import * as assert from 'assert';
import { zSocket } from '../zesarux/zesaruxsocket';
import { Utility } from '../../utility';
import { Labels } from '../../labels';
import { Settings } from '../../settings';
import { RefList } from '../../reflist';
import { GenericWatchpoint, GenericBreakpoint } from '../../genericwatchpoint';
import { RemoteClass, EmulatorBreakpoint, EmulatorState, MemoryPage } from '../remote';
import { StateZ80 } from '../../statez80';
import { CallSerializer } from '../../callserializer';
import { ZesaruxCpuHistory } from '../zesarux/zesaruxcpuhistory';
import { Z80Registers } from '../z80registers';
import { ZxNextRegisters } from './zxnextregisters';





// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints.
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length.
	static MAX_MESSAGE_CATCH_BREAKPOINT = 4 * 32 - 1;	///< breakpoint condition should also be smaller than this.
}


/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial conenction with the ZX Next HW.
 */
export class ZxNextRemote extends RemoteClass {

	/// Max count of breakpoints. Note: Number 100 is used for stepOut.
	static MAX_USED_BREAKPOINTS = Zesarux.MAX_ZESARUX_BREAKPOINTS - 1;

	/// The breakpoint used for step-out.
	static STEP_BREAKPOINT_ID = 100;

	// Maximum stack items to handle.
	static MAX_STACK_ITEMS = 100;

	/// Array that contains free breakpoint IDs.
	private freeBreakpointIds = new Array<number>();

	/// The read ZEsarUx version number as float, e.g. 7.1. Is read directly after socket connection setup.
	public zesaruxVersion = 0.0;

	/// Handles the cpu history for reverse debugging
	protected cpuHistory: ZesaruxCpuHistory;

	/// The virtual stack used during reverse debugging.
	protected reverseDbgStack: RefList<any>;	// TODO:substitute 'any'

	/// We need a serializer for some tasks.
	protected serializer = new CallSerializer('ZesaruxEmulator');

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;

	/// A simple pointer to z80Registers. Just to avoid the typing for the casting.
	protected zxnextRegisters: ZxNextRegisters;

	/// Constructor.
	constructor() {
		super();
		// Create z80 registers instance that deals with the ZEsarUX specific format.
		this.zxnextRegisters = new ZxNextRegisters();
		this.z80Registers = this.zxnextRegisters;
	}


	/// Initializes the machine.
	public init() {
		super.init();

		// Setup the serial device for communication
		this.setupSerial();
	}


	/**
	 * Stops a machine/the debugger.
	 * This will disconnect from the ZX Next.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the disconnect happened.
	 */
	public disconnect(handler: () => void) {
		handler();
	}


	/**
	 * Terminates the machine/the debugger.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 * @param handler is called after the disconnect happened.
	 */
	public terminate(handler: () => void) {
		handler();
	}


	/**
	 * Initializes the serial device used to connect to the ZX Next.
	 */
	protected setupSerial() {
	}


	/**
	 * Retrieve the registers from ZX Next directly.
	 * From outside better use 'getRegisters' (the cached version).
	 */
	protected async getRegistersFromZxNext(): Promise<void> {
	}


	/**
	* Gets the registers from cache. If cache is empty retrieves the registers from
	* the emulator.
	* @param handler(registersString) Passes 'registersString' to the handler.
	*/
	public async getRegisters(): Promise<void> {
		if (!this.zxnextRegisters.getCache()) {
			// Get new data
			return this.getRegistersFromZxNext();
		}
	}


	/**
	 * Sets the value for a specific register.
	 * Reads the value from the emulator and returns it in the promise.
	 * Note: if in reverse debug mode the function should do nothing and the promise should return the previous value.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 * @return Promise with the "real" register value.
	 */
	public async setRegisterValue(register: string, value: number): Promise<number> {
		return new Promise<number>(resolve => {
			// set value
			zSocket.send('set-register ' + register + '=' + value, data => {
				// Get real value (should be the same as the set value)
				this.getRegistersFromZxNext()
					.then(() => {
						const realValue = this.getRegisterValue(register);
						resolve(realValue);
					});
			});
		});
	}


