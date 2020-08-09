import {LogSocket} from '../../log';
import {DZRP} from '../dzrp/dzrpremote';
import {DzrpBufferRemote, CONNECTION_TIMEOUT} from './dzrpbufferremote';
import {Socket} from 'net';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Opcode, OpcodeFlag} from '../../disassembler/opcode';



// Each sent message has to start with this byte.
// The ZX Next transmit a lot of zeroes if the joy port is not configured.
// Therefore this byte is required to recognize when a message starts.
const MESSAGE_START_BYTE = 0xA5;

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


	// Returned breakpoint index.
	protected breakpointIdLastIndex

	// Array is created temporarily during Continue.
	// It holds the breakpoints and their prior values.
	// During Continue it is increased/decreased if other breakpoints are manually added.
	protected breakpointsAndOpcodes: Array<RestorableBreakpoint>;

	// Value to catch the MESSAGE_START_BYTE if received data was 1 byte only.
	protected msgStartByteFound: boolean;


	/// Constructor.
	constructor() {
		super();
		this.cmdRespTimeoutTime=Settings.launch.zxnext.socketTimeout*1000;
	}


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
			this.msgStartByteFound=false;
			this.expectedLength=4;	// for length
			this.receivingHeader=true;
			this.stopChunkTimeout();

			this.breakedAddress=undefined;
			//this.restorableBreakpoints = new Map<number, RestorableBreakpoint>();
			this.breakpointIdLastIndex=0;
			this.onConnect();
		});

		// Handle errors
		this.socket.on('error', err => {
			LogSocket.log('ZxNextSocketRemote: Error: '+err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.socket.on('data', data => {
			this.dataReceived(data);
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port=Settings.launch.zxnext.port;
		const hostname=Settings.launch.zxnext.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * This will disconnect the socket.
	 */
	public async disconnect(): Promise<void> {
		if (!this.socket)
			return;
		return new Promise<void>(async resolve => {
			await super.disconnect();
			this.socket.end(() => {
				resolve();
			});
		});
	}


	/**
	 * Called when data has been received.
	 * If not configured for UART the ZX Next emits zeros through the serial cable.
	 * Therefore we wait until the first indication of a message is received.
	 * I.e. all received messages start with 0xA5.
	 */
	protected dataReceived(data: Buffer) {
		let nData=data;

		if (this.receivedData.length==0&&!this.msgStartByteFound) {
			// Swallow everything (zeroes) up to the first 0xA5 found
			const len=data.length;
			let i;
			for (i=0; i<len; i++) {
				if (data[i]==MESSAGE_START_BYTE) {
					// Start of message found
					if (len==1) {
						this.msgStartByteFound=true;
						return;
					}
					break;
				}
			}
			// Check if start of message found
			if(i+1>=len)
				return;	// Not found
			// Start of message found, skip up to 0xA5
			nData=data.subarray(i+1);
		}
		// Call super
		this.msgStartByteFound=false;
		super.dataReceived(nData);
	}


	/**
	 * Writes the buffer to the socket port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>(resolve => {
			// Send data
			const txt=this.dzrpCmdBufferToString(buffer);
			LogSocket.log('>>> ZxNextSocketRemote: Sending '+txt);
			this.socket.write(buffer, () => {
					resolve();
			});
		});
	}


	/**
	 * The implementation of the SW breakpoints as Z80 instruction (RST) requires a modification
	 * in the calcStep algorithm.
	 * It is for the pathologic case that a calculated breakpoint would be at the
	 * same location as the current PC. E.g. for this code examples
	 * (some senseful some not):
	 * ~~~
	 * loop:  djnz loop
	 *
	 * recursive: call recursive
	 *
	 * endless:  jp endless
	 * ~~~
	 * If the breakpoint would be placed at the PC then the instruction would never be executed.
	 * Therefore
	 * - a stepInto is changed into a stepOver (e.g. to step after the djnz)
	 * - the breakpoint at PC location is set to undefined
	 * @param stepOver true if breakpoint address should be calculate for a step-over.
	 * In this case the branching is ignored for CALL and RST.
	 * @returns A Promise with the opcode and 2 breakpoint
	 * addresses.
	 * The first always points directly after the address.
	 * The 2nd of these bp addresses can be undefined.
	 */
	protected async calcStepBp(stepOver: boolean): Promise<[Opcode, number, number?]> {
		// Get breakpoints
		let [opcode, bpAddr1, bpAddr2]=await super.calcStepBp(stepOver);
		// Check if 2nd breakpoint points to PC
		const pc=this.getPC();
		if (pc==bpAddr2) {
			// For djnz
			bpAddr2=undefined;
		}
		/* for 'recursive' and 'endless' there is no good solution
		if (pc==bpAddr1) {
			// for 'recursive' and 'endless'
			bpAddr1=undefined;
			bpAddr2=undefined;
		}
		*/

		// Check for RST: calcStepBp normally calculates 2 breakpoints for a RST:
		// pc+1 and pc+2.
		// If we would set a SW BP (RST 0) at pc+1 we would change the RST command.
		// So we set only one breakpoint relying on the disassembler setting.
		const ocFlags=opcode.flags;
		if (ocFlags&OpcodeFlag.BRANCH_ADDRESS
			&&(ocFlags&OpcodeFlag.CONDITIONAL)==0
			&&opcode.code==0xCF) {
			// Note: The opcode length for RST 08 is already adjusted by the disassembler.
			// Note: Since we cannot step through ROM anyway a stepInto is handled the same
			// as a stepOver here.
			bpAddr1=pc+opcode.length;
			bpAddr2=undefined;
		}

		return [opcode, bpAddr1, bpAddr2];
	}


	/**
	 * When connected to a ZX Next this method must take
	 * over intelligence from the remote.
	 * 2 states are distinguished:
	 * - enteredBreakpointState=false: The normal one, calls the super class.
	 * - enteredBreakpointState=true: A breakpoint has been hit before.
	 * On continue it is necessary to restore the opcode first.
	 *
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		// Check breakpoints
		if (await this.checkBreakpoint(bp1Address)||await this.checkBreakpoint(bp2Address)) {
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
			const count=this.breakpointsAndOpcodes.length;
			let memCount=count;
			if (oldOpcode!=undefined)
				memCount+1;
			const memValues=new Array<{address: number, value: number}>(memCount);
			let k=0;
			if (oldOpcode!=undefined) {
				// Add the last set breakpoint
				memValues[k++]={address: oldBreakedAddress!, value: oldOpcode[0]}
			}
			// Change the order
			for (let i=count-1; i>=0; i--) {
				const bp=this.breakpointsAndOpcodes[i];
				memValues[k++]={address: bp.address, value: bp.opcode};
			}
			await this.sendDzrpCmdRestoreMem(memValues);
			this.breakpointsAndOpcodes=undefined as any;
			// Call original handler
			originalContinueResolve({breakNumber, breakAddress, breakReasonString});
		};

		// Get all breakpoint addresses (without breakedAddress)
		const bpAddresses=this.getBreakpointAddresses();
		// Set breakpoints and get opcodes
		const opcodes=await this.sendDzrpCmdSetBreakpoints(bpAddresses);
		// Combine
		this.breakpointsAndOpcodes=new Array<RestorableBreakpoint>();
		let len=bpAddresses.length;
		for (let i=0; i<len; i++) {
			const address=bpAddresses[i];
			const opcode=opcodes[i];
			this.breakpointsAndOpcodes.push({address, opcode});
		}

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
	 * This includes the breakpoints set for ASSERTs and LOGPOINTs.
	 * The breakpoints are later sent all at once with CMD_SET_BREAKPOINTS.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID. If the breakpoint could not be set it is set to 0.
	 */
	protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const bpAddress=bp.address;
		// Check breakpoint address.
		const errText=await this.checkBreakpoint(bpAddress);
		if(errText) {
			// Some lower breakpoint addresses cannot be used.
			this.emit('warning', "On the ZXNext you cannot set breakpoints at "+errText+".");
			bp.bpId=0;
		}

		// Add breakpoint
		this.breakpointIdLastIndex++;
		bp.bpId=this.breakpointIdLastIndex;

		// Check if debugged program is running
		if (this.breakpointsAndOpcodes && !this.pauseStep) {
			// Set the breakpoint
			const opcodes=await this.sendDzrpCmdSetBreakpoints([bpAddress]);
			const opcode=opcodes[0];
			// Add to temporary breakpoints
			//if (this.breakpointsAndOpcodes)	// Could be deleted meanwhile
			this.breakpointsAndOpcodes.push({address: bpAddress, opcode});
		}
	}


	/**
	 * Removes a breakpoint from the list.
	 * @param bp The breakpoint to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		// Check if breaked address is removed.
		const bpAddress=bp.address;
		if (this.breakedAddress==bpAddress)
			this.breakedAddress=undefined;
		// Check if debugged program is running
		if (this.breakpointsAndOpcodes && !this.pauseStep) {
			// It is running: remove the breakpoint immediately
			const bpLen=this.breakpointsAndOpcodes.length;
			for (let i=bpLen-1; i>=0; i--) {
				const bp=this.breakpointsAndOpcodes[i];
				if (bp.address==bpAddress) {
					// Get opcode and restore memory
					const opcode=bp.opcode;
					await this.sendDzrpCmdRestoreMem([{address: bpAddress, value: opcode}]);
					// Remove from lists
					//if(this.breakpointsAndOpcodes)	// Could be deleted meanwhile
					this.breakpointsAndOpcodes.splice(i, 1);
					// Return
					return;
				}
			}
		}
	}


	/**
	 * Returns all breakpoint addresses without the this.breakedAddress.
	 * @returns Array with breakpoint address.
	 */
	protected getBreakpointAddresses(): Array<number> {
		const bpFiltered=new Array<number>();
		const tmpBps=this.tmpBreakpoints.keys();
		for(const addr of tmpBps) {
			if (addr!=this.breakedAddress)
				bpFiltered.push(addr);
		}
		return bpFiltered;

		/*
		const bpArray=Array.from(this.restorableBreakpoints.values()).map(bp => bp.address);
		const breakedAddress=this.breakedAddress;
		const bpFiltered=bpArray.filter(address => address!=breakedAddress);
		return bpFiltered;
		*/
	}


	/**
	 * Checks for an allowed breakpoint address.
	 * @returns If allowed: undefined
	 * If not allowed: a string with the address range that can be used for
	 * error output.
	 */
	protected async checkBreakpoint(addr: number|undefined): Promise<string|undefined> {
		if (addr!=undefined) {
			// Check for ROM
			if (addr>=0&&addr<0x4000) {
				const slots=await this.sendDzrpCmdGetSlots();
				const slot=addr>>>13;
				if (slots[slot]>=0xFE)	// ROM
					return "ROM";
			}

			// Check for special area
			if ((addr>=0&&addr<=0x07)
				||(addr>=0x66&&addr<=0x73))
				return "addresses 0x0000-0x0007 and 0x0066-0x0073";
		}
		return undefined;
	}


	/**
	 * This command is not used anymore. Use the NMI button instead.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		try {
			await super.sendDzrpCmdPause();
		}
		catch {
			throw Error("To pause execution use the yellow NMI button of the ZX Next.");
		}
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
