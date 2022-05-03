import exp = require("constants");
import {CustomMemoryBank, CustomMemorySlot, CustomMemoryType} from "../../settingscustommemory";
import {Z80Registers} from "../z80registers";


// TODO: SimMemory: Da gab es glaub ich ein paar Vereinfachungen beim Zugriff über Grenzen hinaus. Da vorher alles eine zusammenhängendes lineares Memory war.


// TODO: Change into individual files.

// Definition of one memory bank, i.e. memory slot/bank relationship.
export interface MemoryBank {
	// Z80 start address of page.
	start: number;

	// Z80 end address of page.
	end: number;

	// The name of the mapped memory area.
	name: string;
}


/**
 * For storing the slot ranges.
 */
interface SlotRange {
	// Z80 start address of slot.
	start: number;

	// Z80 end address of page.
	end: number;

	// The IO configuration for switching the banks
	ioMmu?: any;	// TODO
}


/**
 * For storing the banks.
 */
interface BankInfo {
	// The name of the bank, can include the index variable.
	// Used in the VARIABLE pane. E.g. "ROM0"
	// E.g. 'BANK3' or 'ROM0'.
	name: string;

	// The name of the bank, can include the index variable.
	// Used in the disassembly. E.g. '3' or 'R0'.
	shortName: string;

	// The size of the bank
	size: number;


	/**
	 * Optional. If specified, set the slot as ROM.
	 * The content is the buffer content, or the path of the ROM content.
	 * File content should be in raw format (i.e. `.rom` and `.bin` extensions) or Intel HEX 8-bit format (`.hex` extensions).
	 * Array content is flat and it should cover the whole bank span.
	 */
	rom?: string | Uint8Array;	// TODO: Do I need this here?

	/**
	 * Optional offset of the ROM file/content
	 * TODOQ: Check usage
	 */
	romOffset?: number;
}


/**
 * Class that takes care of the memory model.
 * I.e. it holds the definition of the memory ranges and the associated
 * banks (if any).
 * It is highly configurable. All ranges, sizes ad banks are configured through the
 * constructor.
 */
export class MemoryModel {
	// Holds all slot ranges.
	protected slotRanges: SlotRange[] = [];

	// Holds the initial bank association for a slot.
	// Item is undefined if no memory is assigned.
	// TODO: This is not needed for the MemoryModel but for the SimulatedMemory only. Move it?
	protected initialSlots: (number|undefined)[] = [];

	// Holds the complete bank info.
	protected banks: BankInfo[] = [];


	/**
	 * Constructor.
	 * @param cfg The custom memory model configuration. From the settings.
	 */
	constructor(cfg: CustomMemorySlot[]) {
		let expectedStart = 0;
		// Parse the config
		for (const custMemSlot of cfg) {
			// Check if block needs to be inserted
			const start = custMemSlot.range[0];
			const diff = start - expectedStart;
			if (diff < 0)
				throw Error("Range-start lower or equal than last range-end.");
			if (diff > 0) {
				// Unassigned area between slots
				const unassignedSlotRange = {
					start: expectedStart,
					end: start - 1
				}
				this.slotRanges.push(unassignedSlotRange);
				this.initialSlots.push(undefined);
			}

			// Add slot
			const end = custMemSlot.range[1];
			if (end < start)
				throw Error("Range-end lower than range-start.");

			// Initial bak for slot
			let initialBank = custMemSlot.initialBank;

			// Banks
			const size = end + 1 - start;
			const banks = custMemSlot.banks;
			if (banks.length == 0)
				throw Error("No banks specified for range.");
			for (const bank of banks) {
				const indexStart = this.createBankOrBanks(bank, size);
				// Store initial bank?
				if (initialBank == undefined)
					initialBank = indexStart;
			}

			// Initialize slot with bank
			this.initialSlots.push(initialBank);
			// Slot ranges
			const slotRange = {
				start,
				end,
				ioMMu: custMemSlot.ioMmu
			}
			this.slotRanges.push(slotRange);

			// Next
			expectedStart = end + 1;
		}

		// Last element
		if (expectedStart < 0x10000) {
			// Unassigned area at the end
			const unassignedSlotRange = {
				start: expectedStart,
				end: 0xFFFF
			}
			this.slotRanges.push(unassignedSlotRange);
			this.initialSlots.push(undefined);
		}

		// Set default names for unnamed banks
		for (let index = 0; index < this.banks.length; index++) {
			const bank = this.banks[index];
			if (bank.name == undefined)
				bank.name = 'BANK' + index;
			if (bank.shortName == undefined)
				bank.shortName = index.toString();
		}
	}


