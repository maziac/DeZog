import * as fs from "fs";
import {Utility} from "../../misc/utility";
import {MemoryModelState} from "./memorymodel";
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
	// TODO: test
	public parseBank(addr64k: number, bankString: string): number {
		if (bankString) {
			// Parse bank
			let bank = this.parseShortNameForBank(bankString);
			const banks = this.getBanksFor(addr64k);
			if (!banks.has(bank))
				throw Error("Bank '" + bankString + "' is not reachable from address " + Utility.getHexString(addr64k, 4) + ".");
			return bank;
		}

		// Otherwise: normal parsing
		return super.parseBank(addr64k, bankString);
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
 *
 * Note: The bank 0xFF is 16k in size (slots are 8k each).
 * For slot 1 the upper half is used. This cannot be handled by
 * Memory Model configuration. Therefore the handling is done
 * programmatically in MemoryModelState RomSwitching.
 */
export class MemoryModelZxNext extends MemoryModelZxNextBase {
	public createStateContext(slots: number[], banks: Uint8Array[]): MemoryModelState | undefined {
		return new RomSwitching(slots, banks);
	}

	// Constructor.
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					initialBank: 0xFF,
					banks: [
						{
							index: [0, 223],	// 224 RAM banks
						},
						{
							index: 0xFF,
							name: 'ROM',
							shortName: 'R',
							rom: true,
							bankSize: 0x4000,	// Differs from the usual 8k bank size
						},
					]
				},
				{
					range: [0x2000, 0x3FFF],
					initialBank: 0xFF,
					banks: [
						{
							index: [0, 223],
						},
						{
							// Bank is already defined in previous slot.
							// Note: the bank offset is handled programmatically.
							index: 0xFF,
							bankOffset: 0x2000
						},
					]
				},
				{
					range: [0x4000, 0x5FFF],
					initialBank: 10,
					banks: [{index: [0, 223]}]
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
			]
		});
		this.name = 'ZXNEXT';
	}
}


// Class for the ZxNextMemoryModel to allow 128K ROM switching.
class RomSwitching extends MemoryModelState {
	// Holds the 2*16K ROM data (128k ROM)
	protected rom128Bin: Uint8Array;

	// The currently selected ROM (0=128K or 1=48K)
	protected selectedRom = 1;

	// Remember if ROM switching is disabled.
	protected romSwitchingDisabled = false;

	/// Constructor.
	constructor(slots: number[], memoryBanks: Uint8Array[]) {
		super(slots, memoryBanks);
		// Load the ROM
		const filePath = Utility.getExtensionPath() + '/data/128.rom';
		this.rom128Bin = Uint8Array.from(fs.readFileSync(filePath));
		// Switch initially
		this.switchRomBank(memoryBanks);
	}

	// Copy the selected ROM to the bank.
	public writePort = (portAddress: number, portValue: number) => {
		// Port 0x7FFD:
		// Bit 0-2: 16k RAM block select for 0xC000-0xFFFF
		// Bit 3: 0=normal Screen/Bank 5, 1=shadow Screen/Bank 7
		// Bit 4: 0=128K-ROM, 1=48K-ROM
		// Bit 5: Disable paging
		if ((portAddress | 0x7FFD) === 0x7FFD && !this.romSwitchingDisabled) {
			// Bits 0-2: RAM Select
			const ramBank = 2 * (portValue & 0x07); // RAM block select
			this.slots[6] = ramBank;
			this.slots[7] = ramBank + 1;

			// Paging
			this.romSwitchingDisabled = (portValue & 0b0010_0000) !== 0; // DIS

			// Bit 3: Screen select (normal/shadow) done in ULA screen

			// Bit 4: ROM select
			const prevRom = this.selectedRom;
			this.selectedRom = (portValue & 0b0001_0000) >>> 4;

			if (prevRom !== this.selectedRom) {
				// ROM has changed, update the bank
				this.switchRomBank(this.memoryBanks);
			}
		}
	}


	/** Switches (copies) the ROM bank according 'selectedRom'. */
	protected switchRomBank(banks: Uint8Array[]) {
		// Determine offset
		const offset = (this.selectedRom === 0) ? 0 : 0x4000;
		// Copy file to bank
		const bank = 0xFF;
		const bankData = this.rom128Bin.slice(offset, offset + 0x4000);
		banks[bank] = bankData;
	}
}