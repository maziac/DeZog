import * as vscode from 'vscode';
//import * as SerialPort from 'serialport';
import {DzrpParser} from './dzrpparser';
import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';


// TODO: Kann wahrscheinlich weg.

/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxNextUsbSerialRemote extends ZxNextRemote {

	// The serial port. https://serialport.io/docs/guide-usage
	protected serialPort;

	// The read parser for the serial port.
	protected parser: DzrpParser;


	/// Constructor.
	constructor() {
		super();
		// Create parser
		this.parser=new DzrpParser({}, 'Dezog');
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void>  {
		// Find the right extension
		const serialPortExtension=vscode.extensions.getExtension('maziac.dezog-serial-if');
		if (!serialPortExtension) {
			throw Error('Error: "Dezog Serial Interface" extension (maziac.dezog-serial-if) is not installed.');
		}
		if (!serialPortExtension.isActive)
			await this.serialPort.activate();
		// Get the serial port
		this.serialPort=await vscode.commands.executeCommand('dezog-serial-if.create-serialport');

		// Create parser
		this.parser=new DzrpParser({}, 'Serial');

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
		this.serialPort.open(this.parser, "/dev/cu.usbserial-14610", 115200);
	}



	/**
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		if (!this.serialPort)
			return;
		return new Promise<void>(resolve => {
			this.serialPort.close(() => {
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
