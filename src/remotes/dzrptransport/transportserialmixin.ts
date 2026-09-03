import {LogTransport} from '../../log';
import {DzrpTransportRemote} from './dzrptransportremote';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {SerialPort} from 'serialport';


/** A mixin that handles the serial port.
 * Open, close, sending and receiving.
 * It only handles the bare serial port.
 * It is agnostic of the used protocol. I.e. it does not know about the DZRP protocol.
 *
 * Use e.g. as:
 * class ZxNextSerialRemote extends WithSerial(DzrpDezogIfRemote) {...}
 */


type Constructor<T = {}> = new (...args: any[]) => T;

export function WithSerial<TBase extends Constructor<DzrpTransportRemote>>(Base: TBase) {
	return class extends Base {
		// The serial port instance.
		protected serialPort: SerialPort | undefined;

		/// Initializes the machine.
		/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
		/// The successful emit takes place in 'onConnect' which should be called
		/// by 'doInitialization' after a successful connect.
		protected async doInitialization(): Promise<void> {
			// Call super
			await super.doInitialization();

			// Set timeouts
			this.cmdRespTimeoutTime = this.settingsDzrpTransportType.timeout * 1000;
			this.chunkTimeout = this.cmdRespTimeoutTime;
			// Open the serial port
			const serialPath = this.settingsDzrpTransportType.serial!;
			this.serialPort = new SerialPort({
				path: serialPath,
				baudRate: 921600,
				autoOpen: false
			});

			// React on-open
			this.serialPort.on('open', () => {
				(async () => {
					LogTransport.log(this.logName + ': Connected to ZX Next!');

					this.receivedData = Buffer.alloc(0);
					this.expectedLength = 4;	// for length
					this.receivingHeader = true;
					this.stopChunkTimeout();
					await this.onConnect();
				})();
			});

			// Handle errors
			this.serialPort.on('error', err => {
				ErrorWrapper.wrap(err);
				LogTransport.log(this.logName + ': ' + err);
				// Error
				try {
					this.emit('error', err);
				}
				catch {};
			});

			// Receive data
			this.serialPort.on('data', data => {
				this.dataReceived(data);
			});

			// Start serial connection
			//console.log('serialPort.open();');
			this.serialPort.open();
		}


		/** Closes the serial port.
		 */
		public async closeSerialPort(): Promise<void> {
			return new Promise<void>(resolve => {
				(async () => {
					if (this.serialPort) {
						//console.log('serialPort.close();');
						const serialPort = this.serialPort;
						this.serialPort = undefined;
						serialPort.close(() => {
							//console.log('  serialPort.close() -> done');
							resolve();
						});
						return;
					}
					// If no serialPort exists immediately return
					resolve();
				})();
			});
		}


		/** This will disconnect the serial.
		 */
		public async disconnect(): Promise<void> {
			this.disconnect = async () => {};	// Prohibit that disconnect is executed twice.
			if (!this.serialPort) {
				return;
			}
			await super.disconnect();
			// Close serial port
			await this.closeSerialPort();
		}


		/** Writes the buffer to the serial port.
		 */
		protected async sendBuffer(buffer: Buffer): Promise<void> {
			// Send buffer
			return new Promise<void>((resolve, reject) => {
				// Send data
				const txt = this.dzrpCmdBufferToString(buffer);
				LogTransport.log('>>> ' + this.logName + ': Sending ' + txt);
				let outerError;
				try {
					this.serialPort?.write(buffer, (error) => {
						if (!outerError) {
							if (error)
								throw error;
							resolve();
						}
					});
				}
				catch (e) {
					outerError = e;
					const msg = (e?.msg) ? e.msg : "Serial port write error!";
					reject(new Error(msg));
				}
			});
		}
	};
}
