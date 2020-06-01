import {LogSocket} from '../../log';
import {DzrpBufferRemote} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
//import {DZRP} from '../dzrp/dzrpremote';
//import {Utility} from '../../misc/utility';
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
 * Structure to hold the additional info for a breakpoint ID.
 * I.e. the opcode to restore and the address of
 * the breakpoint.
 */
interface BreakpointExtraInfo { // TODO: Change structure to simple number.
	opcode: number,
	//address: number
}


/**
 * A ZX Next remote that is connected via a socket.
 * I.e. another program that converts socket to serial.
 */
export class ZxNextSocketRemote extends DzrpBufferRemote {

	// The socket connection.
	public socket: Socket;

	// Stores for each breakpoint ID the opcode (the opcode that was exchanged with RST).
	protected bpExtraInfos: Map<number, BreakpointExtraInfo>;

	// For restoring the breakpoints it is necessary to determine
	// if a bp is currently restored or not.
	// If not undefined it is currently restored.
	protected restoreBreakpointId: number|undefined;


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
			this.bpExtraInfos=new Map<number, BreakpointExtraInfo>();
			this.restoreBreakpointId=undefined;
			this.onConnect();
		});

		// Handle errors
		this.socket.on('error', err => {
			LogSocket.log('ZxNextSocketRemote: Error: '+err);
			//console.log('Error: ', err);
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


	/**
	 * When dealing with the HW it is not enough to simply
	 * set a breakpoint but also teh memory contents
	 * of the opcode need to be stored to restore
	 * it if necessary.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		// Get memory at breakpoint address
		const opcodes=await this.sendDzrpCmdReadMem(bpAddress, 1);
		const opcode=opcodes[0];
		// Set breakpoint normally
		const bpId=await super.sendDzrpCmdAddBreakpoint(bpAddress, condition);

		// For each bp ID it is necessary to store the opcode
		this.bpExtraInfos.set(bpId, {opcode});

		// Return
		return bpId;
	}


	/**
	 * Restores the opcode on removal.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		// Remove breakpoint "normally"
		await super.sendDzrpCmdRemoveBreakpoint(bpId);
		// Restore opcode at breakpoint
		await this.restoreOpcodeAtBreakpoint(bpId);
	}


	/**
	 * Returns the address of a given breakpoint ID.
	 * @param bpId The breakpoint ID to find.
	 * @returns The breakpoint address.
	 */
	protected getBreakpointAddress(bpId: number): number {
		// TODO: I can optimize it because the bpId is equal to the address.
		const bp=this.breakpoints.find(bp => bp.bpId==bpId);
		Utility.assert(bp);
		return bp!.address;
	}


	/**
	 * Restores the opcode of a breakpoint for a given breakpoin
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async restoreOpcodeAtBreakpoint(bpId: number): Promise<void> {
		// Get breakpoint address
		const address=this.getBreakpointAddress(bpId);
		// Get opcode
		const bpExtraInfo=this.bpExtraInfos.get(bpId)!;
		Utility.assert(bpExtraInfo);
		// Restore opcode at breakpoint
		await this.sendDzrpCmdWriteMem(address, new Uint8Array([bpExtraInfo.opcode]));
	}



	/**
	 * When connected to a ZX Next this method must take
	 * over intelligence from the remote.
	 * 2 states are distinugished:
	 * - enteredBreakpointState=false: The normal one, calls the super class.
	 *- enteredBreakpointState=true: A breakpoint ahs been hit before.
	 * On continue it is necessary to restore the opcode first.
	 *
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		const bpId=this.restoreBreakpointId;
		if (bpId==undefined) {
			// "Normal" case
			await super.sendDzrpCmdContinue(bp1Address, bp2Address);
		}
		else {
			// Continuing from a breakpoint.
			// Remember old resolve function
			const originalContinueResolve=this.continueResolve;

			// Setup intermediate resolve function.
			this.continueResolve=async ({breakNumber, breakAddress, breakReasonString}) => {
				// Restore the breakpoint
				const bpAddr=this.getBreakpointAddress(bpId);
				this.sendDzrpCmdAddBreakpoint(bpAddr);
				this.restoreBreakpointId=undefined;
				// Restore resolve function
				this.continueResolve=originalContinueResolve;
				// Continue
				await super.sendDzrpCmdContinue(bp1Address, bp2Address);
			};

			// Overwrite the breakpoint temporarily with the opcode,
			// to step over it.
			this.restoreOpcodeAtBreakpoint(bpId);

			// Calculate the 2 temporary bp addresses
			let [, tmpBp1Addr, tmpBp2Addr]=await this.calcStepBp(false /*step-into*/);

			// Step
			await super.sendDzrpCmdContinue(tmpBp1Addr, tmpBp2Addr);
		}
	}

}
