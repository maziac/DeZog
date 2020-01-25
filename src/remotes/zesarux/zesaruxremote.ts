import * as assert from 'assert';
import { zSocket, ZesaruxSocket } from './zesaruxsocket';
import { Utility } from '../../utility';
import { Labels } from '../../labels';
import { Settings } from '../../settings';
import { RefList } from '../../reflist';
import { Log } from '../../log';
import { Frame } from '../../frame';
import { GenericWatchpoint, GenericBreakpoint } from '../../genericwatchpoint';
import { RemoteClass, MachineType, EmulatorBreakpoint, EmulatorState, MemoryPage } from '../remote';
import { StateZ80 } from '../../statez80';
import { CallSerializer } from '../../callserializer';
import { ZesaruxCpuHistory } from './zesaruxcpuhistory';
import { Z80Registers } from '../../z80registers';
import { ZesaruxRegisters } from './zesaruxregisters';



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
export class ZesaruxRemote extends RemoteClass {

	/// Max count of breakpoints. Note: Number 100 is used for stepOut.
	static MAX_USED_BREAKPOINTS = Zesarux.MAX_ZESARUX_BREAKPOINTS-1;

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
	protected reverseDbgStack: RefList;

	/// We need a serializer for some tasks.
	protected serializer = new CallSerializer('ZesaruxEmulator');

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;

	/// A simple pointer to z80Registers. Just to avoid the typing for the casting.
	protected zesaruxRegisters: ZesaruxRegisters;

	/// Constructor.
	constructor() {
		super();
		// Create z80 registers instance that deals with the ZEsarUX specific format.
		this.zesaruxRegisters = new ZesaruxRegisters();
		this.z80Registers = this.zesaruxRegisters;
		// Reverse debugging / CPU history
		this.cpuHistory = new ZesaruxCpuHistory(this.zesaruxRegisters);
	}


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
		this.clearInstructionHistory();
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
	protected getRegistersFromEmulator(): Promise<void>  {
		// Check if in reverse debugging mode
		// In this mode registersCache should be set and thus this function is never called.
		assert(this.cpuHistory);
		assert(!this.cpuHistory.isInStepBackMode());

		return new Promise<void>(resolve => {
			// Get new (real emulator) data
			zSocket.send('get-registers', data => {
				// convert received data to right format ...
				// data is e.g: "PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0 """
				this.zesaruxRegisters.setCache(data);
				resolve();
			});
		});
	}


