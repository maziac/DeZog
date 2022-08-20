import {Utility} from "../../misc/utility";
import {CustomMemoryBank, CustomMemoryType} from "../../settings/settingscustommemory";
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
export interface SlotRange {
	// Z80 start address of slot.
	start: number;

	// Z80 end address of page.
	end: number;

	// The name of the slot. Required for slots that allow bank switching.
	name?: string;

	// The bank numbers that are allowed for this slot.
	banks: Set<number>;
}


/**
 * For storing the banks.
 */
export interface BankInfo {
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
	 * The path of the ROM content.
	 * File content should be in raw format (e.g. `.rom` and `.bin` extensions) or Intel HEX 8-bit format (`.hex` extensions).
	 */
	rom?: boolean | string;

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

	// Holds all slot ranges. Whole 64k will be filled. Unused slots are mapped to
	// new invented banks of BankType.UNUSED.
	public slotRanges: SlotRange[] = [];

	// Holds the complete bank info.
	public banks: BankInfo[] = [];

	// A complete 64k address range is used to associate addresses to slots.
	// This is the most flexible way to assign slots to ranges and the decoding can be done
	// quite fast.
	public slotAddress64kAssociation = new Array<number>(0x10000);

	// Associates shortNames of the banks with their bank number.
	protected shortNameBankNr = new Map<string, number>();

	// Holds the initial bank association for a slot.
	// Item is undefined if no memory is assigned.
	// Only required for the zsim memory.
	public initialSlots: number[] = [];

	// The IO configuration for switching the banks.
	// Also only required for the zsim memory.
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
			const start = custMemSlot.range[0] as number;
			const diff = start - expectedStart;
			if (diff < 0)
				throw Error("Slot range-start (" + start + ") lower or equal than last range-end (" + (expectedStart - 1) + ".");
			if (diff > 0) {
				// Unassigned area between slots
				const unassignedSlotRange = {
					start: expectedStart,
					end: start - 1,
					banks: new Set<number>()
				}
				const unassignedSlotIndex = this.slotRanges.length;
				this.slotAddress64kAssociation.fill(unassignedSlotIndex, unassignedSlotRange.start, unassignedSlotRange.end + 1);
				this.slotRanges.push(unassignedSlotRange);
				this.initialSlots.push(-1);
			}

			// Add slot
			const end = custMemSlot.range[1] as number;
			if (end < start)
				throw Error("Range-end lower than range-start.");


			// Banks
			const slotBanks = new Set<number>();
			const size = end + 1 - start;
			const banks = custMemSlot.banks;
			const banksLen = banks.length;
			if (banksLen == 0)
				throw Error("No banks specified for range.");
			for (const bank of banks) {
				const bankNumbers = this.createBankOrBanks(bank, size, true); //(banksLen > 1));
				// Store all banks for the slot
				bankNumbers.forEach(bankNr => slotBanks.add(bankNr));
			}

			// Associate address range with slot index
			const slotIndex = this.slotRanges.length;
			this.slotAddress64kAssociation.fill(slotIndex, start, end + 1);

			// Check if an initial bank was given
			let initialBank = custMemSlot.initialBank;
			if (initialBank == undefined) {
				// Use first bank
				[initialBank] = slotBanks;
			}
			else {
				// Check if given bank is available
				if (!slotBanks.has(initialBank))
					throw Error("'initialBank=" + initialBank + "' does not exist in slot.");
			}

			// Initialize slot with bank
			this.initialSlots.push(initialBank);

