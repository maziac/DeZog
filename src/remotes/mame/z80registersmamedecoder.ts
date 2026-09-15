import {RegisterData} from '../decoderegisterdata';
import {Z80_REG} from '../z80registers';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';



/**
 * Parses the register data received from the MAME gdbstub.
 * The register data is stored as hex values in the data string.
 * The index into the string depends on the register.
 */
export class Z80RegistersMameDecoder extends Z80RegistersStandardDecoder {

	/**
	 * General parse function from index.
	 * @param data The output from Mame for the command 'print pc,sp,af,bc,de,hl,ix,iy,af2,bc2,de2,hl2,ir,im' + ',mmu0,mmu1,mmu2,mmu3,mmu4,mmu5,mmu6,mmu7' if Z80N is enabled.
	 * Is an array of register values split from the MAME response.
	 * @param index The index into the data array.
	 * @returns The value.
	 */
	public parse(data: RegisterData, index: Z80_REG): number {
		const hexString = data[index];
		return parseInt(hexString, 16);
	}


	/**
	 * Parses the register output for PC etc.
	 * @param data The output from Mame.
	 * @returns The value.
	 */
	public parsePC(data: RegisterData): number {
		return this.parse(data, Z80_REG.PC);
	}

	public parseSP(data: RegisterData): number {
		return this.parse(data, Z80_REG.SP);
	}

	public parseAF(data: RegisterData): number {
		return this.parse(data, Z80_REG.AF);
	}

	public parseBC(data: RegisterData): number {
		return this.parse(data, Z80_REG.BC);
	}

	public parseHL(data: RegisterData): number {
		return this.parse(data, Z80_REG.HL);
	}

	public parseDE(data: RegisterData): number {
		return this.parse(data, Z80_REG.DE);
	}

	public parseIX(data: RegisterData): number {
		return this.parse(data, Z80_REG.IX);
	}

	public parseIY(data: RegisterData): number {
		return this.parse(data, Z80_REG.IY);
	}

	public parseAF2(data: RegisterData): number {
		return this.parse(data, Z80_REG.AF2);
	}

	public parseBC2(data: RegisterData): number {
		return this.parse(data, Z80_REG.BC2);
	}

	public parseHL2(data: RegisterData): number {
		return this.parse(data, Z80_REG.HL2);
	}

	public parseDE2(data: RegisterData): number {
		return this.parse(data, Z80_REG.DE2);
	}

	public parseI(data: RegisterData): number {
		return this.parse(data, Z80_REG.I);
	}

	public parseR(data: RegisterData): number {
		return this.parse(data, Z80_REG.R);
	}

	public parseIM(data: RegisterData): number {
		return this.parse(data, Z80_REG.IM);
	}

	public parseSlots(data: RegisterData): number[] {
		let mmu = Z80_REG.IM + 1;
		if (data.length < mmu) {
			// No MMU registers, probably no Z80N
			return [0];
		}
		const slots: number[] = [];
		for (let i = 0; i < 8; i++) {
			// Parse each MMU register if needed
			// mmu[i] = this.parse(data, mmu + i);
			const hexString = data[mmu + i];
			const bank = parseInt(hexString, 16);
			slots.push(bank);
		}
		// At the moment no banking is supported with the MAME gdbstub:
		return slots;
	}

}

