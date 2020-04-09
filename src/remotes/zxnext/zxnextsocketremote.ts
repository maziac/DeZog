//import * as assert from 'assert';
import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';
import {Socket} from 'net';
import {Settings} from '../../settings';


/// Timeouts.
const CONNECTION_TIMEOUT=1000;	///< 1 sec
//const QUIT_TIMEOUT=1000;	///< 1 sec


// The used channels.
enum Command {
	// Only one command at the moment.
	UART_DATA=1,
};


/**
 * A ZX Next remote that is connected via a socket.
 * I.e. this is for CSpect support.
 * But could be used for other emulators as well.
 */
export class ZxNextSocketRemote extends ZxNextRemote {

	// The socket connection.
	public socket: Socket;


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
		// Init socket
		this.socket=new Socket();

		// React on-open
		this.socket.on('connect', async () => {
			LogSocket.log('ZxNextSocketRemote: Connected to server!');
			this.onConnect();
		});

		// Handle errors
		this.socket.on('error', err => {
			LogSocket.log('ZxNextSocketRemote: Error: '+err);
			console.log('Error: ', err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.socket.on('data', data => {
			if (data.length<5)
				return;
			// Check which "channel"
			switch (data[4]) {
				case Command.UART_DATA:
					// Received data need to be unwrapped (4 bytes length+1 byte control
					// + 4 bytes serial length)
					const length=data.length-(4+1+4);
					const buffer=new Buffer(length);
					data.copy(buffer, 0, 4+1+4);
					LogSocket.log('ZxNextSocketRemote: Received '+this.dzrpRespBufferToString(data, 4+1));
					this.receivedMsg(buffer)
					break;
			}
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port=Settings.launch.cspect.port;	// TODO: Better pass on creation
		const hostname=Settings.launch.cspect.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		return new Promise<void>(resolve => {
			this.socket.end(() => {
				resolve();
			});
		});
	}


	/**
	 * Terminates the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 */
	public async terminate(): Promise<void> {
		return new Promise<void>(resolve => {
			this.socket.end(() => {
				this.emit('terminated');
				resolve();
			});
		});
	}


	/**
	 * Writes the buffer to the socket port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>(resolve => {
			// Start timer to wait on response
			this.socket.setTimeout(3000);	// TODO: make timeout configurable
			// Wrap data in simple packet, just a 4 byte length + 1 control byte is added.
			const length=buffer.length+1;
			const wrapBuffer=new Uint8Array(length+4);
			wrapBuffer[0]=length&0xFF;
			wrapBuffer[1]=(length>>>8)&0xFF;
			wrapBuffer[2]=(length>>>16)&0xFF;
			wrapBuffer[3]=length>>>24;
			wrapBuffer[4]=Command.UART_DATA;
			wrapBuffer.set(buffer, 4+1);
			// Send data
			LogSocket.log('ZxNextSocketRemote: Sending '+this.dzrpCmdBufferToString(buffer));
			this.socket.write(wrapBuffer, () => {
					resolve();
			});
		});
	}
}
