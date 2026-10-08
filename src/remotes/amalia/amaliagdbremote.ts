import {GdbRemote} from '../gdb/gdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {MemBlock} from '../remotebase';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegisterAmaliaDecoder} from './z80registersamaliadecoder';


/** The Amstrad PCW running the Amalia gdbstub.
 * Only the standard gdb packets are used, see GdbRemote.
 * The stub appends the 4 memory slots to the 'g' packet reply.
 */
export class AmaliaGdbRemote extends GdbRemote {
	protected override logName = 'AmaliaGdbRemote';

	// Blocks further apart than this are not merged into one 'm'.
	protected readonly MAX_READ_GAP = 0x100;
	// Max. size of a merged 'm' read.
	protected readonly MAX_READ_BLOCK = 0x400;


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


	/** Reads several memory blocks with as few 'm' packets as possible.
	 * Neighbouring blocks (e.g. the call stack entries) are merged into one
	 * read, which matters because each packet costs a network round trip.
	 * @param blocks The 64k start addresses and sizes of the blocks.
	 * @returns A promise with an array of Uint8Arrays, one for each block.
	 */
	protected async sendDzrpCmdReadMem(blocks: MemBlock[]): Promise<Uint8Array[]> {
		if (blocks.length <= 1)
			return super.sendDzrpCmdReadMem(blocks);

		const result = new Array<Uint8Array>(blocks.length);

		// Blocks that wrap around 0xFFFF are read on their own
		const mergeable: number[] = [];
		for (let i = 0; i < blocks.length; i++) {
			const {addr64k, size} = blocks[i];
			if (addr64k + size > 0x10000)
				result[i] = await this.readMemWithM(addr64k, size);
			else
				mergeable.push(i);
		}
		mergeable.sort((a, b) => blocks[a].addr64k - blocks[b].addr64k);

		let i = 0;
		while (i < mergeable.length) {
			const start = blocks[mergeable[i]].addr64k;
			let end = start + blocks[mergeable[i]].size;
			// Collect the following blocks that are close enough
			let j = i;
			while (j + 1 < mergeable.length) {
				const next = blocks[mergeable[j + 1]];
				const nextEnd = next.addr64k + next.size;
				if (next.addr64k - end > this.MAX_READ_GAP)
					break;
				if (nextEnd - start > this.MAX_READ_BLOCK)
					break;
				j++;
				if (nextEnd > end)
					end = nextEnd;
			}
			// One read for all of them
			const data = await this.readMemWithM(start, end - start);
			for (let k = i; k <= j; k++) {
				const index = mergeable[k];
				const offs = blocks[index].addr64k - start;
				result[index] = data.subarray(offs, offs + blocks[index].size);
			}
			i = j + 1;
		}

		return result;
	}
}
