import {MemoryModel} from "./memorymodel";


/** Contains the predefined memory model for the Colecovision computer.
 */


/** The ColecoVision memory model:
 * 0000-1FFF = ColecoVision BIOS OS 7' (BIOS)
 * 2000-5FFF = Expansion port (EXP)
 * 6000-7FFF = 1K RAM mapped into 8K (7000-73FF) (RAM)
 * 8000-FFFF = Game Cartridge (CR)
 *
 * ZEsarUX uses:
 * 0000-1FFF = BIOS ROM (BIO)
 * 2000-3FFF = Expansion port (EXP)
 * 4000-5FFF = Expansion port (EXP)
 * 6000-7FFF = RAM (1K mapped into an 8K spot) (RAM)
 * 8000-9FFF = Cart ROM (CR)
 * A000-BFFF = Cart ROM (CR)
 * C000-DFFF = Cart ROM (CR)
 * E000-FFFF = Cart ROM (CR)
 */
export class MemoryModelColecoVision extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x1FFF],
					banks: [
						{
							index: 0,
							name: 'BIOS',
							shortName: 'BIOS',
							rom: true
						}
					]
				},
				{
					range: [0x2000, 0x5FFF],
					banks: [
						{
							index: 1,
							name: 'Expansion port',
							shortName: 'EXP',
						}
					]
				},
				{
					range: [0x7000, 0x73FF],
					banks: [
						{
							index: 2,
							name: 'RAM (1k)',
							shortName: 'RAM'
						}
					]
				},
				{
					range: [0x8000, 0xFFFF],
					banks: [
						{
							index: 3,
							name: 'Cartridge ROM',
							shortName: 'CR',
							rom: true
						}
					]
				}
			]
		});
		this.name = 'ColecoVision';
	}
}