	/**
	* Gets the registers from cache. If cache is empty retrieves the registers from
	* the emulator.
	* @param handler(registersString) Passes 'registersString' to the handler.
	*/
	public getRegisters(): Promise<void> {
		if (this.zesaruxRegisters.getCache()) {
			// Already exists, return immediately
			return new Promise<void>(resolve => {
				resolve();
			});
		}
		else {
			// get new data
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
	public setRegisterValue(register: string, value: number): Promise<number> {
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
	/*
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
*/

	/**
	 * Returns the contents of (addr+1).
	 * It assumes that at addr there is a "CALL calladdr" instruction and it returns the
	 * callAddr.
	 * It retrieves the memory contents at addr+1 and calls 'handler' with the result.
	 * @param addr The address.
	 * @param handler(callAddr) The handler is called at the end of the function with the called address.
	 */
	protected getCallAddress(addr: number, handler:(callAddr: number)=>void) {
		// Get the 3 bytes before address.
		zSocket.send( 'read-memory ' + (addr+1) + ' 2', data => { // retrieve calladdr
			// Get low byte
			const lowByte = parseInt(data.substr(0,2),16);
			// Get high byte
			const highByte = parseInt(data.substr(2,2),16);
			// Calculate address
			const callAddr = (highByte<<8) + lowByte;
			// Call handler
			handler(callAddr);
		});
	}


	/**
	 * Returns the address of (addr).
	 * It assumes that at addr there is a "RST p" instruction and it returns the
	 * callAddr, i.e. p.
	 * It retrieves the memory contents at addr, extract p and calls 'handler' with the result.
	 * @param addr The address.
	 * @param handler(callAddr) The handler is called at the end of the function with the called address.
	 */
	protected getRstAddress(addr: number, handler:(callAddr: number)=>void) {
		// Get the 3 bytes before address.
		zSocket.send( 'read-memory ' + (addr) + ' 1', data => { // retrieve p
			// Get low byte
			const p = parseInt(data.substr(0,2),16) & 0b00111000;
			// Call handler
			handler(p);
		});
	}


	/**
	 * Helper function to prepare the callstack for vscode.
	 * Check if the
	 * The function calls itself recursively.
 	 * Uses the zesarux 'extended-stack' feature. I.e. each data on the stack
	 * also has a type, e.g. push, call, rst, interrupt. So it is easy to tell which
	 * are the call addresses and even when an interrupt starts.
	 * Interrupts will be shown in a different 'thread'.
	 * An 'extended-stack' response from ZEsarUx looks like:
	 * 15F7H maskable_interrupt
	 * FFFFH push
	 * 15E1H call
	 * 0000H default
	 * @param frames The array that is sent at the end which is increased every call.
	 * @param zStack The original zesarux stack frame. Each line in zStack looks like "FFFFH push" or "15E1H call"
	 * @param address The address of the instruction, for the first call this is the PC.
	 * For the other calls this is retAddr-3 or similar.
	 * @param index The index in zStack. Is increased with every call.
	 * @param zStackAddress The stack start address (the SP).
	 * @param handler The handler to call when ready.
	 */
	private setupCallStackFrameArray(frames: RefList, zStack: Array<string>, address: number, index: number, zStackAddress: number, handler:(frames: Array<Frame>)=>void) {

		// Check for last frame
		if(index >= zStack.length) {
			// Top frame
			const sp = zStackAddress+2*index;
			frames.addObject(new Frame(address, sp, this.getMainName(sp)));
			// Use new frames
			this.listFrames = frames;
			// call handler
			handler(frames);
			return;
		}

		// Split address and type
		const addrTypeString = zStack[index];
		const retAddr = parseInt(addrTypeString,16);
		const type = addrTypeString.substr(6);

		// Check for CALL or RST
		let k = 0;
		let func;
		if(type == "call") {
			k = 3;	// Opcode length for CALL
			func = this.getCallAddress;
		}
		else if(type == "rst") {
			k = 1;	// Opcode length range for RST
			func = this.getRstAddress;
		}
		else if(type.includes("interrupt")) {
			// Find pushed values
			const stack = new Array<number>();
			for(let l=index-1; l>=0; l--) {
				const addrTypeString = zStack[l];
				if(!addrTypeString.includes('push'))
					break;	// Until something else than PUSH is found
				const pushedValue = parseInt(addrTypeString,16);
				stack.push(pushedValue);
			}
			// Save
			const frame = new Frame(address, zStackAddress+2*(index-1), this.getInterruptName());
			frame.stack = stack;
			frames.addObject(frame);
			// Call recursively
			this.setupCallStackFrameArray(frames, zStack, retAddr, index+1, zStackAddress, handler);
			return;
		}

		// Check if we need to add something to the callstack
		if(func) {
			const callerAddr = retAddr-k;
			func(callerAddr, callAddr => {
				// Now find label for this address
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
				// Find pushed values
				const stack = new Array<number>();
				for(let l=index-1; l>=0; l--) {
					const addrTypeString = zStack[l];
					if(!(addrTypeString.includes('push') || addrTypeString.includes('default')))
						break;	// Until something else than PUSH or default is found
					const pushedValue = parseInt(addrTypeString,16);
					stack.push(pushedValue);
				}
				// Save
				const frame = new Frame(address, zStackAddress+2*(index-1), labelCallAddr)
				frame.stack = stack;
				frames.addObject(frame);
				// Call recursively
				this.setupCallStackFrameArray(frames, zStack, callerAddr, index+1, zStackAddress, handler);
			});
		}
		else {
			// Neither CALL nor RST.
			// Call recursively
			this.setupCallStackFrameArray(frames, zStack, address, index+1, zStackAddress, handler);
		}
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
	 * Uses the zesarux 'extended-stack' feature. I.e. each data on the stack
	 * also has a type, e.g. push, call, rst, interrupt. So it is easy to tell which
	 * are the call addresses and even when an interrupt starts.
	 * Interrupts will be shown in a different 'thread'.
	 * An 'extended-stack' response from ZEsarUx looks like:
	 * 15F7H maskable_interrupt
	 * FFFFH push
	 * 15E1H call
	 * 0000H default
	 *
	 * Note: I'm not using the "pure" extended stack from zesarux but a mixture
	 * of the extended stack and the real stack.
	 * The extended stack values are good for CALL/RST/interrupt but for PUSH/DEFAULT
	 * it contains the values during e.g. the PUSH. For DEFAULT it contains undefined
	 * values.
	 * So I'm using the real stack values for PUSH and DEFAULT.
	 * @param handler The handler to call when ready.
	 */
	public realStackTraceRequest(handler:(frames: RefList)=>void): void {
		// Create a call stack / frame array
		const frames = new RefList();

		// Get current pc
		this.getRegisters().then(() => {
			// Parse the PC value
			const pc = this.z80Registers.getPC();
			const sp = this.z80Registers.getSP();
			// calculate the depth of the call stack
			const tos = this.topOfStack
			var depth = (tos - sp)/2;	// 2 bytes per word
			if(depth>ZesaruxRemote.MAX_STACK_ITEMS)
				depth = ZesaruxRemote.MAX_STACK_ITEMS;

			// Special handling if stack depth is 0
			if(depth <= 0) {
				const zStack = new Array<string>();
				this.setupCallStackFrameArray(frames, zStack, pc, 0, sp, handler);
				return;
			}

			// Get normal stack, e.g. "02C9H 0404H 80F8H 0403H 0302H 0201H 8147H 0000H 0000H 0000H"
			zSocket.send('get-stack-backtrace ' + depth, data => {
				const rStack = data.split(' ');
				// Get 'extended-stack' from zesarux
				zSocket.send('extended-stack get ' + depth, data => {
					Log.log('Call stack: ' + data);
					data = data.replace(/\r/gm, "");
					const zStack = data.split('\n');
					const len = zStack.length-1;
					zStack.splice(len);	// ignore last (is empty)
					// Mix stacks
					for(let i=0; i<len; i++) {
						const type = zStack[i].substr(6);
						// if not CALL, RST or interrupt
						if(!(type.includes('call') || type.includes('rst') || type.includes('interrupt'))) {
							zStack[i] = rStack[i] + ' ' + zStack[i].substr(6);
						}
					}
					// Rest of callstack
					this.setupCallStackFrameArray(frames, zStack, pc, 0, sp, handler);
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
	public async continue(contStoppedHandler: (reason: string, tStates?: number, time?: number)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Continue in reverse debugging
			// Will run until after the first of the instruction history
			// or until a breakpoint condition is true.

			let nextLine;
			let reason;
			try {
				//this.state = EmulatorState.RUNNING;
				//this.state = EmulatorState.IDLE;

				// Get current line
				let currentLine: string = this.zesaruxRegisters.getCache();
				assert(currentLine);

				// Loop over all lines, reverse
				while(true) {
					// Handle stack
					nextLine = this.revDbgNext();
					if(!nextLine)
						break;
					// TODO: wharscheinlcih kann ich ganz auf currentLine verzichten, wenn ich statdessen RegiterCache verwende.
					this.handleReverseDebugStackForward(currentLine, nextLine);

					// Check for breakpoint
					this.zesaruxRegisters.setCache(nextLine);
					const condition = this.checkPcBreakpoints(nextLine);
					if(condition != undefined) {
						reason = condition;
						break;	// BP hit and condition met.
					}

					// Next
					currentLine = nextLine;
				}
			}
			catch(e) {
				reason = 'Error occurred: ' + e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Return if next line is available, i.e. as long as we did not reach the start.
			// Otherwise get the callstack from ZEsarUX.
			if(nextLine) {
				// Call handler
				contStoppedHandler(reason, undefined, undefined);
			}
			else {
				// Get the registers etc. from ZEsarUX
				this.zesaruxRegisters.clearCache();
				this.getRegisters().then(() => {
					const pc = this.getPC();
					reason = 'Break at PC=' + Utility.getHexString(pc,4) + 'h: Reached start of instruction history.';
					contStoppedHandler(reason, undefined, undefined);
				});
			}

			return;
		}

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();
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
						this.zesaruxRegisters.clearCache();
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
		if(reason && reason.startsWith('Break'))
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
		if(this.topOfStack) {
			const diff = this.topOfStack - sp;
			if(diff != 0) {
				if(diff > 0)
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
			let sp = this.zesaruxRegisters.parseSP(currentLine);
			const opcodes = this.cpuHistory.getOpcodes(currentLine);
			const flags = this.zesaruxRegisters.parseAF(currentLine);

			// Check if there is at least one frame
			let frame = this.reverseDbgStack[0];
			if(!frame) {
				 // Create new stack entry if none exists
				 // (could happen in errorneous situations if there are more RETs then CALLs)
				 frame = new Frame(0, sp, this.getMainName(sp));
				 this.reverseDbgStack.unshift(frame);
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
					if(this.cpuHistory.isCallOpcode(firstByte)) {
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
					const prevSP = this.zesaruxRegisters.parseSP(prevLine);
					if(expectedPrevSP != prevSP) {
						// We came from an interrupt. Remove interrupt address from call stack.
						this.reverseDbgStack.shift();
					}

					// And push to stack
					const pc = this.zesaruxRegisters.parsePC(currentLine);
					const frame = new Frame(pc, sp, labelCallAddr);
					this.reverseDbgStack.unshift(frame);

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
			const spPrev = this.zesaruxRegisters.parseSP(prevLine);
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
						this.reverseDbgStack.shift();
						count -= 2;
						// get next frame if countRemove still > 0
						frame = this.reverseDbgStack[0];
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
			const pc = this.zesaruxRegisters.parsePC(currentLine)
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
	protected handleReverseDebugStackForward(currentLine: string, nextLine: string): Promise<void> {
		assert(currentLine);
		assert(nextLine);
		//console.log("currentLine");
		//console.log(currentLine);
		//console.log("nextLine");
		//console.log(nextLine);

		return new Promise<void>( resolve => {
			// Get some values
			const nextSP = this.zesaruxRegisters.parseSP(nextLine);
			let sp = this.zesaruxRegisters.parseSP(currentLine);
			let expectedSP: number|undefined = sp;
			let expectedPC;
			const opcodes = this.cpuHistory.getOpcodes(currentLine);
			const flags = this.zesaruxRegisters.parseAF(currentLine);

			// Check if there is at least one frame
			let frame = this.reverseDbgStack[0];
			if(!frame) {
				// Create new stack entry if none exists
				// (could happen in errorneous situations if there are more RETs then CALLs)
				frame = new Frame(0, sp, this.getMainName(sp));
				this.reverseDbgStack.unshift(frame);
			}

			// Check for CALL (CALL cc)
			if(this.cpuHistory.isCallAndExecuted(opcodes, flags)) {
				sp -= 2;	// CALL pushes to the stack
				expectedSP = sp;
				// Now find label for this address
				const callAddrStr = opcodes.substr(2,4);
				const callAddr = this.cpuHistory.parse16Address(callAddrStr);
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
				const name = labelCallAddr;
				frame = new Frame(0, nextSP-2, name);	// pc is set later anyway
				this.reverseDbgStack.unshift(frame);
			}
			// Check for RST
			else if(this.cpuHistory.isRst(opcodes)) {
				sp -= 2;	// RST pushes to the stack
				expectedSP = sp;
				// Now find label for this address
				const callAddr = this.cpuHistory.getRstAddress(opcodes);
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : Utility.getHexString(callAddr,4)+'h';
				const name = labelCallAddr;
				frame = new Frame(0, nextSP-2, name);	// pc is set later anyway
				this.reverseDbgStack.unshift(frame);
			}
			else {
				// Check for PUSH
				const pushedValue = this.cpuHistory.getPushedValue(opcodes, currentLine);
				if(pushedValue != undefined) {	// Is undefined if not a PUSH
					// Push to frame stack
					frame.stack.unshift(pushedValue);
					sp -= 2;	// PUSH pushes to the stack
					expectedSP = sp;
				}
				// Check for POP
				else if(this.cpuHistory.isPop(opcodes)
					|| this.cpuHistory.isRetAndExecuted(opcodes, flags)) {
					expectedSP += 2;	// Pop from the stack
				}
				// Otherwise calculate the expected SP
				else {
					expectedSP = this.cpuHistory.calcDirectSpChanges(opcodes, sp, currentLine);
					if(expectedSP == undefined) {
						// This means: Opcode was LD SP,(nnnn).
						// So use PC instead to check.
						const pc = this.zesaruxRegisters.parsePC(currentLine);
						expectedPC = pc + 4;	// 4 = size of instruction
					}
				}
			}

			// Check for interrupt. Either use SP or use PC to check.
			let interruptFound = false;
			const nextPC = this.zesaruxRegisters.parsePC(nextLine);
			if(expectedSP != undefined) {
				// Use SP for checking
				if(nextSP == expectedSP-2)
					interruptFound = true;
			}
			else {
				// Use PC for checking
				assert(expectedPC);
				if(nextPC != expectedPC)
					interruptFound = true;
			}

			// Check if SP has increased (POP/RET)
			let usedSP = expectedSP;
			if(!usedSP)
				usedSP = this.zesaruxRegisters.parseSP(nextLine);
			let count = usedSP - sp;
			if(count > 0) {
				while(count > 1 && this.reverseDbgStack.length > 0) {
					// First remove the data stack
					while(count > 1 && frame.stack.length > 0) {
						// Pop from stack
						frame.stack.pop();
						count -= 2;
					}
					// Now remove callstack
					if(count > 1) {
						this.reverseDbgStack.shift();
						count -= 2;
						// get next frame if countRemove still > 0
						frame = this.reverseDbgStack[0];
					}
				}
			}
			else {
				// Decreased. Put something on the stack
				while(count < -1) {
					// Push something unknown to the stack
					frame.stack.push(undefined);
					count += 2;
				}
			}

			// Interrupt
			if(interruptFound) {
				// Put nextPC on callstack
				const name = this.getInterruptName();
				frame = new Frame(0, nextSP, name);	// pc is set later anyway
				this.reverseDbgStack.unshift(frame);
			}

			// Adjust PC within frame
			frame.addr = nextPC;

			// End
			resolve();
		});
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 */
	public reverseContinue(handler:(breakReason: string)=>void) {
		// Make sure the call stack exists
		this.prepareReverseDbgStack(async () => {
			let breakReason;
			try {
				// Loop over all lines, reverse
				let prevLine = this.zesaruxRegisters.getCache();
				assert(prevLine);
				while(true) {
					// Get line
					const currentLine = await this.revDbgPrev();
					if(!currentLine) {
						breakReason = 'Break: Reached end of instruction history.';
						break;
					}

					// Stack handling:
					await this.handleReverseDebugStackBack(currentLine, prevLine);

					// Check for breakpoint
					this.zesaruxRegisters.setCache(currentLine);
					const condition = this.checkPcBreakpoints(currentLine);
					if(condition != undefined) {
						breakReason = condition;
						break;	// BP hit and condition met.
					}

					// Next
					prevLine = currentLine;
				}

			}
			catch(e) {
				breakReason = 'Break: Error occurred: ' + e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
			handler(breakReason);
		});
	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @param handler(disasm, tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	 public async stepOver(handler:(disasm: string, tStates?: number, cpuFreq?: number, breakReason?: string)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Get current line
			let currentLine = this.zesaruxRegisters.getCache();
			assert(currentLine);
			let nextLine;

			// Check for CALL/RST. If not do a normal step-into.
			// If YES stop if pc reaches the next instruction.
			const opcodes = this.cpuHistory.getOpcodes(currentLine);
			const opcode0 = parseInt(opcodes.substr(0,2), 16);
			let pc = this.zesaruxRegisters.parsePC(currentLine);
			let nextPC0;
			let nextPC1;
			if(this.cpuHistory.isCallOpcode(opcode0)) {
				nextPC0 = pc+3;
				nextPC1 = nextPC0;
			}
			else if(this.cpuHistory.isRstOpcode(opcode0)) {
				nextPC0 = pc+1;
				nextPC1 = nextPC0+1;	// If return address is adjusted
			}

			let breakReason;
			try {
				// Find next line with same SP
				while(true) {
					// Get next line
					nextLine = this.revDbgNext();
					if(!nextLine) {
						breakReason = 'Break: Reached start of instruction history.'
						break;	// At end of reverse debugging. Simply get the real call stack.
					}

					// Handle reverse stack
					this.handleReverseDebugStackForward(currentLine, nextLine);

					// Check if next instruction is required
					if(nextPC0 == undefined)
						break;	// A simple step-into

					// Get PC
					pc = this.zesaruxRegisters.parsePC(nextLine);
					// Check for "breakpoint"
					if(pc == nextPC0 || pc == nextPC1)
						break;

					// Check for "real" breakpoint
					this.zesaruxRegisters.setCache(nextLine);
					const condition = this.checkPcBreakpoints(nextLine);
					if(condition != undefined) {
						breakReason = condition;
						break;	// BP hit and condition met.
					}

					// Next
					currentLine = nextLine as string;
				}
			}
			catch(e) {
				breakReason = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
			const instruction =  '  ' + Utility.getHexString(pc, 4) + ' ' + this.cpuHistory.getInstruction(currentLine);
			handler(instruction, undefined, undefined, breakReason);

			// Return if next line is available, i.e. as long as we did not reach the start.
			// Otherwise get the callstack from ZEsarUX.
			if(!nextLine) {
				// Get the registers etc. from ZEsarUX
				this.zesaruxRegisters.clearCache();
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
			const pc = this.z80Registers.getPC();
			zSocket.send('disassemble ' + pc, disasm => {
				// Check if this was a "CALL something" or "CALL n/z,something"
				const opcode = disasm.substr(7,4);

				// For RST and CALL we break when SP reaches the current SP again.
				// This is better than setting a PC breakpoint. A PC breakpoint is maybe never
				// reached if the stack is manipulated.
				// A SP breakpoint might be hit when the stack is being manipulated, but at least it
				// is hit and does not run forever.
				if(opcode == "RST " || opcode == "CALL") {
					// Set condition
					const sp = this.zesaruxRegisters.getSP();
					const condition = 'SP>=' + sp;
					// We do a "run" instead of a step-into/over
					// Set action first (no action).
					const bpId = ZesaruxRemote.STEP_BREAKPOINT_ID;
					// Clear register cache
					this.zesaruxRegisters.clearCache();
					// Note "prints" is required, so that a normal step over will not produce a breakpoint decoration.
					zSocket.send('set-breakpointaction ' + bpId + ' prints step-over', () => {
						// set the breakpoint
						zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
							// enable breakpoint
							zSocket.send('enable-breakpoint ' + bpId, () => {
								// Run
								this.state = EmulatorState.RUNNING;
								this.cpuStepGetTime('run', (tStates, cpuFreq, breakReason) => {
									// Disable breakpoint
									zSocket.send('disable-breakpoint ' + bpId, () => {
										this.state = EmulatorState.IDLE;
										handler(disasm, tStates, cpuFreq, breakReason);
									});
								});
							});
						});
					});
				}
				else {
					// "normal" opcode, just check for repetitive ones
					const cmd = (opcode=="LDIR" || opcode=="LDDR" || opcode=="CPIR" || opcode=="CPDR") ? 'cpu-step-over' : 'cpu-step';
					// Clear register cache
					this.zesaruxRegisters.clearCache();
					// Step
					this.cpuStepGetTime(cmd, (tStates, cpuFreq, breakReason) => {
						// Call handler
						handler(disasm, tStates, cpuFreq, breakReason);
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
			// Get current line
			let currentLine = this.zesaruxRegisters.getCache();
			assert(currentLine);
			let nextLine;

			let errorText;
			try {
				// Get next line
				nextLine = this.revDbgNext();
				if(nextLine) {
					// Handle reverse stack
					this.handleReverseDebugStackForward(currentLine, nextLine);
				}
			}
			catch(e) {
				errorText = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
			const pc = this.zesaruxRegisters.getPC();
			const instruction =  '  ' + Utility.getHexString(pc, 4) + ' ' + this.cpuHistory.getInstruction(currentLine);
			handler(instruction, undefined, undefined, errorText);

			// Return if next line is available, i.e. as long as we did not reach the start.
			// Otherwise get the callstack from ZEsarUX.
			if(!nextLine) {
				// Get the registers etc. from ZEsarUX
				this.zesaruxRegisters.clearCache();
				this.getRegisters();
			}
			return;
		}

		// Make sure that reverse debug stack is cleared
		this.clearReverseDbgStack();

		// Normal step into.
		this.getRegisters().then(() => {
			const pc = this.zesaruxRegisters.getPC();
			zSocket.send('disassemble ' + pc, disasm => {
				// Clear register cache
				this.zesaruxRegisters.clearCache();
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
	 * 'step out' of current call.
	 * @param handler(tStates, cpuFreq, breakReason) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async stepOut(handler:(tStates?: number, cpuFreq?: number, breakReason?: string)=>void) {
		// Check for reverse debugging.
		if(this.cpuHistory.isInStepBackMode()) {
			// Step out will run until the start of the cpu history
			// or until a "RETx" is found (one behind).
			// To make it more complicated: this would falsely find a RETI event
			// if stepout was not started from the ISR.
			// To overcome this also the SP is observed. And we break only if
			// also the SP is lower/equal to when we started.

			// Get current line
			let currentLine = this.zesaruxRegisters.getCache();
			assert(currentLine);
			let nextLine;
			const startSP = this.zesaruxRegisters.getSP();
			let breakReason;
			try {
				// Find next line with same SP
				while(true) {
					// Get next line
					nextLine = this.revDbgNext();
					if(!nextLine) {
						breakReason = 'Break: Reached start of instruction history.';
						break;	// At end of reverse debugging. Simply get the real call stack.
					}

					// Handle reverse stack
					this.handleReverseDebugStackForward(currentLine, nextLine);

					// Check for RET(I/N)
					const flags = this.zesaruxRegisters.parseAF(currentLine);
					const opcodes = this.cpuHistory.getOpcodes(currentLine);
					if(this.cpuHistory.isRetAndExecuted(opcodes, flags)) {
						// Read SP
						const sp = this.zesaruxRegisters.parseSP(nextLine);
						// Check SP
						if(sp > startSP) {
							break;
						}
					}

					// Check for breakpoint
					this.zesaruxRegisters.setCache(nextLine);
					const condition = this.checkPcBreakpoints(nextLine);
					if(condition != undefined) {
						breakReason = condition;
						break;	// BP hit and condition met.
					}

					// Next
					currentLine = nextLine as string;
				}
			}
			catch(e) {
				breakReason = e;
			}

			// Decoration
			this.emitRevDbgHistory();

			// Call handler
			handler(undefined, undefined, breakReason);

			// Return if next line is available, i.e. as long as we did not reach the start.
			// Otherwise get the callstack from ZEsarUX.
			if(!nextLine) {
				// Get the registers etc. from ZEsarUX
				this.zesaruxRegisters.clearCache();
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
			const sp = this.zesaruxRegisters.getSP();

			// calculate the depth of the call stack
			var depth = this.topOfStack - sp;
			if(depth>ZesaruxRemote.MAX_STACK_ITEMS)
				depth = ZesaruxRemote.MAX_STACK_ITEMS;
			if(depth == 0) {
				// no call stack, nothing to step out, i.e. immediately return
				handler(undefined, undefined, "Call stack empty");
				return;
			}
			else if(depth < 0) {
				// Callstack corrupted?
				handler(undefined, undefined, "SP above topOfStack. Stack corrupted?");
				return;
			}

			// get stack from zesarux
			zSocket.send('extended-stack get '+depth, data => {
				data = data.replace(/\r/gm, "");
				const zStack = data.split('\n');
				zStack.splice(zStack.length-1);	// ignore last (is empty)

				// Loop through stack:
				let bpSp = sp;
				for(const addrTypeString of zStack) {
					// Increase breakpoint address
					bpSp += 2;
					// Split address and type
					const type = addrTypeString.substr(6);
					if(type == "call" || type == "rst" || type.includes("interrupt")) {
						//const addr = parseInt(addrTypeString,16);
						// Caller found, set breakpoint: when SP gets 2 bigger than the current value.
						// Set action first (no action).
						const bpId = ZesaruxRemote.STEP_BREAKPOINT_ID;
						zSocket.send('set-breakpointaction ' + bpId + ' prints step-out', () => {
							// Set the breakpoint.
							// Note: PC=PEEKW(SP-2) finds an executed RET.
							const condition = 'PC=PEEKW(SP-2) AND SP>=' + bpSp;
							zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
								// Enable breakpoint
								zSocket.send('enable-breakpoint ' + bpId, () => {

									// Clear register cache
									this.zesaruxRegisters.clearCache();
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
	  * @param handler(instruction, breakReason) The handler that is called after the step is performed.
	  * instruction: e.g. "081C NOP"
	  * breakReason: If not undefined it holds the break reason message.
	  */
	 public stepBack(handler:(instruction: string, breakReason: string)=>void) {
		// Make sure the call stack exists
		this.prepareReverseDbgStack(async () => {
			let breakReason;
			let instruction = '';
			try {
				// Remember previous line
				let prevLine = this.zesaruxRegisters.getCache();
				assert(prevLine);
				const currentLine = await this.revDbgPrev();
				if(currentLine) {
					// Stack handling:
					await this.handleReverseDebugStackBack(currentLine, prevLine);
					// Get instruction
					const pc = this.zesaruxRegisters.getPC();
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
			handler(instruction, breakReason);
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
	public enableWPMEM(enable: boolean, handler?: () => void) {
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
	public enableAssertBreakpoints(enable: boolean, handler?: () => void) {
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
	public enableLogpoints(group: string, enable: boolean, handler?: () => void) {
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
			this.emit('warning', 'ZEsarUX does not support logpoints ("' + bp.log + '").');
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
	 * Returns the breakpoint at the given address.
	 * Note: Checks only breakpoints with a set 'address'.
	 * @param regs The registers as string, e.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf"
	 * @returns A string with the reason. undefined if no breakpoint hit.
	 */
	// TODO: da ich RegisterCache soweoso vorher setze, kann ich mir "regs" sparen.
	// Vielleicht kann ich sogar auf die ganzen parseXX Funktionen verzichten, bzw. auf den data parameter.
	protected checkPcBreakpoints(regs: string): string|undefined {
		assert(this.zesaruxRegisters.getCache());
		let condition;
		const pc = this.zesaruxRegisters.getPC();
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
		this.zesaruxRegisters.clearCache();
		this.clearReverseDbgStack();
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
		this.zesaruxRegisters.clearCache();
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
	protected async revDbgPrev(): Promise<string|undefined> {
		const line = await this.cpuHistory.getPrevRegistersAsync();
		if(line) {
			// Add to register cache
			this.zesaruxRegisters.setCache(line);
			// Add to history for decoration
			const addr = this.zesaruxRegisters.getPC();
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
		this.zesaruxRegisters.setCache(line);
		// Remove one address from history
		this.revDbgHistory.pop();
		return line;
	}
}