	/**
	 * Sets the bank info for one bank.
	 * Since the same bank could be defined in different slots it could be set
	 * several times. In this case the biggest size is used.
	 * And the names are checked for equality (if not undefined).
	 * @param index The index number of the bank. 0-indexed.
	 * @param bankInfo The bank info to set.
	 */
	protected setBankInfo(index: number, bankInfo: BankInfo) {
		let prevInfo = this.banks[index];
		if (prevInfo) {
			// Update previous entry:
			// Get the bigger of both sizes
			if (prevInfo.size < bankInfo.size)
				prevInfo.size = bankInfo.size;
			// Check if both names are the same
			if (prevInfo.name && bankInfo.name) {
				if (prevInfo.name != bankInfo.name)
					throw Error("Different names given for same the bank.");
			}
			if (prevInfo.shortName && bankInfo.shortName) {
				if (prevInfo.shortName != bankInfo.shortName)
					throw Error("Different short names given for the same bank.");
			}
		}
		else {
			// New entry
			this.banks[index] = bankInfo;
		}
	}


	/**
	 * Creates the BankInfo of one bank or several banks in a row if
	 * a range is given.
	 * If a bank with the index already exists then the max. size is selected and
	 * an error is thrown if the names do not match.
	 * @param bank The configuration from the settings.
	 * @param size The size of the bank.
	 * @returns The index of the (first) bank created.
	 */
	protected createBankOrBanks(bank: CustomMemoryBank, size: number): number {
		let indexStart: number;
		let indexOrRange = bank.index;
		// Check for bank range
		if (typeof indexOrRange == 'number') {
			// Just one bank
			indexStart = indexOrRange;
			if (indexStart >= 256)
				throw Error("Bank index too high.");
			if (indexStart < 0)
				throw Error("Bank index < 0.");
			const bankInfo: BankInfo = {
				name: this.createBankName(bank.name, indexStart),
				shortName: this.createBankShortName(bank.shortName, indexStart),
				size
				// TODO: rom?
			};
			this.setBankInfo(indexStart, bankInfo);
		}
		else {
			// A bank range
			indexStart = indexOrRange[0];
			const indexEnd = indexOrRange[1];
			if (indexStart > indexEnd)
				throw Error("Bank range: first index bigger than last index.");
			if (indexEnd >= 256)
				throw Error("Bank index too high.");
			if (indexStart < 0)
				throw Error("Bank index < 0.");
			for (let index = indexStart; index <= indexEnd; index++) {
				const bankInfo: BankInfo = {
					name: this.createBankName(bank.name, index),
					shortName: this.createBankShortName(bank.shortName, index),
					size
					// TODO: rom?
				};
				this.setBankInfo(index, bankInfo);
			}
		}
		// Return
		return indexStart;
	}


	/**
	 * Returns the bank name.
	 * @param name The name, might contain a variable.
	 * @param index The bank index. Might be used to construct the returned name.
	 */
	protected createBankName(name: string | undefined, index: number): string {
		if (name == undefined)
			return undefined!;
		// Use given name
		return name;	// TODO: evaluate name.
	}


	/**
	 * Returns the bank short name.
	 * @param name The name, might contain a variable.
	 * @param index The bank index. Might be used to construct the returned name.
	 */
	protected createBankShortName(shortName: string | undefined, index: number): string {
		if (shortName == undefined)
			return undefined!;
		// Use given name
		return shortName;	// TODO: evaluate name.
	}


