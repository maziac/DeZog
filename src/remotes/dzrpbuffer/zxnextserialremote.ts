import { BreakInfo } from './../dzrp/dzrpremote';
import {LogTransport} from '../../log';
import {DzrpBufferRemote} from './dzrpbufferremote';
import {Settings} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {GenericBreakpoint, GenericWatchpoint} from '../../genericwatchpoint';
import {Opcode, OpcodeFlag} from '../../disassembler/coredisassembler/opcode';
import {Z80Registers, Z80RegistersClass} from '../z80registers';
import {SerialPort} from 'serialport';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegistersZxNextDecoder} from './z80registerszxnextdecoder';


// Each sent message has to start with this byte.
// The ZX Next transmit a lot of zeroes if the joy port is not configured.
// Therefore this byte is required to recognize when a message starts.
const MESSAGE_START_BYTE = 0xA5;

// Timeout until when a response on a command should have been received.
const CMD_RESP_TIMEOUT = 1000;	// 1000 ms = 1 s


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
 * A ZX Next remote that is connected via the serial interface.
 * The serial interface itself is a USB device.
 */
export class ZxNextSerialRemote extends DzrpBufferRemote {

	// The serial port instance.
	protected serialPort: SerialPort | undefined;

	// For restoring the breakpoints it is necessary to determine
	// if a bp is currently restored or not.
	// If not undefined it is currently restored.
	protected longBreakedAddress: number | undefined;


	// Returned breakpoint index.
	protected breakpointIdLastIndex

	// Array is created temporarily during Continue.
	// It holds the breakpoints and their prior values.
	// During Continue it is increased/decreased if other breakpoints are manually added.
	protected breakpointsAndOpcodes: Array<RestorableBreakpoint>;

	// Value to catch the MESSAGE_START_BYTE if received data was 1 byte only.
	protected msgStartByteFound: boolean;


	// The time the last CMD_CONTINUE was sent. Is used to suppress the "No response received message" from the remote if a request is sent from vscode right after a CMD_CONTINUE.
	protected lastCmdContinueTime = 0;	// ms
	protected cmdContinueNoResponseErrorTime = 1000;	// ms


