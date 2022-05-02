import {CustomMemoryType} from "../../settings";
import {Z80Registers} from "../z80registers";
import {BankType} from "../zsimulator/simmemory";



/// Definition of one memory bank, i.e. memory slot/bank relationship.
export interface MemoryBank {
	/// Z80 start address of page.
	start: number;

	/// Z80 end address of page.
	end: number;

	/// The name of the mapped memory area.
	name: string;
}



/**
 * Class that takes care of the memory paging.
 * I.e. it defines which memory bank to slot association is used.
 *
 * Is the base class and defines:
 * 0000-FFFF: RAM
 */
export class MemoryModel {
	/**
	 * Initialize.
	 * Set decoder.
	 */
	public init() {
		Z80Registers.setSlotsAndBanks(undefined, undefined);
	}


	/**
	 * Returns the standard description, I.e. 0-FFFF =  RAM.
	 * @param slots Not used.
	 * @returns An array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(slots: number[] | undefined): MemoryBank[] {
		// Prepare array
		const pages: Array<MemoryBank> = [
			{start: 0x0000, end: 0xFFFF, name: "RAM"}
		];
		// Return
		return pages;
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
				bankName = BankType[BankType.UNUSED];
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
	 * Returns the standard description, I.e. 0-3FFF = ROM, rest is RAM.
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