	/**
	 * 'continue' debugger program execution.
	 * @param contStoppedHandler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 * tStates contains the number of tStates executed and time is the time it took for execution,
	 * i.e. tStates multiplied with current CPU frequency.
 	 */
	public async continue(contStoppedHandler: (reason: string, tStates?: number, time?: number) => void) {
		// Change state
		this.state = EmulatorState.RUNNING;
		// Reset T-state counter.
		zSocket.send('reset-tstates-partial', () => {
			// Run
			zSocket.sendInterruptableRunCmd(text => {
				// (could take some time, e.g. until a breakpoint is hit)
				// get T-State counter
				zSocket.send('get-tstates-partial', data => {
					const tStates = parseInt(data);
					// get clock frequency
					zSocket.send('get-cpu-frequency', data => {
						const cpuFreq = parseInt(data);
						this.state = EmulatorState.IDLE;
						// Clear register cache
						this.zxnextRegisters.clearCache();
						// Handle code coverage
						this.handleCodeCoverage();
						// The reason is the 2nd line
						const reason = this.getBreakReason(text);
						// Call handler
						contStoppedHandler(reason, tStates, cpuFreq);
					});
				});
			});
		});
	}


	/**
	 * Extracts the break reason from the zesarux text returned for the zrcp "run"
	 * command.
	 * @param text E.g. Running until a breakpoint, key press or data sent, menu opening or other event
	 * Breakpoint fired: PC=811FH AND (A<>0)
	 *   811F LD A,03"
	 * @returns E.g. "Breakpoint fired: PC=811FH AND (A<>0)"
	 */
	protected getBreakReason(text: string): string {
		// The reason is the 2nd line
		let result;
		const reason = text.split('\n')[1];
		if (reason && reason.startsWith('Break'))
			result = reason;
		return result;
	}

	/**
	  * 'pause' the debugger.
	  */
	public pause(): void {
		// Send anything through the socket
		zSocket.sendBlank();
	}


	/**
	 * Returns the name of the interrupt.
	 */
	protected getInterruptName() {
		return "__INTERRUPT__";
	}


	/**
	 * Returns the name of the main function.
	 * @param sp The current SP value.
	 * @returns E.g. "__MAIN__" or "__MAIN-2__" if main is not at topOfStack.
	 */
	protected getMainName(sp: number) {
		let part = "";
		if (this.topOfStack) {
			const diff = this.topOfStack - sp;
			if (diff != 0) {
				if (diff > 0)
					part = "+";
				part += diff.toString();
			}
		}
		return "__MAIN" + part + "__";
	}


	/**
	 * Clears the stack used for reverse debugging.
	 * Called when leaving the reverse debug mode.
	 */
	protected clearReverseDbgStack() {
		this.reverseDbgStack = undefined as any;
		this.revDbgHistory.length = 0;
		this.cpuHistory.clearCache();
	}


	/**
	 *  Prefills teh debug stack if it does not exist yet.
	 */
	protected async prepareReverseDbgStack(): Promise<void> {
		if (!this.cpuHistory.isInStepBackMode()) {
			// Prefill array with current stack
			this.reverseDbgStack=await this.getCallStack();
		}
	}


	/**
	 * Handles the current instruction and the previous one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 *
	 * Algorithm:
	 * 1. If (executed) RET
	 * 1.a 		Get caller address
	 * 1.b		If CALL then use it other "__INTERRUPT__"
	 * 1.c		Add to callstack and set PC in frame
	 * 1.d		return
	 * 2. set PC in current frame
	 * 3. If POP
	 * 3.a		Add (SP) to the frame stack
	 * 4. If SP > previous SP
	 * 4.a		Remove from frame stack and call stack
	 *
	 * @param currentLine The current line of the cpu history.
	 * @param prevLine The previous line of the cpu history. (The one that
	 * comes before currentLine). This can also be the cached register values for
	 * the first line.
	 */
	protected async handleReverseDebugStackBack(currentLine: string, prevLine: string): Promise<void> {
		assert(currentLine);
	}


