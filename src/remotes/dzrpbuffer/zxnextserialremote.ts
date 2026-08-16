import {LogTransport} from '../../log';
import {DzrpDezogIfRemote} from './dzrpdezogifremote';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {Settings} from '../../settings/settings';
import {SerialPort} from 'serialport';


// Each sent message has to start with this byte.
// The ZX Next transmit a lot of zeroes if the joy port is not configured.
// Therefore this byte is required to recognize when a message starts.
const MESSAGE_START_BYTE = 0xA5;

// Timeout until when a response on a command should have been received.



/**
 * A ZX Next remote that is connected via the serial interface.
 * The serial interface itself is a USB device.
 */
export class ZxNextSerialRemote extends DzrpDezogIfRemote {
	// The serial port instance.
	protected serialPort: SerialPort | undefined;

	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Set timeouts
		this.cmdRespTimeoutTime = Settings.launch.zxnext.timeout * 1000;
		this.chunkTimeout = this.cmdRespTimeoutTime;
		// Open the serial port
		const serialPath = Settings.launch.zxnext.serial;
		this.serialPort = new SerialPort({
			path: serialPath,
			baudRate: 921600,
			autoOpen: false
		});

		// React on-open
		this.serialPort.on('open', () => {
			(async () => {
				LogTransport.log('ZxNextSerialRemote: Connected to ZX Next!');

				this.receivedData = Buffer.alloc(0);
				this.msgStartByteFound = false;
				this.expectedLength = 4;	// for length
				this.receivingHeader = true;
				this.stopChunkTimeout();

				this.longBreakedAddress = undefined;
				//this.restorableBreakpoints = new Map<number, RestorableBreakpoint>();
				this.breakpointIdLastIndex = 0;
				await this.onConnect();
			})();
		});

		// Handle errors
		this.serialPort.on('error', err => {
			ErrorWrapper.wrap(err);
			LogTransport.log('ZxNextSerialRemote: ' + err);
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


	/**
	 * Closes the serial port.
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


	/**
	 * This will disconnect the serial.
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



	/**
	 * TODO: This is not fully true anymore for the "async break" with copper. Rewrite documentation and handle it somehow.
	 *
	 * Note:
	 * This is like the super class implementation except that it suppresses a warning message.
	 * If F5 (CONTINUE) or F10 etc. is pressed rapidly or held down it may happen that a request
	 * (e.g. memory request) is done after CMD_CONTINUE has been sent. Due to some asynchronous
	 * requests from vscode.
	 * Normally this is not a problem, the remote would just answer the request.
	 * For the ZXNext UART serial protocol this is different.
	 * The UART is not accessible when the Z80 program is being run. This is because the 'dezogif'
	 * program does not check the UART for new data when run and because the Joystick ports are
	 * remapped to serve as joystick ports and not as UART ports when the program is being run.
	 * Thus, the ZX Next is not able to receive and not able to respond.
	 * Furthermore if the user now changes e.g. a register or memory content there should be
	 * feedback that this is not possible.
	 * On the other hand the "automatic" requests from vscode should be suppressed.
	 * As there is no way to distinguish it is done with a time guardian.
	 * I.e about one second after the CMD_CONTINUE was sent no warning is emitted.
	 * Otherwise the warning is shown.
	 */
	protected startCmdRespTimeout(respTimeoutTime: number) {
		this.stopCmdRespTimeout();
		this.cmdRespTimeoutHandle = setTimeout(() => {
			this.stopCmdRespTimeout();
			const err = new Error('No response received from remote.');
			// Log
			LogTransport.log('Warning: ' + err.message);
			// Show warning (only if a few moments have gone after the last CMD_CONTINUE)
			const timeSpan = (Date.now() - this.lastCmdContinueTime);	// In ms
			if (timeSpan > this.cmdContinueNoResponseErrorTime)
				this.emit('warning', err.message);
			// Remove message / Queue next message
			const msg = this.messageQueue.shift()!;
			// Send next message and throw error
			(async () => {
				await this.sendNextMessage();
				// Pass error data to right consumer
				msg.reject(err);
			})();
		}, respTimeoutTime);
	}


	/** Called when data has been received.
	 * If not configured for UART the ZX Next emits zeros through the serial cable.
	 * Therefore we wait until the first indication of a message is received.
	 * I.e. all received messages start with 0xA5.
	 */
	protected dataReceived(data: Buffer) {
		let nData = data;

		if (this.receivedData.length == 0 && !this.msgStartByteFound) {
			// Swallow everything (zeroes) up to the first 0xA5 found
			const len = data.length;
			let i;
			for (i = 0; i < len; i++) {
				if (data[i] == MESSAGE_START_BYTE) {
					// Start of message found
					if (len == 1) {
						this.msgStartByteFound = true;
						return;
					}
					break;
				}
			}
			// Check if start of message found
			if (i + 1 >= len)
				return;	// Not found
			// Start of message found, skip up to 0xA5
			nData = data.subarray(i + 1);
		}
		// Call super
		this.msgStartByteFound = false;
		super.dataReceived(nData);
	}


	/**
	 * Writes the buffer to the serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>((resolve, reject) => {
			// Send data
			const txt = this.dzrpCmdBufferToString(buffer);
			LogTransport.log('>>> ZxNextSerialRemote: Sending ' + txt);
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


	/**
	 * This command is not used. Use the NMI button instead.
	 */
	// protected async sendDzrpCmdPause(): Promise<void> {
	// 	throw Error("To pause execution use the yellow NMI button of the ZX Next.");
	// }
}
