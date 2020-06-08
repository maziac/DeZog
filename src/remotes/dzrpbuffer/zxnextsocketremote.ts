import {LogSocket} from '../../log';
import {DZRP} from '../dzrp/dzrpremote';
import {DzrpBufferRemote, CONNECTION_TIMEOUT} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
//import {DZRP} from '../dzrp/dzrpremote';
//import {Utility} from '../../misc/utility';
//import {Z80_REG} from '../z80registers';




/**
 * Structure to hold the opcode to restore and the address of
 * the breakpoint.
 */
interface RestorableBreakpoint {
	// The breakpoint address
	address: number,
	// The opcode stored at the breakpoint address
	opcode: number
}


/**
 * A ZX Next remote that is connected via a socket.
 * I.e. another program that converts socket to serial.
 */
export class ZxNextSocketRemote extends DzrpBufferRemote {

	// The socket connection.
	public socket: Socket;

	// For restoring the breakpoints it is necessary to determine
	// if a bp is currently restored or not.
	// If not undefined it is currently restored.
	protected breakedAddress: number|undefined;


	// Array of restorable breakpoints which store alos the opcode for restoration.
	protected restorableBreakpoints: Map<number, RestorableBreakpoint>;
	protected restoreBreakpointIdLastIndex


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

			this.receivedData=new Buffer(0);
			this.expectedLength=4;	// for length
			this.receivingHeader=true;
			this.stopChunkTimeout();

