import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersMameDecoder} from '../mame/z80registersmamedecoder';

// Additional Amalia-specific register indices
// Memory slots are appended at the end of the registers, so they start at 12*4 = 48 (0x30)
enum AMALIA_REG {
	S0  = 48,	// 12 (0x0C)
	S1  = 52,	// 13 (0x0D)
	S2  = 56,	// 14 (0x0E)
	S3  = 60	// 15 (0x0F)
}


export class Z80RegisterAmaliaDecoder extends Z80RegistersMameDecoder {
	public parseSlots(data: RegisterData): number[] {
		//The current slots are appened at the end of the registers
		return ([this.parse(data, AMALIA_REG.S0 as any), this.parse(data, AMALIA_REG.S1 as any),
			this.parse(data, AMALIA_REG.S2 as any), this.parse(data, AMALIA_REG.S3 as any)])
	}
}


