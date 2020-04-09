//import * as assert from 'assert';
//import * as SerialPort from 'serialport';
import {DzrpParser} from './dzrpparser';
import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';


let SerialPort;




/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxNextUsbSerialRemote extends ZxNextRemote {

	// The serial port. https://serialport.io/docs/guide-usage
	protected serialPort;

	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
		// Just in case
		if (this.serialPort&&this.serialPort.isOpen)
			this.serialPort.close();

		// Open the serial port
		this.serialPort=new SerialPort("/dev/cu.usbserial-14610", {
			baudRate: 115200, autoOpen: false
		});

		// Create parser
		this.parser=this.serialPort.pipe(new DzrpParser({}, 'Serial'));

		// Handle errors
		this.parser.on('error', err => {
			console.log('Error: ', err);
			// Error
			this.emit('error', err);
		});

		// Install listener
		this.parser.on('data', data => {
			console.log('data SerialFake');
			this.receivedMsg(data);
		});

		// React on-open
		this.serialPort.on('open', async () => {
			console.log('Open');
			LogSocket.log('USB-Serial connection opened!');
			this.onConnect();
		});

		// Handle errors
		this.serialPort.on('error', err => {
			console.log('Error: ', err);
			// Error
			this.emit('error', err);
		});

		// Open the serial port
		this.serialPort.open();
	}



	/**
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		return new Promise<void>(resolve => {
			this.serialPort.close(() => {
				resolve();
			});
		});
	}


	/**
	 * Terminates the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 */
	public async terminate(): Promise<void> {
		return new Promise<void>(resolve => {
			this.serialPort.close(() => {
				this.emit('terminated');
				resolve();
			});
		});
	}


	/**
	 * Writes the buffer to the serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		await this.serialPort.write(buffer);
		// Start timer to wait on response
		this.parser.startTimer('Remote side did not respond.');
	}
}
