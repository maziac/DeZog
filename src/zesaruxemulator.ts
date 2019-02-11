
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
import { EmulatorClass, MachineType, EmulatorBreakpoint, EmulatorState } from './emulator';
import { StateZ80 } from './statez80';
import { CallSerializer } from './callserializer';



/// Minimum required ZEsarUX version.
const MIN_ZESARUX_VERSION = 7.2;


// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints.
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length.
	static MAX_MESSAGE_CATCH_BREAKPOINT = 4*32-1;	///< breakpoint condition should also be smaller than this.
}




/**
 * The representation of the Z80 machine.
 * It receives the requests from the EmulDebugAdapter and commincates with
 * the EmulConnector.
 */
export class ZesaruxEmulator extends EmulatorClass {

	/// Max count of breakpoints. Note: Number 100 is used for stepOut.
	static MAX_USED_BREAKPOINTS = Zesarux.MAX_ZESARUX_BREAKPOINTS-1;

	/// The breakpoint used for step-out.
	static STEP_BREAKPOINT_ID = 100;

	/// Array that contains free breakpoint IDs.
	private freeBreakpointIds = new Array<number>();

	/// Stores the wpmem watchpoints
	protected watchpoints = new Array<GenericWatchpoint>();


	/// Stores the assert breakpoints
	protected assertBreakpoints = new Array<GenericBreakpoint>();

	/// Stores the log points
	protected logpoints = new Map<string, Array<GenericBreakpoint>>();

	/// The read ZEsarUx version number as float, e.g. 7.1. Is read directly after socket connection setup.
	public zesaruxVersion = 0.0;

