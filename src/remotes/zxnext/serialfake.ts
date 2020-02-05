//import * as assert from 'assert';
//import {Z80Registers} from '../z80registers';
import * as SerialPort from 'serialport';
import {ZxNextParser, DZP} from './zxnextusbserial';


/**
 * This class fakes the responses from real HW.
 * It is meant for testing/debuggign purposes only.
 * To use it connect 2 USB/serial converters to your development PC
 * and connect RX with TX and TX with RX. I.e. loop the output of one to
 * the input of the other.
 */
export class SerialFake {

	// The serial port. https://serialport.io/docs/guide-usage
	public serialPort;

	// The read parser for the serial port.
	public parser;


	/// Constructor.
	constructor() {
		// Instantiate the registers
		//this.z80Registers=new Z80Registers();
	}


	/// Initializes the serial port.
	/// Asynchronous: returns when serial port opened.
	public async doInitialization(): Promise<void> {
		return new Promise<void>((resolve, reject)=> {
			// Open the serial port
			this.serialPort=new SerialPort("/dev/cu.usbserial11", {
				baudRate: 115200, autoOpen: false
			});

			// Create parser
			this.parser=this.serialPort.pipe(new ZxNextParser());

			// Install listener
			this.parser.on('data', data => {
				console.log('data SerialFake');
				this.receivedMsg(data);
			});

			// React on-open
			this.serialPort.on('open', async () => {
				console.log('Open SerialFake');
				// Ready for first command
				resolve();
			});

			// Handle errors
			this.serialPort.on('error', err => {
				console.log('Error SerialFake: ', err.message);
				// Error
				reject(err);
			});

			// Open the serial port
			this.serialPort.open();
		});
	}


	/**
	 * Sends a DZP command and waits for the response.
	 */
	protected receivedMsg(data: Buffer) {
		// Check what has been received
		const cmd=data[0];
		switch (cmd) {
			case DZP.CMD_GET_CONFIG:
				this.sendDzpResp(cmd);
				break;
			default:
				throw Error("Unknown command: "+cmd);
		}
	}



	/**
	 * Sends a DZP response.
	 * @param cmd The command for which the response is.
	 * @param data A buffer containing the data.
	 */
	protected sendDzpResp(cmd: number, data?: Buffer) {
		// Calculate length
		let length=1;
		if (data)
			length+=data.length;
		// Put length in buffer
		const header=Buffer.alloc(5);
		// Encode length
		header[0]=length&0xFF;
		header[1]=(length>>8)&0xFF;
		header[2]=(length>>16)&0xFF;
		header[3]=(length>>24)&0xFF;
		// Put command in buffer
		header[4]=cmd;
		// Send header
		this.serialPort.write(header);

		// Send data
		if (data&&data.length>0)
			this.serialPort.write(data);
	}
}


// Comment this if SerialFake should not be started.
export var FakeSerial = new SerialFake();

