import {LogTransport} from '../../log';
import {Socket} from 'net';
import {Settings} from '../../settings/settings';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {CONNECTION_TIMEOUT} from './dzrpbufferremote';
import {DZRP} from '../dzrp/dzrpremote';
import {ZxNextSerialRemote} from './zxnextserialremote';


/**
 * A ZX Next remote that is connected via a socket instead of the serial
 * interface, e.g. through the ZX Next's ESP8266 WiFi module.
 *
 * Everything above the transport is identical to the serial connection:
 * the same 'dezogif' program runs on the ZX Next and the same DZRP
 * breakpoint handling (CMD_SET_BREAKPOINTS/CMD_RESTORE_MEM) is used.
 * Therefore only the transport specific methods are overridden here.
 *
 * Two differences to the serial connection, both a consequence of the
 * transport:
 * - No MESSAGE_START_BYTE (0xA5) is used. It exists because the ZX Next
 *   emits zeroes through the serial cable if the joy port is not
 *   configured. A socket does not have that problem.
 * - CMD_PAUSE is not refused. Over the serial cable the joy ports are
 *   given back to the debugged program when it is continued, which
 *   re-points the UART's RX line away from the joy port pin, so the
 *   ZX Next cannot receive anything while the program runs. Through a
 *   socket the UART stays connected and a byte can arrive at any time.
 *   Whether the pause takes effect is up to the program on the ZX Next,
 *   which has to notice the byte while the debugged program runs.
 */
export class ZxNextSocketRemote extends ZxNextSerialRemote {

	// The socket connection.
	public socket: Socket;


	/// Constructor.
	constructor() {
		super();
		// The socket transport does not use the MESSAGE_START_BYTE.
		this.usesMessageStartByte = false;
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
		this.cmdRespTimeoutTime = Settings.launch.zxnext.timeout * 1000;
		this.chunkTimeout = this.cmdRespTimeoutTime;

		// React on-open
		this.socket.on('connect', () => {
			(async () => {
				LogTransport.log('ZxNextSocketRemote: Connected to ZX Next!');

				this.receivedData = Buffer.alloc(0);
				this.expectedLength = 4;	// for length
				this.receivingHeader = true;
				this.stopChunkTimeout();

				this.longBreakedAddress = undefined;
				this.breakpointIdLastIndex = 0;
				await this.onConnect();
			})();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogTransport.log('ZxNextSocketRemote: closed connection: ' + hadError);
			// Error
			const err = new Error('ZX Next terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Handle errors
		this.socket.on('error', err => {
			ErrorWrapper.wrap(err);
			LogTransport.log('ZxNextSocketRemote: Error: ' + err);
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
		const port = Settings.launch.zxnext.port;
		const hostname = Settings.launch.zxnext.hostname;
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
			LogTransport.log('>>> ZxNextSocketRemote: Sending ' + txt);
			this.socket.write(buffer, () => {
				resolve();
			});
		});
	}


	/**
	 * Override of ZxNextSerialRemote, which refuses to pause because the
	 * serial cable cannot carry anything while the debugged program runs.
	 * Through a socket the byte does arrive, so the command is sent.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_PAUSE);
	}
}
