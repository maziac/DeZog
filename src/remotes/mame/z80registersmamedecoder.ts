import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';



// The index into the data string for certain registers.
//enum MAME_REG {
//}


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
		return 0xA5;
	}

	public parseSP(data: RegisterData): number {
		return 0xA5;
	}

	public parseAF(data: RegisterData): number {
		return 0xA5;
	}

	public parseBC(data: RegisterData): number {
		return 0xA5;
	}

	public parseHL(data: RegisterData): number {
		return 0xA5;
	}

	public parseDE(data: RegisterData): number {
		return 0xA5;
	}

	public parseIX(data: RegisterData): number {
		return 0xA5;
	}

	public parseIY(data: RegisterData): number {
		return 0xA5;
	}

	public parseAF2(data: RegisterData): number {
		return 0xA5;
	}

	public parseBC2(data: RegisterData): number {
		return 0xA5;
	}

	public parseHL2(data: RegisterData): number {
		return 0xA5;
	}

	public parseDE2(data: RegisterData): number {
		return 0xA5;
	}

	public parseI(data: RegisterData): number {
		return 0xA5;
	}

	public parseR(data: RegisterData): number {
		return 0xA5;
	}

	public parseIM(data: RegisterData): number {
		return 0xA5;
	}

	public parseSlots(data: RegisterData): number[] {
		// TODO: Do I use this ? What about parsePCLong?
		return [];
	}

}

