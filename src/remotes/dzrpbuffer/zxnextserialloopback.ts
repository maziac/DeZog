import {LogTransport} from '../../log';
import {SerialPort} from 'serialport';
import {ZxNextSerialRemote} from './zxnextserialremote';


/** A minimal ZX Next remote with it sole purpose being testing the connection via loopback commands.
 */
export class ZxNextSerialLoopback extends ZxNextSerialRemote {
	// Will be set if an error occurred, so that the sedning loop is left
	protected errorOccurred = false;

	/** Runs the loopback test.
	 * @param serialPath The path to the port
	 * @param packetSize The size of the packets for loopback
	 * @param time How long the test should last [seconds]
	 * @param respTimeout The response timeout [seconds]
	 */
	public async runLoopbackTest(serialPath: string, packetSize: number, time = 10, respTimeout = 4): Promise<void> {
		// Set timeouts
		this.cmdRespTimeoutTime = respTimeout * 1000;
		this.chunkTimeout = this.cmdRespTimeoutTime;
		// Open the serial port
		this.serialPort = new SerialPort({
			path: serialPath,
			baudRate: 921600,
			autoOpen: false
		});
		// Packet counter
		let packetCounter = 0;

		// React on-open
		this.serialPort.on('open', () => {
			(async () => {
				const infoMsg = `Serial Loopback Test: ${serialPath} connected.\nTest started.`;
				this.emit('info', infoMsg);
				LogTransport.log(infoMsg);
				this.receivedData = Buffer.alloc(0);
				this.msgStartByteFound = false;
				this.expectedLength = 4;	// for length
				this.receivingHeader = true;
				this.stopChunkTimeout();

				// Start transmitting in a loop
				const startTime = Date.now();
				const duration = time * 1000; // duration in ms
				const printDuration = 1000; // print a log every second
				let timePrint = startTime + printDuration;
				do {
					// Check for error
					if (this.errorOccurred)
						return;
					// Print a log
					if (Date.now() >= timePrint) {
						LogTransport.log(`Serial Loopback Test: Sent/received packets: ${packetCounter}`);
						// Next print
						timePrint = Date.now() + printDuration;
					}
					// Send and receive a packet
					try {
						packetCounter++;
						const sendData = this.createRandomBuffer(packetSize);
						const recData = await this.sendDzrpCmdLoopback(sendData);
						const dataEqual = recData.equals(sendData);
						if (!dataEqual) {
							throw new Error(`Received data is not equal to sent data.`);
						}
					}
					catch (e) {
						const errMsg = `Serial Loopback Test: Error packet ${packetCounter}: ${e.message} (Port '${serialPath}')`;
						this.emit('error', errMsg);
						LogTransport.log(errMsg);
						// Close serial port
						await this.closeSerialPort();
						return;
					}
				} while (Date.now() - startTime < duration);

				// Summary
				const summary = `Serial Loopback Test: Success. ${packetCounter} packets sent with length=${packetSize} each. Port '${serialPath}'.`;
				this.emit('info', summary);
				LogTransport.log(summary);
				// Close serial port
				await this.closeSerialPort();
			})();
		});

		// Handle errors
		this.serialPort.on('error', e => {
			const packetMsg = (packetCounter == 0) ? '' : ` ${packetCounter}:`;
			const errMsg = `Serial Loopback Test:${packetMsg} ${e.message} (Port '${serialPath}')`;
			this.emit('error', errMsg);
			LogTransport.log(errMsg);
			this.errorOccurred = true;
		});

		// Receive data
		this.serialPort.on('data', data => {
			this.dataReceived(data);
		});

		// Start serial connection
		this.serialPort.open();
	}


	/** Creates a buffer with random data.
	 * @param length the length of the buffer
	 * @returns a buffer with random data
	 */
	protected createRandomBuffer(length: number): Buffer {
		const buffer = Buffer.alloc(length);
		for (let i = 0; i < length; i++) {
			buffer[i] = Math.floor(Math.random() * 256);
		}
		return buffer;
	}
}
