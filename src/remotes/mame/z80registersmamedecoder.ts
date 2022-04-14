import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';



// The index into the data string for certain registers.
enum MAME_REG {
	AF = 0,
	BC = 4,
	DE = 8,
	HL = 12,
	AF2 = 16,
	BC2 = 20,
	DE2 = 24,
	HL2 = 28,
	IX = 32,
	IY = 36,
	SP = 40,
	PC = 44
}


/**
 * Parses the register data received from the MAME gdbstub.
 * The register data is stored as hex values in the data string.
 * The index into the string depends on the register.
 */
export class Z80RegistersMameDecoder extends Z80RegistersStandardDecoder {

	/**
	 * Parses the register output for PC etc.
	 * @param data The output from zesarux.
	 * @returns The value.
	 */
	public parsePC(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.PC, MAME_REG.PC + 4), 16);
	}

	public parseSP(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.SP, MAME_REG.SP + 4), 16);
	}

	public parseAF(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.AF, MAME_REG.AF + 4), 16);
	}

	public parseBC(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.BC, MAME_REG.BC + 4), 16);
	}

	public parseHL(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.HL, MAME_REG.HL + 4), 16);
	}

	public parseDE(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.DE, MAME_REG.DE + 4), 16);
	}

	public parseIX(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.IX, MAME_REG.IX + 4), 16);
	}

	public parseIY(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.IY, MAME_REG.IY + 4), 16);
	}

	public parseAF2(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.AF2, MAME_REG.AF2 + 4), 16);
	}

	public parseBC2(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.BC2, MAME_REG.BC2 + 4), 16);
	}

	public parseHL2(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.HL2, MAME_REG.HL2 + 4), 16);
	}

	public parseDE2(data: RegisterData): number {
		return parseInt(data.substring(MAME_REG.DE2, MAME_REG.DE2 + 4), 16);
	}

	public parseI(data: RegisterData): number {
		// TODO: not supported. Report differently?
		return 0;
	}

	public parseR(data: RegisterData): number {
		// TODO: not supported. Report differently?
		return 0;
	}

	public parseIM(data: RegisterData): number {
		// TODO: not supported. Report differently?
		return 0;
	}

	public parseSlots(data: RegisterData): number[] {
		// TODO: Do I use this ? What about parsePCLong?
		return [];
	}

}

