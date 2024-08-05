import {Utility} from "../../misc/utility";
import {MemoryModel} from "./memorymodel";


/**
 * Contains the predefined memory models for ZX81 1K, Timex Sinclair TS1000, 16K, 32K, 48K and 56K RAM Packs.
 * See https://problemkaputt.de/zxdocs.htm
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
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x4000, 0x43FF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX81-1K';
		this.defaultTopOfStack = 0x43FF;
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
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x4000, 0x47FF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX81-2K';
		this.defaultTopOfStack = 0x47FF;
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
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
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
		this.name = 'ZX81-16K';
		this.defaultTopOfStack = 0x7FFF;
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
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x4000, 0xBFFF],
					banks: [
						{
							index: 1,
							name: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'ZX81-32K';
		this.defaultTopOfStack = 0x7FFF; // Like for 16K
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
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
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
		this.defaultTopOfStack = 0x7FFF; // Like for 16K
	}
}

export class MemoryModelZX81_56k extends MemoryModel {	// NOSONAR
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'ROM',
							rom: Utility.getExtensionPath() + '/data/zx81.rom'
						}
					]
				},
				{
					range: [0x1FFF, 0xFFFF],
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
		this.defaultTopOfStack = 0x7FFF; // Like for 16K
	}
}
