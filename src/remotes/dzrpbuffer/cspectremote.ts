import {LogSocket} from '../../log';
import {DzrpBufferRemote} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
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
export class CSpectRemote extends DzrpBufferRemote {

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
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void>  {
		// Check for unsupported settings
		if (Settings.launch.unitTests) {
			throw Error("launch.json: unitTests==true: CSpect does not support running unit tests at the moment.");
		}

		// Init socket
		this.socket=new Socket();
		this.socket.unref();

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

			// Check for unsupported settings
			if (Settings.launch.history.codeCoverageEnabled) {
				this.emit('warning', "launch.json: codeCoverageEnabled==true: CSpect does not support code coverage.");
			}

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
		const port=Settings.launch.cspect.port;
		const hostname=Settings.launch.cspect.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		if (!this.socket)
			return;
		return new Promise<void>(resolve => {
			this.socket.removeAllListeners();
			// Timeout is required because socket.end() does not call the
			// callback it it is already closed and teh state cannot
			// reliable be determined.
			const timeout = setTimeout(() => {
				if (resolve) {
					resolve();
					resolve=undefined as any;
				}
			}, 1000);	// 1 sec
			this.socket.end(() => {
				if (resolve) {
					resolve();
					resolve=undefined as any;
					clearTimeout(timeout);
				}
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


	/**
	 * Watchpoints and WPMEM is disabled for CSpect for now.
	 * There is a problem in CSpect: If a read-breakpoint is set it
	 * can happen that the PC is not incremented anymore or that the
	 * ISR routine is entered for every instruction. It's not on Mike's priority list, so I disable them here.
	 * TODO: Enable CSpect watchpoints when problem is solved in CSpect.
	 */
	public async enableWPMEM(enable: boolean): Promise<void> {
		throw Error("There is no support for watchpoints for CSpect.");
	}


	/**
	 * State saving is not supported in CSpect.
	 */
	public async stateSave(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with CSpect.");
	}
	public async stateRestore(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with CSpect.");
	}

}
