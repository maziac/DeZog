import {LogTransport} from '../../log';
import {Socket} from 'net';
import {Settings} from '../../settings/settings';
import {DzrpBufferRemote, CONNECTION_TIMEOUT} from './dzrpbufferremote';



/**
 * The representation of a MAME remote.
 * Uses the MAME DeZog DZRP plugin.
 */
export class MameRemote extends DzrpBufferRemote {


	// The socket connection.
	public socket: Socket;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = false;
		this.supportsLOGPOINT = true;
		this.cmdRespTimeoutTime = Settings.launch.mame.socketTimeout * 1000;
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

		// React on-open
		this.socket.on('connect', async () => {
			LogTransport.log('MameRemote: Connected to server!');

			this.receivedData = Buffer.alloc(0);
			this.expectedLength = 4;	// for length
			this.receivingHeader = true;
			this.stopChunkTimeout();

			// Check for unsupported settings
			if (Settings.launch.history.codeCoverageEnabled) {
				this.emit('warning', "launch.json: codeCoverageEnabled==true: MAME does not support code coverage.");
			}

			this.onConnect();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogTransport.log('MameRemote: closed connection: ' + hadError);
			console.log('Close.');
			// Error
			const err = new Error('Mame plugin terminated the connection!');
			this.emit('error', err);
		});

		// Handle errors
		this.socket.on('error', err => {
			LogTransport.log('MameRemote: Error: ' + err);
			console.log('Error: ', err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.socket.on('data', data => {
			this.dataReceived(data);
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port = Settings.launch.mame.port;
		const hostname = Settings.launch.mame.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		if (!this.socket)
			return;

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
			LogTransport.log('>>> MameRemote: Sending ' + txt);
			this.socket.write(buffer, () => {
				resolve();
			});
		});
	}


	/**
	 * Setting border is not supported with MAME.
     */
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
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
}