			// Slot ranges
			const slotRange = {
				start,
				end,
				name: custMemSlot.name,
				banks: slotBanks
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
				end: 0xFFFF,
				banks: new Set<number>()
			}
			this.slotRanges.push(unassignedSlotRange);
			this.initialSlots.push(-1);
		}

		// Set default names for unnamed banks
		for (let index = 0; index < this.banks.length; index++) {
			const bank = this.banks[index];
			if (!bank)
				continue;
			if (bank.name == undefined) {
				bank.name = 'BANK' + index;
			}
			if (bank.shortName == undefined) {
				let shortName = index.toString();
				while (this.shortNameBankNr.get(shortName) != undefined) {
					shortName += '_';	// try a slightly different name
				}
				bank.shortName = shortName;
				this.shortNameBankNr.set(shortName, index);
			}
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
		let unassignedBankIndex = this.banks.length;
		for (let i = 0; i < this.slotRanges.length; i++) {
			const slot = this.initialSlots[i];
			if (slot == -1) {
				const slotRange = this.slotRanges[i];
				slotRange.banks.add(unassignedBankIndex);	// Even unused slots get a number.
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
				this.initialSlots[i] = unassignedBankIndex;
				this.slotAddress64kAssociation.fill(i, start, end + 1);
				// Next
				unassignedBankIndex++;
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
		}
		else {
			// New entry
			this.banks[index] = bankInfo;
		}

		// Associate short name with bank number
		const shortName = this.banks[index].shortName;
		if (shortName) {
			const bankNr = this.shortNameBankNr.get(shortName);
			if (bankNr != undefined && bankNr != index) {
				// Name already exists
				throw Error("Bank shortName '" + shortName + "' used more than once for different banks.");
			}
			this.shortNameBankNr.set(shortName, index);
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
	 * @returns An ordered array with the created bank numbers.
	 */
	protected createBankOrBanks(bank: CustomMemoryBank, size: number, assignShortName: boolean): number[] {
		const bankNumbers: number[] = [];
		let indexStart: number;
		let indexOrRange = bank.index;
		const bankType = (bank.rom || typeof bank.rom == 'string') ? BankType.ROM : BankType.RAM;
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
				romOffset: bank.romOffset as number
			};
			this.setBankInfo(indexStart, bankInfo);
			bankNumbers.push(indexStart);
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
					romOffset: bank.romOffset as number
				};
				this.setBankInfo(index, bankInfo);
				bankNumbers.push(index);
			}
		}
		// Return
		return bankNumbers;
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
	public getMemoryBanks(slots: number[]): MemoryBank[] {
		const pages: Array<MemoryBank> = [];
		Utility.assert(slots);
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
				name = this.getBankName(bankNr);
			}
			// Store
			const slotRange = this.slotRanges[i];
			pages.push({start: slotRange.start, end: slotRange.end, name});
		}
		// Return
		return pages;
	}


	/** Returns the name of a bank.
	 * @param bankNr The bank number.
	 * @return E.g. "ROM0"
	 */
	protected getBankName(bankNr: number): string {
		const bank = this.banks[bankNr];
		if (bank)
			return bank.name;
		// Unknown
		return "UNKNOWN" + bankNr;
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
	 * Returns the short name of a bank.
	 * @param longAddress The long address.
	 * @returns The bank number as string (e.g. "R0") or an empty string: if longAddress is < 0x10000 or if there are no switched banks at the given address.
	 */
	public getBankShortNameForAddress(longAddress: number): string {
		// Check for long address
		const bankNr = (longAddress >>> 16) - 1;
		if (bankNr < 0)
			return '';
		// Check for switched banks
		const addr64k = longAddress & 0xFFFF;
		const banks = this.getBanksFor(addr64k);
		if (banks.size == 1)
			return '';	// Just 1 bank
		// Get name for bank number
		const bank = this.banks[bankNr];
		return bank.shortName;
	}


	/**
	 * Parses the short bank name from the given string.
	 * E.g. for a passed "R0" the correspondent bank number is returned.
	 * In case the slot is not banked the bank number is derived from the address.
	 * Also if the address does not fit to the bank an exception is thrown.
	 * @param addr64k A 64k address.
	 * @param bankString The string representing the short bank name. Used by the rev-eng parser. Can be undefined. Then the bank is derived from the slot.
	 * @returns The bank number.
	 */
	public parseBank(addr64k: number, bankString: string): number {
		if (bankString) {
			// Parse bank
			const bank = this.parseShortNameForBank(bankString);
			const banks = this.getBanksFor(addr64k);
			if (!banks.has(bank))
				throw Error("Bank '" + bankString + "' is not reachable from address " + Utility.getHexString(addr64k, 4) + ".");
			return bank;
		}
		else {
			// No bank given, check if it is a banked slot
			const banks = this.getBanksFor(addr64k);
			Utility.assert(banks);
			Utility.assert(banks.size > 0);
			//if (banks.size == 0)
			//	throw Error("Address " + Utility.getHexString(addr64k, 4) + " has no mapped bank.");
			if (banks.size > 1)
				throw Error("Address " + Utility.getHexString(addr64k, 4) + " is in an address range with banked memory but lacks bank information.");
			const values = banks.values().next();
			const value = values.value;
			return value;
		}
	}


	/**
	 * Parses an address with bank in the form "800A.4" or "0010.R0"
	 * and returns the long address.
	 * @param longAddrString E.g "800A.4" or "0010.R0" or "A000" (if no banking for that slot)
	 * @returns A long address, e.g. 0x05800A for "800A.4"
	 */
	public parseAddress(longAddrString: string): number {
		// Devide address from bank
		const addrBank = longAddrString.split('.');
		const addr64kString = addrBank[0];
		const addr64k = parseInt(addr64kString, 16);
		const bankString = addrBank[1];	// Could be undefined

		// Const get bank number
		const bankNumber = this.parseBank(addr64k, bankString);

		// Create long address
		const longAddr = ((bankNumber + 1) << 16) + addr64k;

		return longAddr;
	}


	/**
	 * Returns all banks (numbers) that are mapped to a given address.
	 * @param addr64k The address.
	 * @returns A set of bank numbers or an empty set for unassigned addresses.
	 */
	protected getBanksFor(addr64k: number): Set<number> {
		// Get slot for address
		const slot = this.slotAddress64kAssociation[addr64k];
		// Get banks
		const banks = this.slotRanges[slot].banks;
		return banks;
	}


	/**
	 * Parses the 'shortName' and returns the corresponding bank number for it.
	 * If none exists an exception is thrown.
	 * @param shortName E.g. "R1"
	 * @returns The associated bank number, e.g. 9.
	 */
	protected parseShortNameForBank(shortName: string): number {
		const bankNr = this.shortNameBankNr.get(shortName);
		if (bankNr == undefined)
			throw Error("Bank with shortName '" + shortName + "' does not exist in memory model '" + this.name + "'.");
		return bankNr;
	}
}
