import {DecodeRegisterData, RegisterData} from './decoderegisterdata';
import {Z80_REG} from './z80registers';


/**
 * The standard decoder for registers.
 * Can be used if no external remote is involved, e.g. for the internal
 * simulator.
 */
export class Z80RegistersStandardDecoder extends DecodeRegisterData {

	/**
	 * Parses the register output for PC etc.
	 * @param data The output from zesarux.
	 * @returns The value.
	 */
	public parsePC(data: RegisterData): number {
		return data[Z80_REG.PC];
	}

	public parseSP(data: RegisterData): number {
		return data[Z80_REG.SP];
	}

	public parseAF(data: RegisterData): number {
		return data[Z80_REG.AF];
	}

	public parseBC(data: RegisterData): number {
		return data[Z80_REG.BC];
	}

	public parseHL(data: RegisterData): number {
		return data[Z80_REG.HL];
	}

	public parseDE(data: RegisterData): number {
		return data[Z80_REG.DE];
	}

	public parseIX(data: RegisterData): number {
		return data[Z80_REG.IX];
	}

	public parseIY(data: RegisterData): number {
		return data[Z80_REG.IY];
	}

	public parseAF2(data: RegisterData): number {
		return data[Z80_REG.AF2];
	}

	public parseBC2(data: RegisterData): number {
		return data[Z80_REG.BC2];
	}

	public parseHL2(data: RegisterData): number {
		return data[Z80_REG.HL2];
	}

	public parseDE2(data: RegisterData): number {
		return data[Z80_REG.DE2];
	}

	public parseI(data: RegisterData): number {
		return data[Z80_REG.IR]>>>8;
	}

	public parseR(data: RegisterData): number {
		return data[Z80_REG.IR]&0xFF;
	}

	public parseIM(data: RegisterData): number {
		return data[Z80_REG.IM];
	}

	public parseSlots(data: RegisterData): number[] {
		// Decode slots
		let i=Z80_REG.IM+1;
		const slotCount=data[i++];
		const slots=new Array<number>(slotCount);
		for (let k=0; k<slotCount; k++) {
			slots[k]=data[i++];
		}
		return slots;
	}

}

