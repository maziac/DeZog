import {LogTransport} from '../../log';
import {DzrpRemote} from './dzrpremote';
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
 * Derive from DzrpQueuedRemote if the implemented protocol is not DZRP
 * but only the same functionality.
 */
export class DzrpQueuedRemote extends DzrpRemote {

	// The message queue (used to serialize the sent messages).
	protected messageQueue: Array<MessageBuffer>;

	// Timeout between sending command and receiving response.
	protected cmdRespTimeoutHandle?: NodeJS.Timeout;

	// The used timeout time. (ms)
	protected cmdRespTimeoutTime = 500;	// Will be overwritten.
	protected initCloseRespTimeoutTime = 900;	// Timeout for CMD_INIT and CMD_CLOSE. This is not configurable and depends on vscode internal times.


	/// Constructor.
	constructor() {
		super();
		// Instantiate the message queue
		this.messageQueue = new Array<MessageBuffer>();
	}


	/**
	 * This will disconnect the socket and un-use all data.
	 * Additionally, on disconnect, clears the message (send) queue.
	 * Called e.g. when vscode sends a disconnectRequest.
	 */
	public async disconnect(): Promise<void> {
	//	this.messageQueue.length = 0; Can lead to a seqno problem if done when a cmd has been sent but no response received yet.
		await super.disconnect();
		try {
			//console.log("disconnect: started");
			await this.sendDzrpCmdClose();
			//console.log("disconnect: finished");
		}
		catch (e) {
			console.error("disconnect: Failed to close debug session: " + e);
		}
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
		if (respTimeoutTime > 0) {
			this.cmdRespTimeoutHandle = setTimeout(() => {
				this.stopCmdRespTimeout();
				const err = new Error('No response received from remote.');
				// Log
				LogTransport.log('Warning: ' + err.message);
				// Show warning
				this.emit('warning', err.message);
				// Remove message / Queue next message
				const msg = this.messageQueue.shift()!;
				// Send next
				(async () => {
					await this.sendNextMessage();
					// Pass error data to right consumer
					msg.reject(err);
				})();
			}, respTimeoutTime);
		}
	}


	/**
	 * Stops the command/response timeout.
	 */
	protected stopCmdRespTimeout() {
		if (this.cmdRespTimeoutHandle)
			clearTimeout(this.cmdRespTimeoutHandle);
		this.cmdRespTimeoutHandle = undefined;
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
			// If no response timeout is set/i.e. no response is expected,
			// then resolve is called immediately.
			if (this.cmdRespTimeoutTime == 0) {
				// Queue next message
				this.messageQueue.shift();
				await this.sendNextMessage();
				msg.resolve([]);
			}
		}
		catch (error) {
			LogTransport.log("SENT ERROR.");
			//console.log("SENT ERROR.");
			msg.reject(error);
			// Error will be reported by emit. Treat normally:
		//	msg.resolve([]);
			// Emit
		//	this.emit('error', error);
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

