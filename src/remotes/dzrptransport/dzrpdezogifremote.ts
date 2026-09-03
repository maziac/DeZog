import {DzrpTransportRemote} from './dzrptransportremote';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegistersZxNextDecoder} from './z80registerszxnextdecoder';
import {DzrpTransportType, Settings} from '../../settings/settings';



/** This is the parent class for the zxnext remotes that use the dezogif
 * software.
 * The dezogif comes in two flavors: with a serial or a socket interface.
 */
export class DzrpDezogIfRemote extends DzrpTransportRemote {
	// Value to catch the MESSAGE_START_BYTE if received data was 1 byte only.
	protected msgStartByteFound: boolean;


	/// Constructor.
	constructor(settingsDzrpType: DzrpTransportType) {
		super(settingsDzrpType);
		// Init
		this.supportsBreakOnInterrupt = false;
	}


	/** Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersZxNextDecoder();
	}

	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}

	/** In the ZXNext dezogif implementation it can happen that
	 * the ZXNext is not able to receive the pause command. Therefore the
	 * timeout is reduced to 200ms to give a fast response to the UI.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		// Reduce the timeout
		const prevTimeout = this.cmdRespTimeoutTime;
		this.cmdRespTimeoutTime = 200; // ms
		try {
			await super.sendDzrpCmdPause();
		}
		catch (e) {
			throw e;
		}
		finally {
			// Restore the previous timeout
			this.cmdRespTimeoutTime = prevTimeout;
		}

	}
}