	/// We need a serializer for some tasks.
	protected serializer = new CallSerializer('ZesaruxEmulator');


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
	 * @param handler is called after the connection is disconnected.
	 */
	public stop(handler: () => void) {
		// Terminate the socket
		zSocket.quit(handler);
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
			// Error message from Zesarux
			msg = "ZEsarUX: " + msg;
			this.emit('warning', msg);
		});

		zSocket.on('error', err => {
			// and terminate
			err.message += " (Error in connection to ZEsarUX!)";
			this.emit('error', err);
		});
		zSocket.on('close', () => {
			this.listFrames.length = 0;
			this.breakpoints.length = 0;
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			this.emit('error', err);
		});
		zSocket.on('end', () => {
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			this.emit('error', err);
		});
		zSocket.on('connected', () => {
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
				if(machine == 'zx-80')
					this.machineType = MachineType.ZX80;
				else if(machine == 'zx-81')
					this.machineType = MachineType.ZX81;
				else if(machine == 'spectrum 16k')
					this.machineType = MachineType.SPECTRUM16K;
				else if(machine == 'spectrum 48k')
					this.machineType = MachineType.SPECTRUM48K;
				else if(machine == 'spectrum 128k')
					this.machineType = MachineType.SPECTRUM128K;
				else if(machine == 'tbblue')
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
				if(Settings.launch.load)
					zSocket.send('smartload ' + Settings.launch.load);

				// Initialize breakpoints
				this.initBreakpoints();
			});

			// Send 'initialize' to Machine.
			zSocket.executeWhenQueueIsEmpty( () => {
				this.state = EmulatorState.IDLE;
				this.emit('initialized');
			});
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
	 * Retrieve the registers from zesarux.
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	public getRegistersFromEmulator(handler: (registersString: string) => void) {
		// get new data
		zSocket.send('get-registers', data => {
			// convert received data to right format ...
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
	 * @param handler The handler to call when ready.
	 */
	public stackTraceRequest(handler:(frames: RefList)=>void): void {
		// Create a call stack / frame array
		const frames = new RefList();

		// Get current pc
		this.getRegisters(data => {
			// Parse the PC value
			const pc = Z80Registers.parsePC(data);
			const sp = Z80Registers.parseSP(data);
			const lastCallIndex = frames.addObject(new Frame(pc, sp, 'PC'));

			// calculate the depth of the call stack
			const tos = Labels.topOfStack
			var depth = (tos - sp)/2;	// 2 bytes per word
			if(depth>20)	depth = 20;

			// Check if callstack need to be called
			if(depth > 0) {
				// get stack from zesarux
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
	 * tStates contains the number of tStates executed and time is the time it took for execution,
	 * i.e. tStates multiplied with current CPU frequency.
 	 */
	public continue(contStoppedHandler: (data: string, tStates?: number, time?: number)=>void): void {
		// Change state
		this.state = EmulatorState.RUNNING;
		// Reset T-state counter.
		zSocket.send('reset-tstates-partial', data => {
			// Run
			zSocket.sendInterruptable('run', reason => {
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
						// Call handler
						contStoppedHandler(reason, tStates, cpuFreq);
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
	  * 'reverse continue' debugger program execution.
	  * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	  */
	 public reverseContinue(handler:()=>void) : void {
		this.state = EmulatorState.RUNNING;
		this.state = EmulatorState.IDLE;
		// TODO: needs implementation
		// Clear register cache
		this.RegisterCache = undefined;
		handler();
	}

	/**
	 * 'step over' an instruction in the debugger.
	 * @param handler(disasm, tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	 public stepOver(handler:(disasm: string, tStates: number, cpuFreq: number)=>void): void {
		// Zesarux is very special in the 'step-over' behaviour.
		// In case of e.g a 'jp cc, addr' it will never return
		// if the condition is met because
		// it simply seems to wait until the PC reaches the next
		// instruction what, for a jp-instruction, obviously never happens.
		// Therefore a 'step-into' is executed instead. The only problem is that a
		// 'step-into' is not the desired behaviour for a CALL.
		// So we first check if the instruction is a CALL and
		// then either excute a 'step-over' or a step-into'.
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
	public stepInto(handler:(disasm: string, tStates: number, time: number)=>void): void {
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
	protected cpuStepGetTime(cmd: string, handler:(tStates: number, time: number)=>void): void {
		// Reset T-state counter.
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
					});
				});
			});
		});
	}


	/**
	 * 'step out' of current call.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public stepOut(handler:(tStates?: number, cpuFreq?: number)=>void): void {
		// zesarux does not implement a step-out. Therefore we analyze the call stack to
		// find the first return address.
		// Then a breakpoint is created that triggers when the SP changes to  that address.
		// I.e. when the RET (or (RET cc) gets executed.

		// get current stackpointer
		this.getRegisters( data => {
			// Get SP
			const sp = Z80Registers.parseSP(data);

			// calculate the depth of the call stack
			var depth = Labels.topOfStack - sp;
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
											// Reset T-state counter.
											zSocket.send('reset-tstates-partial', data => {
												zSocket.send('run', () => {
													// takes a little while, then step-over RET
													// get T-State counter
													zSocket.send('get-tstates-partial', data => {
														const tStates = parseInt(data);
														// get clock frequency
														zSocket.send('get-cpu-frequency', data => {
															const cpuFreq = parseInt(data);
															// Disable breakpoint
															zSocket.send('disable-breakpoint ' + bpId, () => {
																this.state = EmulatorState.IDLE;
																handler(tStates, cpuFreq);
																return;
															});
														});
													});
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
	  * @param handler The handler that is called after the step is performed.
	  */
	 public stepBack(handler:()=>void): void {
		// TODO: implement step-back
		// Clear register cache
		this.RegisterCache = undefined;
		// Call handler
		handler();
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It uses ZEsarUX new fast 'memory breakpoints' for this if the breakpoint ha no additional condition.
	 * If it has a condition the (slow) original ZEsarUX breakpoints are used.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	protected setWatchpoints(watchPoints: Array<GenericWatchpoint>, handler?: (watchpoints:Array<GenericWatchpoint>) => void) {
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
	 * Sets the watchpoint array.
	 * @param watchPoints A list of addresses to put a guard on.
	 */
	public setWPMEM(watchPoints: Array<GenericWatchpoint>) {
		this.watchpoints = [...watchPoints];
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
	 * Sets the ASSERTs array.
	 * @param assertBreakpoints A list of addresses to put a guard on.
	 */
	public setASSERT(assertBreakpoints: Array<GenericBreakpoint>) {
		this.assertBreakpoints = [...assertBreakpoints];
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
		handler();
	}


	/**
	 * Sets the LOGPOINTs array.
	 * @param logpoints A list of addresses with messages to put a logpoint on.
	 */
	public setLOGPOINT(logpoints: Map<string, Array<GenericBreakpoint>>) {
		this.logpoints = logpoints;
		this.logpointsEnabled = new Map<string, boolean>();
		// All groups:
		for (const [group] of this.logpoints) {
			this.logpointsEnabled.set(group, false);
		}
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
		handler();
	}


	/**
	 * Converts a condition into the special format that ZEsarUX uses.
	 * Please note that longer complex forms are not possible with zesarux
	 * because it does not support parenthesis and just evaluates one
	 * after the other.
	 * @param condition The general condition format, e.g. "A < 10 && HL != 0".
	 * Format "variable comparison value" (variable=register)
	 * @returns The zesarux format
	 */
	protected convertCondition(condition: string): string|undefined {
		if(!condition || condition.length == 0)
			return '';	// No condition

		const regex = /([a-z]+)\s*([<>=!]+)\s*([0-9]*)\s*(\|\||&&*)?/gi;
		let conds = '';
		let match;
		while((match = regex.exec(condition))) {
			// Get arguments
			let varString = match[1] || "";
			varString = varString.trim();
			let compString = match[2] || "";
			compString = compString.trim();
			let valueString = match[3] || "";
			valueString = valueString.trim();
			let concatString = match[4] || "";
			concatString = concatString.trim();

			// Convert comparison
			// ZEsarUX can recognize <,>,=,/ (/ means not equal).
			assert(compString.length>0);
			let resComp;
			switch(compString) {
				// > :
				case '<=':	resComp = '<'; valueString = '('+valueString+')'+'+1'; break;
				// < :
				case '>=':	resComp = '>'; valueString = '('+valueString+')'+'-1'; break;
				// != :
				case '==':	resComp = '='; break;
				// == :
				case '!=':	resComp = '/'; break;
				default:	resComp = compString; break;
			}
			assert(resComp);	// Otherwise unknown comparison
			assert(resComp.length == 1);

			// Convert value
			const value = eval(valueString);

			// Create zesarux condition
			const zesaruxCondition = varString + resComp + value.toString();

			// Handle concatenation
			let resConcat = '';
			if(concatString.length > 0) {
				if(concatString == "&&")
					resConcat = " and ";
				else if(concatString == "||")
					resConcat = " or ";
				assert(resConcat.length > 0);
			}
			conds += zesaruxCondition + resConcat;
		}

		if(conds.length == 0)
			return undefined;

		return conds;
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint. If bp.address is >= 0 then it adds the condition "PC=address".
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	protected setBreakpoint(bp: EmulatorBreakpoint): number {
		// Check for logpoint (not supported)
		if(bp.log) {
			this.emit('warning', 'ZEsarUX does not support logpoints ("' + bp.log + '"). Instead a normal breakpoint is set.');
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// Get condition
		const zesaruxCondition = this.convertCondition(bp.condition);
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
			if(zesaruxCondition.length > 0)
				condition += ' and ';
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
		while(size > 0) {
			const sendSize = (size > chunkSize) ? chunkSize : size;
			// Convert array to long hex string.
			let bytes = '';
			for(let i=0; i<sendSize; i++) {
				bytes += Utility.getHexString(dataArray[k++], 2);
			}
			// Send
			zSocket.send( 'write-memory-raw ' + address + ' ' + bytes);
			// Next chunk
			size -= chunkSize;
		}
		// call when ready
		zSocket.executeWhenQueueIsEmpty(() => {
			handler();
		});

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
	 * Change the program counter.
	 * @param address The new address for the program counter.
	 * @param handler that is called when the PC has been set.
	 */
	public setProgramCounter(address: number, handler:() => void) {
		this.RegisterCache = undefined;
		zSocket.send( 'set-register PC=' + address.toString(16) + 'h', data => {
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

}

