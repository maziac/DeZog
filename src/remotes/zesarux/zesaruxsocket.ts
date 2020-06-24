import { Log, LogSocketCommands } from '../../log';
import { Socket } from 'net';
import { Settings } from '../../settings';
import { LogSocket } from '../../log';
import {Utility} from '../../misc/utility';


//import { setKeepAliveInterval } from 'net-keepalive';


/// Timeouts.
const CONNECTION_TIMEOUT = 1000;	///< 1 sec
const QUIT_TIMEOUT = 800;	///< 0.8 sec

export const NO_TIMEOUT = 0;	///< Can be used as timeout value and has the special meaning: Don't use any timeout


/**
 * A command send to Zesarux debugger as it is being put in the queue.
 */
class CommandEntry {
	public command: string|undefined;	///< The command string
	public handler: (data: string) => void;	///< The handler being executed after receiving data.
	public suppressErrorHandling: boolean; ///< Normally a warning is output to the UI if a return value (from ZEsarUx) starts with the text "error". If suppressErrorHandling is true this is not signalled to the user.
	public timeout: number;		///< The timeout until a response is expected.
	constructor(command: string|undefined, handler: (data: string) => void, suppressErrorHandling: boolean, timeout: number) {
		this.command = command;
		this.handler = handler;
		this.suppressErrorHandling = suppressErrorHandling;
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
 * Defines a queue that guarantees that each command is send one-by-one.
 */
export class ZesaruxSocket extends Socket {

	protected state: SocketState;	///< connected, etc.

	private queue: Array<CommandEntry>;

	private lastCallQueue: Array<()=>void>;

	public zesaruxState: string;

	// Holds the incomplete received message.
	private receivedDataChunk: string;

	/// A special long lasting command like 'run' that can be interrupted by other commands.
	private interruptableRunCmd: CommandEntry|undefined;

	/// Is true as long as "Running until" has not been received after a 'run'.
	/// Other commands are not allowed to interrupt during this short phase.
	private interruptableRunCmdCriticalPhase: boolean;

	/// This value is set during initialization. It is the time that is
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
		this.unref();

		// Remove all previous listeners (in case of a restart)
		this.myRemoveAllListeners();

		// Init
		this.MSG_TIMEOUT = Settings.launch.zrcp.socketTimeout*1000;
		this.receivedDataChunk = '';
		this.state = SocketState.UNCONNECTED;
		this.queue = new Array<CommandEntry>();
		this.lastCallQueue = new Array<()=>void>();
		this.zesaruxState = 'unknown';
		this.interruptableRunCmd = undefined;

		// Wait on first text from zesarux after connection
		var cEntry = new CommandEntry('connected', data => {
			this.state = SocketState.CONNECTED;
			LogSocket.log('First text from ZEsarUX received!');
			this.emit('connected');	// data transmission may start now.
		}, false, 0);
		this.queue.push(cEntry);
		this.emitQueueChanged();
	}

	/**
	Connects to the Zesarux debug port and initializes it.
	hostname: The IP address, e.g. localhost
	port: The ZRCP port (usually 10000)
	*/
	public connectDebugger() {

		this.state = SocketState.CONNECTING;

		this.on('data', data => {
			this.receiveSocket(data);
		});

		this.on('close', () => {
			LogSocket.log('Socket close: disconnected from server');
			this.state = SocketState.UNCONNECTED;
		});

		this.on('error', err => {
			LogSocket.log('Socket: ' + err);
			this.state = SocketState.UNCONNECTED;
		});

		this.on('timeout', () => {
			switch(this.state) {
				case SocketState.CONNECTING:
				{
					const err = new Error('Connection timeout!');
					LogSocket.log('Socket timeout: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED_WAITING_ON_WELCOME_MSG:
				{
					const err = new Error('Connected ZEsarUX, but ZEsarUX does not communicate!');
					LogSocket.log('ZEsarUX does not communicate: ' + err);
					this.emit('error', err);
				}
				break;

				case SocketState.CONNECTED:
				{
					const err = new Error('ZEsarUX did not answer in time!');
					LogSocket.log('ZEsarUX did not answer in time: ' + err);
					this.emit('error', err);
				}
				break;
			}
		});

		this.on('end', () => {
			this.state = SocketState.UNCONNECTED;
			LogSocket.log('Socket end: disconnected from server');
		});

		this.setTimeout(CONNECTION_TIMEOUT);
		const port = Settings.launch.zrcp.port;
		const hostname = Settings.launch.zrcp.hostname;
		this.connect(port, hostname, () => {
			// set timeout to receive the welcome message
			this.setTimeout(this.MSG_TIMEOUT);
			this.interruptableRunCmdCriticalPhase=false;
			// almost connected
			this.state = SocketState.CONNECTED_WAITING_ON_WELCOME_MSG;
			//this.setKeepAlive(true, 1000);	I would have to enable keep-alive to get notified if the connection closes, but I was not able to change the default interval (2hrs). The package 'net-keepalive' could not be used.
  			// Set TCP_KEEPINTVL for this specific socket
  			//keepAlive.setKeepAliveInterval(this, 3000);	// ms
			// and TCP_KEEPCNT
			//keepAlive.setKeepAliveProbes(this, 1);

			LogSocket.log('Socket: Connected to zesarux server!');
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
	public async executeWhenQueueIsEmpty(): Promise<void> {
		if(this.queue.length > 0) {
			// queue the call
			return new Promise<void>(resolve => {
				this.lastCallQueue.push(resolve);
			});
		}
	}


	/**
	 * If messages are still pending the messages is queued.
	 * Otherwise the message is directly send.
	 * After the message is executed the 'handler' is called.
	 * Additionally the timeout can be set until when a response is expected.
	 * @param command The message to send to ZEsarUX.
	 * @param handler Is called when the response is received. Can be undefined.
	 * @param suppressErrorHandling Normally a warning is output to the UI if a return value (from ZEsarUx)
	 * starts with the text "error". If suppressErrorHandling is true this
	 * is not signalled to the user.
	 * @param timeout The timeout in ms or 0 if no timeout should be used. Default is 100ms. Normally use -1 (or omit) to use the timeout from the Settings.
	 */
	public send(command: string, handler: {(data)} = (data) => {}, suppressErrorHandling = false, /*, timeout = -1*/) {
		const timeout = this.MSG_TIMEOUT;
		// Create command entry
		var cEntry = new CommandEntry(command, handler, suppressErrorHandling, timeout);
		this.queue.push(cEntry);
		this.emitQueueChanged();
		// check if command can be sent right away
		if (!this.interruptableRunCmdCriticalPhase) {
			if (this.queue.length==1) {
				if (this.interruptableRunCmd) {
					// Interrupt the command: create an interrupt cmd
					const cBreak=new CommandEntry('', () => {}, false, this.MSG_TIMEOUT);
					// Insert as first command
					this.queue.unshift(cBreak);
					this.emitQueueChanged();
				}
				// Send command
				this.sendSocket();
			}
		}
	}


	/**
	 * Sends an interruptable 'run' command. I.e. the 'run' command does not immediately return.
	 * The interruptable command is not executed as long as there are other commands in the queue
	 * and it is interrupted by any following command.
	 * Interruption means: The current execution is stopped (a blank is sent),
	 * the handler is re-directed to catch the result.
	 * The commands in the queue are executed and in the end the command is
	 * executed once again.
	 * @param handler Called with the response of the 'run' command.
	 */
	public sendInterruptableRunCmd(handler: (data) => void) {
		Utility.assert(this.interruptableRunCmd == undefined);	// Only one interruptable
		// Create command entry
		this.interruptableRunCmd = new CommandEntry('run', handler, false, NO_TIMEOUT);
		// check if command can be sent right away
		if(this.queue.length == 0) {
			this.sendSocketCmd(this.interruptableRunCmd);
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
		this.log('=>', "'"+cmd.command+"'");

		// Set timeout
		this.setTimeout(cmd.timeout);

		// If 'run' was sent it is not allowed to interrupt it until "Running until" is received.
		// Otherwise Dezog will hang.
		if (cmd==this.interruptableRunCmd) {
			this.interruptableRunCmdCriticalPhase=true;
		}

		// Send
		this.write(command);

		// Log only commands
		if(LogSocketCommands)
			LogSocketCommands.appendLine('>' + command + '<');
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
			LogSocket.log('Error: Received ' + data.length + ' bytes of undefined data!');
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

		// Split multiline data
		const splitData=this.receivedDataChunk.split('\n');
		// Check if at least a full ine has been received (ending with '\n')
		if (splitData.length<2)
			return;

		// Check for response to 'run' command
		if (this.interruptableRunCmdCriticalPhase) {
			// If data has been received ("Running until"...)
			// then the critical phase is over.
			this.interruptableRunCmdCriticalPhase=false;
			// Check if only one line received or multiple
			const lineCount=splitData.length;
			Utility.assert(splitData[0].startsWith("Running until"));
			if (lineCount>2) {
				// Remove first line and work on the rest normally
				splitData.shift();
			}
			else {
				// Check if command is in the queue
				if (this.queue.length>0) {
					// Interrupt the command: create an interrupt cmd
					const cBreak=new CommandEntry('', () => {}, false, this.MSG_TIMEOUT);
					// Insert as first command
					this.queue.unshift(cBreak);
					this.emitQueueChanged();
					// Send command
					this.sendSocket();
				}
				Utility.assert(lineCount==2);
				this.receivedDataChunk=splitData[1];
				return;
			}
		}

		// Check for last line
		const lastLine=splitData[splitData.length-1];
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

			// Remove corresponding command
			let cEntry = this.queue.shift();
			this.emitQueueChanged();

			// Check if we waited for the interruptable command
			const iCmd = this.interruptableRunCmd;
			if(iCmd) {
				if(cEntry == undefined || sData.indexOf('point hit at') >= 0) {
					// Watchpoint or breakpoint hit.
					// It was not interrupted by another command.
					// It returned by itself (e.g. 'run' hit a breakpoint).
					this.interruptableRunCmd = undefined;

					// If cEntry is defined either there is no other command
					// in the queue (user pressed "Break") or there is another
					// command waiting.
					// Sending needs to be done before the 'handler' is called to prevent sending twice if handler also sends something.
					this.sendSocket();	// Does nothing if no command is waiting.

					// Call the handler
					iCmd.handler(concData);
					return;
				}
			}


			// Send next entry (if any)
			this.sendSocket();

			// Save old interruptable (could be that a new one is set in the handlers)
			const interCmd = this.interruptableRunCmd;

			// Check on error from zesarux
			if(concData.substr(0,5).toLowerCase() == 'error') {
				if(!cEntry || !(cEntry.suppressErrorHandling)) {
					// send message through to UI
					let msg = '';
					if(cEntry)
						msg = cEntry.command + ' => ';
					msg += concData;
					this.emit('warning', msg);
				}
			}

			// Execute handler
			if(cEntry != undefined)
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
	 * Reproducibility:
	 * Start emulator, stop it. If you get a warning "ZEsarUX terminated
	 * the connection" the error is still there.
	 */
	protected myRemoveAllListeners() {
		//this.removeAllListeners(); // Still does not work in vscode 1.35.0. Can be seen if quitting the socket will generate in double answers from zesarux.
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
		this.myRemoveAllListeners();

		// Keep the data listener
		this.on('data', data => {
			this.receiveSocket(data);
		});

		// inform caller
		let handlerCalled = false;
		const func = () => {
			if(handlerCalled)
				return;
			handlerCalled = true;
			zSocket.myRemoveAllListeners();
			handler();
		}
		// The new listeners
		this.once('error', () => {
			LogSocket.log('Socket error (should be close).');
			func();
			zSocket.end();
		});
		this.once('timeout', () => {
			LogSocket.log('Socket timeout (should be close).');
			func();
			zSocket.end();
		});
		this.once('close', () => {
			LogSocket.log('Socket closed. OK.');
			this.state = SocketState.UNCONNECTED;
			func();
		});
		this.once('end', () => {
			LogSocket.log('Socket end. OK.');
			this.state = SocketState.UNCONNECTED;
			func();
		});

		// Check state
		//if(this.state != SocketState.CONNECTED)
		/*
		{
			// Already disconnected or not really connected.
			if(!zSocket.connected || this.state == SocketState.CONNECTING)
				zSocket.end();
			else
				func();
			return;
		}
		*/

		// Terminate if connected
		if (this.state==SocketState.CONNECTED) {
			//func();
			//zSocket.destroy();
			//return;
			// Terminate connection
			LogSocket.log('Quitting:');
			this.setTimeout(QUIT_TIMEOUT);
			this.send('\n');	// Just for the case that we are waiting on a breakpoint.
			this.send('cpu-history enabled no', () => {}, true);
			this.send('cpu-code-coverage enabled no', () => {}, true);
			this.send('extended-stack enabled no', () => {}, true);
			this.send('clear-membreakpoints');
			this.send('disable-breakpoints', () => {
				this.send('quit');
				// Close connection (ZEsarUX also closes the connection)
				//zSocket.end(); // "end()" takes too long > 1 s
				zSocket.destroy();

			});
			return;
		}

		// Otherwise just end (and call func)
		this.end();

		// If already destroyed directly call the handler
		if(this.destroyed)
			handler();
		else
			this.destroy();
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
		if(!LogSocket.isEnabled())
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
			LogSocket.log(prefix + line);
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
export let zSocket: ZesaruxSocket;

