import { Log } from './log';
import { Socket } from 'net';
import { Settings } from './settings';

//import { setKeepAliveInterval } from 'net-keepalive';

/// Timeouts.
const CONNECTION_TIMEOUT = 1000;	///< 1 sec
const QUIT_TIMEOUT = 1000;	///< 1 sec
// TODO: CHANGE back:
const MSG_DEFAULT_TIMEOUT = 50000; //5000;	///< 5 sec (socket communication and internal delays may sometimes take longer than a second)
export const NO_TIMEOUT = 0;	///< Can be used as timeout value and has the special meaning: Don't use any timeout


/**
 * A command send to Zesarux debugger as it is being put in the queue.
 */
class CommandEntry {
	public command: string|undefined;	///< The command string
	public handler: {(data)};	///< The handler being executed after receiving data.
	public timeout: number;		///< The timeout until a response is expected.
	constructor(command: string|undefined, handler: {(data: string)} = (data) => {}, timeout: number) {
		this.command = command;
		this.handler = handler;
		this.timeout = timeout;
	}
}


/**
 * The socket state.
 */
enum SocketState {
	UNCONNECTED,
	CONNECTING,
	CONNECTED_WAITING_ON_WELCOME_MSG,
	CONNECTED

};


/**
 * A socket to communicate with the Zesarux debugger.
 * Defines a queue htat guarantees that each command is send one-by-one.
 */
export class ZesaruxSocket extends Socket {


	protected state: SocketState;	///< connected, etc.

	private queue: Array<CommandEntry>;

	private lastCallQueue: Array<()=>void>;

	public zesaruxState: string;

	// Holds the incomplete received message.
	private receivedDataChunk: string;


	/**
	 * Static init method. Creates a new socket object.
	 * Used in the launchRequest.
	 */
	public static Init() {
		zSocket = new ZesaruxSocket();
		zSocket.init();
	}

	/**
	 * Initialize the socket.
	 */
	protected init() {
		// Remove all previous listeners (in case of a restart)
		this.removeAllListeners();
		// Init
		this.receivedDataChunk = '';
		this.state = SocketState.UNCONNECTED;
		this.queue = new Array<CommandEntry>();
		this.lastCallQueue = new Array<()=>void>();
		this.zesaruxState = 'unknown';
		// Wait on first text from zesarux after connection
		var cEntry = new CommandEntry('connected', data => {
			this.state = SocketState.CONNECTED;
			Log.log('First text from ZEsarUX received!');
			this.emit('connected');	// data transmission may start now.
		}, 0);
		this.queue.push(cEntry);
	}

