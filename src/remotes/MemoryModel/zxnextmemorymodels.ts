import {Utility} from "../../misc/utility";
import {MemoryBank} from "./memorymodel";
import {MemoryModelZxSpectrumBase} from "./zxspectrummemorymodels";


/** Contains the predefined memory models for the ZX Next computer.
 */


/** Virtual class  used as base for MemoryModelZxNext.
 * Is itself not instantiated.
 */
export class MemoryModelZxNextBase extends MemoryModelZxSpectrumBase {
	/** Remove the check for same bank shortNames.
	 */
	protected checkShortName(_index: number) {
		//
	}


	/** Additionally uses the address to correctly parse the ROM bank number.
	 * @param addr64k A 64k address.
	 * @param bankString The string representing the short bank name. Used by the rev-eng parser. Can be undefined. Then the bank is derived from the slot.
	 * @returns The bank number.
	 */
	public parseBank(addr64k: number, bankString: string): number {
		if (bankString) {
			// Parse bank
			let bank = this.parseShortNameForBank(bankString);
			// Adjust bank number (for ROM1 and ROM0)
			if ((bank === 0xFF || bank === 0xFD) && addr64k < 0x2000) {
				// Decrement bank number: 0xFE or 0xFC
				bank--;
			}
			const banks = this.getBanksFor(addr64k);
			if (!banks.has(bank))
				throw Error("Bank '" + bankString + "' is not reachable from address " + Utility.getHexString(addr64k, 4) + ".");
			return bank;
		}

		// Otherwise: normal parsing
		return super.parseBank(addr64k, bankString);
	}


	/** Similar to 'getMemoryBanks' but additionally tries to identify the
	 * ROM name from its content.
	 * Therefore for a ROM bank it uses the passed function to read memory
	 * values of the ROM.
	 * With these values it is possible to identify the ROM name.
	 * @param slots The slots to use for display.
	 * @param readMemory A function to read memory from the current 64k space.
	 * @returns An array with the available memory pages, including identified ROM names if possible.
	 *
	 */
	public async getMemoryBanksWithRomNames(slots: number[], readMemory: (bankNr: number, offset: number, length: number) => Promise<Uint8Array>): Promise<MemoryBank[]> {
		Utility.assert(slots);
		const pages: Array<MemoryBank> = [];
		const len = this.slotRanges.length;
		for (let slot = 0; slot < len; slot++) {
			const bankNr = slots[slot];
			let name;
			if (bankNr == undefined) {
				// Unassigned
				name = 'UNASSIGNED';
			}
			else {
				// Use bank
				name = this.getBankName(bankNr);
				// Try to identify ROM name
				if (bankNr === 0xFF || bankNr > 0xF0) {	// TODO: Remove > F0
					const identifiedName = await this.identifyRomName(readMemory, slot);
					if (identifiedName)
						name = identifiedName;
				}
			}
			// Store
			const slotRange = this.slotRanges[slot];
			pages.push({start: slotRange.start, end: slotRange.end, name});
		}
		// Return
		return pages;
	}


	/** Identifies the ROM name by inspecting bytes of the ROM.
	 * @param readMemory A function to read memory from the current 64k space.
	 * @param slot The slot number to inspect.
	 * @returns The identified ROM name or undefined if it could not be identified.
	 */
	protected async identifyRomName(readMemory: (bankNr: number, offset: number, length: number) => Promise<Uint8Array>, slot: number): Promise<string | undefined> {
		// Implement ROM identification logic here
		return undefined;
	}
}


/** The ZX Next memory model used by zsim, zesarux and the dzrp remotes:
 * It supports ROM1 (ZX Basic) and ROM0 (128k editor).
 * 8 slots per 8k.
 * 0000-1FFF: RAM/ROM0/ROM1
 * 2000-3FFF: RAM/ROM0/ROM1
 * 4000-5FFF: RAM
 * 6000-7FFF: RAM
 * 8000-9FFF: RAM
 * A000-BFFF: RAM
 * C000-DFFF: RAM
 * E000-FFFF: RAM
 * The unexpanded ZXNext has 0-95 8k banks.
 * The expanded has: 0-223 8k banks.
 * Banks 0xFC to 0xFF are ROM.
 * Note: 0xFC, FD, FE are invented, in a ZxNext there is only 0xFF.
 * ROM0, lower 2k: 0xFC
 * ROM0, upper 2k: 0xFD
 * ROM1, lower 2k: 0xFE
 * ROM1, upper 2k: 0xFF
 */
export class MemoryModelZxNext extends MemoryModelZxNextBase {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					initialBank: 0xFE,
					banks: [
						{
							index: [0, 223],	// 224 RAM banks
						},
						{
							index: 0xFC,
							name: 'ROM0',
							shortName: 'R0',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/128.rom' 	// 1
						},
						{
							index: 0xFE,
							name: 'ROM1',
							shortName: 'R1',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/48.rom'
						},
					]
				},
				{
					range: [0x2000, 0x3FFF],
					initialBank: 0xFF,
					banks: [
						{
							index: [0, 223],	// All banks are already defined in previous range
						},
						{
							index: 0xFD,
							name: 'ROM0',
							shortName: 'R0',	// Same name, overwrites mapping
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/128.rom',
							fileOffset: 0x2000
						},
						{
							index: 0xFF,
							name: 'ROM1',
							shortName: 'R1',	// Same name, overwrites mapping
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/48.rom',
							fileOffset: 0x2000
						},
					]
				},
				{
					range: [0x4000, 0x5FFF],
					initialBank: 10,
					banks: [{index: [0, 255]}]
				},
				{
					range: [0x6000, 0x7FFF],
					initialBank: 11,
					banks: [{index: [0, 223]}]
				},
				{
					range: [0x8000, 0x9FFF],
					initialBank: 4,
					banks: [{index: [0, 223]}]
				},
				{
					range: [0xA000, 0xBFFF],
					initialBank: 5,
					banks: [{index: [0, 223]}]
				},
				{
					range: [0xC000, 0xDFFF],
					initialBank: 0,
					banks: [{index: [0, 223]}]
				},
				{
					range: [0xE000, 0xFFFF],
					initialBank: 1,
					banks: [{index: [0, 223]}]
				}
			],
			// ioMmu is undefined because memory management is implemented programmatically.
			// The writing of the the slot register would be possible to implement here,
			// but the port also needs to support reading of the register,
			// what cannot be supported here.
			ioMmu: [
				"var disabled;",
				"if((portAddress | 0x7FFD) == 0x7FFD && !disabled) {",
				"  bank = 2*(portValue & 0x07); // RAM block select",
				"  slots[6] = bank;",
				"  slots[7] = bank+1;",
				"  romBank = 0xFC + 2*((portValue & 0b0010000) >>> 4);",
				"  slots[0] = romBank;",
				"  slots[1] = romBank+1;",
				"  disabled = portValue & 0b0100000; // DIS",
				"}"
			]
		});
		this.name = 'ZXNEXT';
	}
}
