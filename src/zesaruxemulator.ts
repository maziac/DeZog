import * as assert from 'assert';
import { zSocket, ZesaruxSocket } from './zesaruxSocket';
import { Z80Registers } from './z80Registers';
import { Utility } from './utility';
import { Labels } from './labels';
import { Settings } from './settings';
import { RefList } from './reflist';
import { Log } from './log';
import { Frame } from './frame';
import { GenericWatchpoint, GenericBreakpoint } from './genericwatchpoint';
import { EmulatorClass, MachineType, EmulatorBreakpoint, EmulatorState, MemoryPage } from './emulator';
import { StateZ80 } from './statez80';
import { CallSerializer } from './callserializer';
import { ZesaruxCpuHistory } from './zesaruxCpuHistory';
//import * as lineRead from 'n-readlines';




/// Minimum required ZEsarUX version.
const MIN_ZESARUX_VERSION = 8.0;


// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints.
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length.
	static MAX_MESSAGE_CATCH_BREAKPOINT = 4*32-1;	///< breakpoint condition should also be smaller than this.
}




/**
 * The representation of the Z80 machine.
 * It receives the requests from the EmulDebugAdapter and communicates with
 * the EmulConnector.
 */
export class ZesaruxEmulator extends EmulatorClass {

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

	/// The virtual stack used during reverse debugging.
	protected reverseDbgStack: RefList;

	/// We need a serializer for some tasks.
	protected serializer = new CallSerializer('ZesaruxEmulator');

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;


	/// Initializes the machine.
	public init() {
		super.init();

		// Create the socket for communication (not connected yet)
		this.setupSocket();

		// Connect zesarux debugger
		zSocket.connectDebugger();
	}


