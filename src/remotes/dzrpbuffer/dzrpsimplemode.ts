import {Opcode, OpcodeFlag} from "../../disassembler/core/opcode";
import {GenericBreakpoint} from "../../genericwatchpoint";
import {Mutex} from "../../misc/mutex";
import {Utility} from "../../misc/utility";
import {BreakInfo, DzrpRemote} from "../dzrp/dzrpremote";
import {BREAK_REASON_NUMBER} from "../remotebase";
import {Z80Registers, Z80RegistersClass} from "../z80registers";





/** Structure to hold the opcode to restore and the address of
 * the breakpoint.
 */
interface RestorableBreakpoint {
	// The breakpoint address
	address: number,
	// The opcode stored at the breakpoint address
	opcode: number
}


/** Mixin with some "magic" to override the dzrpContinue, the
 * dzrpAddBreakpoint and the dzrpRemoveBreakpoint methods of the
 * DzrpRemote class.
 *
 * The purpose is to implement the so called 'simple mode' in DZRP.
 * DZRP has 2 ways to use CMD_CONTINUE.
 * Either with breakpoints set through CMD_ADD_BREAKPOINT or with breakpoints set through CMD_SET_BREAKPOINTS.
 * The latter is called 'simple mode'. It is simple only for the remote,
 * in fact for DeZog it is more complex to handle.
 * In simple mode DeZog takes care of all breakpoints and their
 * restoration. The idea here is that a breakpoint is exchanged in the
 * Z80 machine code with RST 0 instruction. and after CMD_CONTINUE stops,
 * it is restored with its original memory value.
 * This mode is not intended for regular emulators but if the
 * DZRP is implemented directly in Z80 code and runs together with the
 * debugged program on the same Z80 CPU.
 *
 * Reasoning:
 * It could have been implemented as another subclass but then a lot of
 * subclassing would be necessary (one more for every transport layer).
 * So it has been implemented by just modifying the required methods of
 * the DzrpRemote class.
 */
