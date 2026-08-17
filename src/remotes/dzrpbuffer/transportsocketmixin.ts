import {Socket} from "net";
import {DzrpBufferRemote} from "./dzrpbufferremote";
import {Settings} from "../../settings/settings";
import {LogTransport} from "../../log";
import {ErrorWrapper} from "../../misc/errorwrapper";


/** A mixture that handles the serial port.
 * Open, close, sending and receiving.
 * It only handles the bare serial port.
 * It is agnostic of the used protocol. I.e. it does not know about the DZRP protocol.
 *
 * Use e.g. as:
 * class ZxNextSocketRemote extends WithSocket(DzrpDezogIfRemote) {...}
 */

type Constructor<T = {}> = new (...args: any[]) => T;

export function WithSocket<TBase extends Constructor<DzrpBufferRemote>>(Base: TBase) {
	return class extends Base {
		protected socket!: Socket;

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
			this.socket.setTimeout(DzrpBufferRemote.CONNECTION_TIMEOUT);
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
	};
}
