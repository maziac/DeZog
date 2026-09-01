import {DzrpTransportRemote} from './dzrptransportremote';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegistersZxNextDecoder} from './z80registerszxnextdecoder';
import {DzrpTransportType, Settings} from '../../settings/settings';
import {DZRP} from '../dzrp/dzrpremote';



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
		// Set automatically though supportedCommands:
		// this.supportsASSERTION = true;
		// this.supportsWPMEM = false;
		// this.supportsLOGPOINT = true;
		// Overwrite minimal required version
		this.DZRP_VERSION = [2, 2, 0];
	}

	/** Returns the default unsupported commands for a dezogif
	 * (zxnext) remote.
	 */
	protected getDefaultUnsupportedCommands(): number[] {
		return [
			DZRP.CMD_GET_SPRITES, DZRP.CMD_GET_SPRITE_PATTERNS, DZRP.CMD_ADD_BREAKPOINT, DZRP.CMD_REMOVE_BREAKPOINT, DZRP.CMD_ADD_WATCHPOINT, DZRP.CMD_REMOVE_WATCHPOINT,
			DZRP.CMD_READ_STATE, DZRP.CMD_WRITE_STATE
		];
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

