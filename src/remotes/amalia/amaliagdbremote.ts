import {GdbRemote} from '../gdb/gdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {MemBlock} from '../remotebase';
import {GenericBreakpoint} from '../../genericwatchpoint';
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
	protected async sendDzrpCmdReadMemBlocks(blocks: MemBlock[]): Promise<Uint8Array[]> {
		if (blocks.length <= 1)
			return super.sendDzrpCmdReadMemBlocks(blocks);

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


	/** The breakpoint address for the 'Z0'/'z0' packet.
	 * If the breakpoint is bound to a bank the full long address is sent
	 * (bank+1 in bits 16+), otherwise the plain 64k address. The Amalia
	 * gdbstub breaks on a long address only if that bank is paged in.
	 * @param longAddress The (long) breakpoint address.
	 */
	protected breakpointAddress(longAddress: number): string {
		const bankp1 = longAddress >>> 16;
		if (bankp1 === 0)
			return (longAddress & 0xFFFF).toString(16);	// Any bank
		return longAddress.toString(16);
	}


	/** Adds a breakpoint, bank aware.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		await this.sendPacketDataOk('Z0,' + this.breakpointAddress(bp.longAddress) + ',0');
		bp.bpId = 1;	// Removal is by address, so any non-zero id will do.
	}


	/** Removes a breakpoint, bank aware.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		await this.sendPacketDataOk('z0,' + this.breakpointAddress(bp.longAddress) + ',0');
	}
}
