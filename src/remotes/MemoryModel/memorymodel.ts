import {CustomMemoryBank, CustomMemoryType} from "../../settingscustommemory";
import {Z80Registers} from "../z80registers";




/**
 * The memory in the banks can be ROM, RAM or completely unused.
 */
export enum BankType {
	ROM = 0,	// Readonly memory, not writable by Z80 but writable from the debugger and e.g. loadBinSna/Nex.
	RAM = 1,	// Readwrite memory, writable and readable by Z80 and the debugger
	UNUSED = 2	// Not writable by Z80 and debugger. Will be filled with 0xFF.
}


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

	// The name of the slot. Required for slots that allow bank switching.
	name?: string;
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

	// The type: ROM, RAM, ...
	bankType: BankType;

	/**
	 * Optional. If specified, set the slot as ROM.
	 * The content is the buffer content, or the path of the ROM content.
	 * File content should be in raw format (i.e. `.rom` and `.bin` extensions) or Intel HEX 8-bit format (`.hex` extensions).
	 * Array content is flat and it should cover the whole bank span.
	 */
	rom?: string | Uint8Array;

	/**
	 * Optional offset of the ROM file/content
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
	// The name of the model
	public name = 'CUSTOM';

	// Holds all slot ranges.
	public slotRanges: SlotRange[] = [];

	// Holds the initial bank association for a slot.
	// Item is undefined if no memory is assigned.
	// TODO: This is not needed for the MemoryModel but for the SimulatedMemory only. Move it?
	public initialSlots: number[] = [];

	// Holds the complete bank info.
	public banks: BankInfo[] = [];

	// A complete 64k address range is used to associate addresses to slots.
	// This is the most flexible way to assign slots to ranges and the decoding can be done
	// quite fast.
	public slotAddress64kAssociation = new Array<number>(0x10000);


	// The IO configuration for switching the banks
	public ioMmu: string;


	/**
	 * Constructor.
	 * @param cfg The custom memory model configuration. From the settings.
	 */
	constructor(cfg: CustomMemoryType) {
		let expectedStart = 0;
		// Create one string out of ioMmu.
		if (cfg.ioMmu == undefined)
			this.ioMmu = '';
		else {
			if (typeof cfg.ioMmu == "string")
				this.ioMmu = cfg.ioMmu;
			else
				this.ioMmu = cfg.ioMmu.join('\n');
		}
		// Parse the config
		for (const custMemSlot of cfg.slots) {
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
				const slotIndex = this.slotRanges.length;
				this.slotAddress64kAssociation.fill(slotIndex, unassignedSlotRange.start, unassignedSlotRange.end + 1);
				this.slotRanges.push(unassignedSlotRange);
				this.initialSlots.push(-1);
			}

			// Add slot
			const end = custMemSlot.range[1];
			if (end < start)
				throw Error("Range-end lower than range-start.");

			// Initial bank for slot
			let initialBank = custMemSlot.initialBank;

			// Banks
			const size = end + 1 - start;
			const banks = custMemSlot.banks;
			const banksLen = banks.length;
			if (banksLen == 0)
				throw Error("No banks specified for range.");
			for (const bank of banks) {
				const indexStart = this.createBankOrBanks(bank, size, (banksLen > 1));
				// Store initial bank?
				if (initialBank == undefined)
					initialBank = indexStart;
			}

			// Associate address range with slot index
			const slotIndex = this.slotRanges.length;
			this.slotAddress64kAssociation.fill(slotIndex, start, end + 1);

			// Initialize slot with bank
			this.initialSlots.push(initialBank!);

			// Slot ranges
			const slotRange = {
				start,
				end,
				name: custMemSlot.name
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
			this.initialSlots.push(-1);
		}

		// Set default names for unnamed banks
		for (let index = 0; index < this.banks.length; index++) {
			const bank = this.banks[index];
			if (!bank)
				continue;
			if (bank.name == undefined)
				bank.name = 'BANK' + index;
			if (bank.shortName == undefined)
				bank.shortName = index.toString();
		}

		// Assign unused memory
		this.createUnusedBanks();
	}


	/**
	 * Assigns the unused slot ranges to new banks.
	 * This is just an implementation detail to make the slot/bank handling easier.
	 */
	protected createUnusedBanks() {
		// Assign banks to unassigned memory (above max bank number)
		let unassignedIndex = this.banks.length;
		for (let i = 0; i < this.slotRanges.length; i++) {
			const slot = this.initialSlots[i];
			if (slot == -1) {
				const slotRange = this.slotRanges[i];
				const start = slotRange.start;
				const end = slotRange.end;
				const size = end + 1 - start;
				const bankInfo: BankInfo = {
					name: 'UNUSED',
					shortName: '',
					size,
					bankType: BankType.UNUSED
				};
				this.banks.push(bankInfo);
				this.initialSlots[i] = unassignedIndex;
				this.slotAddress64kAssociation.fill(i, start, end + 1);
				// Next
				unassignedIndex++;
			}
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
			// Set name if not yet set
			if (!prevInfo.name)
				prevInfo.name = bankInfo.name;
			if (!prevInfo.shortName)
				prevInfo.shortName = bankInfo.shortName;

			/*
			// Check if both names are the same
			if (prevInfo.name && bankInfo.name) {
				if (prevInfo.name != bankInfo.name)
					throw Error("Different names given for same the bank.");
			}
			if (prevInfo.shortName && bankInfo.shortName) {
				if (prevInfo.shortName != bankInfo.shortName)
					throw Error("Different short names given for the same bank.");
			}
			*/
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
	 * @param assignShortName If false then short name will be set to ''.
	 * @returns The index of the (first) bank created.
	 */
	protected createBankOrBanks(bank: CustomMemoryBank, size: number, assignShortName: boolean): number {
		let indexStart: number;
		let indexOrRange = bank.index;
		const bankType = (bank.rom == undefined) ? BankType.RAM : BankType.ROM;
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
				shortName: (assignShortName) ? this.createBankShortName(bank.shortName, indexStart) : '',
				size,
				bankType,
				rom: bank.rom,
				romOffset: bank.romOffset
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
			if (!assignShortName)
				assignShortName = ((indexEnd - indexStart) > 0);
			for (let index = indexStart; index <= indexEnd; index++) {
				const bankInfo: BankInfo = {
					name: this.createBankName(bank.name, index),
					shortName: (assignShortName) ? this.createBankShortName(bank.shortName, index) : '',
					size,
					bankType,
					rom: bank.rom,
					romOffset: bank.romOffset
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
		// Evaluate given name
		const result = name.replace(/\${index}/g, index.toString());
		return result;
	}


	/**
	 * Returns the bank short name.
	 * @param name The name, might contain a variable.
	 * @param index The bank index. Might be used to construct the returned name.
	 */
	protected createBankShortName(shortName: string | undefined, index: number): string {
		if (shortName == undefined)
			return undefined!;
		// Evaluate given name
		const result = shortName.replace(/\${index}/g, index.toString());
		return result;
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
		Z80Registers.setSlotsAndBanks(
			// Calculate long address
			(addr64k: number, slots: number[]) => {
				const slotIndex = this.slotAddress64kAssociation[addr64k];
				const bank = slots[slotIndex] + 1;
				const result = addr64k + (bank << 16);
				return result;
			},

			// Returns slot index from address
			(addr64k: number) => {
				const slotIndex = this.slotAddress64kAssociation[addr64k];
				return slotIndex;
			}
		);
	}


	/**
	 * Returns the name of a bank.
	 * Used e.g. for the long address display in the disassembly.
	 * The non-overridden method simply returns the number as string.
	 * But overridden methods could also prepend the number with e.g. an
	 * "R" for ROM.
	 * @param bankNr Bank number. Starts at 0.
	 * @returns The bank number as string or an empty string if bank is < 0
	 * (no bank number).
	 */
	public getBankShortName(bankNr: number): string {
		if (bankNr < 0)
			return '';
		const bank = this.banks[bankNr];
		return bank.shortName;
	}


	/**
	 * Returns the bank size.
	 * @returns 0 in this case = no banks used.
	 */
	public getBankSize() {
		return 0;
	}
}
