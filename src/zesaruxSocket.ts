import { Log } from './log';
import { Socket } from 'net';
import { Settings } from './settings';
import * as assert from 'assert';

//import { setKeepAliveInterval } from 'net-keepalive';


/// Timeouts.
const CONNECTION_TIMEOUT = 1000;	///< 1 sec
const QUIT_TIMEOUT = 1000;	///< 1 sec

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

	/// A sepcial long lasting command like 'run' that can be interrupted by other commands.
	private interruptableCmd: CommandEntry|undefined;

	/// Output send and received data to the "OUTPUT" tab in vscode.
	protected  logSocket: Log;

	/// This value is set during intialization. It is the time that is
	/// waited on an answer before the connection is disconnected.
	/// In ms.
	/// See settings 'socketTimeout'.
	protected MSG_TIMEOUT: number;

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
		this.myRemoveAllListeners();

		// Init
		this.MSG_TIMEOUT = Settings.launch.socketTimeout*1000;
		this.logSocket = new Log();
		const channelOut = (Settings.launch.logSocket.channelOutputEnabled) ? "Z80 Debugger Socket" : undefined;
		this.logSocket.init(channelOut, Settings.launch.logSocket.filePath, false);
		this.receivedDataChunk = '';
		this.state = SocketState.UNCONNECTED;
		this.queue = new Array<CommandEntry>();
		this.lastCallQueue = new Array<()=>void>();
		this.zesaruxState = 'unknown';
		this.interruptableCmd = undefined;

		// Wait on first text from zesarux after connection
		var cEntry = new CommandEntry('connected', data => {
			this.state = SocketState.CONNECTED;
			this.logSocket.log('First text from ZEsarUX received!');
			this.emit('connected');	// data transmission may start now.
		}, 0);
		this.queue.push(cEntry);
		this.emitQueueChanged();
	}

	/**
	Connects to the Zesarux debug port and initializes it.
	zhostname: The IP address, e.g. localhost
	zport: The ZRCP port (usually 10000)
	*/
	public connectDebugger() {

		this.state = SocketState.CONNECTING;

		this.on('data', data => {
			this.receiveSocket(data);
		});

		this.on('close', () => {
			this.logSocket.log('Socket close: disconnected from server');
			this.state = SocketState.UNCONNECTED;
		});

		this.on('error', err => {
			this.logSocket.log('Socket: ' + err);
			this.state = SocketState.UNCONNECTED;
		});

		this.on('timeout', () => {
			switch(this.state) {
				case SocketState.CONNECTING:
				{
					const err = new Error('Connection timeout!');
					this.logSocket.log('Socket timeout: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED_WAITING_ON_WELCOME_MSG:
				{
					const err = new Error('Connected ZEsarUX, but ZEsarUX does not communicate!');
					this.logSocket.log('ZEsarUX does not communicate: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED:
				{
					const err = new Error('ZEsarUX did not answer in time!');
					this.logSocket.log('ZEsarUX did not answer in time: ' + err);
					this.emit('error', err);
				}
				break;
			}
		});

		this.on('end', () => {
			this.state = SocketState.UNCONNECTED;
			this.logSocket.log('Socket end: disconnected from server');
		});

		this.setTimeout(CONNECTION_TIMEOUT);
		const port = Settings.launch.zport;
		const hostname = Settings.launch.zhostname;
		this.connect(port, hostname, () => {
			// set timeout to receive the welcome message
			this.setTimeout(this.MSG_TIMEOUT);
			// almost connected
			this.state = SocketState.CONNECTED_WAITING_ON_WELCOME_MSG;
			//this.setKeepAlive(true, 1000);	I would have to enable keep-alive to get notified if the connection closes, but I was not able to change the default interval (2hrs). The package 'net-keepalive' could not be used.
  			// Set TCP_KEEPINTVL for this specific socket
  			//keepAlive.setKeepAliveInterval(this, 3000);	// ms
			// and TCP_KEEPCNT
			//keepAlive.setKeepAliveProbes(this, 1);

			this.logSocket.log('Socket: Connected to zesarux server!');
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
	 * @param timeout The timeout in ms or 0 if no timeout should be used. Defualt is 100ms. Normally use -1 (or omit) to use the timeout from the Settings.
	 */
	public send(command: string, handler: {(data)} = (data) => {}, timeout = -1) {
		if(timeout == -1)
			timeout = this.MSG_TIMEOUT;
		// Create command entry
		var cEntry = new CommandEntry(command, handler, timeout);
		this.queue.push(cEntry);
		this.emitQueueChanged();
		// check if command can be sent right away
		if(this.queue.length == 1) {
			if(this.interruptableCmd) {
				// Interrupt the command: create an interrupt cmd
				const cBreak = new CommandEntry('', ()=>{},this.MSG_TIMEOUT);
				// Insert as first command
				this.queue.unshift(cBreak);
				this.emitQueueChanged();
			}
			// Send command
			this.sendSocket();
		}
	}


	/**
	 * Sends an interruptable command. I.e. an command that does not immmediately return
	 * such as 'run' (continue).
	 * The interruptable command is not executed as long as there are other commands in the queue
	 * and it is interrupted by any following command.
	 * Interruption means: The current execution is stopped (a blank is sent),
	 * the handler is re-directed to cathc the result.
	 * The commands in the queue are executed and in the end the command is
	 * executed once again.
	 * @param command Usualle 'run'
	 * @param handler
	 */
	public sendInterruptable(command: string, handler: {(data)} = (data) => {}) {
		assert(this.interruptableCmd == undefined);	// Only one interruptable
		// Create command entry
		this.interruptableCmd = new CommandEntry(command, handler, NO_TIMEOUT);
		// check if command can be sent right away
		if(this.queue.length == 0) {
			this.sendSocketCmd(this.interruptableCmd);
		}
	}


	/**
	 * Sends a cmd through the socket.
	 * @param cmd The command to send.
	 */
	private sendSocketCmd(cmd: CommandEntry) {
		// check if connected
		if(this.state != SocketState.CONNECTED)
			return;
		// Send command
		if(cmd == undefined)
			return;
		// normal processing
		let command = cmd.command + '\n';
		this.log('=>', cmd.command);
		this.write(command);
		// Set timeout
		this.setTimeout(cmd.timeout);
	}


	/**
	 * Sends the oldest command in the queue through the socket.
	 */
	private sendSocket() {
		// check if connected
		if(this.state != SocketState.CONNECTED)
			return;
		// Check if any command in the queue
		if(this.queue.length == 0)
			return;

		// Send oldest command
		let cEntry = this.queue[0];
		this.sendSocketCmd(cEntry);
	}


	/**
	 * Sends a blank string to zesarux. Used to stop zesarux if it is "run"ning.
	 */
	public sendBlank() {
		// check if connected
		if(this.state != SocketState.CONNECTED)
			return;
		// Send just a newline
		this.log('=>', '\n');
		this.write('\n');
	}


	/**
	 * Receives data from the socket.
	 */
	private receiveSocket(data: Buffer) {
		const sData = data.toString();
		if(!sData) {
			this.logSocket.log('Error: Received ' + data.length + ' bytes of undefined data!');
			return;
		}
		this.log('<=', sData);

		// Check if last line asks for a new command
		this.receivedDataChunk += sData;
		// Check for log message.
		let p = 0;
		let k;
		const lenLog = 5;	// 5 chars: 'log> '
		while((k = this.receivedDataChunk.indexOf('log> ', p)) >= 0) {
			p = k;
			if(k > 0 && this.receivedDataChunk.charAt(k-1) != '\n') {
				p += lenLog;
				continue;
			}
			// Now search for the end
			k = this.receivedDataChunk.indexOf('\n', p)
			if(k < 0) {
				p += lenLog;
				continue;
			}
			// Log found -> forward log
			const log = this.receivedDataChunk.substr(p+lenLog, k-p-lenLog);	// Without '\n'
			this.emit('log', log);
			// Remove log from string
			this.receivedDataChunk = this.receivedDataChunk.substr(0,p) + this.receivedDataChunk.substr(k+1);	// With '\n'
			// Next
		}

		// Check for last line
		const splitData = this.receivedDataChunk.split('\n');
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
			let concData = splitData.join('\n');
			// Remember state
			this.zesaruxState = lastLine.substr(8);

			// remove corresponding command
			let cEntry = this.queue.shift();
			this.emitQueueChanged();

			// Check if we waited for the interruptable command
			if(this.interruptableCmd && cEntry == undefined) {
				// It was not interrupted by another command.
				// It returned by itself (e.g. 'run' hit a breakpoint).
				assert(this.interruptableCmd);
				const iCmd = this.interruptableCmd;
				this.interruptableCmd = undefined;
				if(iCmd)	// calm the transpiler
					iCmd.handler(concData);
				return;
			}

			// Check on error from zesarux
			if(concData.startsWith('Error')) {
				// send message through to UI
				let msg = '';
				if(cEntry)
					msg = cEntry.command + ' => ';
				msg += concData;
				this.emit('warning', msg);
			}

			// Send next entry (if any)
			this.sendSocket();

			// Save old interruptable (could be that a new one is set in the handlers)
			const interCmd = this.interruptableCmd;

			// Execute handler
			if( cEntry != undefined)
				cEntry.handler(concData);

			// Check if last command is completed (if queue is empty)
			this.checkLastCommandCompleted();

			// Check if interruptable command needs to be restarted.
			if(this.queue.length == 0
				&& interCmd) {
					// Restart
					this.sendSocketCmd(interCmd);
				}

		}
	}


	/**
	 * removeAllListeners is broken in vscode 1.31.1 (Feb/2019).
	 * Here is the correct call to remove all listeners if no argument is given.
	 * Note: this is not a full replacement.
	 */
	protected myRemoveAllListeners() {
		const Stream = require('stream');
		Stream.prototype.removeAllListeners.apply(this);
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
		zSocket.myRemoveAllListeners();

		// Keep the data listener
		this.on('data', data => {
			this.receiveSocket(data);
		});

		// inform caller
		const func = () => {
			zSocket.myRemoveAllListeners();
			handler();
		}
		// The new listeners
		zSocket.once('error', () => {
			this.logSocket.log('Socket error (should be close).');
			func()
			zSocket.end();
		});
		zSocket.once('timeout', () => {
			this.logSocket.log('Socket timeout (should be close).');
			func()
			zSocket.end();
		});
		zSocket.once('close', () => {
			this.logSocket.log('Socket closed. OK.');
			func();
		});
		zSocket.once('end', () => {
			this.logSocket.log('Socket end. OK.');
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
		this.logSocket.log('Quitting:');
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


	/**
	 * Signals that the queue has changed.
	 * Used by the Unit Tests to find out when to start the
	 * unit tests.
	 */
	protected emitQueueChanged() {
		this.emit('queueChanged', this.queue.length);
	}


	/**
	 * Prints out a formatted log.
	 * @param prefix Use either '=>' for sending or '<=' for receiving.
	 * @param text The text to log. Can contain newlines.
	 */
	protected log(prefix: string, text: string|undefined) {
		if(!this.logSocket.isEnabled())
			return;

		// Prefixes
		prefix += ' ';
		const prefixLen = prefix.length;
		const nextPrefix = ' '.repeat(prefixLen);

		// Log
		if(text == undefined)
			text = "(undefined)";
		const arr = text.split('\n');
		for(const line of arr) {
			this.logSocket.log(prefix + line);
			prefix = nextPrefix;
		}

		// Log also globally, first line only
		let globLine = prefix + arr[0];
		if(arr.length > 1)
			globLine += ' ...';
		Log.log(globLine);
	}
}


/// zSocket is the singleton object that should be accessed.
export let zSocket;

