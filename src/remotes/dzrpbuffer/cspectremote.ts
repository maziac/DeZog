import {LogSocket} from '../../log';
import {DzrpBufferRemote, CONNECTION_TIMEOUT} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
import {DzrpMachineType} from '../dzrp/dzrpremote';
//import {Utility} from '../../misc/utility';



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


	/// Constructor.
	constructor() {
		super();
		this.cmdRespTimeoutTime=Settings.launch.cspect.socketTimeout*1000;
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void>  {
		// Check for unsupported settings
		if (Settings.launch.unitTests) {
			throw Error("launch.json: unitTests==true: CSpect does not support running unit tests.");
		}

		// Init socket
		this.socket=new Socket();
		this.socket.unref();

		// React on-open
		this.socket.on('connect', async () => {
			LogSocket.log('CSpectRemote: Connected to server!');

			this.receivedData=Buffer.alloc(0);
			this.expectedLength=4;	// for length
			this.receivingHeader=true;
			this.stopChunkTimeout();

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
			// callback it it is already closed and the state cannot
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
	 * Writes the buffer to the socket port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>(resolve => {
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
	 * REMARK: Enable CSpect watchpoints when problem is solved in CSpect.
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


	/**
	 * Returns a better error in case of CSpect plugin incompability.
	 * @returns The error, program name (incl. version), dzrp version and the machine type.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	protected async sendDzrpCmdInit(): Promise<{error: string|undefined, programName: string, dzrpVersion: string, machineType: DzrpMachineType}> {
		const result=await super.sendDzrpCmdInit();
		if (result.error) {
			// An error occured. Add some help.
			result.error+="\nTry updating the DeZog (CSpect) Plugin (https://github.com/maziac/DeZogPlugin/releases)."
		};
		return result;
	}



	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdSetBreakpoints(bpAddresses: Array<number>): Promise<Array<number>> {
		throw Error("'sendDzrpCmdSetBreakpoints' is not implemented.'");
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdRestoreMem(elems: Array<{address: number, value: number}>): Promise<void> {
		throw Error("'sendDzrpCmdRestoreMem' is not implemented.");
	}
}
