import {RegisterData} from '../decoderegisterdata';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';



/**
 * The 'zxnext' remote does not allow to obtain the IM value.
 */
export class Z80RegistersZxNextDecoder extends Z80RegistersStandardDecoder {

	public parseIM(data: RegisterData): number {
		return NaN;
	}
}

