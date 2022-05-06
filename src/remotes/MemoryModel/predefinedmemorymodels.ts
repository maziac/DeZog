import {Utility} from "../../misc/utility";
import {MemoryModel} from "./memorymodel";


/**
 * Contains the predefined memory models for ZX16k, ZX48K, ZX128 and ZXNext
 */


/**
 * Default model for MAME.
 * Nothing known.
 */
export class MemoryModelUnknown extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0,
							name: 'UNKNOWN'
						}
					]
				}
			]
		});
		this.name = 'UNKNOWN';
	}
}


/**
 * Model with all RAM.
 */
export class MemoryModelAllRam extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0,
							name: 'RAM'
						}
					]
				}
			]
		});
		this.name = 'RAM';
	}
}


/**
 * ZX16K
 * ROM + RAM, above 0x8000 unassigned.
 */
export class MemoryModelZx16k extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/48.rom'
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


/**
 * ZX48K
 * 16K ROM + 48K RAM
 */
export class MemoryModelZx48k extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/48.rom'
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


/**
 * ZX128K
 * 8 RAM banks a 16k.
 * 2 ROMs
 */
export class MemoryModelZx128k extends MemoryModel {
	constructor() {
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
							rom: Utility.getExtensionPath() + '/data/128.rom' 	// 128k editor
						},
						{
							index: 9,
							name: 'ROM1',
							shortName: 'R1',
							rom: Utility.getExtensionPath() + '/data/48.rom'
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
							index: [0, 9],	// All banks are already defined in previous range
						}
					]
				}

			],
			ioMmu: [
				"var disabled;",
				"if(portAddress == 0x7FFD && !disabled) {",
				"  slotC000 = portValue & 0x07; // RAM block select",
				"  disabled = portValue & 0b0100000; // DIS",
				"  slotROM = ((portValue & 0b0010000) >>> 4) + 8;",
				"}"
			]
		});
		this.name = 'ZX128K';
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
 * E000-FFFF: RAM
 */
export class MemoryModelZxNext extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					initialBank: 254,
					banks: [
						{
							index: [0, 253],	// 254  RAM banks
						},
						{
							index: 254,
							name: 'ROM',
							shortName: 'R',
							rom: Utility.getExtensionPath() + '/data/48.rom'
						},
					]
				},
				{
					range: [0x2000, 0x3FFF],
					initialBank: 255,
					banks: [
						{
							index: [0, 253],	// All banks are already defined in previous range
						},
						{
							index: 255,
							name: 'ROM',
							shortName: 'R',
							rom: Utility.getExtensionPath() + '/data/48.rom',
							romOffset: 0x2000
						}
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
					banks: [{index: [0, 255]}]
				},
				{
					range: [0x8000, 0x9FFF],
					initialBank: 4,
					banks: [{index: [0, 255]}]
				},
				{
					range: [0xA000, 0xBFFF],
					initialBank: 5,
					banks: [{index: [0, 255]}]
				},
				{
					range: [0xC000, 0xDFFF],
					initialBank: 0,
					banks: [{index: [0, 255]}]
				},
				{
					range: [0xE000, 0xFFFF],
					initialBank: 1,
					banks: [{index: [0, 255]}]
				}
			],
			// ioMmu is undefined because memory management is implemented programmatically.
			// The writing of the the slot register would be possible to implement here,
			// but the port also needs to support reading of the register,
			// what cannot be supported here.
		});
		this.name = 'ZXNEXT';
	}
}
