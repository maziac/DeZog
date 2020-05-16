import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
//import {Z80_REG} from '../z80registers';


/// Timeouts.
const CONNECTION_TIMEOUT=1000;	///< 1 sec
//const QUIT_TIMEOUT=1000;	///< 1 sec


// The used channels.
enum Channel {
	// Only one command at the moment.
	UART_DATA=1,
};


/**
 * A ZX Next remote that is connected via a socket.
 * I.e. another program that converts socket to serial.
 */
export class ZxNextSocketRemote extends ZxNextRemote {

	// The socket connection.
	public socket: Socket;



	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void>  {
		// Init socket
		this.socket=new Socket();
		this.socket.unref();

		// React on-open
		this.socket.on('connect', async () => {
			LogSocket.log('ZxNextSocketRemote: Connected to server!');

			// Test
			/*
			const regs=await this.sendDzrpCmdGetRegisters();
			await this.sendDzrpCmdGetConfig();
			await this.sendDzrpCmdPause();
	//		const regs=await this.sendDzrpCmdGetRegisters();
			//const slots=await this.sendDzrpCmdGetSlots();
			const mem=await this.sendDzrpCmdReadMem(0x100, 0x200);
			await this.sendDzrpCmdAddBreakpoint(0);
			await this.sendDzrpCmdRemoveBreakpoint(0);
			await this.sendDzrpCmdWriteMem(0xE000, new Uint8Array([ 1, 2, 3]));
			const mem2=await this.sendDzrpCmdReadMem(0xE000, 4);
			await this.sendDzrpCmdSetRegister(Z80_REG.HL, 0x1234);
			const regs2=await this.sendDzrpCmdGetRegisters();
			*/

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
			// TODO: Need to implement receiving of small chunks.
			if (data.length<5)
				return;
			// Check which "channel"
			switch (data[4]) {
				case Channel.UART_DATA:
					// Received data need to be unwrapped (4 bytes length+1 byte control
					// + 4 bytes serial length)
					const length=data.length-(4+1+4);
					const buffer=new Buffer(length);
					data.copy(buffer, 0, 4+1+4);
					const txt=this.dzrpRespBufferToString(data, 4+1);
					LogSocket.log('ZxNextSocketRemote: Received '+txt);
					this.receivedMsg(buffer)
					break;
			}
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port=Settings.launch.serial.port;
		const hostname=Settings.launch.serial.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		if (!this.socket)
			return;
		return new Promise<void>(resolve => {
			this.socket.end(() => {
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
			wrapBuffer[4]=Channel.UART_DATA;
			wrapBuffer.set(buffer, 4+1);
			// Send data
			const txt=this.dzrpCmdBufferToString(buffer);
			LogSocket.log('ZxNextSocketRemote: Sending '+txt);
			this.socket.write(wrapBuffer, () => {
					resolve();
			});
		});
	}
}
