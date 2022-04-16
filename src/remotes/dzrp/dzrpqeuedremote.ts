import {LogTransport} from '../../log';
import {DzrpRemote, DZRP} from './dzrpremote';
import {Utility} from '../../misc/utility';




/**
 * A structure used to serialize the sent messages.
 */
class MessageBuffer {
	// The response timeout time
	public respTimeoutTime: number;

	// The buffer to send
	public buffer: Buffer;

	// The function to call when the response is received.
	public resolve: (buffer) => void;

	// The function to call when the command times out.
	public reject: (error) => void;

	// Additional data. Transport specific.
	public customData?: any;
}


/**
 * The queued remote takes care that the async messages
 * can simply be sent with an await.
 * The 'resolve' is called when the reply is received or when a timeout occurs.
 * Derive from DzrpQeuedRemote if the implemented protocol is not DZRP
 * but only the same functionality.
 */
export class DzrpQeuedRemote extends DzrpRemote {

	// The message queue (used to serialize the sent messages).
	protected messageQueue: Array<MessageBuffer>;

	// Timeout between sending command and receiving response.
	protected cmdRespTimeout?: NodeJS.Timeout;

	// The used timeout time. (ms)
	protected cmdRespTimeoutTime = 500;	// Will be overwritten.
	protected initCloseRespTimeoutTime = 900;	// Timeout for CMD_INIT and CMD_CLOSE. This is not configurable and depends on vscode internal times.

	// Timeout between data chunks
	protected chunkTimeout?: NodeJS.Timeout;


	/// Constructor.
	constructor() {
		super();
		// Instantiate the message queue
		this.messageQueue = new Array<MessageBuffer>();
	}


	/**
	 * This will disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 */
	public async disconnect(): Promise<void> {
		try {
			await this.sendDzrpCmdClose();
		}
		catch {}
	}


	/**
	 * Starts the command/response timeout.
	 * If the timer elapses a warning is shown.
	 * The message is removed from the message queue.
	 * It is normal that this e.g. happens if a ZX Next is connected and has a running
	 * (non-paused) program. In that case the UART is not configured for the joy ports
	 * and is not able to receive anything at all.
	 * @param respTimeoutTime The response timeout.
	 */
	protected startCmdRespTimeout(respTimeoutTime: number) {
		this.stopCmdRespTimeout();
		this.cmdRespTimeout = setTimeout(() => {
			this.stopCmdRespTimeout();
			const err = new Error('No response received from remote.');
			// Log
			LogTransport.log('Warning: ' + err.message);
			// Show warning
			this.emit('warning', err.message);
			// Remove message / Queue next message
			const msg = this.messageQueue.shift()!;
			this.sendNextMessage();
			// Pass error data to right consumer
			msg.reject(err);
		}, respTimeoutTime);
	}


	/**
	 * Stops the command/response timeout.
	 */
	protected stopCmdRespTimeout() {
		if (this.cmdRespTimeout)
			clearTimeout(this.cmdRespTimeout);
		this.cmdRespTimeout = undefined;
	}



	/**
	 * Puts a new message into the queue.
	 * @param buffer The buffer to send.
	 * @param respTimeoutTime The response timeout.
	 * @param resolve Called with the data when a response is received.
	 * @param reject Called when the command/response timeout elapses.
	 * @returns A Promise. The resolve/reject functions are stored in the messageQueue.
	 */
	protected putIntoQueue(buffer: Buffer, respTimeoutTime: number, resolve: (buffer) => void, reject: (error) => void): MessageBuffer {

		// TODO: REMOVE
		const l = this.messageQueue.length;
		if (l > 0) {
			const prevMsg = this.messageQueue[l - 1];
			if (prevMsg[5] == DZRP.CMD_CONTINUE)
				console.log();
		}

		// Create new buffer entry
		const entry = new MessageBuffer();
		entry.buffer = buffer;
		entry.respTimeoutTime = respTimeoutTime;
		entry.resolve = resolve;
		entry.reject = reject;
		// Add to queue
		this.messageQueue.push(entry);

		return entry;
	}


	/**
	 * If messageQueue is empty returns immediately.
	 * Otherwise the first message in the queue is sent.
	 */
	protected async sendNextMessage(): Promise<void> {
		if (this.messageQueue.length == 0)
			return;

		// Get next message from buffer
		const msg = this.messageQueue[0];
		if (!msg)
			return;

		try {
			this.startCmdRespTimeout(msg.respTimeoutTime);
			await this.sendBuffer(msg.buffer);
		}
		catch (error) {
			LogTransport.log("SENT ERROR.");
			console.log("SENT ERROR.");
			this.emit('error', error);
		}
	}


	/**
	 * Override.
	 * Writes the buffer to the socket or serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		Utility.assert(false);
	}

}