	/**
	 * Returns a description for the slots used in the variables section.
	 * @param slots The slots to use for display.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		const pages: Array<MemoryBank> = [];
		if (slots) { // TODO: slots shouldn't be undefined
			const len = this.slotRanges.length;
			for (let i = 0; i < len; i++) {
				const bankNr = slots[i];
				let name;
				if (bankNr == undefined) {
					// Unassigned
					name = 'UNASSIGNED';
				}
				else {
					// Use bank
					const bank = this.banks[bankNr];
					name = bank.name;
				}
				// Store
				const slotRange = this.slotRanges[i];
				pages.push({start: slotRange.start, end: slotRange.end, name});
			}
		}
		// Return
		return pages;
	}








	/**
	 * Initialize.
	 * Set decoder.
	 */
	public init() {
		Z80Registers.setSlotsAndBanks(undefined, undefined);
	}


	/**
	 * Returns the name of a bank.
	 * Used e.g. for the long address display in the disassembly.
	 * The non-overridden method simply returns the number as string.
	 * But overridden methods could also prepend teh number with e.g. an
	 * "R" for ROM.
	 * @param bank Bank number. Starts at 0.
	 * @returns The bank number as string or an empty string if bank is < 0
	 * (no bank number).
	 */
	public getBankName(bank: number): string {
		if (bank < 0)
			return '';
		return bank.toString();
	}


	/**
	 * Returns the bank size.
	 * @returns 0 in this case = no banks used.
	 */
	public getBankSize() {
		return 0;
	}

}


/**
 * Class that takes care of the memory paging.
 * I.e. it defines which memory bank to slot association is used.
 *
 * Is the base class and defines:
 * 0000-3FFF: ROM
 * 4000-7FFF: RAM
 */
export class Zx16MemoryModel extends MemoryModel {

	/**
	 * Returns the standard description, I.e. 0-3FFF = ROM, rest is RAM.
	 * @param slots Not used.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		return [
			{start: 0x0000, end: 0x3FFF, name: "ROM"},
			{start: 0x4000, end: 0x7FFF, name: "RAM"},
			{start: 0x8000, end: 0xFFFF, name: "UNUSED"}
		];
	}


	/**
	 * Returns the bank size.
	 * @returns 0 in this case = no banks used.
	 */
	public getBankSize() {
		return 0;
	}

}


/**
 * Class that takes care of the memory paging.
 * I.e. it defines which memory bank to slot association is used.
 *
 * Is the base class and defines:
 * 0000-3FFF: ROM
 * 4000-FFFF: RAM
 */
export class Zx48MemoryModel extends MemoryModel {

	/**
	 * Returns the standard description, I.e. 0-3FFF = ROM, rest is RAM.
	 * @param slots Not used.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		return [
			{start: 0x0000, end: 0x3FFF, name: "ROM"},
			{start: 0x4000, end: 0xFFFF, name: "RAM"}
		];
	}


	/**
	 * Returns the bank size.
	 * @returns 0 in this case = no banks used.
	 */
	public getBankSize() {
		return 0;
	}
}


/**
 * The ZX 128k memory model:
 * 4 slots per 16k.
 * 0000-3FFF: ROM
 * 4000-7FFF: RAM
 * 8000-BFFF: RAM
 * C000-FFFF: RAM
 */
export class Zx128MemoryModel extends MemoryModel {

	// Number of slots used for the 64k. 64k/slots is the used bank size.
	protected countSlots: number;

	// The size of one bank.
	protected bankSize: number;

	/**
	 * Constructor.
	 * @param countSlots Number of slots used for the 64k. 64k/slots is the used bank size.
	 * For ZX128k these are 4 slots.
	 */
	constructor(countSlots = 4) {
		super();
		this.countSlots = countSlots;
		this.bankSize = 0x10000 / countSlots;
	}

	/**
	 * Initialize.
	 * Set decoder.
	 */
	public init() {
		// 4x16k banks
		Z80Registers.setSlotsAndBanks(
			(address: number, slots: number[]) => {
				// Calculate long address
				const slotNr = address >>> 14;
				const bank = slots[slotNr] + 1;
				const result = address + (bank << 16);
				return result;
			},
			(addr: number) => {
				const slotIndex = (addr >>> 14) & 0x03;
				return slotIndex;
			}
		);
	}