	/**
	 * Stops a machine/the debugger.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public disconnect(handler: () => void) {
		// Terminate the socket
		zSocket.quit(handler);
	}


	/**
	 * Terminates the machine/the debugger.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 * @param handler is called after the connection is terminated.
	 */
	public terminate(handler: () => void) {
		this.terminating = true;
		this.clearInstructionHistory();	// delete all transaction log files
		// The socket connection must be closed as well.
		zSocket.quit(() => {
			// Send terminate event (to Debug Session which will send a TerminateEvent to vscode. That in turn will create a 'disconnect')
			this.emit('terminated');
			handler();
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
				zSocket.executeWhenQueueIsEmpty(() => {
					var debug_settings = (Settings.launch.skipInterrupt) ? 32 : 0;
					zSocket.send('set-debug-settings ' + debug_settings);

					// Reset the cpu before loading.
					if(Settings.launch.resetOnLaunch)
						zSocket.send('hard-reset-cpu');

	/*
	logfile     name:   File to store the log
	enabled     yes|no: Enable or disable the cpu transaction log. Requires logfile to enable it
	autorotate  yes|no: Enables automatic rotation of the log file
	rotatefiles number: Number of files to keep in rotation (1-999)
	rotatesize  number: Size in MB to rotate log file (1-9999)
	truncate    yes|no: Truncate the log file. Requires value set to yes
	datetime    yes|no: Enable datetime logging
	tstates     yes|no: Enable tstates logging
	address     yes|no: Enable address logging. Enabled by default
	opcode      yes|no: Enable opcode logging. Enabled by default
	registers   yes|no: Enable registers logging
	*/
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
					if(Settings.codeCoverageEnabled) {
						zSocket.send('cpu-code-coverage enabled yes');
						zSocket.send('cpu-code-coverage clear');
					}
					else
						zSocket.send('cpu-code-coverage enabled no');

					// Reverse debugging / CPU history
					this.cpuHistory = new ZesaruxCpuHistory();

					// Number of lines for reverse debug
					//const lines = this.numberOfHistoryLines();


					// Coverage + reverse debugging settings

					// TODO: Ignore repetition of 'HALT'

				});

				zSocket.executeWhenQueueIsEmpty(() => {
					// Check for console.error
					if(error) {
						this.emit('error', error);
					}
					else {
						// Send 'initialize' to Machine.
						this.state = EmulatorState.IDLE;
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
			zSocket.send('enable-breakpoints');
			this.clearAllZesaruxBreakpoints();

			// Init breakpoint array
			this.freeBreakpointIds.length = 0;
			for(var i=1; i<=ZesaruxEmulator.MAX_USED_BREAKPOINTS; i++)
				this.freeBreakpointIds.push(i);
	}


	/**
	 * Retrieve the registers from zesarux directly.
	 * From outside better use 'getRegisters' (the cached version).
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	public async getRegistersFromEmulator(handler: (registersString: string) => void) {
		// Check if in reverse debugging mode
		// In this mode registersCache should be set and thus this function is never called.
		assert(!this.cpuHistory.isInStepBackMode());
		/*
		if(this.cpuHistory.isInStepBackMode()) {
			// Read registers from file
			let line = await this.cpuHistory.getLine() as string;
			assert(line);
			let data = this.cpuHistory.getRegisters(line);
			handler(data);
			return;
		}
		*/

		// Get new (real emulator) data
		zSocket.send('get-registers', data => {
			// convert received data to right format ...
			// data is e.g: "PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0 """
			handler(data);
		});
	}


	/**
	 * Sets the value for a specific register.
	 * @param name The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 * @param handler The handler that is called when command has finished.
	 */
	public setRegisterValue(name: string, value: number, handler?: (resp) => void) {
		// set value
		zSocket.send('set-register ' + name + '=' + value, data => {
			// Get real value (should be the same as the set value)
			if(handler)
				Z80Registers.getVarFormattedReg(name, data, formatted => {
					handler(formatted);
				});
		});
	}


	/**
	 * This is a very specialized function to find a CALL, CALL cc or RST opcode
	 * at the 3 bytes before the given address.
	 * Idea is that the 'addr' is a return address from the stack and we want to find
	 * the caller.
	 * @param addr The address.
	 * @param handler(k,caddr) The handler is called at the end of the function.
	 * k=3, addr: If a CALL was found, caddr contains the call address.
	 * k=2/1, addr: If a RST was found, caddr contains the RST address (p). k is the position,
	 * i.e. if RST was found at addr-k. Used to work also with esxdos RST.
	 * k=0, addr=0: Neither CALL nor RST found.
	 */
	protected findCallOrRst(addr: number, handler:(k: number, addr: number)=>void) {
		// Get the 3 bytes before address.
		zSocket.send( 'read-memory ' + (addr-3) + ' ' + 3, data => { // subtract opcode + address (last 3 bytes)
			// Check for Call
			const opc3 = parseInt(data.substr(0,2),16);	// get first of the 3 bytes
			if(opc3 == 0xCD	// CALL nn
				|| (opc3 & 0b11000111) == 0b11000100) 	// CALL cc,nn
			{
				// It was a CALL, get address.
				let callAddr = parseInt(data.substr(2,4),16)
				callAddr = (callAddr>>8) + ((callAddr & 0xFF)<<8);	// Exchange high and low byte
				handler(3, callAddr);
				return;
			}

			// Check if one of the 2 last bytes was a RST.
			// Note: Not only the last byte is checkd bt also the byte before. This is
			// a small "hack" to allow correct return addresses even for esxdos.
			let opc12 = parseInt(data.substr(2,4),16);	// convert both opcodes at once
			let k = 1;
			while(opc12 != 0) {
				if((opc12 & 0b11000111) == 0b11000111)
					break;
				// Next
				opc12 >>= 8;
				k++;
			}
			if(opc12 != 0) {
				// It was a RST, get p
				const p = opc12 & 0b00111000;
				handler(k, p);
				return;
			}

			// Nothing found = -1
			handler(0, 0);
		});
	}


	/**
	 * Helper function to prepare the callstack for vscode.
	 * What makes it complicated is the fact that for every word on the stack the zesarux
	 * has to be called to get the disassembly to check if it was a CALL.
	 * The function calls itself recursively.
	 * @param frames The array that is sent at the end which is increased every call.
	 * @param zStack The original zesarux stack frame.
	 * @param zStackAddress The start address of the stack.
	 * @param index The index in zStack. Is increased with every call.
	 * @param lastCallFrameIndex The index to the last item on stack (in listFrames) that was a CALL.
	 * @param handler The handler to call when ready.
	 */
	private setupCallStackFrameArray(frames: RefList, zStack: Array<string>, zStackAddress: number, index: number, lastCallFrameIndex: number, handler:(frames: Array<Frame>)=>void) {

		// skip invalid addresses (should not happen)
		var addrString;
		while(index < zStack.length) {
			addrString = zStack[index];
			if(addrString.length >= 4)
				break;
			++index;
		}

		// Check for last frame
		if(index >= zStack.length) {
			// Use new frames
			this.listFrames = frames;
			// call handler
			handler(frames);
			return;
		}

		// Get caller address with opcode (e.g. "call sub1")
		const addr = parseInt(addrString,16);
		// Check for CALL or RST
		this.findCallOrRst(addr, (k, callAddr) => {
			if(k == 3) {
				// CALL.
				// Now find label for this address
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
				// Save
				lastCallFrameIndex = frames.addObject(new Frame(addr-3, zStackAddress+2*index, 'CALL ' + labelCallAddr));
			}
			else if(k==1 || k == 2) {
				// RST.
				const pString = Utility.getHexString(callAddr,2)+'h'
				// Save
				lastCallFrameIndex = frames.addObject(new Frame(addr-k, zStackAddress+2*index, 'RST ' + pString));
			}
			else {
				// Neither CALL nor RST.
				// Get last call frame
				const frame = frames.getObject(lastCallFrameIndex);
				frame.stack.push(addr);
			}


			// Call recursively
			this.setupCallStackFrameArray(frames, zStack, zStackAddress, index+1, lastCallFrameIndex, handler);
		});
	}


	/**
	 * Returns the stack frames.
	 * Either the "real" ones from ZEsarUX or the virtual ones during reverse debugging.
	 * @param handler The handler to call when ready.
	 */
	public stackTraceRequest(handler:(frames: RefList)=>void): void {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Return virtual stack
			assert(this.reverseDbgStack);
			handler(this.reverseDbgStack);
		}
		else {
			// "real" stack trace
			this.realStackTraceRequest(handler);
		}
	}


	/**
	 * Returns the "real" stack frames from ZEsarUX.
	 * (Opposed to the virtual one during reverse debug mode.)
	 * @param handler The handler to call when ready.
	 */
	public realStackTraceRequest(handler:(frames: RefList)=>void): void {
		// Create a call stack / frame array
		const frames = new RefList();

		// Get current pc
		this.getRegisters(data => {
			// Parse the PC value
			const pc = Z80Registers.parsePC(data);
			const sp = Z80Registers.parseSP(data);
			const lastCallIndex = frames.addObject(new Frame(pc, sp, 'PC'));

			// calculate the depth of the call stack
			const tos = this.topOfStack
			var depth = (tos - sp)/2;	// 2 bytes per word
			if(depth>20)	depth = 20;

			// Check if callstack need to be called
			if(depth > 0) {
				// Get stack from zesarux
				zSocket.send('get-stack-backtrace '+depth, data => {
					Log.log('Call stack: ' + data);
					// add the received stack, something like:
					// get-stack-backtrace 11:
					// 744EH D0C5H D12AH CC18H CBD3H 0E01H 0100H 0000H 0000H 3200H 0000H
					const zStack = data.split(' ');
					zStack.splice(zStack.length-1);	// ignore last (is empty)
					// rest of callstack
					this.setupCallStackFrameArray(frames, zStack, sp, 0, lastCallIndex, handler);
				});
			}
			else {
				// Use new frames
				this.listFrames = frames;
				// no callstack, call handler immediately
				handler(frames);
			}
		});
	}


	/**
	 * 'continue' debugger program execution.
	 * @param contStoppedHandler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 * tStates contains the number of tStates executed and time is the time it took for execution,
	 * i.e. tStates multiplied with current CPU frequency.
 	 */
	public async continue(contStoppedHandler: (reason: string, tStates?: number, time?: number)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// continue in reverse debugging will run until the start of the transaction log
			// or until a breakpoint condition is true.
			let reason = 'Break: Reached start of instruction history.';
			try {
				//this.state = EmulatorState.RUNNING;
				//this.state = EmulatorState.IDLE;

				// Getcurrent line
				let currentLine: string|undefined = await this.cpuHistory.getLineXXX();
				assert(currentLine);

				// Loop over all lines, reverse
				while(currentLine) {
					// Handle stack
					const nextLine = await this.revDbgNext();
					this.handleReverseDebugStackFwrd(currentLine, nextLine);

					// Check for breakpoint
					// TODO: ...

					// Next
					currentLine = nextLine;
				}
			}
			catch(e) {
				reason = 'Break: Error occurred: ' + e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Clear register cache
			this.RegisterCache = undefined;

			// Call handler
			contStoppedHandler(reason, undefined, undefined);
			return;
		}

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();
		// Change state
		this.state = EmulatorState.RUNNING;
		// Handle code coverage
		this.enableCpuTransactionLog(() => {
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
							this.RegisterCache = undefined;
							// Handle code coverage
							this.handleCodeCoverage();
							// The reason is the 2nd line
							const reason = text.split('\n')[1];
							assert(reason);
							// Call handler
							contStoppedHandler(reason, tStates, cpuFreq);
						});
					});
				});
			});
		});
	}


	/**
	  * 'pause' the debugger.
	  */
	 public pause(): void {
		// Send anything through the socket
		zSocket.sendBlank();
	}


	/**
	 * Clears the stack used for reverse debugging.
	 * Called when leaving the reverse debug mode.
	 */
	protected clearReverseDbgStack() {
		this.reverseDbgStack = undefined as any;
	}


	/**
	 * Returns the pointer to the virtual reverse debug stack.
	 * If it does not exist yet it will be created and prefilled with the current
	 * (memory) stack values.
	 */
	protected prepareReverseDbgStack(handler:() => void) {
		if(this.cpuHistory.isInStepBackMode()) {
			// Call immediately
			handler();
		}
		else {
			// Prefill array with current stack
			this.realStackTraceRequest(frames => {
				this.reverseDbgStack = frames;
				handler();
			});
		}
	}


	/**
	 * Handles the current instruction and the previous one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 * Normally only the top frame on the stack is changed for the new PC value.
	 * But if a "RET" instruction is found also the 'next' PC value is pushed
	 * to the stack.
	 * @param currentLine The current line of the cpu history.
	 */
	protected async handleReverseDebugStackBack(currentLine: string) {
		let prevLine;
		assert(this.reverseDbgStack.length > 0);
		// Remove current frame
		//const lastFrame =
		this.reverseDbgStack.shift();

		// TODO: handle stack
		if (false) {

		// Check for RETx
		assert(currentLine)
		//	currentLine = await this.cpuHistory.getLine();
		const instr = this.cpuHistory.getInstruction(currentLine);
		if(instr.startsWith("RET")) {
			// Create new frame with better name on stack
			const regs = this.cpuHistory.getRegisters(currentLine);
			const pc = Z80Registers.parsePC(regs);
			const sp = Z80Registers.parseSP(regs);
			const name = 'TODO: CALL caller name';
			// TODO: Need to find out if RST or CALL caller.
			const frame = new Frame(pc, sp, name);
			this.reverseDbgStack.unshift(frame);
		}
		// Check for CALL and RST
		else if(instr.startsWith("CALL") || instr.startsWith("RST")) {
			// Check if the SP got bigger, if not we might have skipped a
			// simulated RST only.
			const currentRegs = this.cpuHistory.getRegisters(currentLine);
			const currentSP = Z80Registers.parseSP(currentRegs);
			const prevRegs = this.cpuHistory.getRegisters(prevLine);
			const prevSP = Z80Registers.parseSP(prevRegs);
			if(currentSP > prevSP) {
				// Pop from call stack
				assert(this.reverseDbgStack.length > 0);
				this.reverseDbgStack.shift();
			}
		}
		}

		// Add current PC
		const regs = this.cpuHistory.getRegisters(currentLine);
		const pc = Z80Registers.parsePC(regs);
		const sp = Z80Registers.parseSP(regs);
		const topFrame = new Frame(pc, sp, 'PC');
		this.reverseDbgStack.unshift(topFrame);
	}


	/**
	 * Handles the current instruction and the next one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 * Normally only the top frame on the stack is changed for the new PC value.
	 * But if e.g. a "CALL" or "RET" instruction is found the stack needs to be changed.
	 * @param currentLine The current line of the transaction log.
	 * @param nextLine The next line of the transaction log. (The one that
	 * comes after currentLine.) If that is empty the start f the log has been reached.
	 * In that case the reverseDbgStack is cleared because the real stack can be used.
	 */
	protected handleReverseDebugStackFwrd(currentLine: string, nextLine: string|undefined) {
		assert(currentLine);
		// Check for end
		if(!nextLine) {
			this.reverseDbgStack = undefined as any;
			return;
		}

		// Remove current frame
		//const lastFrame =
		assert(this.reverseDbgStack.length > 0);
		this.reverseDbgStack.shift();

		// Check for RETx
		const instr = this.cpuHistory.getInstruction(currentLine);
		if(instr.startsWith("RET")) {
			// Pop from call stack
			assert(this.reverseDbgStack.length > 0);
			this.reverseDbgStack.shift();
		}
		// Check for CALL and RST
		else if(instr.startsWith("CALL") || instr.startsWith("RST")) {
			// Check if the SP got smaller, if not we might have skipped a
			// simulated RST only.
			const currentRegs = this.cpuHistory.getRegisters(currentLine);
			const currentSP = Z80Registers.parseSP(currentRegs);
			const nextRegs = this.cpuHistory.getRegisters(nextLine);
			const nextSP = Z80Registers.parseSP(nextRegs);
			if(currentSP > nextSP) {
				// Push to call stack
				const pc = Z80Registers.parsePC(currentRegs);
				// Now find label for this address
				const callAddr = Z80Registers.parsePC(nextRegs);
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
				const name = ((instr.startsWith("CALL")) ? "CALL " : "RST ") + labelCallAddr;
				const frame = new Frame(pc, currentSP, name);
				this.reverseDbgStack.unshift(frame);
			}
		}

		// Add current PC
		const regs = this.cpuHistory.getRegisters(nextLine);
		const pc = Z80Registers.parsePC(regs);
		const sp = Z80Registers.parseSP(regs);
		const topFrame = new Frame(pc, sp, 'PC');
		this.reverseDbgStack.unshift(topFrame);
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 */
	public reverseContinue(handler:(reason: string)=>void) {
		// Make sure the call stack exists
		this.prepareReverseDbgStack(async () => {
			let errorText: string|undefined;
			let reason;
			try {
				// Loop over all lines, reverse
				reason = 'Break: Reached end of instruction history.';
				while(true) {
					// Get line
					const currentLine = await this.revDbgPrev();
					if(!currentLine)
						break;
					// Stack handling:
					this.handleReverseDebugStackBack(currentLine);

					// Breakpoint handling:
					// Check for breakpoint
					// TODO: ...
				}

			}
			catch(e) {
				errorText = e;
				reason = 'Break: Error occurred: ' + errorText;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
			handler(reason);
		});
	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @param handler(disasm, tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	 public async stepOver(handler:(disasm: string, tStates?: number, cpuFreq?: number, error?: string)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Step over should skip all CALLs and RST.
			// This is more difficult as it seems. It could also happen that an
			// interrupt kicks in.
			// The algorithm does work by checking the SP:
			// 1. SP is read
			// 2. switch to next line
			// 3. SP is read
			// 4. If SP has not changed stop
			// 5. Otherwise switch to next line until SP is reached.
			// Note: does not work for PUSH/POP or "LD SP". Therefore these are
			// handled in a special way. However, if an interrupt would kick in when
			// e.g. a "LD SP,(nnnn)" is done, then the "stepOver" would incorrectly
			// work just like a "stepInto". However this should happen very seldomly.

			// Get current instruction
			let currentLine: string = await this.cpuHistory.getLineXXX() as string;
			assert(currentLine);
			let instruction = this.cpuHistory.getInstruction(currentLine);
			// Read SP
			const regs = this.cpuHistory.getRegisters(currentLine);
			let expectedSP = Z80Registers.parseSP(regs);
			let dontCheckSP = false;


			// Check for changing SP
			if(instruction.startsWith('PUSH'))
				expectedSP -= 2;
			else if(instruction.startsWith('POP'))
				expectedSP += 2;
			else if(instruction.startsWith('DEC SP'))
				expectedSP --;
			else if(instruction.startsWith('INC SP'))
				expectedSP ++;
			else if(instruction.startsWith('LD SP,')) {
				const src = instruction.substr(6);
				if(src.startsWith('HL'))
					expectedSP = Z80Registers.parseHL(regs);	// LD SP,HL
				else if(src.startsWith('IX'))
					expectedSP = Z80Registers.parseIX(regs);	// LD SP,IX
				else if(src.startsWith('IY'))
					expectedSP = Z80Registers.parseIY(regs);	// LD SP,IY
				else if(src.startsWith('('))
					dontCheckSP = true;	// LD SP,(nnnn)	-> no way to determine memory contents
				else
					expectedSP = parseInt(src, 16);		// LD SP,nnnn
			}

			// Check for RET. There are 2 possibilities if RET was conditional.
			let expectedSP2 = expectedSP;
			if(instruction.startsWith('RET'))
				expectedSP2 += 2;

			let errorText;
			try {
				// Find next line with same SP
				while(currentLine) {
					// Handle stack
					const nextLine = await this.revDbgNext();
					this.handleReverseDebugStackFwrd(currentLine, nextLine);

					if(dontCheckSP) {
						// Break after first line
						break;
					}

					// TODO: need to check for breakpoint

					// Read SP
					const regs = this.cpuHistory.getRegisters(currentLine);
					const sp = Z80Registers.parseSP(regs);
					// Check expected SPs
					if(expectedSP == sp)
						break;
					if(expectedSP2 == sp)
						break;

					// Next
					currentLine = nextLine as string;
				}
			}
			catch(e) {
				errorText = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Clear register cache
			this.RegisterCache = undefined;

			// Call handler
			handler(instruction, undefined, undefined, errorText);
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
		// So we first check if the instruction is a CALL and
		// then either execute a 'step-over' or a step-into'.
		this.getRegisters(data => {
			const pc = Z80Registers.parsePC(data);
			zSocket.send('disassemble ' + pc, disasm => {
				// Clear register cache
				this.RegisterCache = undefined;
				// Check if this was a "CALL something" or "CALL n/z,something"
				const opcode = disasm.substr(7,4);

				if(opcode == "RST ") {
					// Use a special handling for RST required for esxdos.
					// Zesarux internally just sets a breakpoint after the current opcode. In esxdos this
					// address is used as parameter. I.e. the return address is tweaked after that address.
					// Therefore we set an additional breakpoint 1 after the current address.

					// Set action first (no action).
					const bpId = ZesaruxEmulator.STEP_BREAKPOINT_ID;
					zSocket.send('set-breakpointaction ' + bpId + ' prints step-over', () => {
						// set the breakpoint (conditions are evaluated by order. 'and' does not take precedence before 'or').
						const condition = 'PC=' + (pc+2);	// PC+1 would be the normal return address.
						zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
							// enable breakpoint
							zSocket.send('enable-breakpoint ' + bpId, () => {
								// Run
								this.state = EmulatorState.RUNNING;
								this.cpuStepGetTime('cpu-step-over', (tStates, cpuFreq) => {
									// takes a little while, then step-over RET
									// Disable breakpoint
									zSocket.send('disable-breakpoint ' + bpId, () => {
										this.state = EmulatorState.IDLE;
										handler(disasm, tStates, cpuFreq);
									});
								});
							});
						});
					});
				}
				else {
					// No special handling for the other opcodes.
					const cmd = (opcode=="CALL" || opcode=="LDIR" || opcode=="LDDR") ? 'cpu-step-over' : 'cpu-step';
					// Step
					this.cpuStepGetTime(cmd, (tStates, cpuFreq) => {
						// Call handler
						handler(disasm, tStates, cpuFreq);
					});
				}
			});
		});
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async stepInto(handler:(disasm: string, tStates?: number, time?: number, error?: string)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			let errorText;
			let instr = '';
			try {
				// Get disassembly of instruction
				const currentLine = await this.cpuHistory.getLineXXX() as string;
				assert(currentLine);
				instr = this.cpuHistory.getInstruction(currentLine);
				// Handle stack
				const nextLine = await this.revDbgNext();
				this.handleReverseDebugStackFwrd(currentLine, nextLine);
			}
			catch(e) {
				errorText = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Clear register cache
			this.RegisterCache = undefined;

			// Call handler
			handler(instr, undefined, undefined, errorText);
			return;
		}

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();

		// Normal step into.
		this.getRegisters(data => {
			const pc = Z80Registers.parsePC(data);
			zSocket.send('disassemble ' + pc, disasm => {
				// Clear register cache
				this.RegisterCache = undefined;
				this.cpuStepGetTime('cpu-step', (tStates, cpuFreq) => {
					handler(disasm, tStates, cpuFreq);
				});
			});
		});
	}


	/**
	 * Executes a step and also returns the T-states and time needed.
	 * @param cmd Either 'cpu-step' or 'cpu-step-over'.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	protected cpuStepGetTime(cmd: string, handler:(tStates: number, cpuFreq: number, error?: string)=>void): void {
		// Handle code coverage
		this.enableCpuTransactionLog(() => {
			// Reset T-state counter etc.
			zSocket.send('reset-tstates-partial', data => {
				// Step into
				zSocket.send(cmd, data => {
					// get T-State counter
					zSocket.send('get-tstates-partial', data => {
						const tStates = parseInt(data);
						// get clock frequency
						zSocket.send('get-cpu-frequency', data => {
							const cpuFreq = parseInt(data);
							// Call handler
							handler(tStates, cpuFreq);
							// Handle code coverage
							this.handleCodeCoverage();
						});
					});
				});
			});
		});
	}


	/**
	 * If code coverage or reverse debugging enabled is enabled the ZEsarUX cpu-transaction-log is enabled
	 * before the 'handler' is called.
	 * If code coverage or reverse debugging is not enabled 'handler' is called immediately.
	 * @param handler Is called after the coverage commands have been sent.
	 */
	protected enableCpuTransactionLog(handler:()=>void): void {
		// TODO: similar for reverse debug

		/*
		// Code coverage or reverse debugging enabled
		if(Settings.codeCoverageEnabled()) {
			// Enable logging
			zSocket.send('cpu-code-coverage get', data => {
				// Call handler
				handler();
			});
		}
		else
		*/
		{
			// Call handler (without coverage)
			handler();
		}
	}


	/**
	 * Reads the coverage addresses and clears them in ZEsarUX.
	 */
	protected handleCodeCoverage() {
		// Check if code coverage is enabled
		if(!Settings.codeCoverageEnabled)
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
	 * 'step out' of current call.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async stepOut(handler:(tStates?: number, cpuFreq?: number, error?: string)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Step out will run until the start of the transaction log
			// or until a "RETx" is found (one behind).
			// To make it more complicated: this would falsely find a RETI event
			// if stepout was not started form the ISR.
			// To overcome this also the SP is observed. And we break only if
			// also the SP is lower/equal to when we started.

			// Get current line
			let currentLine = await this.cpuHistory.getLineXXX() as string;
			assert(currentLine);;

			// Read SP
			let regs = this.cpuHistory.getRegisters(currentLine);
			const startSP = Z80Registers.parseSP(regs);

			// Do as long as necessary
			let errorText;
			try {
				while(currentLine) {
					// Handle stack
					const nextLine = await this.revDbgNext();
					this.handleReverseDebugStackFwrd(currentLine, nextLine);

					// Get current instruction
					const instruction = this.cpuHistory.getInstruction(currentLine);

					// Check for RET
					if(instruction.startsWith('RET')) {
						// Read SP
						const regs = this.cpuHistory.getRegisters(currentLine);
						const sp = Z80Registers.parseSP(regs);
						// Check SP
						if(sp >= startSP) {
							break;
						}
					}

					// Next
					currentLine = nextLine as string;
				}
			}
			catch(e) {
				errorText = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Clear register cache
			this.RegisterCache = undefined;

			// Call handler
			handler(undefined, undefined, errorText);
			return;
		}


		// Zesarux does not implement a step-out. Therefore we analyze the call stack to
		// find the first return address.
		// Then a breakpoint is created that triggers when the SP changes to that address.
		// I.e. when the RET (or (RET cc) gets executed.

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();
		// Get current stackpointer
		this.getRegisters( data => {
			// Get SP
			const sp = Z80Registers.parseSP(data);

			// calculate the depth of the call stack
			var depth = this.topOfStack - sp;
			if(depth>20)	depth = 20;
			if(depth == 0) {
				// no call stack, nothing to step out, i.e. immediately return
				handler();
				return;
			}

			// get stack from zesarux
			zSocket.send('get-stack-backtrace '+depth, data => {
				// add the received stack, something like:
				// get-stack-backtrace 11:
				// 744EH D0C5H D12AH CC18H CBD3H 0E01H 0100H 0000H 0000H 3200H 0000H
				const zStack = data.split(' ');
				zStack.splice(zStack.length-1);	// ignore last (is empty)
				// Now search the call stack for an address that points after a 'CALL'.
				const recursiveFunc = (stack: Array<string>, sp: number) => {
					// Search for "CALL"
					const addrString = stack.shift();
					if(!addrString) {
						// Stop searching, no "CALL" found.
						// Nothing to step out, i.e. immediately return.
						handler();
					}
					else {
						const addr = parseInt(addrString,16);
						this.findCallOrRst(addr, (k) => {
							if(k != 0) {
								// CALL or RST found, set breakpoint: when SP gets bigger than the current value.
								// Set action first (no action).
								const bpId = ZesaruxEmulator.STEP_BREAKPOINT_ID;
								zSocket.send('set-breakpointaction ' + bpId + ' prints step-out', () => {
									// set the breakpoint (conditions are evaluated by order. 'and' does not take precedence before 'or').
									const condition = 'SP=' + (sp+2);
									zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
										// enable breakpoint
										zSocket.send('enable-breakpoint ' + bpId, () => {

											// Clear register cache
											this.RegisterCache = undefined;
											// Run
											this.state = EmulatorState.RUNNING;
											this.cpuStepGetTime('run', (tStates, cpuFreq) => {
												// Disable breakpoint
												zSocket.send('disable-breakpoint ' + bpId, () => {
													this.state = EmulatorState.IDLE;
													handler(tStates, cpuFreq);
												});
											});

										});
									});
								});
								return;
							}
							// "CALL" not found, so continue searching
							recursiveFunc(stack, sp+2);
						});
					}
				};	// end recursiveFunc

				// Loop the call stack recursively
				recursiveFunc(zStack, sp);

			});
		});
	}


	/**
	  * 'step backwards' the program execution in the debugger.
	  * @param handler(instruction, error) The handler that is called after the step is performed.
	  * instruction: e.g. "081C NOP"
	  * error: If not undefined t holds the exception message.
	  */
	 public stepBack(handler:(error: string)=>void) {
		// Make sure the call stack exists
		this.prepareReverseDbgStack(async () => {
			let errorText;
			try {
				const currentLine = await this.revDbgPrev();
				if(!currentLine)
					throw Error('Reached end of instruction history.')
				// Stack handling:
				this.handleReverseDebugStackBack(currentLine);
			}
			catch(e) {
				errorText = e;
			}

			// Decoration
			if(!errorText)
				this.emitRevDbgHistory();

			// Call handler
			handler(errorText);
		});
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It uses ZEsarUX new fast 'memory breakpoints' for this if the breakpoint ha no additional condition.
	 * If it has a condition the (slow) original ZEsarUX breakpoints are used.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	public setWatchpoints(watchPoints: Array<GenericWatchpoint>, handler?: (watchpoints:Array<GenericWatchpoint>) => void) {
		// Set watchpoints (memory guards)
		for(let wp of watchPoints) {
			// Check if condition is used
			if(wp.conditions.length > 0) {
				// OPEN: ZEsarUX does not allow for memory breakpoints plus conditions.
				// Will most probably never be implemented by Cesar.
				// I leave this open mainly as a reminder.
				// At the moment no watchpoint will be set if an additional condition is set.
			}
			else {
				// This is the general case. Just add a breakpoint on memory access.
				let type = 0;
				if(wp.access.indexOf('r') >= 0)
					type |= 0x01;
				if(wp.access.indexOf('w') >= 0)
					type |= 0x02;

				// Create watchpoint with range
				const size = wp.size;
				let addr = wp.address;
				zSocket.send('set-membreakpoint ' + addr.toString(16) + 'h ' + type + ' ' + size);
			}
		}

		// Call handler
		if(handler) {
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
	public enableWPMEM(enable: boolean, handler: () => void) {
		if(enable) {
			this.setWatchpoints(this.watchpoints);
		}
		else {
			// Remove watchpoint(s)
			//zSocket.send('clear-membreakpoints');
			for(let wp of this.watchpoints) {
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
	public enableAssertBreakpoints(enable: boolean, handler: () => void) {
		// not supported.
		if(this.assertBreakpoints.length > 0)
			this.emit('warning', 'ZEsarUX does not support ASSERTs in the sources.');
		if(handler)
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
	public enableLogpoints(group: string, enable: boolean, handler: () => void) {
		// not supported.
		if(this.logpoints.size > 0)
			this.emit('warning', 'ZEsarUX does not support LOGPOINTs in the sources.');
		if(handler)
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
	protected convertCondition(condition: string): string|undefined {
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
	public setBreakpoint(bp: EmulatorBreakpoint): number {
		// Check for logpoint (not supported)
		if(bp.log) {
			this.emit('warning', 'ZEsarUX does not support logpoints ("' + bp.log + '"). Instead a normal breakpoint is set.');
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// Get condition
		let zesaruxCondition = this.convertCondition(bp.condition);
		if(zesaruxCondition == undefined) {
			this.emit('warning', "Breakpoint: Can't set condition: " + (bp.condition || ''));
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// get free id
		if(this.freeBreakpointIds.length == 0)
			return 0;	// no free ID
		bp.bpId = this.freeBreakpointIds[0];
		this.freeBreakpointIds.shift();

		// Create condition from address and bp.condition
		let condition = '';
		if(bp.address >= 0) {
			condition = 'PC=0'+Utility.getHexString(bp.address, 4)+'h';
			if(zesaruxCondition.length > 0) {
				condition += ' and ';
				zesaruxCondition = '(' + zesaruxCondition + ')';
			}
		}
		if(zesaruxCondition.length > 0)
			condition += zesaruxCondition;

		// set action first (no action)
		const shortCond = (condition.length < 50) ? condition : condition.substr(0,50) + '...';
		zSocket.send('set-breakpointaction ' + bp.bpId + ' prints breakpoint ' + bp.bpId + ' hit (' + shortCond + ')', () => {
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
	 * @param handler(bps) On return the handler is called with all breakpoints.
	 * @param tmpDisasmFileHandler(bpr) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 */
	public setBreakpoints(path: string, givenBps:Array<EmulatorBreakpoint>,
		handler:(bps: Array<EmulatorBreakpoint>)=>void,
		tmpDisasmFileHandler:(bp: EmulatorBreakpoint)=>EmulatorBreakpoint) {

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
	 * Sends a command to ZEsarUX.
	 * @param cmd E.g. 'get-registers'.
	 * @param handler The response (data) is returned.
	 */
	public dbgExec(cmd: string, handler:(data)=>void) {
		cmd = cmd.trim();
		if(cmd.length == 0)	return;

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
	public getMemoryDump(address: number, size: number, handler:(data: Uint8Array, addr: number)=>void) {
		// Use chunks
		const chunkSize = 0x10000;// 0x1000;
		// Retrieve memory values
		const values = new Uint8Array(size);
		let k = 0;
		while(size > 0) {
			const retrieveSize = (size > chunkSize) ? chunkSize : size;
			zSocket.send( 'read-memory ' + address + ' ' + retrieveSize, data => {
				const len = data.length;
				assert(len/2 == retrieveSize);
				for(var i=0; i<len; i+=2) {
					const valueString = data.substr(i,2);
					const value = parseInt(valueString,16);
					values[k++] = value;
				}
			});
			// Next chunk
			size -= chunkSize;
		}
		// send data to handler
		zSocket.executeWhenQueueIsEmpty(() => {
			handler(values, address);
		});
	}


	/**
	 * Writes a memory dump to zesarux.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 * @param handler(response) The handler that is called when zesarux has received the data.
	 */
	public writeMemoryDump(address: number, dataArray: Uint8Array, handler:() => void) {
		// Use chunks
		const chunkSize = 0x10000; //0x1000;
		let k = 0;
		let size = dataArray.length;
		let chunkCount = 0;
		while(size > 0) {
			const sendSize = (size > chunkSize) ? chunkSize : size;
			// Convert array to long hex string.
			let bytes = '';
			for(let i=0; i<sendSize; i++) {
				bytes += Utility.getHexString(dataArray[k++], 2);
			}
			// Send
			chunkCount ++;
			zSocket.send( 'write-memory-raw ' + address + ' ' + bytes, () => {
				chunkCount --;
				if(chunkCount == 0)
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
	public writeMemory(address:number, value:number, handler:(realValue: number) => void) {
		// Write byte
		zSocket.send( 'write-memory ' + address + ' ' + value, data => {
			// read byte
			zSocket.send( 'read-memory ' + address + ' 1', data => {
				// call handler
				const readValue = parseInt(data,16);
				handler(readValue);
			});
		});
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @param handler(memoryPages) The handler that receives the memory pages list.
	 */
	public getMemoryPages(handler:(memoryPages: MemoryPage[])=>void) {
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

		zSocket.send( 'get-memory-pages verbose', data => {
			const pages: Array<MemoryPage> = [];
			const lines = data.split('\n');
			const len = lines.length;
			let i = 0;
			while(i+4 < len) {
				// Read data
				let name = lines[i+2].substr(12);
				name += ' (' + lines[i+1].substr(11) + ')';
				const startStr = lines[i+3].substr(7);
				const start = Utility.parseValue(startStr);
				const endStr = lines[i+4].substr(5);
				const end = Utility.parseValue(endStr);
				// Save in array
				pages.push({start, end, name});
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
	public setProgramCounter(address: number, handler?:() => void) {
		this.RegisterCache = undefined;
		zSocket.send( 'set-register PC=' + address.toString(16) + 'h', data => {
			if(handler)
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
		if(!state)
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
	public stateRestore(stateData: StateZ80, handler?: ()=>void) {
		// Clear register cache
		this.RegisterCache = undefined;
		// Restore state
		stateData.stateRestore(handler);
	}



	// ZX Next related ---------------------------------


	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @param value(value) Calls 'handler' with the value of the register.
	 */
	public getTbblueRegister(registerNr: number, handler: (value)=>void) {
		zSocket.send('tbblue-get-register ' + registerNr, data => {
			// Value is returned as 2 digit hex number followed by "H", e.g. "00H"
			const valueString = data.substr(0,2);
			const value = parseInt(valueString,16);
			// Call handler
			handler(value);
		});
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @param handler(paletteArray) Calls 'handler' with a 256 byte Array<number> with the palette values.
	 */
	public getTbblueSpritesPalette(paletteNr: number, handler: (paletteArray)=>void) {
		const paletteNrString = (paletteNr == 0) ? 'first' : 'second';
		zSocket.send('tbblue-get-palette sprite ' + paletteNrString + ' 0 256', data => {
			// Palette is returned as 3 digit hex separated by spaces, e.g. "02D 168 16D 000"
			const palette = new Array<number>(256);
			for(let i=0; i<256; i++) {
				const colorString = data.substr(i*4,3);
				const color = parseInt(colorString,16);
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
	public getTbblueSpritesClippingWindow(handler: (xl: number, xr: number, yt: number, yb: number)=>void) {
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
	public getTbblueSprites(slot: number, count: number, handler: (sprites)=>void) {
		zSocket.send('tbblue-get-sprite ' + slot + ' ' + count, data => {
			// Sprites are returned one line per sprite, each line consist of 4x 2 digit hex values, e.g.
			// "00 00 00 00"
			// "00 00 00 00"
			const spriteLines = data.split('\n');
			const sprites = new Array<Uint8Array>();
			for(const line of spriteLines) {
				if(line.length == 0)
					continue;
				const sprite = new Uint8Array(4);
				for(let i=0; i<4; i++) {
					const attrString = line.substr(i*3,2);
					const attribute = parseInt(attrString,16);
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
	public getTbblueSpritePatterns(index: number, count: number, handler: (patterns)=>void) {
		zSocket.send('tbblue-get-pattern ' + index + ' ' + count, data => {
			// Sprite patterns are returned one line per pattern, each line consist of
			// 256x 2 digit hex values, e.g. "E3 E3 E3 E3 E3 ..."
			const patternLines = data.split('\n');
			patternLines.pop();	// Last element is a newline only
			const patterns = new Array<Array<number>>();
			for(const line of patternLines) {
				const pattern = new Array<number>(256);
				for(let i=0; i<256; i++) {
					const attrString = line.substr(i*3,2);
					const attribute = parseInt(attrString,16);
					pattern[i] = attribute;
				}
				patterns.push(pattern);
			}
			// Call handler
			handler(patterns);
		});
	}


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
	 * Calculates the required number of transaction log lines from the
	 * 'history' setting for reverse debugging and code coverage.
	 * @returns -1 = Infinite, 0 = disabled, >0 = number of lines
	 */
	protected numberOfHistoryLines(): number {
		let covRotateLines;
		if(Settings.launch.history.codeCoverageInstructionCountYoung < 0 || Settings.launch.history.codeCoverageInstructionCountElder < 0) {
			covRotateLines = -1;	// infinite
		}
		else {
			covRotateLines = Settings.launch.history.codeCoverageInstructionCountYoung + Settings.launch.history.codeCoverageInstructionCountElder;
		}

		// Number of lines for history
		const rdRotLines = Settings.launch.history.reverseDebugInstructionCount;
		let totRotLines;
		if(covRotateLines < 0 || rdRotLines < 0) {
			totRotLines = -1;	// infinite
		}
		else {
			totRotLines = covRotateLines + rdRotLines;
		}

		// Infinity
		if(totRotLines < 0)
			totRotLines = 0x7FFFFFFF;

		return totRotLines;
	}


	/**
	 * @returns true if either code coverage or reverse debugging is enabled.
	 */
	// TODO: REMOVE
	protected isCpuTransactionLogEnabled(): boolean {
		return Settings.codeCoverageEnabled() || (Settings.launch.history.reverseDebugInstructionCount != 0);
	}


	/**
	 * Clears the instruction history.
	 * For reverse debugging and code coverage.
	 * This will call 'cpu-transaction-log truncate yes' to clear the log in Zesarux.
	 * ZEsarUX has a 'truncaterotated' but this does not remove all log files it just
	 * empties them. And it would also not clear logs bigger than the set rotation.
	 * So that I will not use it but clear the logs on my own.
	 */
	public clearInstructionHistory() {
		// TODO: REMOVE
		super.clearInstructionHistory();
		/*
		zSocket.send('cpu-transaction-log truncate yes');
		if(this.cpuTransactionLog)
			this.cpuTransactionLog.deleteRotatedFiles();
		*/
	}


	/**
	 * @returns Returns the previous line in the transaction log.
	 * If at end it returns undefined.
	 */
	protected async revDbgPrev(): Promise<string|undefined> {
		let line = await this.cpuHistory.getPrevRegisters();
		if(line) {
			// Add to register cache
			this.RegisterCache = line;
			// Add to history for decoration
			const addr = parseInt(line.substr(3,4), 16);
			this.revDbgHistory.push(addr);
		}
		return line;
	}

	/**
	 * @returns Returns the next line in the transaction log.
	 * If at start it returns ''.
	 */
	protected async revDbgNext(): Promise<string|undefined> {
		// Get line
		let line = await this.cpuHistory.getNextRegisters();
		if(line) {
			// Add to register cache
			this.RegisterCache = line;
			// Remove one address from history
			assert(this.revDbgHistory.length > 0);
			this.revDbgHistory.pop();
		}
		return line;
	}
}

