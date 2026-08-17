import {LogTransport} from '../../log';
import {ZxNextType} from '../../settings/settings';
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

	// Each sent message has to start with this byte.
	// The ZX Next transmit a lot of zeroes if the joy port is not configured.
	// Therefore this byte is required to recognize when a message starts.
	public static readonly MESSAGE_START_BYTE = 0xA5;

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
	protected dataReceived(data: Buffer) {
		let nData = data;

		if (this.receivedData.length == 0 && !this.msgStartByteFound) {
			// Swallow everything (zeroes) up to the first 0xA5 found
			const len = data.length;
			let i;
			for (i = 0; i < len; i++) {
				if (data[i] == ZxNextSerialRemote.MESSAGE_START_BYTE) {
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


	// Calls the super implementation. Is required because ZxNextSerialRemote need to get a timestamp
	// for the last CMD_CONTINUE command.
	protected async superSendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		this.lastCmdContinueTime = Date.now();
		await super.superSendDzrpCmdContinue(bp1Addr64k, bp2Addr64k);
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
}
