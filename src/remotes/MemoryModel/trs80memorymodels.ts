import {MemoryModel} from "./memorymodel";
import {Z80Registers} from "../z80registers";


/** Contains the predefined memory models for TRS-80 computers.
 */


/** TRS-80 base definition.
 */
export class MemoryModelTrs80Base extends MemoryModel {
	
	/** Initialize the TRS-80 memory model with long address functions.
	 */
	public init() {
		Z80Registers.setSlotsAndBanks(
			// Calculate long address
			(addr64k: number, slots: number[]) => {
				const slotIndex = this.slotAddress64kAssociation[addr64k];
				const bank = slots[slotIndex] + 1;
				return addr64k + (bank << 16);
			},
			// Returns slot index from address
			(addr64k: number) => {
				return this.slotAddress64kAssociation[addr64k];
			}
		);
	}
}


/** TRS-80 Model 3
 * 12KB ROM (0x0000-0x2FFF) + Video RAM (0x3C00-0x3FFF) + 48KB RAM (0x4000-0xFFFF)
 * Video RAM is actually mapped at 0x3C00-0x3FFF (1KB)
 * The area 0x3000-0x3BFF is mapped I/O and system ROM
 */
export class MemoryModelTrs80Model3 extends MemoryModelTrs80Base {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x2FFF],  // 12KB ROM
					banks: [
						{
							index: 0,
							name: 'ROM',
							shortName: 'ROM'
						}
					]
				},
				{
					range: [0x3000, 0x3BFF],  // Mapped I/O and system areas
					banks: [
						{
							index: 1,
							name: 'SYS_IO',
							shortName: 'SIO'
						}
					]
				},
				{
					range: [0x3C00, 0x3FFF],  // 1KB Video RAM
					banks: [
						{
							index: 2,
							name: 'VIDEO_RAM',
							shortName: 'VID'
						}
					]
				},
				{
					range: [0x4000, 0xFFFF],  // 48KB RAM
					banks: [
						{
							index: 3,
							name: 'RAM',
							shortName: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'TRS80_MODEL3';
	}
}


/** TRS-80 Model 1
 * 12KB ROM (0x0000-0x2FFF) + Video RAM (0x3C00-0x3FFF) + 48KB RAM (0x4000-0xFFFF)
 * Memory layout identical to Model 3 - differences are in ROM content and software, not memory structure
 * Video RAM is actually mapped at 0x3C00-0x3FFF (1KB)
 * The area 0x3000-0x3BFF is mapped I/O and system ROM
 */
export class MemoryModelTrs80Model1 extends MemoryModelTrs80Base {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0x2FFF],  // 12KB ROM
					banks: [
						{
							index: 0,
							name: 'ROM',
							shortName: 'ROM'
						}
					]
				},
				{
					range: [0x3000, 0x3BFF],  // Mapped I/O and system areas
					banks: [
						{
							index: 1,
							name: 'SYS_IO',
							shortName: 'SIO'
						}
					]
				},
				{
					range: [0x3C00, 0x3FFF],  // 1KB Video RAM
					banks: [
						{
							index: 2,
							name: 'VIDEO_RAM',
							shortName: 'VID'
						}
					]
				},
				{
					range: [0x4000, 0xFFFF],  // 48KB RAM
					banks: [
						{
							index: 3,
							name: 'RAM',
							shortName: 'RAM'
						}
					]
				},
			]
		});
		this.name = 'TRS80_MODEL1';
	}
}
