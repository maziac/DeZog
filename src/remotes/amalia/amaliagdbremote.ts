import {Z80Registers} from '../z80registers';
import {MameGdbRemote} from '../mame/mamegdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {MameType} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegisterAmaliaDecoder} from './z80registersamaliadecoder';

export class AmaliaGdbRemote extends MameGdbRemote {
	constructor(settingsMameType: MameType) {
		super(settingsMameType);
	}

	/** Override to create the Amalia-specific decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegisterAmaliaDecoder();
	}

    /** Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Init
			//const qReply =
			//await this.sendPacketData('?'); // Reply is ignored
			const qXmlReply = await this.sendPacketData('qXfer:features:read:target.xml:00,FFFF');	// Enable 'g', 'G', 'p', and 'P commands

			// Check the XML
			this.parseXml(qXmlReply);

			// Load executable
			await this.load();

			Z80Registers.decoder = this.createZ80RegistersDecoder();

			this.memoryModel = new MemoryModelAmstradPCW()
			this.memoryModel.init();

			// Ready
			this.emit('initialized', 'Amalia connected!')
		}
		catch (err) {
			try {
				this.emit('error', err);
			}
			catch {};
		}
	}     

	protected readonly MAX_PACKET_SIZE: number = 128;

	/** Sends the command to retrieve a memory dump.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
        //const cmd = 'm' + addr64k.toString(16) + ',' + size.toString(16);
		//const resp = await this.sendPacketData(cmd);
		// Parse the hex values
		//if ( size == 0x10000)
		//	size = 0xA000; // MAME gdbstub cannot handle 64k reads. Reduce to 64k-1.

		const chunkSize = Math.floor((this.MAX_PACKET_SIZE - 4) / 2); // 2 hex chars per byte	

		const buffer = new Uint8Array(size);
		let remaining = size;
		let offset = 0;
		let addr = addr64k & 0xFFFF; // ensure 16-bit address
		while (remaining > 0) {
			let sendSize = remaining;
			if (sendSize > chunkSize)
				sendSize = chunkSize; // Note: MAME gdbstub returns 2 hex chars per byte
			// Note: existing code used size-1 for the m command. Keep same behaviour per chunk.
			const cmd = 'm' + Utility.getHexString(addr, 4) + ',' + Utility.getHexString(sendSize, 4);
			const resp = await this.sendPacketData(cmd);

			// Expect 2 hex chars per byte
			const expectedLen = sendSize * 2;
			if (resp.length < expectedLen)
				throw Error("Communication error: Amalia replied with truncated memory data.");

			for (let i = 0; i < sendSize; i++) {
				const k = 2 * i;
				const valString = resp.substring(k, k + 2);
				const val = parseInt(valString, 16);
				buffer[offset + i] = val;
			}

			// Advance
			rest:
			remaining -= sendSize;
			offset += sendSize;
			addr = (addr + sendSize) & 0xFFFF;
		}

		return buffer;
	}


	/** Sends the command to write a memory dump.
	 * @param addr64k The memory start address (64k).
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const chunkSize = Math.floor((this.MAX_PACKET_SIZE - 15) / 2); // 2 hex chars per byte	
		let totalSize = dataArray.length;
		let i = 0;
		while (totalSize > 0) {
			// Next sending size
			let sendSize = totalSize;
			if (sendSize > chunkSize)
				sendSize = chunkSize;
			// The command
			let cmd = 'M' + Utility.getHexString(addr64k, 4) + ',' + Utility.getHexString(sendSize, 4) + ':';
			// Convert memory array into a string (cmd)
			const end = i + sendSize;
			for (; i < end; i++) {
				const val = dataArray[i];
				cmd += Utility.getHexString(val, 2);
			}
			// Send to MAME
			await this.sendPacketDataOk(cmd);
			// Next
			totalSize -= sendSize;
			addr64k += sendSize;
		}
	}

}