			this.breakedAddress=undefined;
			this.restorableBreakpoints = new Map<number, RestorableBreakpoint>();
			this.restoreBreakpointIdLastIndex=0;
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
			this.dataReceived(data);
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
				// Send data
			const txt=this.dzrpCmdBufferToString(buffer);
			LogSocket.log('ZxNextSocketRemote: Sending '+txt);
			this.socket.write(buffer, () => {
					resolve();
			});
		});
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
		// Check breakpoints
		if (this.checkBreakpoint(bp1Address)||this.checkBreakpoint(bp2Address)) {
			const breakAddress=this.getPC();
			const breakReasonString="Cannot step at address "+Utility.getHexString(breakAddress, 4)+"h.";
			this.emit('warning', breakReasonString);
			const breakNumber=BREAK_REASON_NUMBER.STEPPING_NOT_ALLOWED;
			this.continueResolve!({breakNumber, breakAddress, breakReasonString});
			return;
		}

		// Remember old resolve function
		const originalContinueResolve=this.continueResolve!;
		const resolveWithBp = async ({breakNumber, breakAddress, breakReasonString}) => {
			// Store breakpoint if breakpoint was hit
			this.breakedAddress=undefined;
			if (breakNumber==BREAK_REASON_NUMBER.BREAKPOINT_HIT)
				this.breakedAddress=breakAddress;
			// Restore breakpoint addresses
			const count=bpAddresses.length;
			Utility.assert(count==opcodes.length);
			let memCount=count;
			if (oldOpcode!=undefined)
				memCount+1;
			const memValues=new Array<{address: number, value: number}>(memCount);
			let k=0;
			if (oldOpcode!=undefined) {
				// Add the las set breakpoint
				memValues[k++]={address: oldBreakedAddress!, value: oldOpcode[0]}
			}
			// Change the order
			for (let i=count-1; i>=0; i--) {
				memValues[k++]={address: bpAddresses[i], value: opcodes[i]};
			}
			await this.sendDzrpCmdRestoreMem(memValues);
			// Call original handler
			originalContinueResolve({breakNumber, breakAddress, breakReasonString});
		};

		// Get all breakpoint addresses (without breakedAddress)
		const bpAddresses=this.getBreakpointAddresses();
		// Set breakpoints and get opcodes
		const opcodes=await this.sendDzrpCmdSetBreakpoints(bpAddresses);

		// Handle different states
		const oldBreakedAddress=this.breakedAddress;
		let oldOpcode;
		if (oldBreakedAddress==undefined) {
			// "Normal" case.
			// Catch resolve method to store the breakpoint ID.
			Utility.assert(this.continueResolve);
			this.continueResolve=resolveWithBp;
			await super.sendDzrpCmdContinue(bp1Address, bp2Address);
		}
		else {
			// Continuing from a breakpoint.
			// Setup intermediate resolve function.
			this.continueResolve=async ({breakNumber, breakAddress, breakReasonString}) => {
				// Store new breakpoint if breakpoint was hit
				this.breakedAddress=undefined;
				if (breakNumber==BREAK_REASON_NUMBER.BREAKPOINT_HIT)
					this.breakedAddress=breakAddress;

				// Check if 2nd continue is necessary
				if ((breakAddress!=undefined&&
					(breakAddress==bp1Address||breakAddress==bp2Address))
					||breakNumber==BREAK_REASON_NUMBER.BREAKPOINT_HIT) {
					// Either a "real" breakpoint was hit or one of the original temporary breakpoints.
					// In any case we don't need to continue here.
					resolveWithBp({breakNumber, breakAddress, breakReasonString});
				}
				else {
					// Restore resolve function
					this.continueResolve=resolveWithBp;
					// Restore the breakpoint (the other breakpoints are already set)
					oldOpcode=await this.sendDzrpCmdSetBreakpoints([oldBreakedAddress]);
					// Continue
					await super.sendDzrpCmdContinue(bp1Address, bp2Address);
				}
			};

			// Calculate the 2 temporary bp addresses
			let [, tmpBp1Addr, tmpBp2Addr]=await this.calcStepBp(false /*step-into*/);

			// Step
			await super.sendDzrpCmdContinue(tmpBp1Addr, tmpBp2Addr);
		}
	}


	/**
	 * Sends the command to set all breakpoints.
	 * For the ZXNext all breakpoints are set at once just before the
	 * next 'continue' is executed.
	 * @param bpAddresses The breakpoint addresses. Each 0x0000-0xFFFF.
	 * @returns A Promise with the memory contents from each breakpoint address.
	 */
	protected async sendDzrpCmdSetBreakpoints(bpAddresses: Array<number>): Promise<Array<number>> {
		// Create buffer from array
		const count=bpAddresses.length;
		const buffer=Buffer.alloc(2*count);
		let i=0;
		for (const addr of bpAddresses) {
			buffer[i++]=addr&0xFF;
			buffer[i++]=(addr>>>8)&0xFF;
		}
		const opcodes=await this.sendDzrpCmd(DZRP.CMD_SET_BREAKPOINTS, buffer);
		return [...opcodes];
	}


	/**
	 * Sends the command to restore the memory for all breakpoints.
	 * This is send just after the 'continue' command.
	 * So that the user only sees correct memory contents even if doing
	 * a disassembly or memory read.
	 * It is also required otherwise the breakpoints in 'calcStep' are not correctly
	 * calculated.
	 * @param elems The addresses + memory content.
	 */
	protected async sendDzrpCmdRestoreMem(elems: Array<{address: number, value: number}>): Promise<void> {
		// Create buffer from array
		const count=elems.length;
		const buffer=Buffer.alloc(3*count);
		let i=0;
		for (const elem of elems) {
			const addr=elem.address;
			buffer[i++]=addr&0xFF;
			buffer[i++]=(addr>>>8)&0xFF;
			buffer[i++]=elem.value;
		}
		await this.sendDzrpCmd(DZRP.CMD_RESTORE_MEM, buffer);
	}


	/**
	 * Stores the breakpoints in a list.
	 * This inlcides the breakpoints set for ASSERTs and LOGPOINTs.
	 * The breakpoints are later sent all at once with CMS_SET_BREAKPOINTS.
	 * @param bpAddress The breakpoint address. 0x00??-0xFFFF.
	 * @param condition Not used.
	 * @returns A Promise with the breakpoint ID or 0 if breakpoint could not be set.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		// Check breakpoint address.
		const errText=this.checkBreakpoint(bpAddress);
		if(errText) {
			// Some lower breakpoint addresses cannot be used.
			this.emit('warning', "On the ZXNext you cannot set breakpoints at "+errText+".");
			return 0;
		}
		this.restoreBreakpointIdLastIndex++;
		this.restorableBreakpoints.set(this.restoreBreakpointIdLastIndex,{address: bpAddress, opcode: 0});
		return this.restoreBreakpointIdLastIndex;
	}


	/**
	 * Removes a breakpoint from the list.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		// Get address to check if current breakpoint is removed
		const bp=this.restorableBreakpoints.get(bpId)!;
		Utility.assert(bp);
		if (this.breakedAddress==bp?.address)
			this.breakedAddress=undefined;
		// Delete
		this.restorableBreakpoints.delete(bpId);
	}


	/**
	 * Returns all breakpoint addresses without the this.breakedAddress.
	 * @returns Array with breakpoint address.
	 */
	protected getBreakpointAddresses(): Array<number> {
		const bpArray=this.breakpoints.map(bp => bp.address);
		const breakedAddress=this.breakedAddress;
		const bpFiltered=bpArray.filter(address => address!=breakedAddress);
		return bpFiltered;
	}


	/**
	 * Checks for an allowed breakpoint address.
	 * @returns If allowed: undefined
	 * If not allowed: a string with the address range that can be used for
	 * error output.
	 */
	protected checkBreakpoint(addr: number|undefined): string|undefined {
		/// TODO: Add exact values.
		if (addr!=undefined&&
			(addr<0
			||addr<0x38
				||addr==0x66))
			return "addresses 0x0000-0x0037 and 0x0066";
		return undefined;
	}


	/**
	 * Not supported.
	 * The ZX Next can't read the sprite attributes.
	 * Throws an exception.
 	*/
	public async sendDzrpCmdGetSprites(index: number, count: number): Promise<Array<Uint8Array>> {
		throw Error("The sprite attributes can't be read on a ZX Next unfortunately.");
	}


	/**
	* Not supported.
	* The ZX Next can't read the sprite patterns.
	* Throws an exception.
	*/
	protected async sendDzrpCmdGetSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		throw Error("The sprite patterns can't be read on a ZX Next unfortunately.");
	}


	/**
	 * State saving is not supported with ZX Next.
	 */
	public async stateSave(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with the ZX Next.");
	}
	public async stateRestore(filePath: string): Promise<void> {
		throw Error("Saving and restoring the state is not supported with the ZX Next.");
	}
}
