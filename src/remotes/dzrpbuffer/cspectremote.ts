import {DzrpTransportRemote} from './dzrptransportremote';
import {CSpectType, Settings} from '../../settings/settings';
import {WithSocket} from './transportsocketmixin';
import {DZRP} from '../dzrp/dzrpremote';



/** The CSpect Remote.
 * It connects via socket with CSpect.
 * Or better: with the DeZog plugin for CSpect.
 * The CSpect DeZog plugin internally communicates with the
 * CSpect debugger.
 */
export class CSpectRemote extends WithSocket(DzrpTransportRemote) {
	protected override logName = 'CSpectRemote';

	/// Constructor.
	constructor(settingsDzrpType: CSpectType) {
		super(settingsDzrpType);
		// Init
		this.supportsBreakOnInterrupt = false;
	}


	/** Returns the default unsupported commands for the CSpect remote.
	 */
	protected getDefaultUnsupportedCommands(): number[] {
		return [
			DZRP.CMD_SET_BREAKPOINTS, DZRP.CMD_RESTORE_MEM, DZRP.CMD_LOOPBACK, DZRP.CMD_ADD_WATCHPOINT, DZRP.CMD_REMOVE_WATCHPOINT, DZRP.CMD_READ_STATE, DZRP.CMD_WRITE_STATE
		];
	}


	/** Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		// Check for unsupported settings
		if (Settings.launch.history.codeCoverageEnabled) {
			this.emit('warning', "launch.json: codeCoverageEnabled==true: CSpect does not support code coverage.");
		}
		await super.onConnect();
	}


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}
}