export function createDzrpSimpleMode<TBase extends new (...args: any[]) => DzrpRemote>(Base: TBase) {
	return class extends Base {
		// Mutex to handle concurrent access to the DZRP commands and notifications.
		// Is especially used to receive the restore opcodes when setting
		// a breakpoint while the debugged program is running before the
		// debugged program may break.
		protected cmdMutex: Mutex;

		// Returned breakpoint index.
		protected breakpointIdLastIndex: number;

		// Array is created temporarily during Continue.
		// It holds the breakpoints and their prior values.
		// During Continue it is increased/decreased if other breakpoints are manually added.
		protected breakpointsAndOpcodes: Array<RestorableBreakpoint>;

		/** Use initSimpleMode instead of a constructor. */
		protected initSimpleMode() {
			this.cmdMutex = new Mutex();
			this.breakpointIdLastIndex = 0;
			this.breakpointsAndOpcodes = undefined as any;
		}

		/** The implementation of the SW breakpoints as Z80 instruction (RST) requires a modification
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
			if (pc === bpAddr2) {
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
				&& (ocFlags & OpcodeFlag.CONDITIONAL) === 0
				&& opcode.code === 0xCF) {
				// Note: The opcode length for RST 08 is already adjusted by the disassembler.
				// Note: Since we cannot step through ROM anyway a stepInto is handled the same
				// as a stepOver here.
				bpAddr1 = pc + opcode.length;
				bpAddr2 = undefined;
			}

			return [opcode, bpAddr1, bpAddr2];
		}


		/** When connected to a ZX Next this method must take
		 * over functionality from the remote.
		 * 2 states are distinguished:
		 * - enteredBreakpointState=false: The normal one, calls the super class.
		 * - enteredBreakpointState=true: A breakpoint has been hit before.
		 * On continue it is necessary to restore the opcode first.
		 *
		 * Executes the continue ('run') operation.
		 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
		 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
		 */
		protected async dzrpContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
			// Check if current address matches a breakpoint
			const currentAddress = this.getPCLong();
			const bpAtCurrentAddress = this.breakpoints.some(bp => bp.longAddress === currentAddress);
			let longBreakedAddress = (bpAtCurrentAddress ? currentAddress : undefined);

			// Get long addresses
			let longBp1Address = bp1Addr64k;
			let longBp2Address = bp2Addr64k;
			const slots = Z80Registers.getSlots();
			if (bp1Addr64k !== undefined)
				longBp1Address = Z80Registers.createLongAddress(bp1Addr64k, slots);
			if (bp2Addr64k !== undefined)
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
				// Lock to ensure that a previously sent CMD_SET_BREAKPOINTS command returns the restored memory values before continuing
				await this.cmdMutex.lock();
				try {
					longBreakedAddress = undefined;
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
					if (oldOpcode !== undefined)
						memCount++;
					const memValues = new Array<{address: number, value: number}>(memCount);
					let k = 0;
					if (oldOpcode !== undefined) {
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
				}
				finally {
					this.cmdMutex.unlock();
				}
			};

			// Get all breakpoint addresses (without longBreakedAddress)
			const bpAddresses = this.getBreakpointAddresses(longBreakedAddress);
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
			let oldOpcode;
			const oldBreakedAddress = longBreakedAddress;
			if (oldBreakedAddress === undefined) {
				// "Normal" case.
				// Catch resolve method to store the breakpoint ID.
				Utility.assert(this.funcContinueResolve);
				this.funcContinueResolve = resolveWithBp;
				await this.sendDzrpCmdContinue(bp1Addr64k, bp2Addr64k);
			}
			else {
				// Continuing from a breakpoint: Step over the current instruction wo bp,
				// insert the bp and continue.
				// Setup intermediate resolve function.
				this.funcContinueResolve = async (breakInfo: BreakInfo) => {
					longBreakedAddress = undefined;
					// Check if 2nd continue is necessary
					let breakAddr64k;
					if (breakInfo.longAddr !== undefined)
						breakAddr64k = breakInfo.longAddr & 0xFFFF;
					if ((breakAddr64k !== undefined &&
						(breakAddr64k === bp1Addr64k || breakAddr64k === bp2Addr64k))
						|| breakInfo.reasonNumber === BREAK_REASON_NUMBER.BREAKPOINT_HIT) {
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
						await this.sendDzrpCmdContinue(bp1Addr64k, bp2Addr64k);
					}
				};

				// Calculate the 2 temporary bp addresses
				let [, tmpBp1Addr, tmpBp2Addr] = await this.calcStepBp(false /*step-into*/);

				// Step
				await this.sendDzrpCmdContinue(tmpBp1Addr, tmpBp2Addr);
			}
		}



		/** Stores the breakpoints in a list.
		 * This includes the breakpoints set for ASSERTIONs and LOGPOINTs.
		 * The breakpoints are later sent all at once with CMD_SET_BREAKPOINTS.
		 * @param bp The breakpoint. dzrpAddBreakpoint will set bp.bpId with the breakpoint
		 * ID. If the breakpoint could not be set it is set to 0.
		 */
		protected async dzrpAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
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
				// Lock: to get the response safely before a
				// possible pause notification occurs.
				await this.cmdMutex.lock();
				try {
					// Set the breakpoint
					const opcodes = await this.sendDzrpCmdSetBreakpoints([bpAddress]);
					const opcode = opcodes[0];
					// Add to temporary breakpoints
					//if (this.breakpointsAndOpcodes)	// Could be deleted meanwhile
					this.breakpointsAndOpcodes.push({address: bpAddress, opcode});
				}
				finally {
					this.cmdMutex.unlock();
				}
			}
		}


		/** Removes a breakpoint from the list.
		 * @param bp The breakpoint to remove.
		 */
		protected async dzrpRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
			// Check if breaked address is removed.
			const bpAddress = bp.longAddress;
			// if (this.longBreakedAddress === bpAddress)
			// 	this.longBreakedAddress = undefined;
			// Check if debugged program is running
			if (this.breakpointsAndOpcodes && !this.pauseStep) {
				// It is running: remove the breakpoint immediately
				const bpLen = this.breakpointsAndOpcodes.length;
				for (let i = bpLen - 1; i >= 0; i--) {
					const bp = this.breakpointsAndOpcodes[i];
					if (bp.address === bpAddress) {
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


		/** Returns all breakpoint addresses without the given excludeAddress.
		 * @param excludeAddress The long address to exclude from the returned list.
		 * @returns Array with breakpoint address.
		 */
		protected getBreakpointAddresses(excludeAddress: number | undefined): Array<number> {
			const bpFiltered = new Array<number>();
			const tmpBps = this.tmpBreakpoints.keys();
			for (const addr of tmpBps) {
				if (addr !== excludeAddress)
					bpFiltered.push(addr);
			}
			return bpFiltered;
		}


		/** Checks for an allowed breakpoint address.
		 * @param longAddr Log address or undefined.
		 * @returns If allowed: undefined
		 * If not allowed: a string with the address range that can be used for
		 * error output.
		 */
		protected checkBreakpoint(longAddr: number | undefined): string | undefined {
			if (longAddr !== undefined) {
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
	}
}
