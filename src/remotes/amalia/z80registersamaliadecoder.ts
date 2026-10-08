import {HexFormat} from '../../misc/hexformat';
import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';


// The character index into the 'g' packet reply for each register.
// The Amalia gdbstub appends the 4 memory slots after the standard registers.
enum AMALIA_REG {
	AF = 0,		// 0
	BC = 4,		// 1
	DE = 8,		// 2
	HL = 12,	// 3
	AF2 = 16,	// 4
	BC2 = 20,	// 5
	DE2 = 24,	// 6
	HL2 = 28,	// 7
	IX = 32,	// 8
	IY = 36,	// 9
	SP = 40,	// 10 (0x0A)
	PC = 44,	// 11 (0x0B)
	S0 = 48,	// 12 (0x0C)
	S1 = 52,	// 13 (0x0D)
	S2 = 56,	// 14 (0x0E)
	S3 = 60		// 15 (0x0F)
}


/** Parses the registers of the Amalia gdbstub.
 * The values come from the gdb 'g' packet, i.e. one hex string with the
 * words in little endian order.
 */
export class Z80RegisterAmaliaDecoder extends Z80RegistersStandardDecoder {

	public parse(data: RegisterData, index: AMALIA_REG): number {
		return HexFormat.parseHexWordLE(data as any, index);
	}

	public parsePC(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.PC);
	}

	public parseSP(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.SP);
	}

	public parseAF(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.AF);
	}

	public parseBC(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.BC);
	}

	public parseHL(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.HL);
	}

	public parseDE(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.DE);
	}

	public parseIX(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.IX);
	}

	public parseIY(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.IY);
	}

	public parseAF2(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.AF2);
	}

	public parseBC2(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.BC2);
	}

	public parseHL2(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.HL2);
	}

	public parseDE2(data: RegisterData): number {
		return this.parse(data, AMALIA_REG.DE2);
	}

	public parseI(_data: RegisterData): number {
		return NaN;
	}

	public parseR(_data: RegisterData): number {
		return NaN;
	}

	public parseIM(_data: RegisterData): number {
		return NaN;
	}

	public parseSlots(data: RegisterData): number[] {
		return [this.parse(data, AMALIA_REG.S0), this.parse(data, AMALIA_REG.S1),
			this.parse(data, AMALIA_REG.S2), this.parse(data, AMALIA_REG.S3)];
	}
}


