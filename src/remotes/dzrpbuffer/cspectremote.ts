import {DzrpBufferRemote} from './dzrpbufferremote';
import {CSpectType, Settings} from '../../settings/settings';
import {WithSocket} from './transportsocketmixin';



/** The CSpect Remote.
 * It connects via socket with CSpect.
 * Or better: with the DeZog plugin for CSpect.
 * The CSpect DeZog plugin internally communicates with the
 * CSpect debugger.
 */
export class CSpectRemote extends WithSocket(DzrpBufferRemote) {
	protected override logName = 'CSpectRemote';

	/// Constructor.
	constructor(settingsDzrpType: CSpectType) {
		super(settingsDzrpType);
		// Init
		this.supportsBreakOnInterrupt = false;
		// Set automatically though supportedCommands:
		// this.supportsASSERTION = true;
		// this.supportsWPMEM = false;
		// this.supportsLOGPOINT = true;
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


	/** Overrides the parent to send the additional pause command.
	 */
	public async disconnect(): Promise<void> {
		if (!this.socket)
			return;

		// Check if socket is already open.
		if (this.socket.readyState === 'open') {
			// Socket is open for communication:
			// Send a 'break' request to emulator to stop it if it is running. (Note: does work only with cspect.)
			try {
				await this.pause();
			}
			catch {}; // Ignore any error while disconnecting.

			// Disconnect: Removes listeners and sends a CLOSE command.
			await super.disconnect();
		}

		return new Promise<void>(resolve => {
			this.socket?.removeAllListeners();
			// Timeout is required because socket.end() does not call the
			// callback if it is already closed and the state cannot
			// reliable be determined.
			const timeout = setTimeout(() => {
				if (resolve) {
					resolve();
				}
			}, 1000);	// 1 sec
			this.socket?.end(() => {
				if (resolve) {
					resolve();
					clearTimeout(timeout);
				}
			});
			this.socket = undefined as any;
		});
	}


	/** Watchpoints and WPMEM is disabled for CSpect for now.
	 * There is a problem in CSpect: If a read-breakpoint is set it
	 * can happen that the PC is not incremented anymore or that the
	 * ISR routine is entered for every instruction. It's not on Mike's priority list, so I disable them here.
	 * REMARK: Enable CSpect watchpoints when problem is solved in CSpect.
	 */
	public async enableWPMEM(enable: boolean): Promise<void> {
		if (this.wpmemWatchpoints.length > 0) {
			// Only if watchpoints exist
			throw Error("There is no support for watchpoints for CSpect.");
		}
	}


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}
}
