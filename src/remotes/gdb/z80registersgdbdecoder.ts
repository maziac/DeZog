import {RegisterData} from '../decoderegisterdata';
import {HexFormat} from '../../misc/hexformat';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';


// The character index into the 'g' packet reply for each register.
export enum GDB_REG {
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
	PC = 44		// 11 (0x0B)
}


/** Parses the reply of the gdb 'g' packet.
 * The reply is one hex string holding the register words in little endian
 * order. I, R and IM are not part of it.
 */
export class Z80RegistersGdbDecoder extends Z80RegistersStandardDecoder {

	public parse(data: RegisterData, index: number): number {
		return HexFormat.parseHexWordLE(data as unknown as string, index);
	}

	public parsePC(data: RegisterData): number {
		return this.parse(data, GDB_REG.PC);
	}

	public parseSP(data: RegisterData): number {
		return this.parse(data, GDB_REG.SP);
	}

	public parseAF(data: RegisterData): number {
		return this.parse(data, GDB_REG.AF);
	}

	public parseBC(data: RegisterData): number {
		return this.parse(data, GDB_REG.BC);
	}

	public parseHL(data: RegisterData): number {
		return this.parse(data, GDB_REG.HL);
	}

	public parseDE(data: RegisterData): number {
		return this.parse(data, GDB_REG.DE);
	}

	public parseIX(data: RegisterData): number {
		return this.parse(data, GDB_REG.IX);
	}

	public parseIY(data: RegisterData): number {
		return this.parse(data, GDB_REG.IY);
	}

	public parseAF2(data: RegisterData): number {
		return this.parse(data, GDB_REG.AF2);
	}

	public parseBC2(data: RegisterData): number {
		return this.parse(data, GDB_REG.BC2);
	}

	public parseHL2(data: RegisterData): number {
		return this.parse(data, GDB_REG.HL2);
	}

	public parseDE2(data: RegisterData): number {
		return this.parse(data, GDB_REG.DE2);
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

	public parseSlots(_data: RegisterData): number[] {
		// The gdb protocol has no banking information
		return [0];
	}
}
