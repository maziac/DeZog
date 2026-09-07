import {LogDzrpNtf, LogTransport} from '../../log';
import {ZxNextType} from '../../settings/settings';
import {DZRP} from '../dzrp/dzrpremote';
import {DzrpDezogIfRemote} from './dzrpdezogifremote';
import {WithSerial} from './transportserialmixin';



/** A ZX Next remote that is connected via the serial interface.
 * The serial interface itself is a USB device.
 * As the serial interface shares the ZXNext UART port with the
 * joystick ports the receiving line might not always be connected
 * to the serial device connected to the host's USB port.
 * This results in a series of received zeroes. Therefore the
 * dezogif uart software on the ZXNext adds a leading 0xA5 byte to
 * each message. This is used to recognize the start of a message.
 */
export class ZxNextSerialRemote extends WithSerial(DzrpDezogIfRemote) {
	protected override logName = 'ZxNextSerialRemote';

	// Each response message has to start with this byte.
	// The ZX Next transmit a lot of zeroes if the joy port is not configured.
	// Therefore this byte is required to recognize when a message starts.
	protected static readonly MESSAGE_START_BYTE_RESP = 0xA5;

	// Each notification has to start with this byte. Needs to be different of MESSAGE_START_BYTE_RESP.
	protected static readonly MESSAGE_START_BYTE_NTF = 0xA4;

	// Value used for flow control.
	protected static readonly FLOW_CONTROL_SIGNAL = 0x11;

	// The flow control uart counter.
	// DeZog will send a 0x11 when this counter reaches 256.
	protected flowControlUartCounter = 0;

	// The time the last CMD_CONTINUE was sent. Is used to suppress the "No response received message" from the remote if a request is sent from vscode right after a CMD_CONTINUE.
	protected lastCmdContinueTime = 0;	// ms
	protected cmdContinueNoResponseErrorTime = 1000;	// ms


	// Constructor.
	constructor(settingsDzrpType: ZxNextType) {
		super(settingsDzrpType);
		this.msgStartByteFound = false;
	}


	/** Called when data has been received.
	 * If not configured for UART the ZX Next emits zeros through the serial cable.
	 * Therefore we wait until the first indication of a message is received.
	 * I.e. all received messages start with 0xA5.
	 */
	protected lengthBuffer: Buffer;
	protected dataReceived(data: Buffer) {
		let nData = data;

		if (!this.lengthBuffer || this.lengthBuffer.length < 5) {
			// Swallow everything (zeroes) up to after the first 0xA5 found
			const k1 = data.indexOf(ZxNextSerialRemote.MESSAGE_START_BYTE_RESP);
			const k2 = data.indexOf(ZxNextSerialRemote.MESSAGE_START_BYTE_NTF);
			let k = k1;
			if (k < 0)
				k = k2;
			else if (k2 >= 0) {
				if (k2 < k)
					k = k2;
			}
			if (k < 0)
				return;	// Not found

			// Flow control, uart counter
			if (k === k1) {
				// Reset uart counter, at start of a new response message
				this.flowControlUartCounter = 0;
				this.msgStartByteFound = true;
				this.lengthBuffer = data.subarray(k);
			}
			// Increase uart counter
			this.flowControlUartCounter += data.length - k; // including start byte

			if (this.flowControlUartCounter >= 256) {
				if (this.flowControlUartCounter > 256) {
					// Because dezogif stops sending at 256 this should never happen
					console.warn("Flow control uart counter exceeded 256, this should not happen.");
				}
				// Send flow control signal to remote
				this.flowControlUartCounter = 0;
				this.sendFlowControlSignal();
			}

			// Strip start byte
			nData = data.subarray(k + 1);
			if (nData.length == 0)
				return;
		}
		// Call super
		this.msgStartByteFound = false;
		super.dataReceived(nData);
	}


	/** Send flow control signal to the remote. */
	protected sendFlowControlSignal() {
		try {
			this.writeToSerialPort(Buffer.from([ZxNextSerialRemote.FLOW_CONTROL_SIGNAL]));
		} catch (e) {
			const msg = (e?.msg) ? e.msg : "Serial port write error!";
			console.error(msg);	// TODO: Better error reporting
		}
	}


	// Override to record the timestamp of the last CMD_CONTINUE command.
	protected async dzrpContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		this.lastCmdContinueTime = Date.now();
		await super.dzrpContinue(bp1Addr64k, bp2Addr64k);
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
			LogTransport.log(this.logName + ': Warning: ' + err.message);
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


	/**
	 * This command is not used. Use the NMI button instead.
	 */
	// protected async sendDzrpCmdPause(): Promise<void> {
	// 	throw Error("To pause execution use the yellow NMI button of the ZX Next.");
	// }

	/** Low level write to the serial port.
	 * Escapes the characters used for flow control.
	 */		protected async writeToSerialPort(buffer: Buffer, cb?: (error: Error | null | undefined) => void): Promise<void> {
		// Encode special characters for flow control (xon/xoff)
		// 0x10 = > 0x10, 0x00
		// 0x11 = > 0x10, 0x01 (xon)
		// 0x13 = > 0x10, 0x03 (xoff)
		buffer = Buffer.from(buffer);	// Ensure we have a Buffer instance
		const encodedBuffer: number[] = [];
		for (const byte of buffer) {
			if (byte === 0x10) {
				encodedBuffer.push(0x10, 0x00);
			}
			else if (byte === 0x11) {
				encodedBuffer.push(0x10, 0x01);
			}
			else if (byte === 0x13) {	// TODO: Required?
				encodedBuffer.push(0x10, 0x03);
			}
			else {
				encodedBuffer.push(byte);
			}
		}
		buffer = Buffer.from(encodedBuffer);
		// Send
		super.writeToSerialPort(buffer);
	}


	/** Overrides the sendDzrpCmd implementation to introduce a retry if a response was
	 * only partly received.
	 * The UART of ZXNext does not support flow control.
	 * In rare cases bytes might be lost when receiving from the ZXNext.
	 * Therefore a retry is implemented here.
	 * @param cmd The command.
	 * @param data A buffer containing the data.
	 * @param respTimeoutTime The response timeout. Undefined=use default.
	 * @returns The response (payload data after seq no) is returned in the Promise.
	 */
	protected async sendDzrpCmd(cmd: DZRP, data?: Buffer | Array<number>, respTimeoutTime?: number): Promise<Buffer> {
		const maxRetries = 0;
		let attempt = 0;

		while (true) {
			try {
				attempt++;
				return await super.sendDzrpCmd(cmd, data, respTimeoutTime);
			}
			catch (err) {
				if (this.receivedData.length === 0 || attempt >= maxRetries) {
					// No partially received data or too many retries, throw immediately.
					throw err;
				}
				// Retry
				const txt = '[' + new Date().toISOString() + '] sendDzrpCmd RETRY ' + attempt + ': Warning: ' + err.message;
				LogDzrpNtf.log(txt);
				// Discard any partially received data before retrying.
				this.msgStartByteFound = false;
				this.receivedData = Buffer.alloc(0);
				this.expectedLength = 4;
				this.receivingHeader = true;
				this.messageQueue.length = 0;
				this.stopChunkTimeout();
			}
		}

	}
}
