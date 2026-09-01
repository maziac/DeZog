import {DzrpTransportRemote} from './dzrptransportremote';
import {CSpectType, Settings} from '../../settings/settings';
import {WithSocket} from './transportsocketmixin';



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


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}
}
