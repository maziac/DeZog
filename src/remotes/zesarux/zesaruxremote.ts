import * as assert from 'assert';
import { zSocket, ZesaruxSocket } from './zesaruxsocket';
import { Utility } from '../../misc/utility';
import { Labels } from '../../labels';
import { Settings } from '../../settings';
import { CallStackFrame } from '../../callstackframe';
import {GenericWatchpoint, GenericBreakpoint} from '../../genericwatchpoint';
import {RemoteBase, MachineType, RemoteBreakpoint, MemoryPage } from '../remotebase';
import { CallSerializer } from '../../callserializer';
import { ZesaruxCpuHistory } from './zesaruxcpuhistory';
import { Z80Registers } from '../z80registers';
import {ZesaruxRegisters} from './zesaruxregisters';



/// Minimum required ZEsarUX version.
const MIN_ZESARUX_VERSION = 8.1;


// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints.
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length.
	static MAX_MESSAGE_CATCH_BREAKPOINT = 4*32-1;	///< breakpoint condition should also be smaller than this.
}




/**
 * The representation of the ZEsarUX emulator.
 * It receives the requests from the DebugAdapter and communicates with
 * the ZesaruxSocket.
 */
export class ZesaruxRemote extends RemoteBase {

	/// Max count of breakpoints. Note: Number 100 is used for stepOut.
	static MAX_USED_BREAKPOINTS = Zesarux.MAX_ZESARUX_BREAKPOINTS-1;

	/// The breakpoint used for step-out.
	static STEP_BREAKPOINT_ID = 100;

	/// Array that contains free breakpoint IDs.
	private freeBreakpointIds = new Array<number>();

	/// The read ZEsarUx version number as float, e.g. 7.1. Is read directly after socket connection setup.
	public zesaruxVersion = 0.0;

	/// Handles the cpu history for reverse debugging
	protected cpuHistory: ZesaruxCpuHistory;

	/// We need a serializer for some tasks.
	protected serializer = new CallSerializer('ZesaruxEmulator');

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;


	/// Constructor.
	constructor() {
		super();
		// Create z80 registers instance that deals with the ZEsarUX specific format.
		this.z80Registers=new ZesaruxRegisters();
		// Reverse debugging / CPU history
		this.cpuHistory=new ZesaruxCpuHistory(this.z80Registers);
		// Supported features
		this.supportsZxNextRegisters=true;
	}


	/// Initializes the machine.
	public doInitialization() {
		// Create the socket for communication (not connected yet)
		this.setupSocket();

		// Connect zesarux debugger
		zSocket.connectDebugger();
	}


	/**
	 * Stops the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		return new Promise<void>(resolve => {
			// Terminate the socket
			zSocket.quit(() => {
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
		this.terminating = true;
		this.clearInstructionHistory();
		return new Promise<void>(resolve => {
			// The socket connection must be closed as well.
			zSocket.quit(() => {
				// Send terminate event (to Debug Session which will send a TerminateEvent to vscode. That in turn will create a 'disconnect')
				this.emit('terminated');
				resolve();
			});
		});
	}


	/**
	 * Override removeAllListeners to remove listeners also from socket.
	 * @param event
	 */
	public removeAllListeners(event?: string|symbol|undefined): this {
		super.removeAllListeners();
		// Additionally remove listeners from socket.
		zSocket.removeAllListeners();
		return this;
	}

	/**
	 * Initializes the socket to zesarux but does not connect yet.
	 * Installs handlers to react on connect and error.
	 */
	protected setupSocket() {
		ZesaruxSocket.Init();

		zSocket.on('log', msg => {
			// A (breakpoint) log message from Zesarux was received
			this.emit('log', msg);
		});

		zSocket.on('warning', msg => {
			if(this.terminating)
				return;
			// Error message from Zesarux
			msg = "ZEsarUX: " + msg;
			this.emit('warning', msg);
		});

		zSocket.on('error', err => {
			if(this.terminating)
				return;
			// and terminate
			err.message += " (Error in connection to ZEsarUX!)";
			this.emit('error', err);
		});
		zSocket.on('close', () => {
			if(this.terminating)
				return;
			this.listFrames.length = 0;
			this.breakpoints.length = 0;
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			this.emit('error', err);
		});
		zSocket.on('end', () => {
			if(this.terminating)
				return;
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			this.emit('error', err);
		});
		zSocket.on('connected', () => {
			if(this.terminating)
				return;

			let error: Error;
			try {
				// Initialize
				zSocket.send('about');
				zSocket.send('get-version', data => {
					// e.g. "7.1-SN"
					this.zesaruxVersion = parseFloat(data);
					// Check version
					if(this.zesaruxVersion < MIN_ZESARUX_VERSION) {
						zSocket.quit();
						const err = new Error('Please update ZEsarUX. Need at least version ' + MIN_ZESARUX_VERSION + '.');
						this.emit('error', err);
						return;
					}
				});

				zSocket.send('get-current-machine', data => {
					const machine = data.toLowerCase();
					// Determine which ZX Spectrum it is, e.g. 48K, 128K
					if(machine.indexOf('80') >= 0)
						this.machineType = MachineType.ZX80;
					else if(machine.indexOf('81') >= 0)
						this.machineType = MachineType.ZX81;
					else if(machine.indexOf('16k') >= 0)
						this.machineType = MachineType.SPECTRUM16K;
					else if(machine.indexOf('48k') >= 0)
						this.machineType = MachineType.SPECTRUM48K;
					else if(machine.indexOf('128k') >= 0)
						this.machineType = MachineType.SPECTRUM128K;
					else if(machine.indexOf('tbblue') >= 0)
						this.machineType = MachineType.TBBLUE;
				});

				// Allow extensions
				this.zesaruxConnected();

				// Wait for previous command to finish
				zSocket.executeWhenQueueIsEmpty().then(() => {
					var debug_settings = (Settings.launch.skipInterrupt) ? 32 : 0;
					zSocket.send('set-debug-settings ' + debug_settings);

					// Reset the cpu before loading.
					if(Settings.launch.resetOnLaunch)
						zSocket.send('hard-reset-cpu');

					// Enter step-mode (stop)
					zSocket.send('enter-cpu-step');

					// Load sna or tap file
					const loadPath = Settings.launch.load;
					if(loadPath)
						zSocket.send('smartload ' + Settings.launch.load);

					// Load obj file(s) unit
					for(let loadObj of Settings.launch.loadObjs) {
						if(loadObj.path) {
							// Convert start address
							const start = Labels.getNumberFromString(loadObj.start);
							if(isNaN(start))
								throw Error("Cannot evaluate 'loadObjs[].start' (" + loadObj.start + ").");
							zSocket.send('load-binary ' + loadObj.path + ' ' + start + ' 0');	// 0 = load entire file
						}
					}

					// Set Program Counter to execAddress
					if(Settings.launch.execAddress) {
						const execAddress = Labels.getNumberFromString(Settings.launch.execAddress);
						if(isNaN(execAddress)) {
							error = new Error("Cannot evaluate 'execAddress' (" + Settings.launch.execAddress + ").");
							return;
						}
						// Set PC
						this.setProgramCounter(execAddress);
					}

					// Initialize breakpoints
					this.initBreakpoints();


					// Code coverage
					if(Settings.launch.history.codeCoverageEnabled) {
						zSocket.send('cpu-code-coverage enabled yes', () => {}, true);	// suppress any error
						zSocket.send('cpu-code-coverage clear');
					}
					else
						zSocket.send('cpu-code-coverage enabled no', () => {}, true);	// suppress any error

					// Reverse debugging.
					this.cpuHistory.init(Settings.launch.history.reverseDebugInstructionCount);

					// Enable extended stack
					zSocket.send('extended-stack enabled no', () => {}, true);	// bug in ZEsarUX
					zSocket.send('extended-stack enabled yes');
				});

				zSocket.executeWhenQueueIsEmpty().then(() => {
					// Check for console.error
					if(error) {
						this.emit('error', error);
					}
					else {
						// Send 'initialize' to Machine.
						this.emit('initialized');
					}
				});
			}
			catch(e) {
				// Some error occurred
				this.emit('error', e);
			}
		});
	}


