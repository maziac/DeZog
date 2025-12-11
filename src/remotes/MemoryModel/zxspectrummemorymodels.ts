import {Utility} from "../../misc/utility";
import {MemoryModel} from "./memorymodel";


/** Contains the predefined memory models for ZX Specturm computers.
 */


/** ZX Spectrum base definition.
 */
export class MemoryModelZxSpectrumBase extends MemoryModel {
}


/** ZX16K
 * ROM + RAM, above 0x8000 unassigned.
 */
export class MemoryModelZx16k extends MemoryModelZxSpectrumBase {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/48.rom'
						}
					]
				},
				{
					range: [0x4000, 0x7FFF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX16K';
	}
}


/** ZX48K
 * 16K ROM + 48K RAM
 */
export class MemoryModelZx48k extends MemoryModelZxSpectrumBase {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/48.rom'
						}
					]
				},
				{
					range: [0x4000, 0xFFFF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX48K';
	}
}


/** ZX128K
 * 8 RAM banks a 16k.
 * 2 ROMs
 */
export class MemoryModelZx128k extends MemoryModelZxSpectrumBase {
	constructor(ramBanks = 8) {
		super({
			slots: [
				{
					range: [0x0000, 0x3FFF],
					name: "slotROM",
					initialBank: 8,
					banks: [
						{
							index: 8,
							name: 'ROM0',
							shortName: 'R0',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/128.rom' 	// 128k editor
						},
						{
							index: 9,
							name: 'ROM1',
							shortName: 'R1',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/48.rom'
						}
					]
				},
				{
					range: [0x4000, 0x7FFF],
					banks: [
						{
							index: 5
						}
					]
				},
				{
					range: [0x8000, 0xBFFF],
					banks: [
						{
							index: 2
						}
					]
				},
				{
					range: [0xC000, 0xFFFF],
					name: "slotC000",
					initialBank: 0,
					banks: [
						{
							index: [0, ramBanks-1],
						}
					]
				}
			],
			ioMmu: [
				"var disabled;",
				"if((portAddress | 0x7FFD) == 0x7FFD && !disabled) {",
				"  slotC000 = portValue & 0x07; // RAM block select",
				"  disabled = portValue & 0b0100000; // DIS",
				"  slotROM = ((portValue & 0b0010000) >>> 4) + 8;",
				"}"
			]
		});
		this.name = 'ZX128K';
	}
}


/** ZX256K
 * 16 RAM banks a 16k.
 * 2 ROMs
 */
/*
Too many clones: https://zx-pk.ru/threads/11490-paging-ports-of-zx-clones.html?langid=1
I think I leave it with the ZX128K.
export class MemoryModelZx256k extends MemoryModelZx128k {
	constructor() {
		super(16);	// 16 RAM banks
		this.name = 'ZX256K';
		this.ioMmu = [
			"var disabled;",
			"if((portAddress | 0x7FFD) == 0x7FFD && !disabled) {",
			"  slotC000 = portValue & 0x07; // RAM block select",
			"  disabled = portValue & 0b0100000; // DIS",
			"  slotROM = ((portValue & 0b0010000) >>> 4) + 8;",
			"}"
		].join('\n');
	}
}
*/

