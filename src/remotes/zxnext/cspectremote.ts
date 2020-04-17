import {LogSocket} from '../../log';
import {ZxNextRemote} from './zxnextremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
import {Z80Registers, Z80RegistersStandardDecoder} from '../z80registers';
import {Utility} from '../../misc/utility';


/// Timeouts.
const CONNECTION_TIMEOUT=1000;	///< 1 sec
const CHUNK_TIMEOUT=1000;	///< 1 sec
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

	// To collect received chunks.
	protected receivedData: Buffer;
	protected expectedLength: number;
	protected receivingHeader: boolean;

	// Timeout between data chunks
	protected chunkTimeout?: NodeJS.Timeout;


	/// Constructor.
	constructor() {
		super();
		// Set decoder
		Z80Registers.decoder=new Z80RegistersStandardDecoder();
	}


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

			this.receivedData=new Buffer(0);
			this.expectedLength=4;	// for length
			this.receivingHeader=true;
			this.stopChunkTimeout();

			// Test
			/*
			await this.sendDzrpCmdPause();
			const regs=await this.sendDzrpCmdGetRegisters();
			await this.sendDzrpCmdGetConfig();
	//		const regs=await this.sendDzrpCmdGetRegisters();
			//const slots=await this.sendDzrpCmdGetSlots();
			const mem=await this.sendDzrpCmdReadMem(0x100, 0x200);
			const bpId = await this.sendDzrpCmdAddBreakpoint(0);
			await this.sendDzrpCmdRemoveBreakpoint(bpId);
			await this.sendDzrpCmdWriteMem(0xE000, new Uint8Array([ 1, 2, 3]));
			const mem2=await this.sendDzrpCmdReadMem(0xE000, 4);
			await this.sendDzrpCmdSetRegister(Z80_REG.HL, 4660);
			const regs2=await this.sendDzrpCmdGetRegisters();
			*/

			this.onConnect();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogSocket.log('CSpectRemote: closed connection: '+hadError);
			console.log('Close.');
			// Error
			const err=new Error('CSpect plugin terminated the connection!');
			this.emit('error', err);
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
			this.dataReceived(data);
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
			this.socket.removeAllListeners();
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
			this.socket.removeAllListeners();
			this.socket.end(() => {
				this.emit('terminated');
				resolve();
			});
		});
	}

	/**
	 * Starts the chunk timeout.
	 */
	protected startChunkTimeout() {
		this.stopChunkTimeout();
		this.chunkTimeout=setTimeout(() => {
			const err=new Error('Socket chunk timeout.');
			// Log
			LogSocket.log('Error: '+err.message);
			// Error
			this.emit('error', err);
		}, CHUNK_TIMEOUT);
	}


	/**
	 * Stops the chunk timeout.
	 */
	protected stopChunkTimeout() {
		if (this.chunkTimeout)
			clearTimeout(this.chunkTimeout);
		this.chunkTimeout=undefined;
	}


	/**
	 * Called when data has been received.
	 */
	protected dataReceived(data: Buffer) {
		//LogSocket.log('dataReceived, count='+data.length);

		// Add data to existing buffer
		this.receivedData=Buffer.concat([this.receivedData, data]);

		// While loop becasue there might be more than 1 message received
		while (this.receivedData.length>0) {
			// Check if still data to receive
			if (this.receivedData.length<this.expectedLength) {
				this.startChunkTimeout();
				return;	// Wait for more
			}

			// Check length
			if (this.receivingHeader) {
				// Header has been received, read length
				const buffer=this.receivedData;
				let recLength=buffer[0];
				recLength+=buffer[1]*256;
				recLength+=buffer[2]*256*256;
				recLength+=buffer[3]*256*256*256;
				this.expectedLength=recLength+4;
				this.receivingHeader=false;
				// Check if all payload has been received
				if (this.receivedData.length<this.expectedLength) {
					this.startChunkTimeout();
					return;	// Wait for more
				}
			}

			// Complete message received.
			this.stopChunkTimeout();

			// Strip length
			const length=this.expectedLength-4;
			const strippedBuffer=new Buffer(length);
			this.receivedData.copy(strippedBuffer, 0, 4, this.expectedLength);

			// Log
			const txt=this.dzrpRespBufferToString(this.receivedData);
			LogSocket.log('<<< CSpectRemote: Received '+txt);

			// Handle received buffer
			this.receivedMsg(strippedBuffer);

			// Prepare next buffer. Copy to many received bytes.
			const overLength=this.receivedData.length-this.expectedLength;
			Utility.assert(overLength>=0);
			const nextBuffer=new Buffer(overLength);
			this.receivedData.copy(nextBuffer, 0, this.expectedLength);
			this.receivedData=nextBuffer;
			// Next header
			this.expectedLength=4;
			this.receivingHeader=true;
		}
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
			LogSocket.log('>>> CSpectRemote: Sending '+txt);
			this.socket.write(buffer, () => {
					resolve();
			});
		});
	}
}
