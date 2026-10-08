import {GdbRemote} from '../gdb/gdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegisterAmaliaDecoder} from './z80registersamaliadecoder';


/** The Amstrad PCW running the Amalia gdbstub.
 * Only the standard gdb packets are used, see GdbRemote.
 * The stub appends the 4 memory slots to the 'g' packet reply.
 */
export class AmaliaGdbRemote extends GdbRemote {
	protected override logName = 'AmaliaGdbRemote';


	/** The decoder also reads the memory slots.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegisterAmaliaDecoder();
	}


	/** The PCW pages 4 banks of 16k.
	 */
	protected createMemoryModel() {
		return new MemoryModelAmstradPCW();
	}
}
