import {Z80Registers} from '../z80registers';
import {MameGdbRemote} from '../mame/mamegdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {MameType} from '../../settings/settings';
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



}
