//import * as assert from 'assert';
import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
//import {Z80_REG} from '../z80registers';


/// Timeouts.
const CONNECTION_TIMEOUT=1000;	///< 1 sec
//const QUIT_TIMEOUT=1000;	///< 1 sec




/**
 * The CSpect Remote.
 * It connects via socket with CSpect.
 * Or better: with the DeZog plugin for CSpect.
 * The CSpect DeZog plugin internally communicates with the
 * CSpect debugger.
 */
export class CSpectRemote extends ZxNextRemote {

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
			LogSocket.log('CSpectRemote: Connected to server!');

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
			LogSocket.log('CSpectRemote: Error: '+err);
			console.log('Error: ', err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.socket.on('data', data => {
			// TODO: Need to implement receiving of small chunks.

			const txt=this.dzrpRespBufferToString(data);
			LogSocket.log('CSpectRemote: Received '+txt);
			this.receivedMsg(data)
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port=Settings.launch.cspect.port;	// TODO: Better pass on class creation
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
			// Send data
			const txt=this.dzrpCmdBufferToString(buffer);
			LogSocket.log('CSpectRemote: Sending '+txt);
			this.socket.write(buffer, () => {
					resolve();
			});
		});
	}
}
