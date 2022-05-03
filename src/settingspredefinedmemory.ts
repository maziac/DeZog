import {CustomMemorySlot} from "./settingscustommemory";


/**
 * Contains the predefined memory for ZX16k, ZX48K, ZX128 and ZXNext
 */


/**
 * ZX16K
 * ROM + RAM, above 0x8000 unassigned.
 */
export const Zx16kMemModel: CustomMemorySlot[] = [
	{
		range: [0x0000, 0x3FFF],
		banks: [
			{
				index: 0,
				name: 'ROM',
				rom: 'rom0.hex'
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
];


/**
 * ZX48K
 * 16K ROM + 48K RAM
 */
export const Zx48kMemModel: CustomMemorySlot[] = [
	{
		range: [0x0000, 0x3FFF],
		banks: [
			{
				index: 0,
				name: 'ROM',
				rom: 'rom0.hex'
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
];


/**
 * ZX128K
 * 8 RAM banks a 16k.
 * 2 ROMs
 */
export const Zx128kMemModel: CustomMemorySlot[] = [
	{
		range: [0x0000, 0x3FFF],
		initialBank: 8,
		banks: [
			{
				index: [0, 7],
			},
			{
				index: 8,
				name: 'ROM0',
				shortName: 'R0',
				rom: 'rom0.hex'	// 128k editor
			},
			{
				index: 9,
				name: 'ROM1',
				shortName: 'R1',
				rom: 'rom1.hex'	// 48k Basic
			}
		]
	},
	{
		range: [0x4000, 0x7FFF],
		initialBank: 5,
		banks: [
			{
				index: [0, 9],	// All banks are already defined in previous range
			}
		]
	},
	{
		range: [0x8000, 0xBFFF],
		initialBank: 2,
		banks: [
			{
				index: [0, 9],	// All banks are already defined in previous range
			}
		]
	},
	{
		range: [0xC000, 0xFFFF],
		initialBank: 0,
		banks: [
			{
				index: [0, 9],	// All banks are already defined in previous range
			}
		]
	},
];


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
export const ZxNextMemModel: CustomMemorySlot[] = [
	{
		range: [0x0000, 0x1FFF],
		initialBank: 0,
		banks: [
			{
				index: [0, 253],	// 254  RAM banks
			},
			{
				index: 254,
				name: 'ROM',
				shortName: 'R'
			},
			{
				index: 255,
				name: 'ROM',
				shortName: 'R'
			}
		]
	},
	{
		range: [0x2000, 0x3FFF],
		initialBank: 1,
		banks: [
			{
				index: [0, 255],	// All banks are already defined in previous range
			}
		]
	},
	{
		range: [0x4000, 0x5FFF],
		initialBank: 2,
		banks: [{index: [0, 255]}]
	},
	{
		range: [0x6000, 0x7FFF],
		initialBank: 3,
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
		initialBank: 6,
		banks: [{index: [0, 255]}]
	},
	{
		range: [0xE000, 0xFFFF],
		initialBank: 7,
		banks: [{index: [0, 255]}]
	}
];

