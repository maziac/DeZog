import {LogTransport} from '../../log';
import {DzrpBufferRemote, CONNECTION_TIMEOUT} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings/settings';
import {GenericWatchpoint} from '../../genericwatchpoint';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {DZRP} from '../dzrp/dzrpremote';



/**
 * The CSpect Remote.
 * It connects via socket with CSpect.
 * Or better: with the DeZog plugin for CSpect.
 * The CSpect DeZog plugin internally communicates with the
 * CSpect debugger.
 */
export class CSpectRemote extends DzrpBufferRemote {

	// The socket connection.
	public socket: Socket;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = false;
		this.supportsLOGPOINT = true;
		this.supportsBreakOnInterrupt = false;
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Init socket
		this.socket = new Socket();
		this.socket.unref();

		// Set timeouts
		this.cmdRespTimeoutTime = Settings.launch.cspect.socketTimeout * 1000;
		this.chunkTimeout = this.cmdRespTimeoutTime;

		// React on-open
		this.socket.on('connect', () => {
			(async () => {
				LogTransport.log('CSpectRemote: Connected to server!');

				this.receivedData = Buffer.alloc(0);
				this.expectedLength = 4;	// for length
				this.receivingHeader = true;
				this.stopChunkTimeout();

				// Check for unsupported settings
				if (Settings.launch.history.codeCoverageEnabled) {
					this.emit('warning', "launch.json: codeCoverageEnabled==true: CSpect does not support code coverage.");
				}

				await this.onConnect();
			})();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogTransport.log('CSpectRemote: closed connection: ' + hadError);
			//console.log('Close.');
			// Error
			const err = new Error('CSpect plugin terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Handle errors
		this.socket.on('error', err => {
			ErrorWrapper.wrap(err);
			LogTransport.log('CSpectRemote: Error: ' + err);
			//console.log('Error: ', err.message);
			// Error
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Receive data
		this.socket.on('data', data => {
			this.dataReceived(data);
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port = Settings.launch.cspect.port;
		const hostname = Settings.launch.cspect.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		if (!this.socket)
			return;

		// Check if socket is already open.
		if (this.socket.readyState === 'open') {
			// Socket is open for communication:
			// Send a 'break' request to emulator to stop it if it is running. (Note: does work only with cspect.)
			await this.pause();

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


	/**
	 * Writes the buffer to the socket port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>(resolve => {
			// Send data
			const txt = this.dzrpCmdBufferToString(buffer);
			LogTransport.log('>>> CSpectRemote: Sending ' + txt);
			this.socket.write(buffer, () => {
				resolve();
			});
		});
	}


	/**
	 * Watchpoints and WPMEM is disabled for CSpect for now.
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


	/**
	 * This throws an exception. Used and catched by the unit tests.
	 * @param wp The watchpoint to set. Will set 'bpId' in the 'watchPoint'.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		throw Error("Watchpoints not supported for CSpect.");
	}


	/**
	 * State saving is not supported in CSpect.
	 */
	public async stateSave(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with CSpect.");
	}
	public async stateRestore(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with CSpect.");
	}


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdSetBreakpoints(bpAddresses: Array<number>): Promise<Array<number>> {
		throw Error("'sendDzrpCmdSetBreakpoints' is not implemented.'");
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdRestoreMem(elems: Array<{address: number, value: number}>): Promise<void> {
		throw Error("'sendDzrpCmdRestoreMem' is not implemented.");
	}


	/** In from port.
	 */
	protected async sendDzrpCmdReadPort(port: number): Promise<number> {
		const data = await this.sendDzrpCmd(DZRP.CMD_READ_PORT, [port & 0xFF, port >>> 8]);
		return data[0];
	}


	/** Out to port.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_WRITE_PORT, [port & 0xFF, port >>> 8, value]);
	}


	/** Execute assembly code.
	 */
	protected async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
		const data = await this.sendDzrpCmd(DZRP.CMD_EXEC_ASM, code);
		return {
			error: data[0],
			f: data[1],
			a: data[2],
			bc: data[3] + 256 * data[4],
			de: data[5] + 256 * data[6],
			hl: data[7] + 256 * data[8]
		};
	}


	/**
	 * Is called by loadBinSna but not supported by the CSpect plugin.
	 * Therefore it does nothing.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		// NOSONAR
		//super.sendDzrpCmdInterruptOnOff(enable); // TODO: Enable when Cspect is release with dezog plugin v2.3.0
	}
}