	/**
	 * Is called right after Zesarux has been connected and the version info was read.
	 * Can be overridden to check for extensions.
	 */
	protected zesaruxConnected() {
		// For standard Zesarux do nothing special
	}


	/**
	 * Initializes the zesarux breakpoints.
	 * Override this if fast-breakpoints should be used.
	 */
	protected initBreakpoints() {
			// Clear memory breakpoints (watchpoints)
			zSocket.send('clear-membreakpoints');

			// Clear all breakpoints
			zSocket.send('enable-breakpoints', () => {}, true);
			this.clearAllZesaruxBreakpoints();

			// Init breakpoint array
			this.freeBreakpointIds.length = 0;
			for(var i=1; i<=ZesaruxRemote.MAX_USED_BREAKPOINTS; i++)
				this.freeBreakpointIds.push(i);
	}


	/**
	 * Retrieve the registers from zesarux directly.
	 * From outside better use 'getRegisters' (the cached version).
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	protected async getRegistersFromEmulator(): Promise<void>  {
		// Check if in reverse debugging mode
		// In this mode registersCache should be set and thus this function is never called.
		assert(this.cpuHistory);
		assert(!this.cpuHistory.isInStepBackMode());

		return new Promise<void>(resolve => {
			// Get new (real emulator) data
			zSocket.send('get-registers', data => {
				// convert received data to right format ...
				// data is e.g: "PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0 """
				this.z80Registers.setCache(data);
				resolve();
			});
		});
	}


	/**
	* Make sure the cache is filled.
	* If cache is empty retrieves the registers from
	* the emulator.
	* @param handler(registersString) Passes 'registersString' to the handler.
	*/
	public async getRegisters(): Promise<void> {
		if (!this.z80Registers.getCache()) {
			// Get new data
			return this.getRegistersFromEmulator();
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
				this.getRegistersFromEmulator()
				.then(() => {
					const realValue = this.getRegisterValue(register);
					resolve(realValue);
				});
			});
		});
	}


	/**
	 * Checks the stack entry type for the given value.
	 * For ZEsarUX the extended stack is used, i.e. the 'stackEntryValue'
	 * already contains the type.
	 * An 'extended-stack' response from ZEsarUx looks like:
	 * 15F7H maskable_interrupt
	 * FFFFH push
	 * 15E1H call
	 * 0000H default
	 * @param stackEntryValue E.g. "3B89"
	 * @returns {name, callerAddr}
	 * if there was a CALL or RST
	 * - name: The label name or the hex string of the called address
	 * - callerAddr: The caller address of the subroutine
	 * Otherwise undefined.
	 */
	protected getStackEntryType(stackEntryValue: string): Promise<{name: string, callerAddr: number}|undefined> {
		// Get type
		const type=stackEntryValue.substr(5);
		if (type=='call'||type=='rst') {
			// Get the addresses
			return super.getStackEntryType(stackEntryValue);
		}

		return new Promise<{name: string, callerAddr: number}|undefined>(resolve => {
			if (type.includes('interrupt')) {
				// Interrupt
				const retAddr=parseInt(stackEntryValue, 16);
				resolve({name: this.getInterruptName(), callerAddr: retAddr});
			}
			else {
				// Some pushed value
				resolve(undefined);
			}
		});
	}


	/**
	 * Returns the stack as array.
	 * Oldest element is at index 0.
	 * @returns The stack, i.e. the word values from topOfStack to SP.
	 * But no more than about 100 elements.
	 * The values are returned as hex string with additional from the
	 * ZEsarUX extended stack, e.g.:
	 *  15F7H maskable_interrupt
	 * FFFFH push
	 * 15E1H call
	 * 0000H default
	 */
	public async getStack(): Promise<Array<string>> {
		return new Promise<Array<string>>(async resolve => {
			// Get normal callstack
			const stack=await super.getStack();
			// Get e-stack
			const depth=stack.length;
			if (depth==0) {
				resolve(stack);
				return;
			}
			// Get extended stack from zesarux
			zSocket.send('extended-stack get '+depth, data => {
				data=data.replace(/\r/gm, "");
				const zStack=data.split('\n');
				let len=zStack.length-1;
				zStack.splice(len);	// ignore last (is empty)
				if (depth<len)
					len=depth;
				// Mix stacks
				for (let i=0; i<len; i++) {
					const type=zStack[i].substr(5);
					// Add to original stack
					stack[depth-1-i]+=type;
				}
				resolve(stack);
			});
		});
	}



	/**
	 * 'continue' debugger program execution.
	 * @returns A Promise with {reason, tStates, cpuFreq}.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async continue(): Promise<{breakReasonString: string, tStates?: number, cpuFreq?: number}> {
		// Check for reverse debugging.
		if (this.cpuHistory.isInStepBackMode()) {
			// Continue in reverse debugging
			// Will run until after the first of the instruction history
			// or until a breakpoint condition is true.

			let nextLine;
			let breakReasonString;
			try {
				//this.state = RemoteState.RUNNING;
				//this.state = RemoteState.IDLE;

				// Get current line
				let currentLine: string=this.z80Registers.getCache();
				assert(currentLine);

				// Loop over all lines, reverse
				while (true) {
					// Handle stack
					nextLine=this.revDbgNext();
					if (!nextLine)
						break;

					this.handleReverseDebugStackForward(currentLine, nextLine);

					// Check for breakpoint
					this.z80Registers.setCache(nextLine);
					const condition=this.checkPcBreakpoints();
					if (condition!=undefined) {
						breakReasonString=condition;
						break;	// BP hit and condition met.
					}

					// Next
					currentLine=nextLine;
				}
			}
			catch (e) {
				breakReasonString='Error occurred: '+e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Return if next line is available, i.e. as long as we did not reach the start.
			if (!nextLine) {
				// Get the registers etc. from ZEsarUX
				this.z80Registers.clearCache();
				await this.getRegisters();
				const pc=this.getPC();
				breakReasonString='Break at PC='+Utility.getHexString(pc, 4)+'h: Reached start of instruction history.';
			}
			return {breakReasonString};
		}

		return new Promise<{breakReasonString: string, tStates?: number, cpuFreq?: number}>(resolve => {
			// Make sure that reverse debug stack is cleared
			this.clearReverseDbgStack();
			// Reset T-state counter.
			zSocket.send('reset-tstates-partial', () => {
				// Run
				zSocket.sendInterruptableRunCmd(text => {
					// (could take some time, e.g. until a breakpoint is hit)
					// get T-State counter
					zSocket.send('get-tstates-partial', data => {
						const tStates=parseInt(data);
						// get clock frequency
						zSocket.send('get-cpu-frequency', data => {
							const cpuFreq=parseInt(data);
							// Clear register cache
							this.z80Registers.clearCache();
							// Handle code coverage
							this.handleCodeCoverage();
							// The reason is the 2nd line
							const breakReasonString=this.getBreakReason(text);
							// Call handler
							resolve({breakReasonString, tStates, cpuFreq});
						});
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
		if(reason && reason.startsWith('Break'))
			result = reason;
		return result;
	}


	/**
	  * 'pause' the debugger.
	  */
	public async pause(): Promise<void> {
		// Send anything through the socket
		zSocket.sendBlank();
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
	 * Returns true if in reverse debugging mode.
	 */
	protected isInStepBackMode(): boolean {
		return this.cpuHistory.isInStepBackMode();
	}


	/**
	 * Returns the pointer to the virtual reverse debug stack.
	 * If it does not exist yet it will be created and prefilled with the current
	 * (memory) stack values.
	 */
	protected async prepareReverseDbgStack(): Promise<void> {
		if(!this.cpuHistory.isInStepBackMode()) {
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
		//console.log("currentLine");
		//console.log(currentLine);
		//console.log("prevLine");
		//console.log(prevLine);

		return new Promise<void>( resolve => {

			// Get some values
			let sp = this.z80Registers.parseSP(currentLine);
			const opcodes = this.cpuHistory.getOpcodes(currentLine);
			const flags = this.z80Registers.parseAF(currentLine);

			// Check if there is at least one frame
			let frame = this.reverseDbgStack.last();
			if (!frame) {
				 // Create new stack entry if none exists
				 // (could happen in errorneous situations if there are more RETs then CALLs)
				 frame = new CallStackFrame(0, sp, this.getMainName(sp));
				 this.reverseDbgStack.push(frame);
			}

			// Check for RET (RET cc and RETI/N)
			if(this.cpuHistory.isRetAndExecuted(opcodes, flags)) {
				// Get return address
				const retAddr = this.cpuHistory.getSPContent(currentLine);
				// Get memory at return address
				zSocket.send( 'read-memory ' + ((retAddr-3)&0xFFFF) + ' 3', data => {
					// Check for CALL and RST
					const firstByte = parseInt(data.substr(0,2),16);
					let callAddr;
					if (this.cpuHistory.isCallOpcode(firstByte)) {
						// Is a CALL or CALL cc, get called address
						// Get low byte
						const lowByte = parseInt(data.substr(2,2),16);
						// Get high byte
						const highByte = parseInt(data.substr(4,2),16);
						// Calculate address
						callAddr = (highByte<<8) + lowByte;
					}
					else if(this.cpuHistory.isRstOpcode(firstByte)) {
						// Is a Rst, get p
						callAddr = firstByte & 0b00111000;
					}
					// If no calledAddr then we don't know.
					// Possibly it is an interrupt, but it could be also an errorneous situation, e.g. too many RETs
					let labelCallAddr;
					if(callAddr == undefined) {
						// Unknown
						labelCallAddr = "__UNKNOWN__";
					}
					else {
						// Now find label for this address
						const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
						labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
					}

					// Check if there also was an interrupt in previous line
					const expectedPrevSP = sp + 2;
					const prevSP = this.z80Registers.parseSP(prevLine);
					if(expectedPrevSP != prevSP) {
						// We came from an interrupt. Remove interrupt address from call stack.
						this.reverseDbgStack.pop();
					}

					// And push to stack
					const pc = this.z80Registers.parsePC(currentLine);
					const frame = new CallStackFrame(pc, sp, labelCallAddr);
					this.reverseDbgStack.push(frame);

					// End
					resolve();
				});
				return;
			}

			// Check if the frame stack needs to be changed, if it's pop.
			let pushedValue;
			if(this.cpuHistory.isPop(opcodes)) {
				// Remember to push to stack
				pushedValue = this.cpuHistory.getSPContent(currentLine);
				// Correct stack (this strange behavior is done to cope with an interrupt)
				sp += 2;
			}

			// Check if SP has decreased (CALL/PUSH/Interrupt) or increased
			const spPrev = this.z80Registers.parseSP(prevLine);
			let count = sp - spPrev;
			if(count > 0) {
				// Decreased (CALL/PUSH/Interrupt)
				while(count > 1 && this.reverseDbgStack.length > 0) {
					// First remove the data stack
					while(count > 1 && frame.stack.length > 0) {
						// Pop from stack
						frame.stack.pop();
						count -= 2;
					}
					// Now remove callstack
					if(count > 1) {
						// Stop if last item on stack
						if(this.reverseDbgStack.length <= 1)
							break;
						this.reverseDbgStack.pop();
						count -= 2;
						// get next frame if countRemove still > 0
						frame = this.reverseDbgStack.last();
					}
				}
			}
			else {
				// Increased. Put something on the stack
				while(count < -1) {
					// Push something unknown to the stack
					frame.stack.push(undefined);
					count += 2;
				}
			}

			// Adjust PC within frame
			const pc = this.z80Registers.parsePC(currentLine)
			assert(frame);
			frame.addr = pc;

			// Add a possibly pushed value
			if(pushedValue != undefined)
				frame.stack.push(pushedValue);

			// End
			resolve();
		});
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
		//console.log("currentLine");
		//console.log(currentLine);
		//console.log("nextLine");
		//console.log(nextLine);

		// Get some values
		let sp=this.z80Registers.parseSP(currentLine);
		let expectedSP: number|undefined=sp;
		let expectedPC;
		const opcodes=this.cpuHistory.getOpcodes(currentLine);
		const flags=this.z80Registers.parseAF(currentLine);
		const nextSP=this.z80Registers.parseSP(nextLine);

		// Check if there is at least one frame
		let frame=this.reverseDbgStack.last();
		if (!frame) {
			// Create new stack entry if none exists
			// (could happen in errorneous situations if there are more RETs then CALLs)
			frame=new CallStackFrame(0, sp, this.getMainName(sp));
			this.reverseDbgStack.push(frame);
		}

		// Check for CALL (CALL cc)
		if (this.cpuHistory.isCallAndExecuted(opcodes, flags)) {
			sp-=2;	// CALL pushes to the stack
			expectedSP=sp;
			// Now find label for this address
			const callAddrStr=opcodes.substr(2, 4);
			const callAddr=this.cpuHistory.parse16Address(callAddrStr);
			const labelCallAddrArr=Labels.getLabelsForNumber(callAddr);
			const labelCallAddr=(labelCallAddrArr.length>0)? labelCallAddrArr[0]:Utility.getHexString(callAddr, 4)+'h';
			const name=labelCallAddr;
			frame=new CallStackFrame(0, nextSP-2, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}
		// Check for RST
		else if (this.cpuHistory.isRst(opcodes)) {
			sp-=2;	// RST pushes to the stack
			expectedSP=sp;
			// Now find label for this address
			const callAddr=this.cpuHistory.getRstAddress(opcodes);
			const labelCallAddrArr=Labels.getLabelsForNumber(callAddr);
			const labelCallAddr=(labelCallAddrArr.length>0)? labelCallAddrArr[0]:Utility.getHexString(callAddr, 4)+'h';
			const name=labelCallAddr;
			frame=new CallStackFrame(0, nextSP-2, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}
		else {
			// Check for PUSH
			const pushedValue=this.cpuHistory.getPushedValue(opcodes, currentLine);
			if (pushedValue!=undefined) {	// Is undefined if not a PUSH
				// Push to frame stack
				frame.stack.unshift(pushedValue);
				sp-=2;	// PUSH pushes to the stack
				expectedSP=sp;
			}
			// Check for POP
			else if (this.cpuHistory.isPop(opcodes)
				||this.cpuHistory.isRetAndExecuted(opcodes, flags)) {
				expectedSP+=2;	// Pop from the stack
			}
			// Otherwise calculate the expected SP
			else {
				expectedSP=this.cpuHistory.calcDirectSpChanges(opcodes, sp, currentLine);
				if (expectedSP==undefined) {
					// This means: Opcode was LD SP,(nnnn).
					// So use PC instead to check.
					const pc=this.z80Registers.parsePC(currentLine);
					expectedPC=pc+4;	// 4 = size of instruction
				}
			}
		}

		// Check for interrupt. Either use SP or use PC to check.
		let interruptFound=false;
		const nextPC=this.z80Registers.parsePC(nextLine);
		if (expectedSP!=undefined) {
			// Use SP for checking
			if (nextSP==expectedSP-2)
				interruptFound=true;
		}
		else {
			// Use PC for checking
			assert(expectedPC);
			if (nextPC!=expectedPC)
				interruptFound=true;
		}

		// Check if SP has increased (POP/RET)
		let usedSP=expectedSP;
		if (!usedSP)
			usedSP=this.z80Registers.parseSP(nextLine);
		let count=usedSP-sp;
		if (count>0) {
			while (count>1&&this.reverseDbgStack.length>0) {
				// First remove the data stack
				while (count>1&&frame.stack.length>0) {
					// Pop from stack
					frame.stack.pop();
					count-=2;
				}
				// Now remove callstack
				if (count>1) {
					this.reverseDbgStack.pop();
					count-=2;
					// get next frame if countRemove still > 0
					frame=this.reverseDbgStack.last();
				}
			}
		}
		else {
			// Decreased. Put something on the stack
			while (count<-1) {
				// Push something unknown to the stack
				frame.stack.push(undefined);
				count+=2;
			}
		}

		// Interrupt
		if (interruptFound) {
			// Put nextPC on callstack
			const name=this.getInterruptName();
			frame=new CallStackFrame(0, nextSP, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}

		// Adjust PC within frame
		frame.addr=nextPC;
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * The Promise resolves when it's stopped e.g. when a breakpoint is hit.
	 * @returns A string with the break reason. (Never undefined)
	 */
	public async reverseContinue(): Promise<string> {
		// Make sure the call stack exists
		await this.prepareReverseDbgStack();
		let breakReason;
		try {
			// Loop over all lines, reverse
			let prevLine=this.z80Registers.getCache();
			assert(prevLine);
			while (true) {
				// Get line
				const currentLine=await this.revDbgPrev();
				if (!currentLine) {
					breakReason='Break: Reached end of instruction history.';
					break;
				}

				// Stack handling:
				await this.handleReverseDebugStackBack(currentLine, prevLine);

				// Check for breakpoint
				this.z80Registers.setCache(currentLine);
				const condition=this.checkPcBreakpoints();
				if (condition!=undefined) {
					breakReason=condition;
					break;	// BP hit and condition met.
				}

				// Next
				prevLine=currentLine;
			}

		}
		catch (e) {
			breakReason='Break: Error occurred: '+e;
		}

		// Decoration
		this.emitRevDbgHistory();

		// Call handler
		return breakReason;
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
		return new Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}>(resolve => {
			// Check for reverse debugging.
			if (this.cpuHistory.isInStepBackMode()) {
				// Get current line
				let currentLine=this.z80Registers.getCache();
				assert(currentLine);
				let nextLine;

				// Check for CALL/RST. If not do a normal step-into.
				// If YES stop if pc reaches the next instruction.
				const opcodes=this.cpuHistory.getOpcodes(currentLine);
				const opcode0=parseInt(opcodes.substr(0, 2), 16);
				let pc=this.z80Registers.parsePC(currentLine);
				let nextPC0;
				let nextPC1;
				if (this.cpuHistory.isCallOpcode(opcode0)) {
					nextPC0=pc+3;
					nextPC1=nextPC0;
				}
				else if (this.cpuHistory.isRstOpcode(opcode0)) {
					nextPC0=pc+1;
					nextPC1=nextPC0+1;	// If return address is adjusted
				}

				let breakReason;
				try {
					// Find next line with same SP
					while (true) {
						// Get next line
						nextLine=this.revDbgNext();
						if (!nextLine) {
							breakReason='Break: Reached start of instruction history.'
							break;	// At end of reverse debugging. Simply get the real call stack.
						}

						// Handle reverse stack
						this.handleReverseDebugStackForward(currentLine, nextLine);

						// Check if next instruction is required
						if (nextPC0==undefined)
							break;	// A simple step-into

						// Get PC
						pc=this.z80Registers.parsePC(nextLine);
						// Check for "breakpoint"
						if (pc==nextPC0||pc==nextPC1)
							break;

						// Check for "real" breakpoint
						this.z80Registers.setCache(nextLine);
						const condition=this.checkPcBreakpoints();
						if (condition!=undefined) {
							breakReason=condition;
							break;	// BP hit and condition met.
						}

						// Next
						currentLine=nextLine as string;
					}
				}
				catch (e) {
					breakReason=e;
				}

				// Decoration
				this.emitRevDbgHistory();

				// Call handler
				const instruction='  '+Utility.getHexString(pc, 4)+' '+this.cpuHistory.getInstruction(currentLine);
				resolve({instruction, tStates: undefined, cpuFreq: undefined, breakReason});

				// Return if next line is available, i.e. as long as we did not reach the start.
				// Otherwise get the callstack from ZEsarUX.
				if (!nextLine) {
					// Get the registers etc. from ZEsarUX
					this.z80Registers.clearCache();
					this.getRegisters();
				}
				return;
			}

			// Make sure that reverse debug stack is cleared
			this.clearReverseDbgStack();

			// Zesarux is very special in the 'step-over' behavior.
			// In case of e.g a 'jp cc, addr' it will never return
			// if the condition is met because
			// it simply seems to wait until the PC reaches the next
			// instruction what, for a jp-instruction, obviously never happens.
			// Therefore a 'step-into' is executed instead. The only problem is that a
			// 'step-into' is not the desired behavior for a CALL.
			// Furthermore we don't get a break reason for a zesarux step-over.
			// I.e. if a step-over is interrupted by a breakpoint zesarux breaks at the breakpoint
			// but does not show a reason.
			// Therefore the CALL and RST are exceuted with a "run".
			// All others are executed with a step-into.
			// Only exception is LDDR etc. Those are executed as step-over.
			this.getRegisters().then(() => {
				const pc=this.z80Registers.getPC();
				zSocket.send('disassemble '+pc, disasm => {
					// Check if this was a "CALL something" or "CALL n/z,something"
					const opcode=disasm.substr(7, 4);

					// For RST and CALL we break when SP reaches the current SP again.
					// This is better than setting a PC breakpoint. A PC breakpoint is maybe never
					// reached if the stack is manipulated.
					// A SP breakpoint might be hit when the stack is being manipulated, but at least it
					// is hit and does not run forever.
					if (opcode=="RST "||opcode=="CALL") {
						// Set condition
						const sp=this.z80Registers.getSP();
						const condition='SP>='+sp;
						// We do a "run" instead of a step-into/over
						// Set action first (no action).
						const bpId=ZesaruxRemote.STEP_BREAKPOINT_ID;
						// Clear register cache
						this.z80Registers.clearCache();
						// Note "prints" is required, so that a normal step over will not produce a breakpoint decoration.
						zSocket.send('set-breakpointaction '+bpId+' prints step-over', () => {
							// set the breakpoint
							zSocket.send('set-breakpoint '+bpId+' '+condition, () => {
								// enable breakpoint
								zSocket.send('enable-breakpoint '+bpId, () => {
									// Run
									this.cpuStepGetTime('run', (tStates, cpuFreq, breakReason) => {
										// Disable breakpoint
										zSocket.send('disable-breakpoint '+bpId, () => {
											resolve({instruction: disasm, tStates, cpuFreq, breakReason});
										});
									});
								});
							});
						});
					}
					else {
						// "normal" opcode, just check for repetitive ones
						const cmd=(opcode=="LDIR"||opcode=="LDDR"||opcode=="CPIR"||opcode=="CPDR")? 'cpu-step-over':'cpu-step';
						// Clear register cache
						this.z80Registers.clearCache();
						// Step
						this.cpuStepGetTime(cmd, (tStates, cpuFreq, breakReason) => {
							// Call handler
							resolve({instruction: disasm, tStates, cpuFreq, breakReason});
						});
					}
				});
			});
		});
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @returns A Promise:
	 * 'instruction' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 * 'breakReason' E.g. "End of history reached"
	 */
	public async stepInto(): Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}> {
		return new Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}>(resolve => {
			// Check for reverse debugging.
			if (this.cpuHistory.isInStepBackMode()) {
				// Get current line
				let currentLine=this.z80Registers.getCache();
				assert(currentLine);
				const pc=this.z80Registers.parsePC(currentLine);
				let nextLine;

				let breakReason;
				try {
					// Get next line
					nextLine=this.revDbgNext();
					if (nextLine) {
						// Handle reverse stack
						this.handleReverseDebugStackForward(currentLine, nextLine);
					}
				}
				catch (e) {
					// E.g. "End of history reached"
					breakReason=e;
				}

				// Decoration
				this.emitRevDbgHistory();

				// Call handler
				const instruction='  '+Utility.getHexString(pc, 4)+' '+this.cpuHistory.getInstruction(currentLine);
				resolve({instruction, tStates: undefined, cpuFreq: undefined, breakReason});

				// Return if next line is available, i.e. as long as we did not reach the start.
				// Otherwise get the callstack from ZEsarUX.
				if (!nextLine) {
					// Get the registers etc. from ZEsarUX
					this.z80Registers.clearCache();
					this.getRegisters();
				}
				return;
			}

			// Make sure that reverse debug stack is cleared
			this.clearReverseDbgStack();

			// Normal step into.
			this.getRegisters().then(() => {
				const pc=this.z80Registers.getPC();
				zSocket.send('disassemble '+pc, instruction => {
					// Clear register cache
					this.z80Registers.clearCache();
					this.cpuStepGetTime('cpu-step', (tStates, cpuFreq) => {
						resolve({instruction, tStates, cpuFreq: cpuFreq});
					});
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
	protected cpuStepGetTime(cmd: string, handler:(tStates: number, cpuFreq: number, breakReason?: string)=>void): void {
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
		if(!Settings.launch.history.codeCoverageEnabled)
			return;

		// Get coverage
		zSocket.send('cpu-code-coverage get', data => {
			// Check for error
			if(data.startsWith('Error'))
				return;
			// Parse data and collect addresses
			const addresses = new Set<number>();
			const length = data.length;
			for(let k=0; k<length; k+=5) {
				const addressString = data.substr(k,4);
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
		if(count <= 0)
			return;

		// Get start index
		let index = this.cpuHistory.getHistoryIndex() + 1;

		let startIndex = index - count;
		if(startIndex < 0)
			startIndex = 0;
		const addresses = this.revDbgHistory.slice(startIndex);

		// Get short history
		zSocket.send('cpu-history get-pc ' + index + ' ' + count, data => {
			// data e.g. = "80d9 80d7 80d5 80d3 80f5 "
			// or "80d9 80d7 Error..." if not all data is available.
			// Parse data and collect addresses
			const length = data.length;
			for(let k=0; k<length; k+=5) {
				const addressString = data.substr(k,4);
				// Check for error
				if(addressString.toLowerCase() == 'erro')
					break;
				const address = parseInt(addressString, 16);
				addresses.push(address);
			}
			// Emit code coverage event
			this.emit('historySpot', startIndex, addresses);
		}, true);
	}


	/**
	 * 'step out' of current subroutine.
	 * @param A Promise that returns {tStates, cpuFreq, breakReason}	 * 'tStates' contains the number of tStates executed.
	 * 'cpuFreq' contains the CPU frequency at the end.
	 * 'breakReason' a possibly text with the break reason.
	 */
	public async stepOut(): Promise<{tStates?: number, cpuFreq?: number, breakReason?: string}> {
		return new Promise<{tStates?: number, cpuFreq?: number, breakReason?: string}>(resolve => {
			// Check for reverse debugging.
			if (this.cpuHistory.isInStepBackMode()) {
				// Step out will run until the start of the cpu history
				// or until a "RETx" is found (one behind).
				// To make it more complicated: this would falsely find a RETI event
				// if stepout was not started from the ISR.
				// To overcome this also the SP is observed. And we break only if
				// also the SP is lower/equal to when we started.

				// Get current line
				let currentLine=this.z80Registers.getCache();
				assert(currentLine);
				let nextLine;
				const startSP=this.z80Registers.getSP();
				let breakReason;
				try {
					// Find next line with same SP
					while (true) {
						// Get next line
						nextLine=this.revDbgNext();
						if (!nextLine) {
							breakReason='Break: Reached start of instruction history.';
							break;	// At end of reverse debugging. Simply get the real call stack.
						}

						// Handle reverse stack
						this.handleReverseDebugStackForward(currentLine, nextLine);

						// Check for RET(I/N)
						const flags=this.z80Registers.parseAF(currentLine);
						const opcodes=this.cpuHistory.getOpcodes(currentLine);
						if (this.cpuHistory.isRetAndExecuted(opcodes, flags)) {
							// Read SP
							const sp=this.z80Registers.parseSP(nextLine);
							// Check SP
							if (sp>startSP) {
								break;
							}
						}

						// Check for breakpoint
						this.z80Registers.setCache(nextLine);
						const condition=this.checkPcBreakpoints();
						if (condition!=undefined) {
							breakReason=condition;
							break;	// BP hit and condition met.
						}

						// Next
						currentLine=nextLine as string;
					}
				}
				catch (e) {
					breakReason=e;
				}

				// Decoration
				this.emitRevDbgHistory();

				// Call handler
				resolve({breakReason});

				// Return if next line is available, i.e. as long as we did not reach the start.
				// Otherwise get the callstack from ZEsarUX.
				if (!nextLine) {
					// Get the registers etc. from ZEsarUX
					this.z80Registers.clearCache();
					this.getRegisters();
				}
				return;
			}


			// Zesarux does not implement a step-out. Therefore we analyze the call stack to
			// find the first return address.
			// Then a breakpoint is created that triggers when an executed RET is found  the SP changes to that address.
			// I.e. when the RET (or (RET cc) gets executed.

			// Make sure that reverse debug stack is cleared
			this.clearReverseDbgStack();
			// Get current stackpointer
			this.getRegisters().then(() => {
				// Get SP
				const sp=this.z80Registers.getSP();

				// calculate the depth of the call stack
				var depth=this.topOfStack-sp;
				if (depth>ZesaruxRemote.MAX_STACK_ITEMS)
					depth=ZesaruxRemote.MAX_STACK_ITEMS;
				if (depth==0) {
					// no call stack, nothing to step out, i.e. immediately return
					resolve({breakReason: "Call stack empty"});
					return;
				}
				else if (depth<0) {
					// Callstack corrupted?
					resolve({breakReason: "SP above topOfStack. Stack corrupted?"});
					return;
				}

				// get stack from zesarux
				zSocket.send('extended-stack get '+depth, data => {
					data=data.replace(/\r/gm, "");
					const zStack=data.split('\n');
					zStack.splice(zStack.length-1);	// ignore last (is empty)

					// Loop through stack:
					let bpSp=sp;
					for (const addrTypeString of zStack) {
						// Increase breakpoint address
						bpSp+=2;
						// Split address and type
						const type=addrTypeString.substr(6);
						if (type=="call"||type=="rst"||type.includes("interrupt")) {
							//const addr = parseInt(addrTypeString,16);
							// Caller found, set breakpoint: when SP gets 2 bigger than the current value.
							// Set action first (no action).
							const bpId=ZesaruxRemote.STEP_BREAKPOINT_ID;
							zSocket.send('set-breakpointaction '+bpId+' prints step-out', () => {
								// Set the breakpoint.
								// Note: PC=PEEKW(SP-2) finds an executed RET.
								const condition='PC=PEEKW(SP-2) AND SP>='+bpSp;
								zSocket.send('set-breakpoint '+bpId+' '+condition, () => {
									// Enable breakpoint
									zSocket.send('enable-breakpoint '+bpId, () => {

										// Clear register cache
										this.z80Registers.clearCache();
										// Run
										this.cpuStepGetTime('run', (tStates, cpuFreq, breakReason) => {
											// Disable breakpoint
											zSocket.send('disable-breakpoint '+bpId, () => {
												resolve({tStates, cpuFreq, breakReason});
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
					resolve({});
				});
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
		// Make sure the call stack exists
		await this.prepareReverseDbgStack();
			let breakReason;
			let instruction = '';
			try {
				// Remember previous line
				let prevLine = this.z80Registers.getCache();
				assert(prevLine);
				const currentLine = await this.revDbgPrev();
				if(currentLine) {
					// Stack handling:
					await this.handleReverseDebugStackBack(currentLine, prevLine);
					// Get instruction
					const pc = this.z80Registers.getPC();
					instruction = '  ' + Utility.getHexString(pc, 4) + ' ' + this.cpuHistory.getInstruction(currentLine);
				}
				else
					breakReason = 'Break: Reached end of instruction history.';
			}
			catch(e) {
				breakReason = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
		return {instruction, breakReason};
	}


	/**
	 * Sets one watchpoint in the remote.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It uses ZEsarUX new fast 'memory breakpoints' for this if the breakpoint has no additional condition.
	 * If it has a condition: not implemented.
	 * @param wp The watchpoint to set.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		return new Promise<void>(resolve => {
			// Check if condition is used
			if (wp.condition && wp.condition.length>0) {
				// OPEN: ZEsarUX does not allow for memory breakpoints plus conditions.
				// Will most probably never be implemented by Cesar.
				// I leave this open mainly as a reminder.
				// At the moment no watchpoint will be set if an additional condition is set.
			}
			else {
				// This is the general case. Just add a breakpoint on memory access.
				let type=0;
				if (wp.access.indexOf('r')>=0)
					type|=0x01;
				if (wp.access.indexOf('w')>=0)
					type|=0x02;

				// Create watchpoint with range
				const size=wp.size;
				let addr=wp.address;
				zSocket.send('set-membreakpoint '+addr.toString(16)+'h '+type+' '+size);
			}

			// Return promise after last watchpoint set
			zSocket.executeWhenQueueIsEmpty().then(resolve);
		});
	}


	/**
	 * Removes one watchpoint from the remote and removes it from the 'watchpoints' list.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to remove. Will set 'bpId' in the 'watchPoint' to undefined.
	 */
	public async removeWatchpoint(wp: GenericWatchpoint): Promise<void> {
		return new Promise<void>(resolve => {
			// Clear watchpoint with range
			const size=wp.size;
			let addr=wp.address;
			zSocket.send('set-membreakpoint '+addr.toString(16)+'h 0 '+size);
			// Return promise after last watchpoint set
			zSocket.executeWhenQueueIsEmpty().then(resolve);
		});
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * Promise is called when ready.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertBreakpoints(enable: boolean): Promise<void>{
		// not supported.
		if(this.assertBreakpoints.length > 0)
			this.emit('warning', 'ZEsarUX does not support ASSERTs in the sources.');
	}


	/**
	 * Set all log points.
	 * Called only once.
	 * Promise is called after the last logpoint is set.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param enable Enable or disable the logpoints.
	 */
	public async enableLogpoints(logpoints: Array<GenericBreakpoint>, enable: boolean): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * Promise is called all logpoints are set.
	 * @param group The group to enable/disable. If undefined: all groups. E.g. "UNITTEST".
	 * @param enable true=enable, false=disable.
	 */
	public async enableLogpointGroup(group: string, enable: boolean): Promise<void> {
		if(this.logpoints.size>0)
			this.emit('warning', 'ZEsarUX does not support logpoints.');
	}


	/**
	 * Converts a condition into the format that ZEsarUX uses.
	 * With version 8.0 ZEsarUX got a new parser which is very flexible,
	 * so the condition is not changed very much.
	 * Only the C-style operators like "&&", "||", "==", "!=" are added.
	 * Furthermore "b@(...)" and "w@(...)" are converted to "peek(...)" and "peekw(...)".
	 * And "!(...)" is converted to "not(...)" (only with brackets).
	 * Note: The original ZEsarUX operators are not forbidden. E.g. "A=1" is allowed as well as "A==1".
	 * Labels: ZESarUX does not know the labels only addresses. Therefore all
	 * labels need to be evaluated first and converted to addresses.
	 * @param condition The general condition format, e.g. "A < 10 && HL != 0".
	 * Even complex parenthesis forms are supported, e.g. "(A & 0x7F) == 127".
	 * @returns The zesarux format.
	 */
	protected convertCondition(condition?: string): string|undefined {
		if(!condition || condition.length == 0)
			return '';	// No condition

		// Convert labels
		let regex = /\b[_a-z][\.0-9a-z_]*\b/gi;
		let conds = condition.replace(regex, label => {
			// Check if register
			if(Z80Registers.isRegister(label))
				return label;
			// Convert label to number.
			const addr = Labels.getNumberForLabel(label);
			// If undefined, don't touch it.
			if(addr == undefined)
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
	public async setBreakpoint(bp: RemoteBreakpoint): Promise<number> {
		return new Promise<number>(resolve => {
			// Check for logpoint (not supported)
			if (bp.log) {
				this.emit('warning', 'ZEsarUX does not support logpoints ("'+bp.log+'").');
				// set to unverified
				bp.address=-1;
				return 0;
			}

			// Get condition
			let zesaruxCondition=this.convertCondition(bp.condition);
			if (zesaruxCondition==undefined) {
				this.emit('warning', "Breakpoint: Can't set condition: "+(bp.condition||''));
				// set to unverified
				bp.address=-1;
				return 0;
			}

			// get free id
			if (this.freeBreakpointIds.length==0)
				return 0;	// no free ID
			bp.bpId=this.freeBreakpointIds[0];
			this.freeBreakpointIds.shift();

			// Create condition from address and bp.condition
			let condition='';
			if (bp.address>=0) {
				condition='PC=0'+Utility.getHexString(bp.address, 4)+'h';
				if (zesaruxCondition.length>0) {
					condition+=' and ';
					zesaruxCondition='('+zesaruxCondition+')';
				}
			}
			if (zesaruxCondition.length>0)
				condition+=zesaruxCondition;

			// set action first (no action)
			const shortCond=(condition.length<50)? condition:condition.substr(0, 50)+'...';
			zSocket.send('set-breakpointaction '+bp.bpId+' prints breakpoint '+bp.bpId+' hit ('+shortCond+')', () => {
				//zSocket.send('set-breakpointaction ' + bp.bpId + ' menu', () => {
				// set the breakpoint
				zSocket.send('set-breakpoint '+bp.bpId+' '+condition, () => {
					// enable the breakpoint
					zSocket.send('enable-breakpoint '+bp.bpId);
					// Add to list
					this.breakpoints.push(bp);
					// return
					resolve(bp.bpId);
				});
			});

		});
	}


	/**
	 * Clears one breakpoint.
	 */
	protected async removeBreakpoint(bp: RemoteBreakpoint): Promise<void> {
		return new Promise<void>(resolve => {
			// Disable breakpoint
			zSocket.send('disable-breakpoint '+bp.bpId, () => {
				// Remove from list
				let index=this.breakpoints.indexOf(bp);
				assert(index!==-1, 'Breakpoint should be removed but does not exist.');
				this.breakpoints.splice(index, 1);
				this.freeBreakpointIds.push(index);
			});
		});
	}


	/**
	 * Disables all breakpoints set in zesarux on startup.
	 */
	protected clearAllZesaruxBreakpoints() {
		for(var i=1; i<=Zesarux.MAX_ZESARUX_BREAKPOINTS; i++) {
			zSocket.send('disable-breakpoint ' + i);
		}
	}


	/**
	 * Set all breakpoints for a file.
	 * If system is running, first break, then set the breakpoint(s).
	 * But, because the run-handler is not known here, the 'run' is not continued afterwards.
	 * @param path The file (which contains the breakpoints).
	 * @param givenBps The breakpoints in the file.
	 * @param tmpDisasmFileHandler(bpr) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 * @returns A Promise with all breakpoints.
	 */
	public async setBreakpoints(path: string, givenBps:Array<RemoteBreakpoint>,
		tmpDisasmFileHandler: (bp: RemoteBreakpoint) => RemoteBreakpoint|undefined): Promise<Array<RemoteBreakpoint>> {
		// Do most of the work
		const bps = super.setBreakpoints(path, givenBps, tmpDisasmFileHandler);
		// But wait for the socket.
		await zSocket.executeWhenQueueIsEmpty();
		return bps;
	}


	/**
	 * Returns the breakpoint at the given address.
	 * Note: Checks only breakpoints with a set 'address'.
	 * @returns A string with the reason. undefined if no breakpoint hit.
	 */
	protected checkPcBreakpoints(): string|undefined {
		assert(this.z80Registers.getCache());
		let condition;
		const pc = this.z80Registers.getPC();
		for(const bp of this.breakpoints) {
			if(bp.address == pc) {
				// Check for condition
				if(!bp.condition) {
					condition = "";
					break;
				}

				// Evaluate condition
				try {
					const result = Utility.evalExpression(bp.condition, true);
					if(result != 0) {
						condition = bp.condition;
						break;
					}
				}
				catch(e) {
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
		if(condition != undefined) {
			reason = 'Breakpoint hit at PC=' + Utility.getHexString(pc,4) + 'h';
			if(condition != "")
				reason += ', ' + condition;
		}
		return reason;
	}


	/**
	 * Sends a command to ZEsarUX.
	 * @param cmd E.g. 'get-registers'.
	 * @returns A Promise with the result of the command.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		cmd=cmd.trim();
		if (cmd.length==0) {
			// No command given
			throw new Error('No command given.');
		}

		// Send command to ZEsarUX
		return new Promise<string>(resolve => {
			zSocket.send(cmd, data => {
				// Call handler
				resolve(data);
			});
		});
	}


	/**
	 * Reads a memory dump from zesarux and converts it to a number array.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public async readMemoryDump(address: number, size: number): Promise<Uint8Array> {
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
			zSocket.executeWhenQueueIsEmpty().then(() => {
				resolve(values);
			});
		});
	}


	/**
	 * Writes a memory dump to zesarux.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		return new Promise<void>(resolve => {
			// Use chunks
			const chunkSize=0x10000; //0x1000;
			let k=0;
			let size=dataArray.length;
			let chunkCount=0;
			while (size>0) {
				const sendSize=(size>chunkSize)? chunkSize:size;
				// Convert array to long hex string.
				let bytes='';
				for (let i=0; i<sendSize; i++) {
					bytes+=Utility.getHexString(dataArray[k++], 2);
				}
				// Send
				chunkCount++;
				zSocket.send('write-memory-raw '+address+' '+bytes, () => {
					chunkCount--;
					if (chunkCount==0)
						resolve();
				});
				// Next chunk
				size-=chunkSize;
			}
		});
	}


	/**
	 * Writes one memory value to zesarux.
	 * The write is followed by a read and the read value is returned
	 * in the handler.
	 * @param address The address to change.
	 * @param value The new value. (byte)
	 * @returns A Promise with the real value.
	 */
	public async writeMemory(address: number, value: number): Promise<number> {
		return new Promise<number>(resolve => {
			// Write byte
			zSocket.send('write-memory '+address+' '+value, data => {
				// read byte
				zSocket.send('read-memory '+address+' 1', data => {
					// call handler
					const readValue=parseInt(data, 16);
					resolve(readValue);
				});
			});
		});
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @returns A Promise with an array with the available memory pages.
	 */
	public async getMemoryPages(): Promise<MemoryPage[]> {
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

		return new Promise<MemoryPage[]>(resolve => {
			zSocket.send('get-memory-pages verbose', data => {
				const pages: Array<MemoryPage>=[];
				const lines=data.split('\n');
				const len=lines.length;
				let i=0;
				while (i+4<len) {
					// Read data
					let name=lines[i+2].substr(12);
					name+=' ('+lines[i+1].substr(11)+')';
					const startStr=lines[i+3].substr(7);
					const start=Utility.parseValue(startStr);
					const endStr=lines[i+4].substr(5);
					const end=Utility.parseValue(endStr);
					// Save in array
					pages.push({start, end, name});
					// Next
					i+=6;
				}

				// send data to handler
				resolve(pages);
			});
		});
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM, registers etc.
	 * @param filePath The file path to store to.
	 * @returns State data.
	 */
	public async stateSave(filePath: string): Promise<void> {
		return new Promise<void>(resolve => {
			// Save as zsf
			filePath+=".zsf";
			zSocket.send('snapshot-save '+filePath, data => {
				resolve();
			});
		});
	}


	/**
	 * Called from "-state restore" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param filePath The file path to retore from.
	 */
	public async stateRestore(filePath: string): Promise<void> {
		return new Promise<void>(resolve => {
			// Load as zsf
			filePath+=".zsf";
			zSocket.send('snapshot-load '+filePath, data => {
				// Clear register cache
				this.z80Registers.clearCache();
				resolve();
			});
		});
	}


	// ZX Next related ---------------------------------


	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @returns A promise with the value of the register.
	 */
	public async getTbblueRegister(registerNr: number): Promise<number> {
		return new Promise<number>(resolve => {
			zSocket.send('tbblue-get-register '+registerNr, data => {
				// Value is returned as 2 digit hex number followed by "H", e.g. "00H"
				const valueString=data.substr(0, 2);
				const value=parseInt(valueString, 16);
				// Call handler
				resolve(value);
			});
		});
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @returns A Promise that returns a 256 byte Array<number> with the palette values.
	 */
	public getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {
		return new Promise<Array<number>>(resolve => {
			const paletteNrString=(paletteNr==0)? 'first':'second';
			zSocket.send('tbblue-get-palette sprite '+paletteNrString+' 0 256', data => {
				// Palette is returned as 3 digit hex separated by spaces, e.g. "02D 168 16D 000"
				const palette=new Array<number>(256);
				for (let i=0; i<256; i++) {
					const colorString=data.substr(i*4, 3);
					const color=parseInt(colorString, 16);
					palette[i]=color;
				}
				// Call handler
				resolve(palette);
			});
		});
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions (xl, xr, yt, yb).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number}> {
		return new Promise<{xl: number, xr: number, yt: number, yb: number}>(resolve => {
			zSocket.send('tbblue-get-clipwindow sprite', data => {
				// Returns 4 decimal numbers, e.g. "0 175 0 192 "
				const clip=data.split(' ');
				const xl=parseInt(clip[0]);
				const xr=parseInt(clip[1]);
				const yt=parseInt(clip[2]);
				const yb=parseInt(clip[3]);
				// Call handler
				resolve({xl, xr, yt, yb});
			});
		})
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @returns A Promise with an array of sprite data.
	 */
	public async getTbblueSprites(slot: number, count: number): Promise<Array<Uint8Array>> {
		return new Promise<Array<Uint8Array>>(resolve => {
			zSocket.send('tbblue-get-sprite '+slot+' '+count, data => {
				// Sprites are returned one line per sprite, each line consist of 4x 2 digit hex values, e.g.
				// "00 00 00 00"
				// "00 00 00 00"
				const spriteLines=data.split('\n');
				const sprites=new Array<Uint8Array>();
				for (const line of spriteLines) {
					if (line.length==0)
						continue;
					const sprite=new Uint8Array(4);
					for (let i=0; i<4; i++) {
						const attrString=line.substr(i*3, 2);
						const attribute=parseInt(attrString, 16);
						sprite[i]=attribute;
					}
					sprites.push(sprite);
				}
				// Call handler
				resolve(sprites);
			});
		});
	}


	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @preturns A Promise with an array of sprite pattern data.
	 */
	public async getTbblueSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		return new Promise<Array<Array<number>>>(resolve => {
			zSocket.send('tbblue-get-pattern '+index+' '+count, data => {
				// Sprite patterns are returned one line per pattern, each line consist of
				// 256x 2 digit hex values, e.g. "E3 E3 E3 E3 E3 ..."
				const patternLines=data.split('\n');
				patternLines.pop();	// Last element is a newline only
				const patterns=new Array<Array<number>>();
				for (const line of patternLines) {
					const pattern=new Array<number>(256);
					for (let i=0; i<256; i++) {
						const attrString=line.substr(i*3, 2);
						const attribute=parseInt(attrString, 16);
						pattern[i]=attribute;
					}
					patterns.push(pattern);
				}
				// Call handler
				resolve(patterns);
			});
		});
	}


	// ------------------------------------


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @returns A Promise called after being quiet for the given timeout.
	 */
	public async executeAfterBeingQuietFor(timeout: number): Promise<void>{
		return new Promise<void>(resolve => {
			let timerId;
			const timer=() => {
				clearTimeout(timerId);
				timerId=setTimeout(() => {
					// Now there is at least 100ms quietness:
					// Stop listening
					zSocket.removeListener('queueChanged', timer);
					// Load the initial unit test routine (provided by the user)
					resolve();
				}, timeout);
			};

			// 2 triggers
			zSocket.on('queueChanged', timer);
			zSocket.executeWhenQueueIsEmpty().then(timer);
		});
	}


	/**
	 * @returns Returns the previous line in the cpu history.
	 * If at end it returns undefined.
	 */
	protected async revDbgPrev(): Promise<string|undefined> {
		const line = await this.cpuHistory.getPrevRegistersAsync();
		if(line) {
			// Add to register cache
			this.z80Registers.setCache(line);
			// Add to history for decoration
			const addr = this.z80Registers.getPC();
			this.revDbgHistory.push(addr);
		}
		return line;
	}


	/**
	 * @returns Returns the next line in the cpu history.
	 * If at start it returns ''.
	 */
	protected revDbgNext(): string|undefined {
		// Get line
		let line = this.cpuHistory.getNextRegisters() as string;
		this.z80Registers.setCache(line);
		// Remove one address from history
		this.revDbgHistory.pop();
		return line;
	}
}

