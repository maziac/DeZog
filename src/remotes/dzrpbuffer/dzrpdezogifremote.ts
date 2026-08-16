import {DzrpBufferRemote} from './dzrpbufferremote';
import {BreakInfo} from './../dzrp/dzrpremote';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {GenericBreakpoint, GenericWatchpoint} from '../../genericwatchpoint';
import {Opcode, OpcodeFlag} from '../../disassembler/core/opcode';
import {Z80Registers, Z80RegistersClass} from '../z80registers';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegistersZxNextDecoder} from './z80registerszxnextdecoder';
import {Settings} from '../../settings/settings';


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
 * This is the parent class for the zxnext remotes that use the dezogif
 * software.
 * The dezogif comes in two flavors: with a serial or a socket interface.
 */
export class DzrpDezogIfRemote extends DzrpBufferRemote {
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
		this.supportsBreakOnInterrupt = false;
		// Overwrite minimal required version
		this.DZRP_VERSION = [2, 1, 0];
		//console.log('ZxNextSerialRemote: constructor()');
	}


	/** Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersZxNextDecoder();
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
	 * over functionality from the remote.
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
			await this.funcContinueResolve!(breakInfo);
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
			if (breakInfo.reasonNumber !== BREAK_REASON_NUMBER.MANUAL_BREAK) {
				if (breakInfo.longAddr === longBp1Address || breakInfo.longAddr === longBp2Address)
					breakInfo.reasonNumber = BREAK_REASON_NUMBER.NO_REASON;
			}

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
			await originalContinueResolve(breakInfo);
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
					await resolveWithBp(breakInfo);
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


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<void> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
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