	/**
	Connects to the Zesarux debug port and initializes it.
	zhostname: The IP address, e.g. localhost
	zport: The ZRCP port (usually 10000)
	startAutomatically: true = start after connecting
	 */
	public connectDebugger() {

		this.state = SocketState.CONNECTING;

		this.on('data', data => {
			this.receiveSocket(data);
		});

		this.on('close', () => {
			Log.log('Socket close: disconnected from server');
			this.state = SocketState.UNCONNECTED;
		});

		this.on('error', err => {
			Log.log('Socket: ' + err);
			this.state = SocketState.UNCONNECTED;
		});

		this.on('timeout', () => {
			switch(this.state) {
				case SocketState.CONNECTING:
				{
					const err = new Error('Connection timeout!');
					Log.log('Socket timeout: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED_WAITING_ON_WELCOME_MSG:
				{
					const err = new Error('Connected ZEsarUX, but ZEsarUX does not communicate!');
					Log.log('ZEsarUX does not communicate: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED:
				{
					const err = new Error('ZEsarUX did not answer in time!');
					Log.log('ZEsarUX did not answer in time: ' + err);
					this.emit('error', err);
				}
				break;
			}
		});

		this.on('end', () => {
			this.state = SocketState.UNCONNECTED;
			Log.log('Socket end: disconnected from server');
		});

		this.setTimeout(CONNECTION_TIMEOUT);
		this.connect(Settings.launch.zport, Settings.launch.zhostname, () => {
			// set timeout to receive the welcome message
			this.setTimeout(MSG_DEFAULT_TIMEOUT);
			// almost connected
			this.state = SocketState.CONNECTED_WAITING_ON_WELCOME_MSG;
			//this.setKeepAlive(true, 1000);	I would have to enable keep-alive to get notified if the connection closes, but I was not able to change the default interval (2hrs). The package 'net-keepalive' could not be used.
  			// Set TCP_KEEPINTVL for this specific socket
  			//keepAlive.setKeepAliveInterval(this, 3000);	// ms
			// and TCP_KEEPCNT
			//keepAlive.setKeepAliveProbes(this, 1);

			Log.log('Socket: Connected to zesarux server!');
		});

	}

	/**
	 * Checks if the queue is empty.
	 * Calls the lastCallQueue handlers.
	 */
	private checkLastCommandCompleted() {
		// Call the handler(s)
		while(true) {
			if(this.queue.length != 0)
				return; // Still commands in the queue (need to be here as the queue can be filled during the for-loop)
			const handler = this.lastCallQueue.shift();
			if(!handler)
				break;
			handler();
		}
	}


	/**
	 * If queue is empty the handler is immediately executed.
	 * Otherwise it is executed when queue becomes empty.
	 * @param handler The method to execute.
	 */
	public executeWhenQueueIsEmpty(handler: ()=>void) {
		if(this.queue.length == 0) {
			// execute immediately if queue is empty
			handler();
		}
		else {
			// queue the call
			this.lastCallQueue.push(handler);
		}
	}


	/**
	 * If messages are still pending the messages is queued.
	 * Otherwise the message is directly send.
	 * After the message is executed the 'handler' is called.
	 * Additionally the timeout can be set until when a repsonse is expected.
	 * @param command The message to send to ZEsarUX.
	 * @param handler Is called when the response is received. Can be undefined.
	 * @param timeout The timeout in ms or 0 if no timeout should be used. Defualt is 100ms.
	 */
	public send(command: string, handler: {(data)} = (data) => {}, timeout = MSG_DEFAULT_TIMEOUT) {
		// Create command entry
		var cEntry = new CommandEntry(command, handler, timeout);
		this.queue.push(cEntry);
		// check if command can be sent right away
		if(this.queue.length == 1) {
			this.sendSocket();
		}
	}

	/**
	 * Sends the oldest command in the queue through the socket.
	 */
	private sendSocket() {
		// check if connected
		if(this.state != SocketState.CONNECTED)
			return;
		// Send oldest command
		var cEntry = this.queue[0];
		if( cEntry == undefined)
			return;
		// normal processing
		var command = cEntry.command + '\n';
		Log.log('=> ' + cEntry.command);
		this.write(command);
		// Set timeout
		this.setTimeout(cEntry.timeout);
	}

	/**
	 * Sends a blank string to zesarux. Used to stop zesarux if it is "run"ning.
	 */
	public sendBlank() {
		// check if connected
		if(this.state != SocketState.CONNECTED)
			return;
		// Send just a newline
		this.write('\n');
	}


	/**
	 * Receives data from the socket.
	 */
	private receiveSocket(data: Buffer) {
		const sData = data.toString();
		if(!sData) {
			Log.log('Error: Received ' + data.length + ' bytes of undefined data!');
			return;
		}
		Log.log('<= ' + sData);

		// Check if last line asks for a new command
		this.receivedDataChunk += sData;
		var splitData = this.receivedDataChunk.split('\n');
		const lastLine = splitData[splitData.length-1];
		const bCommand1 = lastLine.startsWith('command');
		const bCommand2 = lastLine.endsWith('> ');
		if(bCommand1 && bCommand2) {
			// clear timer
			this.setTimeout(0);
			// clear receive buffer
			this.receivedDataChunk = '';
			// remove last line
			splitData.splice(splitData.length-1,1);
			var concData = splitData.join('\n');
			// remove corresponding command
			var cEntry = this.queue.shift();
			// Remember state
			this.zesaruxState = lastLine.substr(8);
			// Send next entry (if any)
			this.sendSocket();
			// Check on error from zesarux
			if(concData.startsWith('Error')) {
				// send message through to UI
				var msg = '';
				if(cEntry)
					msg = cEntry.command + ' => ';
				msg += concData;
				this.emit('warning', msg);
			}
			// Execute handler
			if( cEntry != undefined)
				cEntry.handler(concData);
			// Check if last command is completed (if queue is empty)
			this.checkLastCommandCompleted();
		}
	}


	/**
	 * Sends a "quit" to zesarux. In response zesarux will close the connection.
	 * This sends "quit" immediately. I.e. it does not wait on the queue.
	 * In fact it clears the queue.
	 * @param handler is called after the connection is disconnected. Can be omitted.
	 */
	public async quit(handler = ()=>{}) {
		// Clear queues
		this.queue.length = 0;
		this.lastCallQueue.length = 0;

		// Exchange listeners
		zSocket.removeAllListeners()

		// Keep the data listener
		this.on('data', data => {
			this.receiveSocket(data);
		});

		// inform caller
		const func = () => {
			zSocket.removeAllListeners();
			handler();
		}
		// The new listeners
		zSocket.once('error', () => {
			Log.log('Socket error (should be close).');
			func()
			zSocket.end();
		});
		zSocket.once('timeout', () => {
			Log.log('Socket timeout (should be close).');
			func()
			zSocket.end();
		});
		zSocket.once('close', () => {
			Log.log('Socket closed. OK.');
			func();
		});
		zSocket.once('end', () => {
			Log.log('Socket end. OK.');
			func();
		});

		// Check state
		if(this.state == SocketState.UNCONNECTED
			|| this.state != SocketState.CONNECTED) {
			// Already disconnected or not really connected.
			zSocket.end();
			return;
		}

		// Terminate connection
		Log.log('Quitting:');
		this.setTimeout(QUIT_TIMEOUT);
		this.send('\n');	// Just for the case that we are waiting on a breakpoint.
		this.send('clear-membreakpoints');
		this.send('disable-breakpoints');
		this.send('quit', data => {
			// Close connection (ZEsarUX also closes the connection)
			zSocket.end();
			handler();
		});
	}
}

/// zSocket is the singleton object that should be accessed.
export let zSocket;