	/**
	 * Returns a description for the slots used in the variables section.
	 * @param slots The slots to use for display.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		// Prepare array
		const pages: Array<MemoryBank> = [];
		// Fill array
		if (slots) {
			let start = 0x0000;
			let i = 0;
			slots.forEach(bank => {
				const end = start + this.bankSize - 1;
				const name = (i == 0) ? "ROM" + (bank & 0x01) : "BANK" + bank;
				pages.push({start, end, name});
				// Next
				start = end + 1;
				i++;
			});
		}
		// Return
		return pages;
	}


	/**
	 * Returns the name of a bank.
	 * Ovverides to return a prepended 'R' to indicate ROM banks.
	 * @param bank Bank number. Starts at 0.
	 * @returns E.g. '0' or 'R1' for rom bank 1
	 */
	public getBankName(bank: number): string {
		if (bank < 0)
			return '';
		// Banks 8 and 9 are used for ROM. The other banks 0-7 are RAM.
		const name = (bank >= 8) ? "R" + (bank & 0x01) : bank.toString();
		return name;
	}


	/**
	 * Returns the bank size.
	 * @returns this.bankSize
	 */
	public getBankSize() {
		return this.bankSize;
	}
}


/**
 * The ZX Next memory model:
 * 8 slots per 8k.
 * 0000-1FFF: RAM/ROM
 * 2000-3FFF: RAM/ROM
 * 4000-5FFF: RAM
 * 6000-7FFF: RAM
 * 8000-9FFF: RAM
 * A000-BFFF: RAM
 * C000-DFFF: RAM
 * A000-FFFF: RAM
 */
export class ZxNextMemoryModel extends Zx128MemoryModel {

	/**
	 * Constructor.
	 */
	constructor() {
		super(8);
	}


	/**
	 * Initialize.
	 * Set decoder.
	 */
	public init() {
		// 8x8k banks
		Z80Registers.setSlotsAndBanks(
			(address: number, slots: number[]) => {
				// Calculate long address
				const slotNr = address >>> 13;
				const bank = slots[slotNr] + 1;
				const result = address + (bank << 16);
				return result;
			},
			(addr: number) => {
				const slotIndex = (addr >>> 13) & 0x07;
				return slotIndex;
			}
		);
	}


	/**
	 * Returns a description for the slots used in the variables section.
	 * @param slots The slots to use for display.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		// Prepare array
		const pages: Array<MemoryBank> = [];
		// Fill array
		if (slots) {
			let start = 0x0000;
			slots.forEach(bank => {
				const end = start + this.bankSize - 1;
				const name = (bank >= 254) ? "ROM" : "BANK" + bank;
				pages.push({start, end, name});
				start = end + 1;
			});
		}
		// Return
		return pages;
	}
}




/**
 * AllRomModel:
 * Has no banks, or only one continuous 64k bank.
 */
export class AllRomModel extends MemoryModel {

	/**
	 * Returns 0-FFFF =  ROM.
	 * @param slots Not used.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		// Prepare array
		const pages: Array<MemoryBank> = [
			{start: 0x0000, end: 0xFFFF, name: "ROM"}
		];
		// Return
		return pages;
	}
}



/**
 * Takes the custom memory model description and creates the description of the memory banks.
 */
export class CustomMemoryModel extends MemoryModel {

	// The custom memory description.
	protected memoryBanks: MemoryBank[] = [];

	/**
	 * Constructor.
	 * @param customMemory The memory description.
	 */
	constructor(customMemory: CustomMemoryType) {
		super();
		const nob = customMemory.numberOfBanks;
		const bankSize = 0x10000 / nob;
		let addr = 0;
		for (let i = 0; i < nob; i++) {
			let bankName = customMemory.banks[i.toString()];
			if (bankName == undefined)
				bankName = 'UNUSED';
			this.memoryBanks.push({
				start: addr,
				end: addr + bankSize - 1,
				name: bankName
			});
			// Next
			addr += bankSize;
		}
	}


	/**
	 * Returns the standard description, E.g. 0-3FFF = ROM, rest is RAM.
	 * Used by the 'Memory Banks' description in the VARIABLE pane and in the
	 * visual RAM of zsim.
	 * @param slots Not used.
	 * @returns An array with the available memory banks. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		return this.memoryBanks
	}


	/**
	 * Returns the bank size.
	 * @returns 0 in this case = no banks used.
	 */
	public getBankSize() {
		return 0;
	}

}

