import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersGdbDecoder} from '../gdb/z80registersgdbdecoder';


// The Amalia gdbstub appends the 4 memory slots after the standard registers
// of the 'g' packet reply.
enum AMALIA_REG {
	S0 = 48,	// 12 (0x0C)
	S1 = 52,	// 13 (0x0D)
	S2 = 56,	// 14 (0x0E)
	S3 = 60		// 15 (0x0F)
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
