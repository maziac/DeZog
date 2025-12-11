import {Utility} from "../../misc/utility";
import {MemoryModel} from "./memorymodel";


/** Contains the predefined memory models for ZX81 1K, Timex Sinclair TS1000, 16K, 32K, 48K and 56K RAM Packs.
 * See https://problemkaputt.de/zxdocs.htm
 *
 * See https://github.com/ikjordan/picozx81/blob/main/src/zx8x.c:
 *           1K to 16K       32K           48K           56K      Extra Info.
 *
 *  65535  +----------+  +----------+  +----------+  +----------+
 * (FFFFh) | 16K RAM  |  | 16K RAM  |  | 16K RAM  |  | 16K RAM  | DFILE can be
 *         | mirrored |  | mirrored |  |          |  |          | wholly here.
 *         |          |  |          |  |          |  |          |
 *         |          |  |          |  |          |  |          | BASIC variables
 *         |          |  |          |  |          |  |          | can go here.
 *  49152  +----------+  +----------+  +----------+  +----------+
 * (C000h) | 8K ROM   |  | 16K RAM  |  | 16K RAM  |  | 16K RAM  | BASIC program
 *         | mirrored |  |          |  |          |  |          | is restricted
 *  40960  +----------+  |          |  |          |  |          | to here.
 * (A000h) | 8K ROM   |  |          |  |          |  |          |
 *         | mirrored |  |          |  |          |  |          |
 *  32768  +----------+  +----------+  +----------+  +----------+
 * (8000h) | 16K RAM  |  | 16K RAM  |  | 16K RAM  |  | 16K RAM  | No machine code
 *         |          |  |          |  |          |  |          | beyond here.
 *         |          |  |          |  |          |  |          |
 *         |          |  |          |  |          |  |          | DFILE can be
 *         |          |  |          |  |          |  |          | wholly here.
 *  16384  +----------+  +----------+  +----------+  +----------+
 * (4000h) | 8K ROM   |  | 8K ROM   |  | 8K ROM   |  | 8K RAM   |
 *         | mirrored |  | mirrored |  | mirrored |  |          |
 *   8192  +----------+  +----------+  +----------+  +----------+
 * (2000h) | 8K ROM   |  | 8K ROM   |  | 8K ROM   |  | 8K ROM   |
 *         |          |  |          |  |          |  |          |
 *      0  +----------+  +----------+  +----------+  +----------+
 */

export class MemoryModelZX81_1k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM 0000-1FFF',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0x3FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0x4000, 0x43FF],
					banks: [
						{
							index: 1,
							name: 'RAM 4000-43FF'
						}
					]
				},
				{
					range: [0x8000, 0x9FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xA000, 0xBFFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xC000, 0xC3FF],
					banks: [
						{
							index: 1,	// Mirrored RAM 0x4000-0x43FF
						}
					]
				},
			]
		});
		this.name = 'ZX81-1K';
	}
}

export class MemoryModelZX81_2k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM 0000-1FFF',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0x3FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0x4000, 0x47FF],
					banks: [
						{
							index: 1,
							name: 'RAM 4000-47FF'
						}
					]
				},
				{
					range: [0x8000, 0x9FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xA000, 0xBFFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xC000, 0xC7FF],
					banks: [
						{
								index: 1,	// Mirrored 0x4000-0x47FF
						}
					]
				},
			]
		});
		this.name = 'ZX81-2K';
	}
}

export class MemoryModelZX81_16k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM 0000-1FFF',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0x3FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0x4000, 0x7FFF],
					banks: [
						{
							index: 1,
							name: 'RAM 4000-7FFF'
						}
					]
				},
				{
					range: [0x8000, 0x9FFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xA000, 0xBFFF],
					banks: [
						{
							index: 0,	// Mirrored ROM 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0xC000, 0xFFFF],
					banks: [
						{
							index: 1,	// Mirrored 0x4000-0x7FFF
						}
					]
				},
			]
		});
		this.name = 'ZX81-16K';
	}
}

export class MemoryModelZX81_32k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM 0000-1FFF',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0x3FFF],
					banks: [
						{
							index: 0,	// Mirrored 0x0000-0x1FFF
						}
					]
				},
				{
					range: [0x4000, 0x7FFF],
					banks: [
						{
							index: 1,
							name: 'RAM 4000-7FFF'
						}
					]
				},
				{
					range: [0x8000, 0xBFFF],
					banks: [
						{
							index: 2,
							name: 'RAM'
						}
					]
				},
				{
					range: [0xC000, 0xFFFF],
					banks: [
						{
							index: 1,	// Mirrored 0x4000-0x7FFF
						}
					]
				},
			]
		});
		this.name = 'ZX81-32K';
	}
}

export class MemoryModelZX81_48k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM 0000-1FFF',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0x3FFF],
					banks: [
						{
							index: 0,	// Mirrored 0x0000-0x1FFF
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
		this.name = 'ZX81-48K';
	}
}

export class MemoryModelZX81_56k extends MemoryModel {	// NOSONAR
	// Also enables the area 0x2000-0x3FFF with RAM
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: true,
							filePath: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x2000, 0xFFFF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX81-56K';
	}
}
