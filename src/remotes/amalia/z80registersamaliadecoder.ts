import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersGdbDecoder} from '../gdb/z80registersgdbdecoder';


// The Amalia gdbstub includes an unavailable IR register before the memory slots.
enum AMALIA_REG {
	S0 = 52,	// 13 (0x0D)
	S1 = 56,	// 14 (0x0E)
	S2 = 60,	// 15 (0x0F)
	S3 = 64		// 16 (0x10)
}


/** Parses the registers of the Amalia gdbstub.
 * Like the plain gdb 'g' packet but with the memory slots appended.
 */
export class Z80RegisterAmaliaDecoder extends Z80RegistersGdbDecoder {

	public parseSlots(data: RegisterData): number[] {
		return [this.parse(data, AMALIA_REG.S0), this.parse(data, AMALIA_REG.S1),
			this.parse(data, AMALIA_REG.S2), this.parse(data, AMALIA_REG.S3)];
	}
}