	/// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = false;
		this.supportsLOGPOINT = true;
		this.cmdRespTimeoutTime = CMD_RESP_TIMEOUT;
		console.log('ZxNextSerialRemote: constructor()');
	}


	/**
	 * Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersZxNextDecoder();
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Open the serial port
		const serialPath = Settings.launch.zxnext.serial;
		this.serialPort = new SerialPort({
			path: serialPath,
			baudRate: 921600,
			autoOpen: false
		});

		// React on-open
		this.serialPort.on('open', async () => {
			LogTransport.log('ZxNextSerialRemote: Connected to ZX Next!');

			this.receivedData = Buffer.alloc(0);
			this.msgStartByteFound = false;
			this.expectedLength = 4;	// for length
			this.receivingHeader = true;
			this.stopChunkTimeout();

			this.longBreakedAddress = undefined;
			//this.restorableBreakpoints = new Map<number, RestorableBreakpoint>();
			this.breakpointIdLastIndex = 0;
			this.onConnect();
		});

		// Handle errors
		this.serialPort.on('error', err => {
			LogTransport.log('ZxNextSerialRemote: ' + err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.serialPort.on('data', data => {
			this.dataReceived(data);
		});

		// Start serial connection
		console.log('serialPort.open();');
		this.serialPort.open();
	}


	/**
	 * Closes the serial port.
	 */
	public async closeSerialPort(): Promise<void> {
		return new Promise<void>(async resolve => {
			if (this.serialPort) {
				console.log('serialPort.close();');
				this.serialPort.close(() => {
					console.log('  serialPort.close() -> done');
					this.serialPort = undefined;
					resolve();
				});
				return;
			}
			// If no serialPort exists immediately return
			resolve();
		});
	}


	/**
	 * This will disconnect the serial.
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		return new Promise<void>(async resolve => {
			if (!this.serialPort) {
				resolve();
				return;
			}
			await super.disconnect();
			// Close serial port
			await this.closeSerialPort();
			resolve();
		});
	}


	/**
	 * Note:
	 * This is like the super class implementation except that it suppresses a warning message.
	 * If F5 (CONTINUE) or F10 etc. is pressed rapidly or held down it may happen that a request
	 * (e.g. memory request) is done after CMD_CONTINUE has been sent. Due to some asynchronous
	 * requests from vscode.
	 * Normally this is not a problem, the remote would just answer the request.
	 * For the ZXNext UART serial protocol this is different.
	 * The UART is not accessible when the Z80 program is being run. This is because the 'dezogif'
	 * program does not check the UART for new data when run and because the Joystick ports are
	 * remapped to serve as joystick ports and not as UART ports when the program is being run.
	 * Thus, the ZX Next is not able to receive and not able to respond.
	 * Furthermore if the user now changes e.g. a register or memory content there should be
	 * feedback that this is not possible.
	 * On the other hand the "automatic" requests from vscode should be suppressed.
	 * As there is no way to distinguish it is done with a time guardian.
	 * I.e about one second after the CMD_CONTINUE was sent no warning is emitted.
	 * Otherwise the warning is shown.
	 */
	protected startCmdRespTimeout(respTimeoutTime: number) {
		this.stopCmdRespTimeout();
		this.cmdRespTimeout = setTimeout(() => {
			this.stopCmdRespTimeout();
			const err = new Error('No response received from remote. A simple reason for this message is that the ZX Next is running the debugged program and cannot answer. In that case press the yellow NMI button on the ZX Next to pause execution. It can, of course, be also any other connection problem.');
			// Log
			LogTransport.log('Warning: ' + err.message);
			// Show warning (only if a few moments have gone after the last CMD_CONTINUE)
			const timeSpan = (Date.now() - this.lastCmdContinueTime);	// In ms
			if (timeSpan > this.cmdContinueNoResponseErrorTime)
				this.emit('warning', err.message);
			// Remove message / Queue next message
			const msg = this.messageQueue.shift()!;
			this.sendNextMessage();
			// Pass error data to right consumer
			msg.reject(err);
		}, respTimeoutTime);
	}


	/**
	 * Called when data has been received.
	 * If not configured for UART the ZX Next emits zeros through the serial cable.
	 * Therefore we wait until the first indication of a message is received.
	 * I.e. all received messages start with 0xA5.
	 */
	protected dataReceived(data: Buffer) {
		let nData = data;

		if (this.receivedData.length == 0 && !this.msgStartByteFound) {
			// Swallow everything (zeroes) up to the first 0xA5 found
			const len = data.length;
			let i;
			for (i = 0; i < len; i++) {
				if (data[i] == MESSAGE_START_BYTE) {
					// Start of message found
					if (len == 1) {
						this.msgStartByteFound = true;
						return;
					}
					break;
				}
			}
			// Check if start of message found
			if (i + 1 >= len)
				return;	// Not found
			// Start of message found, skip up to 0xA5
			nData = data.subarray(i + 1);
		}
		// Call super
		this.msgStartByteFound = false;
		super.dataReceived(nData);
	}


	/**
	 * Writes the buffer to the serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		// Send buffer
		return new Promise<void>((resolve, reject) => {
			// Send data
			const txt = this.dzrpCmdBufferToString(buffer);
			LogTransport.log('>>> ZxNextSerialRemote: Sending ' + txt);
			let outerError;
			try {
				this.serialPort?.write(buffer, (error) => {
					if (!outerError) {
						if (error)
							throw error;
						resolve();
					}
				});
			}
			catch (e) {
				outerError = e;
				reject(e);
			}
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
		let [opcode, bpAddr1, bpAddr2] = await super.calcStepBp(stepOver);
		// Check if 2nd breakpoint points to PC
		const pc = this.getPC();
		if (pc == bpAddr2) {
			// For djnz
			bpAddr2 = undefined;
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
		const ocFlags = opcode.flags;
		if (ocFlags & OpcodeFlag.BRANCH_ADDRESS
			&& (ocFlags & OpcodeFlag.CONDITIONAL) == 0
			&& opcode.code == 0xCF) {
			// Note: The opcode length for RST 08 is already adjusted by the disassembler.
			// Note: Since we cannot step through ROM anyway a stepInto is handled the same
			// as a stepOver here.
			bpAddr1 = pc + opcode.length;
			bpAddr2 = undefined;
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
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		// Get long addresses
		let longBp1Address = bp1Addr64k;
		let longBp2Address = bp2Addr64k;
		const slots = Z80Registers.getSlots();
		if (bp1Addr64k != undefined)
			longBp1Address = Z80Registers.createLongAddress(bp1Addr64k, slots);
		if (bp2Addr64k != undefined)
			longBp2Address = Z80Registers.createLongAddress(bp2Addr64k, slots);

		// Check breakpoints
		if (this.checkBreakpoint(longBp1Address) || this.checkBreakpoint(longBp2Address)) {
			const longAddr = this.getPCLong();
			const breakInfo: BreakInfo = {
				longAddr,
				reasonString: "Cannot step at address " + Utility.getHexString(longAddr, 4) + "h.",
				reasonNumber: BREAK_REASON_NUMBER.STEPPING_NOT_ALLOWED
			};
			this.emit('warning', breakInfo.reasonString);
			this.funcContinueResolve!(breakInfo);
			return;
		}

		// Remember old resolve function
		const originalContinueResolve = this.funcContinueResolve!;
		const resolveWithBp = async (breakInfo: BreakInfo) => {
			// Store breakpoint if breakpoint was hit
			this.longBreakedAddress = undefined;
			if (breakInfo.reasonNumber == BREAK_REASON_NUMBER.BREAKPOINT_HIT)
				this.longBreakedAddress = breakInfo.longAddr;

			// If tmp breakpoint and real breakpoint was hit, i.e. both are the same
			// then the 'dezogif' cannot determine the tmp breakpoint correctly.
			// I.e. it is corrected here.
			if (breakInfo.longAddr == longBp1Address || breakInfo.longAddr == longBp2Address)
				breakInfo.reasonNumber = BREAK_REASON_NUMBER.NO_REASON;

			// Restore breakpoint addresses
			const count = this.breakpointsAndOpcodes.length;
			let memCount = count;
			if (oldOpcode != undefined)
				memCount++;
			const memValues = new Array<{address: number, value: number}>(memCount);
			let k = 0;
			if (oldOpcode != undefined) {
				// Add the last set breakpoint
				memValues[k++] = {address: oldBreakedAddress!, value: oldOpcode[0]}
			}
			// Change the order
			for (let i = count - 1; i >= 0; i--) {
				const bp = this.breakpointsAndOpcodes[i];
				memValues[k++] = {address: bp.address, value: bp.opcode};
			}
			await this.sendDzrpCmdRestoreMem(memValues);
			this.breakpointsAndOpcodes = undefined as any;
			// Call original handler
			originalContinueResolve(breakInfo);
		};

		// Get all breakpoint addresses (without breakedAddress)
		const bpAddresses = this.getBreakpointAddresses();
		// Set breakpoints and get opcodes
		const opcodes = await this.sendDzrpCmdSetBreakpoints(bpAddresses);
		// Combine
		this.breakpointsAndOpcodes = new Array<RestorableBreakpoint>();
		let len = bpAddresses.length;
		for (let i = 0; i < len; i++) {
			const address = bpAddresses[i];
			const opcode = opcodes[i];
			this.breakpointsAndOpcodes.push({address, opcode});
		}

		// Handle different states
		const oldBreakedAddress = this.longBreakedAddress;
		let oldOpcode;
		if (oldBreakedAddress == undefined) {
			// "Normal" case.
			// Catch resolve method to store the breakpoint ID.
			Utility.assert(this.funcContinueResolve);
			this.funcContinueResolve = resolveWithBp;
			this.lastCmdContinueTime = Date.now();
			await super.sendDzrpCmdContinue(bp1Addr64k, bp2Addr64k);
		}
		else {
			// Continuing from a breakpoint.
			// Setup intermediate resolve function.
			this.funcContinueResolve = async (breakInfo: BreakInfo) => {
				// Store new breakpoint if breakpoint was hit
				this.longBreakedAddress = undefined;
				if (breakInfo.reasonNumber == BREAK_REASON_NUMBER.BREAKPOINT_HIT)
					this.longBreakedAddress = breakInfo.longAddr;

				// Check if 2nd continue is necessary
				let breakAddr64k;
				if (breakInfo.longAddr != undefined)
					breakAddr64k = breakInfo.longAddr & 0xFFFF;
				if ((breakAddr64k != undefined &&
					(breakAddr64k == bp1Addr64k || breakAddr64k == bp2Addr64k))
					|| breakInfo.reasonNumber == BREAK_REASON_NUMBER.BREAKPOINT_HIT) {
					// Either a "real" breakpoint was hit or one of the original temporary breakpoints.
					// In any case we don't need to continue here.
					resolveWithBp(breakInfo);
				}
				else {
					// Restore resolve function
					this.funcContinueResolve = resolveWithBp;
					// Restore the breakpoint (the other breakpoints are already set)
					oldOpcode = await this.sendDzrpCmdSetBreakpoints([oldBreakedAddress]);
					// Continue
					this.lastCmdContinueTime = Date.now();
					await super.sendDzrpCmdContinue(bp1Addr64k, bp2Addr64k);
				}
			};

			// Calculate the 2 temporary bp addresses
			let [, tmpBp1Addr, tmpBp2Addr] = await this.calcStepBp(false /*step-into*/);

			// Step
			this.lastCmdContinueTime = Date.now();
			await super.sendDzrpCmdContinue(tmpBp1Addr, tmpBp2Addr);
		}
	}


	/**
	 * Stores the breakpoints in a list.
	 * This includes the breakpoints set for ASSERTIONs and LOGPOINTs.
	 * The breakpoints are later sent all at once with CMD_SET_BREAKPOINTS.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID. If the breakpoint could not be set it is set to 0.
	 */
	protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const bpAddress = bp.longAddress;
		// Check breakpoint address.
		const errText = this.checkBreakpoint(bpAddress);
		if (errText) {
			// Some lower breakpoint addresses cannot be used.
			this.emit('warning', "On the ZXNext you cannot set breakpoints at " + errText + ".");
			bp.bpId = 0;
		}

		// Add breakpoint
		this.breakpointIdLastIndex++;
		bp.bpId = this.breakpointIdLastIndex;

		// Check if debugged program is running
		if (this.breakpointsAndOpcodes && !this.pauseStep) {
			// Set the breakpoint
			const opcodes = await this.sendDzrpCmdSetBreakpoints([bpAddress]);
			const opcode = opcodes[0];
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
		const bpAddress = bp.longAddress;
		if (this.longBreakedAddress == bpAddress)
			this.longBreakedAddress = undefined;
		// Check if debugged program is running
		if (this.breakpointsAndOpcodes && !this.pauseStep) {
			// It is running: remove the breakpoint immediately
			const bpLen = this.breakpointsAndOpcodes.length;
			for (let i = bpLen - 1; i >= 0; i--) {
				const bp = this.breakpointsAndOpcodes[i];
				if (bp.address == bpAddress) {
					// Get opcode and restore memory
					const opcode = bp.opcode;
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
		const bpFiltered = new Array<number>();
		const tmpBps = this.tmpBreakpoints.keys();
		for (const addr of tmpBps) {
			if (addr != this.longBreakedAddress)
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
	 * @param longAddr Log address or undefined.
	 * @returns If allowed: undefined
	 * If not allowed: a string with the address range that can be used for
	 * error output.
	 */
	protected checkBreakpoint(longAddr: number | undefined): string | undefined {
		if (longAddr != undefined) {
			// Check for ROM
			const bank = Z80RegistersClass.getBankFromAddress(longAddr);
			if (bank >= 0xFE)	// ROM
				return "ROM";

			// Check for special area
			const addr64k = longAddr & 0xFFFF;
			if ((addr64k >= 0 && addr64k <= 0x07)
				|| (addr64k >= 0x66 && addr64k <= 0x73))
				return "addresses 0x0000-0x0007 and 0x0066-0x0073";
		}
		return undefined;
	}


	/**
	 * This command is not used. Use the NMI button instead.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		throw Error("To pause execution use the yellow NMI button of the ZX Next.");
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


	/**
	 * Unsupported functions.
	 */
	public async enableWPMEM(enable: boolean): Promise<void> {
		if (this.wpmemWatchpoints.length > 0) {
			// Only if watchpoints exist
			throw Error("There is no support for watchpoints with the ZX Next.");
		}
	}
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		throw Error("Watchpoints not supported with the ZX Next.");
	}

	/**
	 * Unsupported DRZP commands.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		throw Error("Watchpoints are not supported with the ZX Next.");
	}
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		throw Error("Watchpoints are not supported with the ZX Next.");
	}
}