	/**
	 * Handles the current instruction and the next one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 * Note: This function wouldn'T have to be async (Promise) but
	 * it doesn't hurt and maybe I decide in future to communicate
	 * with ZEsarUX for some reason.
	 *
	 * Algorithm:
	 * 1. If (executed) CALL/RST
	 * 1.a 		expectedSP = SP-2
	 * 1.b		Put called address to callstack and set PC in frame
	 * 2. else If PUSH
	 * 2.a		expectedSP = SP-2
	 * 2.b		Add pushed value to frame stack
	 * 3. else If POP/RET
	 * 3.a		expectedSP = SP+2
	 * 3. else
	 * 3.a		expectedSP = calcDirectSpChanges
	 * 4. If nextSP != expectedSP   // Check for interrupt
	 * 4.a		Put nextPC on callstack
	 * 5. If SP > previous SP
	 * 5.a		Remove from frame stack and call stack
	 * @param currentLine The current line of the cpu history.
	 * @param nextLine The next line of the cpu history.
	 */
	protected handleReverseDebugStackForward(currentLine: string, nextLine: string) {
		assert(currentLine);
		assert(nextLine);
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 */
	public async reverseContinue(): Promise<string> {
		// Make sure the call stack exists
		await this.prepareReverseDbgStack();
		return "";

	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @returns A Promise with:
	 * 'disasm' is the disassembly of the current line.
	 * 'tStates' contains the number of tStates executed.
	 * 'cpuFreq' contains the CPU frequency at the end.
	 * 'breakReason' a possibly text with the break reason
	 */
	public async stepOver(): Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}> {
		assert(false);	// override this
		return {
			instruction: ""
		};
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async stepInto(handler: (disasm: string, tStates?: number, time?: number, error?: string) => void) {
		// Normal step into.
		this.getRegisters().then(() => {
			const pc = this.zxnextRegisters.getPC();
			zSocket.send('disassemble ' + pc, disasm => {
				// Clear register cache
				this.zxnextRegisters.clearCache();
				this.cpuStepGetTime('cpu-step', (tStates, cpuFreq) => {
					handler(disasm, tStates, cpuFreq);
				});
			});
		});
	}


	/**
	 * Executes a step and also returns the T-states and time needed.
	 * @param cmd Either 'cpu-step' or 'cpu-step-over'.
	 * @param handler(tStates, cpuFreq, breakReason) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	protected cpuStepGetTime(cmd: string, handler: (tStates: number, cpuFreq: number, breakReason?: string) => void): void {
		// Reset T-state counter etc.
		zSocket.send('reset-tstates-partial', data => {
			// Command, e.g. step into
			zSocket.send(cmd, result => {
				// get T-State counter
				zSocket.send('get-tstates-partial', data => {
					const tStates = parseInt(data);
					// get clock frequency
					zSocket.send('get-cpu-frequency', data => {
						const cpuFreq = parseInt(data);
						// Call handler
						const breakReason = this.getBreakReason(result);
						handler(tStates, cpuFreq, breakReason);
						// Handle code coverage
						this.handleCodeCoverage();
					});
				});
			});
		});
	}


	/**
	 * Reads the coverage addresses and clears them in ZEsarUX.
	 */
	protected handleCodeCoverage() {
		// Check if code coverage is enabled
		if (!Settings.launch.history.codeCoverageEnabled)
			return;

		// Get coverage
		zSocket.send('cpu-code-coverage get', data => {
			// Check for error
			if (data.startsWith('Error'))
				return;
			// Parse data and collect addresses
			const addresses = new Set<number>();
			const length = data.length;
			for (let k = 0; k < length; k += 5) {
				const addressString = data.substr(k, 4);
				const address = parseInt(addressString, 16);
				addresses.add(address);
			}
			// Clear coverage in ZEsarUX
			zSocket.send('cpu-code-coverage clear');
			// Emit code coverage event
			this.emit('coverage', addresses);
		});
	}


	/**
	 * Reads the short history and emits it.
	 * Is used to display short history decoration.
	 * Is called by the EmulDebugAdapter.
	 */
	public handleHistorySpot() {
		// Check if code coverage is enabled
		const count = Settings.launch.history.spotCount;
		if (count <= 0)
			return;

		// Get start index
		let index = this.cpuHistory.getHistoryIndex() + 1;

		let startIndex = index - count;
		if (startIndex < 0)
			startIndex = 0;
		const addresses = this.revDbgHistory.slice(startIndex);

		// Get short history
		zSocket.send('cpu-history get-pc ' + index + ' ' + count, data => {
			// data e.g. = "80d9 80d7 80d5 80d3 80f5 "
			// or "80d9 80d7 Error..." if not all data is available.
			// Parse data and collect addresses
			const length = data.length;
			for (let k = 0; k < length; k += 5) {
				const addressString = data.substr(k, 4);
				// Check for error
				if (addressString.toLowerCase() == 'erro')
					break;
				const address = parseInt(addressString, 16);
				addresses.push(address);
			}
			// Emit code coverage event
			this.emit('historySpot', startIndex, addresses);
		}, true);
	}


	/**
	 * 'step out' of current call.
	 * @param handler(tStates, cpuFreq, breakReason) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async stepOut(handler: (tStates?: number, cpuFreq?: number, breakReason?: string) => void) {

		// Zesarux does not implement a step-out. Therefore we analyze the call stack to
		// find the first return address.
		// Then a breakpoint is created that triggers when an executed RET is found  the SP changes to that address.
		// I.e. when the RET (or (RET cc) gets executed.

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();
		// Get current stackpointer
		this.getRegisters().then(() => {
			// Get SP
			const sp = this.zxnextRegisters.getSP();

			// calculate the depth of the call stack
			var depth = this.topOfStack - sp;
			if (depth > ZxNextRemote.MAX_STACK_ITEMS)
				depth = ZxNextRemote.MAX_STACK_ITEMS;
			if (depth == 0) {
				// no call stack, nothing to step out, i.e. immediately return
				handler(undefined, undefined, "Call stack empty");
				return;
			}
			else if (depth < 0) {
				// Callstack corrupted?
				handler(undefined, undefined, "SP above topOfStack. Stack corrupted?");
				return;
			}

			// get stack from zesarux
			zSocket.send('extended-stack get ' + depth, data => {
				data = data.replace(/\r/gm, "");
				const zStack = data.split('\n');
				zStack.splice(zStack.length - 1);	// ignore last (is empty)

				// Loop through stack:
				let bpSp = sp;
				for (const addrTypeString of zStack) {
					// Increase breakpoint address
					bpSp += 2;
					// Split address and type
					const type = addrTypeString.substr(6);
					if (type == "call" || type == "rst" || type.includes("interrupt")) {
						//const addr = parseInt(addrTypeString,16);
						// Caller found, set breakpoint: when SP gets 2 bigger than the current value.
						// Set action first (no action).
						const bpId = ZxNextRemote.STEP_BREAKPOINT_ID;
						zSocket.send('set-breakpointaction ' + bpId + ' prints step-out', () => {
							// Set the breakpoint.
							// Note: PC=PEEKW(SP-2) finds an executed RET.
							const condition = 'PC=PEEKW(SP-2) AND SP>=' + bpSp;
							zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
								// Enable breakpoint
								zSocket.send('enable-breakpoint ' + bpId, () => {

									// Clear register cache
									this.zxnextRegisters.clearCache();
									// Run
									this.state = EmulatorState.RUNNING;
									this.cpuStepGetTime('run', (tStates, cpuFreq, breakReason) => {
										// Disable breakpoint
										zSocket.send('disable-breakpoint ' + bpId, () => {
											this.state = EmulatorState.IDLE;
											handler(tStates, cpuFreq, breakReason);
										});
									});

								});
							});
						});
						// Return on a CALL etc.
						return;
					}
				}

				// If we reach here the stack was either empty or did not contain any call, i.e. nothing to step out to.
				handler();
			});
		});
	}


	/**
	  * 'step backwards' the program execution in the debugger.
	  * @returns {instruction, breakReason} Promise.
	  * instruction: e.g. "081C NOP"
	  * breakReason: If not undefined it holds the break reason message.
	  */
	public async stepBack(): Promise<{instruction: string, breakReason: string|undefined}> {
		assert(false);
		return {instruction: "", breakReason: undefined};
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It uses ZEsarUX new fast 'memory breakpoints' for this if the breakpoint ha no additional condition.
	 * If it has a condition the (slow) original ZEsarUX breakpoints are used.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	public setWatchpoints(watchPoints: Array<GenericWatchpoint>, handler?: (watchpoints: Array<GenericWatchpoint>) => void) {
		// Set watchpoints (memory guards)
		for (let wp of watchPoints) {
			// Check if condition is used
			if (wp.conditions.length > 0) {
				// OPEN: ZEsarUX does not allow for memory breakpoints plus conditions.
				// Will most probably never be implemented by Cesar.
				// I leave this open mainly as a reminder.
				// At the moment no watchpoint will be set if an additional condition is set.
			}
			else {
				// This is the general case. Just add a breakpoint on memory access.
				let type = 0;
				if (wp.access.indexOf('r') >= 0)
					type |= 0x01;
				if (wp.access.indexOf('w') >= 0)
					type |= 0x02;

				// Create watchpoint with range
				const size = wp.size;
				let addr = wp.address;
				zSocket.send('set-membreakpoint ' + addr.toString(16) + 'h ' + type + ' ' + size);
			}
		}

		// Call handler
		if (handler) {
			zSocket.executeWhenQueueIsEmpty(() => {
				// Copy array
				const wps = watchPoints.slice(0);
				handler(wps);
			});
		}
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableWPMEM(enable: boolean, handler?: () => void) {
		if (enable) {
			this.setWatchpoints(this.watchpoints);
		}
		else {
			// Remove watchpoint(s)
			//zSocket.send('clear-membreakpoints');
			for (let wp of this.watchpoints) {
				// Clear watchpoint with range
				const size = wp.size;
				let addr = wp.address;
				zSocket.send('set-membreakpoint ' + addr.toString(16) + 'h 0 ' + size);
			}
		}
		this.wpmemEnabled = enable;
		zSocket.executeWhenQueueIsEmpty(handler);
	}


	/**
	 * Set all assert breakpoints.
	 * Called only once.
	 * @param assertBreakpoints A list of addresses to put an assert breakpoint on.
	 */
	public setAssertBreakpoints(assertBreakpoints: Array<GenericBreakpoint>) {
		// not supported.
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableAssertBreakpoints(enable: boolean, handler?: () => void) {
		// not supported.
		if (this.assertBreakpoints.length > 0)
			this.emit('warning', 'ZEsarUX does not support ASSERTs in the sources.');
		if (handler)
			handler();
	}


	/**
	 * Set all log points.
	 * Called only once.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param handler() Is called after the last logpoint is set.
	 */
	public setLogpoints(logpoints: Array<GenericBreakpoint>, handler: (logpoints: Array<GenericBreakpoint>) => void) {
		// not supported.
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * @param group The group to enable/disable. If undefined: all groups.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableLogpoints(group: string, enable: boolean, handler?: () => void) {
		// not supported.
		if (this.logpoints.size > 0)
			this.emit('warning', 'ZEsarUX does not support LOGPOINTs in the sources.');
		if (handler)
			handler();
	}


	/**
	 * Converts a condition into the format that ZEsarUX uses.
	 * With version 8.0 ZEsarUX got a new parser which is very flexible,
	 * so the condition is not changed very much.
	 * Only the C-style operators like "&&", "||", "==", "!=" are added.
	 * Furthermore "b@(...)" and "w@(...)" are converted to "peek(...)" and "peekw(...)".
	 * And "!(...)" is converted to "not(...)" (only with brackets).
	 * Note: The original ZEsarUX operators are not forbidden. E.g. "A=1" is allowed as well as "A==1".
	 * Labels: ZESarUX does not not the labels only addresses. Therefore all
	 * labels need to be evaluated first and converted to addresses.
	 * @param condition The general condition format, e.g. "A < 10 && HL != 0".
	 * Even complex parenthesis forms are supported, e.g. "(A & 0x7F) == 127".
	 * @returns The zesarux format
	 */
	protected convertCondition(condition: string): string | undefined {
		if (!condition || condition.length == 0)
			return '';	// No condition

		// Convert labels
		let regex = /\b[_a-z][\.0-9a-z_]*\b/gi;
		let conds = condition.replace(regex, label => {
			// Check if register
			if (Z80Registers.isRegister(label))
				return label;
			// Convert label to number.
			const addr = Labels.getNumberForLabel(label);
			// If undefined, don't touch it.
			if (addr == undefined)
				return label;
			return addr.toString();;
		});

		// Convert operators
		conds = conds.replace(/==/g, '=');
		conds = conds.replace(/!=/g, '<>');
		conds = conds.replace(/&&/g, ' AND ');
		conds = conds.replace(/\|\|/g, ' OR ');
		conds = conds.replace(/==/g, '=');
		conds = conds.replace(/!/g, 'NOT');

		// Convert hex numbers ("0x12BF" -> "12BFH")
		conds = conds.replace(/0x[0-9a-f]+/gi, value => {
			const valh = value.substr(2) + 'H';
			return valh;
		});

		console.log('Converted condition "' + condition + '" to "' + conds);
		return conds;
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint. If bp.address is >= 0 then it adds the condition "PC=address".
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public setBreakpoint(bp: EmulatorBreakpoint): number {
		// Check for logpoint (not supported)
		if (bp.log) {
			this.emit('warning', 'ZEsarUX does not support logpoints ("' + bp.log + '").');
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// Get condition
		let zesaruxCondition = this.convertCondition(bp.condition);
		if (zesaruxCondition == undefined) {
			this.emit('warning', "Breakpoint: Can't set condition: " + (bp.condition || ''));
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// get free id
		if (this.freeBreakpointIds.length == 0)
			return 0;	// no free ID
		bp.bpId = this.freeBreakpointIds[0];
		this.freeBreakpointIds.shift();

		// Create condition from address and bp.condition
		let condition = '';
		if (bp.address >= 0) {
			condition = 'PC=0' + Utility.getHexString(bp.address, 4) + 'h';
			if (zesaruxCondition.length > 0) {
				condition += ' and ';
				zesaruxCondition = '(' + zesaruxCondition + ')';
			}
		}
		if (zesaruxCondition.length > 0)
			condition += zesaruxCondition;

		// set action first (no action)
		const shortCond = (condition.length < 50) ? condition : condition.substr(0, 50) + '...';
		zSocket.send('set-breakpointaction ' + bp.bpId + ' prints breakpoint ' + bp.bpId + ' hit (' + shortCond + ')', () => {
			//zSocket.send('set-breakpointaction ' + bp.bpId + ' menu', () => {
			// set the breakpoint
			zSocket.send('set-breakpoint ' + bp.bpId + ' ' + condition, () => {
				// enable the breakpoint
				zSocket.send('enable-breakpoint ' + bp.bpId);
			});
		});

		// Add to list
		this.breakpoints.push(bp);

		// return
		return bp.bpId;
	}


	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpoint(bp: EmulatorBreakpoint) {
		// set breakpoint with no condition = disable/remove
		//zSocket.send('set-breakpoint ' + bp.bpId);

		// disable breakpoint
		zSocket.send('disable-breakpoint ' + bp.bpId);

		// Remove from list
		var index = this.breakpoints.indexOf(bp);
		assert(index !== -1, 'Breakpoint should be removed but does not exist.');
		this.breakpoints.splice(index, 1);
		this.freeBreakpointIds.push(index);
	}


	/**
	 * Disables all breakpoints set in zesarux on startup.
	 */
	protected clearAllZesaruxBreakpoints() {
		for (var i = 1; i <= Zesarux.MAX_ZESARUX_BREAKPOINTS; i++) {
			zSocket.send('disable-breakpoint ' + i);
		}
	}


	/**
	 * Set all breakpoints for a file.
	 * If system is running, first break, then set the breakpoint(s).
	 * But, because the run-handler is not known here, the 'run' is not continued afterwards.
	 * @param path The file (which contains the breakpoints).
	 * @param givenBps The breakpoints in the file.
	 * @param handler(bps) On return the handler is called with all breakpoints.
	 * @param tmpDisasmFileHandler(bpr) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 */
	public setBreakpoints(path: string, givenBps: Array<EmulatorBreakpoint>,
		handler: (bps: Array<EmulatorBreakpoint>) => void,
		tmpDisasmFileHandler: (bp: EmulatorBreakpoint) => EmulatorBreakpoint) {

		this.serializer.exec(() => {
			// Do most of the work
			super.setBreakpoints(path, givenBps,
				bps => {
					// But wait for the socket.
					zSocket.executeWhenQueueIsEmpty(() => {
						handler(bps);
						// End
						this.serializer.endExec();
					});
				},
				tmpDisasmFileHandler
			);
		});
	}


	/**
	 * Returns the breakpoint at the given address.
	 * Note: Checks only breakpoints with a set 'address'.
	 * @param regs The registers as string, e.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf"
	 * @returns A string with the reason. undefined if no breakpoint hit.
	 */
	// TODO: da ich RegisterCache soweoso vorher setze, kann ich mir "regs" sparen.
	// Vielleicht kann ich sogar auf die ganzen parseXX Funktionen verzichten, bzw. auf den data parameter.
	protected checkPcBreakpoints(regs: string): string | undefined {
		assert(this.zxnextRegisters.getCache());
		let condition;
		const pc = this.zxnextRegisters.getPC();
		for (const bp of this.breakpoints) {
			if (bp.address == pc) {
				// Check for condition
				if (!bp.condition) {
					condition = "";
					break;
				}

				// Evaluate condition
				try {
					const result = Utility.evalExpression(bp.condition, true);
					if (result != 0) {
						condition = bp.condition;
						break;
					}
				}
				catch (e) {
					// A problem during evaluation happened,
					// e.g. a memory location has been tested which is not possible
					// during reverse debugging.
					condition = "Could not evaluate: " + bp.condition;
					break;
				}
			}
		}

		// Text
		let reason;
		if (condition != undefined) {
			reason = 'Breakpoint hit at PC=' + Utility.getHexString(pc, 4) + 'h';
			if (condition != "")
				reason += ', ' + condition;
		}
		return reason;
	}


	/**
	 * Sends a command to ZEsarUX.
	 * @param cmd E.g. 'get-registers'.
	 * @param handler The response (data) is returned.
	 */
	public dbgExec(cmd: string, handler: (data) => void) {
		cmd = cmd.trim();
		if (cmd.length == 0) return;

		// Check if we need a break
		this.breakIfRunning();
		// Send command to ZEsarUX
		zSocket.send(cmd, data => {
			// Call handler
			handler(data);
		});
	}


	/**
	 * Reads a memory dump from zesarux and converts it to a number array.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public async getMemoryDump(address: number, size: number): Promise<Uint8Array> {
		return new Promise<Uint8Array>(resolve => {
			// Use chunks
			const chunkSize=0x10000;// 0x1000;
			// Retrieve memory values
			const values=new Uint8Array(size);
			let k=0;
			while (size>0) {
				const retrieveSize=(size>chunkSize)? chunkSize:size;
				zSocket.send('read-memory '+address+' '+retrieveSize, data => {
					const len=data.length;
					assert(len/2==retrieveSize);
					for (var i=0; i<len; i+=2) {
						const valueString=data.substr(i, 2);
						const value=parseInt(valueString, 16);
						values[k++]=value;
					}
				});
				// Next chunk
				size-=chunkSize;
			}
			// send data to handler
			zSocket.executeWhenQueueIsEmpty(() => {
				resolve(values);
			});
		});
	}


	/**
	 * Writes a memory dump to zesarux.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 * @param handler(response) The handler that is called when zesarux has received the data.
	 */
	public writeMemoryDump(address: number, dataArray: Uint8Array, handler: () => void) {
		// Use chunks
		const chunkSize = 0x10000; //0x1000;
		let k = 0;
		let size = dataArray.length;
		let chunkCount = 0;
		while (size > 0) {
			const sendSize = (size > chunkSize) ? chunkSize : size;
			// Convert array to long hex string.
			let bytes = '';
			for (let i = 0; i < sendSize; i++) {
				bytes += Utility.getHexString(dataArray[k++], 2);
			}
			// Send
			chunkCount++;
			zSocket.send('write-memory-raw ' + address + ' ' + bytes, () => {
				chunkCount--;
				if (chunkCount == 0)
					handler();
			});
			// Next chunk
			size -= chunkSize;
		}
		// call when ready
		//zSocket.executeWhenQueueIsEmpty(() => {
		//	handler();
		//});

	}


	/**
	 * Writes one memory value to zesarux.
	 * The write is followed by a read and the read value is returned
	 * in the handler.
	 * @param address The address to change.
	 * @param value The new value. (byte)
	 */
	public writeMemory(address: number, value: number, handler: (realValue: number) => void) {
		// Write byte
		zSocket.send('write-memory ' + address + ' ' + value, data => {
			// read byte
			zSocket.send('read-memory ' + address + ' 1', data => {
				// call handler
				const readValue = parseInt(data, 16);
				handler(readValue);
			});
		});
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @param handler(memoryPages) The handler that receives the memory pages list.
	 */
	public getMemoryPages(handler: (memoryPages: MemoryPage[]) => void) {
		/* Read data from zesarux has the following format:
		Segment 1
		Long name: ROM 0
		Short name: O0
		Start: 0H
		End: 1FFFH

		Segment 2
		Long name: ROM 1
		Short name: O1
		Start: 2000H
		End: 3FFFH

		Segment 3
		Long name: RAM 10
		Short name: A10
		Start: 4000H
		End: 5FFFH
		...
		*/

		zSocket.send('get-memory-pages verbose', data => {
			const pages: Array<MemoryPage> = [];
			const lines = data.split('\n');
			const len = lines.length;
			let i = 0;
			while (i + 4 < len) {
				// Read data
				let name = lines[i + 2].substr(12);
				name += ' (' + lines[i + 1].substr(11) + ')';
				const startStr = lines[i + 3].substr(7);
				const start = Utility.parseValue(startStr);
				const endStr = lines[i + 4].substr(5);
				const end = Utility.parseValue(endStr);
				// Save in array
				pages.push({ start, end, name });
				// Next
				i += 6;
			}

			// send data to handler
			handler(pages);
		});
	}


	/**
	 * Change the program counter.
	 * @param address The new address for the program counter.
	 * @param handler that is called when the PC has been set.
	 */
	public setProgramCounter(address: number, handler?: () => void) {
		this.zxnextRegisters.clearCache();
		this.clearReverseDbgStack();
		zSocket.send('set-register PC=' + address.toString(16) + 'h', data => {
			if (handler)
				handler();
		});
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM + the registers.
	 * @param handler(stateData) The handler that is called after restoring.
	 */
	public stateSave(handler: (stateData) => void) {
		// Create state variable
		const state = StateZ80.createState(this.machineType);
		if (!state)
			throw new Error("Machine unknown. Can't save the state.")
		// Get state
		state.stateSave(handler);
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param stateData Pointer to the data to restore.
	 * @param handler The handler that is called after restoring.
	 */
	public stateRestore(stateData: StateZ80, handler?: () => void) {
		// Clear register cache
		this.zxnextRegisters.clearCache();
		// Restore state
		stateData.stateRestore(handler);
	}


	// ZX Next related ---------------------------------


	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @param value(value) Calls 'handler' with the value of the register.
	 */
	public getTbblueRegister(registerNr: number, handler: (value) => void) {
		zSocket.send('tbblue-get-register ' + registerNr, data => {
			// Value is returned as 2 digit hex number followed by "H", e.g. "00H"
			const valueString = data.substr(0, 2);
			const value = parseInt(valueString, 16);
			// Call handler
			handler(value);
		});
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @param handler(paletteArray) Calls 'handler' with a 256 byte Array<number> with the palette values.
	 */
	public getTbblueSpritesPalette(paletteNr: number, handler: (paletteArray) => void) {
		const paletteNrString = (paletteNr == 0) ? 'first' : 'second';
		zSocket.send('tbblue-get-palette sprite ' + paletteNrString + ' 0 256', data => {
			// Palette is returned as 3 digit hex separated by spaces, e.g. "02D 168 16D 000"
			const palette = new Array<number>(256);
			for (let i = 0; i < 256; i++) {
				const colorString = data.substr(i * 4, 3);
				const color = parseInt(colorString, 16);
				palette[i] = color;
			}
			// Call handler
			handler(palette);
		});
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @param handler(xl, xr, yt, yb) Calls 'handler' with the clipping dimensions.
	 */
	public getTbblueSpritesClippingWindow(handler: (xl: number, xr: number, yt: number, yb: number) => void) {
		zSocket.send('tbblue-get-clipwindow sprite', data => {
			// Returns 4 decimal numbers, e.g. "0 175 0 192 "
			const clip = data.split(' ');
			const xl = parseInt(clip[0]);
			const xr = parseInt(clip[1]);
			const yt = parseInt(clip[2]);
			const yb = parseInt(clip[3]);
			// Call handler
			handler(xl, xr, yt, yb);
		});
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @param handler(sprites) Calls 'handler' with an array of sprite data (an array of an array of 4 bytes, the 4 attribute bytes).
	 */
	public getTbblueSprites(slot: number, count: number, handler: (sprites) => void) {
		zSocket.send('tbblue-get-sprite ' + slot + ' ' + count, data => {
			// Sprites are returned one line per sprite, each line consist of 4x 2 digit hex values, e.g.
			// "00 00 00 00"
			// "00 00 00 00"
			const spriteLines = data.split('\n');
			const sprites = new Array<Uint8Array>();
			for (const line of spriteLines) {
				if (line.length == 0)
					continue;
				const sprite = new Uint8Array(4);
				for (let i = 0; i < 4; i++) {
					const attrString = line.substr(i * 3, 2);
					const attribute = parseInt(attrString, 16);
					sprite[i] = attribute;
				}
				sprites.push(sprite);
			}
			// Call handler
			handler(sprites);
		});
	}


	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @param handler(patterns) Calls 'handler' with an array of sprite pattern data.
	 */
	public getTbblueSpritePatterns(index: number, count: number, handler: (patterns) => void) {
		zSocket.send('tbblue-get-pattern ' + index + ' ' + count, data => {
			// Sprite patterns are returned one line per pattern, each line consist of
			// 256x 2 digit hex values, e.g. "E3 E3 E3 E3 E3 ..."
			const patternLines = data.split('\n');
			patternLines.pop();	// Last element is a newline only
			const patterns = new Array<Array<number>>();
			for (const line of patternLines) {
				const pattern = new Array<number>(256);
				for (let i = 0; i < 256; i++) {
					const attrString = line.substr(i * 3, 2);
					const attribute = parseInt(attrString, 16);
					pattern[i] = attribute;
				}
				patterns.push(pattern);
			}
			// Call handler
			handler(patterns);
		});
	}

	// ------------------------------------


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @param handler This handler is called after being quiet for the given timeout.
	 */
	public executeAfterBeingQuietFor(timeout: number, handler: () => void) {
		let timerId;
		const timer = () => {
			clearTimeout(timerId);
			timerId = setTimeout(() => {
				// Now there is at least 100ms quietness:
				// Stop listening
				zSocket.removeListener('queueChanged', timer);
				// Load the initial unit test routine (provided by the user)
				handler();
			}, timeout);
		};

		// 2 triggers
		zSocket.on('queueChanged', timer);
		zSocket.executeWhenQueueIsEmpty(timer);
	}


	/**
	 * @returns Returns the previous line in the cpu history.
	 * If at end it returns undefined.
	 */
	protected async revDbgPrev(): Promise<string | undefined> {
		const line = await this.cpuHistory.getPrevRegistersAsync();
		if (line) {
			// Add to register cache
	//		this.zxnextRegisters.setCache(line);
			// Add to history for decoration
			const addr = this.zxnextRegisters.getPC();
			this.revDbgHistory.push(addr);
		}
		return line;
	}


	/**
	 * @returns Returns the next line in the cpu history.
	 * If at start it returns ''.
	 */
	protected revDbgNext(): string | undefined {
		// Get line
		let line = this.cpuHistory.getNextRegisters() as string;
//		this.zxnextRegisters.setCache(line);
		// Remove one address from history
		this.revDbgHistory.pop();
		return line;
	}
}

