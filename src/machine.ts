

//import { basename } from 'path';
import { zSocket, NO_TIMEOUT } from './zesaruxSocket';
import { Z80Registers } from './z80Registers';
import { Utility } from './utility';
import { Labels } from './labels';
import { Settings } from './settings';
//import { CallSerializer } from './callserializer';
import { RefList } from './reflist';
import { Log } from './log';
//import { /*ShallowVar,*/ DisassemblyVar, RegistersMainVar, RegistersSecondaryVar, StackVar, LabelVar } from './shallowvar';
import { Frame } from './frame';
import { EventEmitter } from 'events';
import { MachineBreakpoint } from './machine';
import { GenericWatchpoint } from './genericwatchpoint';


// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length
}


// Set to true to disable breakpoints.
//const DBG_DISABLE_BREAKPOINTS = true;
const DBG_DISABLE_BREAKPOINTS = false;


/**
 * The breakpoint representation.
 */
export interface MachineBreakpoint {
	bpId: number;	/// The breakpoint ID/number
	filePath: string;	/// The file to which the breakpoint belongs
	lineNr: number;	/// The line number in the file starting at 0
	condition: string;	/// Usually the pc value (e.g. "PC=0A7f")
}


/// The machine type, e.g. ZX81, Spectrum 16k, Spectrum 128k, etc.
/// NOT USED:
export enum MachineType {
	UNKNOWN = 0,
	ZX80,
	ZX81,
	SPECTRUM16K,
	SPECTRUM48K,
	SPECTRUM128K

/*
	MK14     MK14
	ZX80     ZX-80
	ZX81     ZX-81
	16k      Spectrum 16k
	48k      Spectrum 48k
	128k     Spectrum 128k
	QL       QL
	P2       Spectrum +2
	P2F      Spectrum +2 (French)
	P2S      Spectrum +2 (Spanish)
	P2A40    Spectrum +2A (ROM v4.0)
	P2A41    Spectrum +2A (ROM v4.1)
	P2AS     Spectrum +2A (Spanish)
	P340     Spectrum +3 (ROM v4.0)
	P341     Spectrum +3 (ROM v4.1)
	P3S      Spectrum +3 (Spanish)
	TS2068   Timex TS 2068
	Inves    Inves Spectrum+
	48ks     Spectrum 48k (Spanish)
	128ks    Spectrum 128k (Spanish)
	TK90X    Microdigital TK90X
	TK90XS   Microdigital TK90X (Spanish)
	TK95     Microdigital TK95
	Z88      Cambridge Z88
	Sam      Sam Coupe
	Pentagon Pentagon
	Chloe140 Chloe 140 SE
	Chloe280 Chloe 280 SE
	Chrome   Chrome
	Prism    Prism
	ZXUNO    ZX-Uno
	TSConf   ZX-Evolution TS-Conf
	TBBlue   TBBlue/ZX Spectrum Next
	ACE      Jupiter Ace
	CPC464   Amstrad CPC 464
	*/

}


/// The internal machine state.
enum MachineState{
	UNINITIALIZED = 0,	///< before connection to ZEsarUX.
	IDLE,				///< The normal state. Waiting for a new command.
	RUNNING,			///< When a 'continue' or 'stepOut' has benn requested. Until the next break.
	RUNNING_REVERSE,	///< Not yet used. Same as 'RUNNING' but in reverse direction.
};


/**
 * The representation of the Z80 machine.
 * It receives the requests from the EmulDebugAdapter and commincates with
 * the EmulConnector.
 */
export class MachineClass extends EventEmitter {

	/// The machine type, e.g. 48k or 128k etc.
	public machineType = MachineType.UNKNOWN;

	/// Current state, e.g. RUNNING
	private state = MachineState.UNINITIALIZED;

	/// A list for the frames (call stack items)
	private listFrames = new RefList();

	/// Mirror of the machine's breakpoints.
	private breakpoints = new Array<MachineBreakpoint>();

	/// Array that contains free breakpoint IDs.
	private freeBreakpointIds = new Array<number>();

	/// Array with the zesarux breakpoint IDs used for the WPMEM in the sources.
	/// Note: size can be smaller than the number of WPMEM as some WPMEM might
	/// be combined into one zesarux breakpoint.
	private wpmemBpIds = new Array<number>();

	/// The WPMEM watchpoints can only be enabled/disable alltogether.
	public wpmemEnabled = false;

	/// The register cache for values retrieved from zesarux. Public for unit tests only.
	public ZesaruxRegisterCache: string|undefined = undefined;


	/// Initializes the machine.
	public init() {
		// Init the registers
		Z80Registers.init();

		// Create the socket for communication (not connected yet)
		this.setupSocket();

		// Connect zesarux debugger
		zSocket.connectDebugger();
	}


	/**
	 * Stops a machine/the debugger.
	 * This will disconnect the socket to zesarux and un-use all data.
	 */
	public stop(handler: () => void) {
		zSocket.removeAllListeners();

		// inform caller
		const func = () => {
			zSocket.removeAllListeners();
			handler();
		}
		zSocket.once('error', () =>
			func() );
		zSocket.once('timeout', () =>
			func() );
		zSocket.once('close', () =>
			func() );
		zSocket.once('end', () =>
			func() );

		// disable breakpoints
//		zSocket.send('disable breakpoints', () => {
			// and quit
			zSocket.quit();
//		});
	}


	/**
	 * Factory: At the moment this static method just creates a new Machine.
	 * Later it may create different machines depending on the type (48K 128).
	 */
	public static create() {
		Machine = new MachineClass();
	}


	/**
	 * Initializes the socket to zesarux but does not connect yet.
	 * Installs handlers to react on connect and error.
	 */
	protected setupSocket() {
		zSocket.init();
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
			zSocket.send('get-version');
			zSocket.send('get-current-machine', data => {
				// Determine which ZX Spectrum it is, e.g. 48K, 128K
				if(data == 'ZX-80')
					this.machineType = MachineType.ZX80;
				else if(data == 'ZX-81')
					this.machineType = MachineType.ZX81;
				else if(data == 'Spectrum 16k')
					this.machineType = MachineType.SPECTRUM16K;
				else if(data == 'Spectrum 48k')
					this.machineType = MachineType.SPECTRUM48K;
				else if(data == 'Spectrum 128k')
					this.machineType = MachineType.SPECTRUM128K;
			});
			var debug_settings = (Settings.launch.skipInterrupt) ? 32 : 0;
			zSocket.send('set-debug-settings ' + debug_settings);

			// TODO: Should load the snapshot file after 'enter-cpu-step' but somehow this does not work.
			/*
			command> enter-cpu-step
			command@cpu-step> snapshot-load /Volumes/Macintosh HD 2/Projects/zesarux/asm/z80-sample-program/z80-sample-program.sna
			Error. Can not enter cpu step mode. You can try closing the menu
			command>
			*/
			// Load snapshot file
			if(Settings.launch.loadSnap)
				zSocket.send('snapshot-load ' + Settings.launch.loadSnap);

			// Enter step-mode (stop)
			zSocket.send('enter-cpu-step');

			// Clear all breakpoints
			if(!DBG_DISABLE_BREAKPOINTS) {
				zSocket.send('enable-breakpoints');
				this.clearAllZesaruxBreakpoints();
			}
			// Init breakpoint array
			this.freeBreakpointIds.length = 0;
			for(var i=1; i<=Zesarux.MAX_ZESARUX_BREAKPOINTS; i++)
				this.freeBreakpointIds.push(i);

			// WORKAROUND for zesarux: the first step does nothing
			zSocket.send('cpu-step');
			//

			// Send 'initialize' to Machine.
			zSocket.executeWhenQueueIsEmpty( () => {
				this.state = MachineState.IDLE;
				this.emit('initialized');
			});
		});
	}


	/**
	 * If registers have not been received yet from zesarux they are
	 * requested now.
	 * If they are already cached, the cached value is returned.
	 * The cached value is cleared whenever a step or run is done.
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	public getRegisters(handler: (registersString: string) => void) {
		if(this.ZesaruxRegisterCache) {
			// Already exists, return immediately
			handler(this.ZesaruxRegisterCache);
		}
		else {
			// get new data
			zSocket.send('get-registers', data => {
				// Store received data
				this.ZesaruxRegisterCache = data;
				const regs = data || '';	// Just to remove warning
				handler(regs);
			});
		}
	}


	/**
	 * Returns a specific register value.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @returns The register value.
	 */
	public getRegisterValue(register: string, handler: (value: number) => void) {
		this.getRegisters((regsString) => {
			const value = Z80Registers.getRegValueByName(register, regsString);
			handler(value);
		});
	}

	/**
	 * Returns a specific register value as a fromatted string.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param handler(formattedString) The 'formattedString' is passed to handler.
	 */
	public getVarFormattedRegister(register: string, handler: (formattedString: string) => void) {
		this.getRegisters((regsString) => {
			Z80Registers.getVarFormattedReg(register, regsString,  handler);
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
		const addr_3 = addr-3;	// subtract opcode + address
		zSocket.send('disassemble ' + addr_3, data => {
			const opcode = data.substr(7,4);
			// Check if this was a "CALL something" or "CALL n/z,something"
			if(opcode == "CALL") {
				// get address of call: last 4 bytes
				const callAddrString = data.substr(data.length-4);
				const callAddr = parseInt(callAddrString,16);
				// Now find label for this address
				const labelCallAddrArr = Labels.getLabelsForNumber(callAddr);
				const labelCallAddr = (labelCallAddrArr.length > 0) ? labelCallAddrArr[0] : callAddrString+'h';
				const file = Labels.getFileAndLineForAddress(addr_3);
				// Save
				lastCallFrameIndex = frames.addObject(new Frame(addr_3, zStackAddress+2*index, 'CALL ' + labelCallAddr, file.fileName, file.lineNr));
			}
			else {
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
		this.getRegisters( data => {
			// Parse the PC value
			const pc = Z80Registers.parsePC(data);
			const file = Labels.getFileAndLineForAddress(pc);

			const sp = Z80Registers.parseSP(data);
			const lastCallIndex = frames.addObject(new Frame(pc, sp, 'PC',file.fileName, file.lineNr));

			// calculate the depth of the call stack
			var depth = (Labels.topOfStack - sp)/2;	// 2 bytes per word
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
	 * @param The reference number to the frame.
	 * @returns The associated frame or undefined.
	 */
	public getFrame(ref: number): Frame|undefined {
		const frame = this.listFrames.getObject(ref);
		return frame;
	}


	/**
	  * 'continue' debugger program execution.
	  * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	  */
	 public continue(handler:()=>void): void {
		this.state = MachineState.RUNNING;
		// Clear register cache
		this.ZesaruxRegisterCache = undefined;
		// Run
		zSocket.send('run', (data) => {
			this.state = MachineState.IDLE;
			// Call handler (could take some time, e.g. until a breakpoint is hit)
			handler();
		}, NO_TIMEOUT);
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
		this.state = MachineState.RUNNING;
		this.state = MachineState.IDLE;
		// TODO: needs implementation
		// Clear register cache
		this.ZesaruxRegisterCache = undefined;
		handler();
	}

	 /**
	  * 'step over' an instruction in the debugger.
	  * @param handler The handler that is called after the step is performed.
	  */
	 public stepOver(handler:()=>void): void {
		// Zesarux is very special in the 'step-over' behaviour.
		// In case of e.g a 'jp cc, addr' it will never return
		// if the condition is met because
		// it simply seems to wait until the PC reaches the next
		// instruction what, for a jp-instruction, obviously never happens.
		// Therefore a 'step-into' is executed instead. The only problem is that a
		// 'step-into' is not the desired behaviour for a CALL.
		// So we first check if the instruction is a CALL and
		// then either excute a 'step-over' or a step-into'.
		this.getRegisters( data => {
			const pc = Z80Registers.parsePC(data);
			zSocket.send('disassemble ' + pc, data => {
				const opcode = data.substr(7,4);
				// Check if this was a "CALL something" or "CALL n/z,something"
				const cmd = (opcode=="CALL" || opcode=="LDIR" || opcode=="LDDR") ? 'cpu-step-over' : 'cpu-step';

				// Clear register cache
				this.ZesaruxRegisterCache = undefined;
				// Step
				zSocket.send(cmd, data => {
					// Call handler
					handler();
				});
			});
		});
	}


	 /**
	  * 'step into' an instruction in the debugger.
	  * @param handler The handler that is called after the step is performed.
	  */
	 public stepInto(handler:()=>void): void {
		// Clear register cache
		this.ZesaruxRegisterCache = undefined;
		// Step into
		zSocket.send('cpu-step', data => {
			// Call handler
			handler();
		});
	}


	 /**
	  * 'step out' of current call.
	  * @param handler The handler that is called after the step out is performed.
	  */
	 public stepOut(handler:()=>void): void {
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
						const addr_3 = addr-3;	// subtract opcode + address
						zSocket.send('disassemble ' + addr_3, data => {
							const opcode = data.substr(7,4);
							// Check if this was a "CALL something" or "CALL n/z,something"
							if(opcode == "CALL") {
								// found, set breakpoint: when SP gets bigger than the current value
								const freeBps = this.freeBreakpointIds;
								if(freeBps.length < 1) {
									// No breakpoint available
									handler();
									return;
								}

								// set action first (no action)
								const bpId = freeBps[0];
								zSocket.send('set-breakpointaction ' + bpId + ' prints step-out', () => {
									// set the breakpoint (conditions are evaluated by order. 'and' does not take precedence before 'or').
									const condition = 'SP>' + sp;
									zSocket.send('set-breakpoint ' + bpId + ' ' + condition, () => {
										// enable breakpoint
										zSocket.send('enable-breakpoint ' + bpId, () => {

											// Clear register cache
											this.ZesaruxRegisterCache = undefined;
											// Run
											this.state = MachineState.RUNNING;
											zSocket.send('run', () => {
												// takes a little while, then step-over RET
												// Disable breakpoint
												zSocket.send('disable-breakpoint ' + bpId, () => {
													this.state = MachineState.IDLE;
													handler();
													return;
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
		this.ZesaruxRegisterCache = undefined;
		// Call handler
		handler();
	}


	/**
	 * If sytem state is running, a break is done.
	 */
	private breakIfRunning() {
		// Break if currently running
		if(this.state == MachineState.RUNNING || this.state == MachineState.RUNNING_REVERSE) {
			// Break
			this.pause();
		}
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It does so by accumulating watches into a single breakpoint.
	 * I.e. if the watch is of length 1 as many as possible watches are put in one breakpoint.
	 * If the length is > 1 then a single breakpoint is used.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 * Passes 'bpIds' with the used zesarux breakpoint IDs.
	 */
	public setWatchpoints(watchPoints: Array<GenericWatchpoint>, handler: (bpIds:Array<number>) => void) {
		// Set watchpoints (memory guards)
		var conditions = '';
		var notEnoughBreakpoints = false;
		const bpIds = new Array<number>();
		for(let watchpoint of watchPoints) {
			if(watchpoint.length == 0)
				continue;
			// create condition
			var cond = '';
			const access = watchpoint.access;
			if(watchpoint.length == 1) {
				cond = 'MWA=' + watchpoint.address;
				// Check access type
				if(access == 'w') {
					// no change
				}
				else if(access == 'r') {
					cond = cond.replace(/MWA/g, 'MRA');
				}
				else if(access == 'rw') {
					cond += ' or ' + cond.replace(/MWA/g, 'MRA');
				}
				// Check if size too big
				if(conditions.length + 4 + cond.length > Zesarux.MAX_BREAKPOINT_CONDITION_LENGTH) {
					// (enough watches) set breakpoint
					const bp = { bpId: 0, filePath: '', lineNr: 0, condition: conditions };
					if(this.setBreakpoint(bp) == 0) {
						notEnoughBreakpoints = true;
						break;
					}
					// Collect breakpoint
					bpIds.push(bp.bpId);
					// Prepare for next
					conditions = cond;
				}
				else {
					// collect watchpoint
					if(conditions.length != 0)	// Check if first
						conditions += ' or ';
					conditions += cond;
				}
			}
			else {
				// a complete area of addresses has been chosen use an own breakpoint for this.
				// Set one or 2 new breakpoints
				const bp1 = { bpId: 0, filePath: '', lineNr: 0, condition: '' };
				var bp2 = { bpId: 0, filePath: '', lineNr: 0, condition: '' };;
				cond = 'MWA>' + (watchpoint.address-1) + ' and MWA<' + (watchpoint.address+watchpoint.length);
				if(access == 'w') {
					// no change
					bp1.condition = cond;
				}
				else if(access == 'r') {
					bp1.condition = cond.replace(/MWA/g, 'MRA');
				}
				else if(access == 'rw') {
					bp1.condition = cond;
					bp2.condition = cond.replace(/MWA/g, 'MRA');
				}
				// Set breakpoint(s)
				if(this.setBreakpoint(bp1) == 0) {
					notEnoughBreakpoints = true;
					break;
				}
				// Collect breakpoint
				bpIds.push(bp1.bpId);
				// 2nd breakpoint
				if(bp2.condition.length > 0) {
					if(this.setBreakpoint(bp2) == 0) {
						notEnoughBreakpoints = true;
						break;
					}
					// Collect breakpoint
					bpIds.push(bp2.bpId);
				}
			}
		}

		// Check if something remains to be sent
		if(conditions.length > 0 ) {
			// Yes, send the remaining watchpoints
			const bp = { bpId: 0, filePath: '', lineNr: 0, condition: conditions };
			if(this.setBreakpoint(bp) == 0) {
				notEnoughBreakpoints = true;
			}
			else {
				// Collect breakpoint
				bpIds.push(bp.bpId);
			}
		}

		// Call handler
		zSocket.executeWhenQueueIsEmpty( () => {
			if(notEnoughBreakpoints) {
				// Send warning
				this.emit('warning', 'Not enough breakpoints available for all watchpoints (WPMEM). Would require ' + watchPoints.length + ' breakpoints.');
			}
			handler(bpIds);
		});
	}


	/**
	 * Thin wrapper around setWatchpoints just to catch and store
	 * the used breakpoint IDs.
	 * Called only once.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler() Is called after the last watchpoint is set.
	 */
	public setWPMEM(watchPoints: Array<GenericWatchpoint>, handler: () => void) {
		this.setWatchpoints(watchPoints, (bpIds) => {
			this.wpmemBpIds = bpIds;
			handler();
		});
		this.wpmemEnabled = true;
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableWPMEM(enable: boolean, handler: () => void) {
		for(let bpId of this.wpmemBpIds) {
			if(enable)
				zSocket.send('enable-breakpoint ' + bpId);
			else
				zSocket.send('disable-breakpoint ' + bpId);
		}
		this.wpmemEnabled = enable;
		zSocket.executeWhenQueueIsEmpty(handler);
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	protected setBreakpoint(bp: MachineBreakpoint): number {
		// get free id
		if(this.freeBreakpointIds.length == 0)
			return 0;	// no free ID
		bp.bpId = this.freeBreakpointIds[0];
		this.freeBreakpointIds.shift();

		// set action first (no action)
		const shortCond = (bp.condition.length < 50) ? bp.condition : bp.condition.substr(0,50) + '...';
		zSocket.send('set-breakpointaction ' + bp.bpId + ' prints breakpoint ' + bp.bpId + ' hit (' + shortCond + ')', () => {
			// set the breakpoint
			zSocket.send('set-breakpoint ' + bp.bpId + ' ' + bp.condition, () => {
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
	protected removeBreakpoint(bp: MachineBreakpoint) {
		// set breakpoint with no condition = disable/remove
		//zSocket.send('set-breakpoint ' + bp.bpId);

		// disable breakpoint
		zSocket.send('disable-breakpoint ' + bp.bpId);

		// Remove from list
		var index = this.breakpoints.indexOf(bp);
		var assert = require('assert');
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
	 */
	public setBreakpoints(path: string, givenBps:Array<MachineBreakpoint>, handler:(bps: Array<MachineBreakpoint>)=>void) {
		this.breakIfRunning();

		// get all old breakpoints for the path
		const oldBps = this.breakpoints.filter(bp => bp.filePath == path);

		// Create new breakpoints
		const currentBps = new Array<MachineBreakpoint>();
		givenBps.forEach( bp => {
			// get PC value of that line
			const addr = Labels.getAddrForFileAndLine(path, bp.lineNr);
			// Check if valid line
			if(addr >= 0) {
				// Now search last line with that pc
				const file = Labels.getFileAndLineForAddress(addr);
				// Check if right file
				if(path.valueOf() == file.fileName.valueOf()) {
					// create breakpoint object
					var condition = 'PC='+Utility.getHexString(addr, 4)+'h';
					if(bp.condition && bp.condition.length > 0)
						condition += ' and ' + bp.condition;
					const ebp = { bpId: 0, filePath: file.fileName, lineNr: file.lineNr, condition: condition };
					// add to array
					currentBps.push(ebp);
				}
			}
		});

		// Now check which breakpoints are new or removed (this includes 'changed').
		const newBps = currentBps.filter(bp => oldBps.filter(obp => obp.condition == bp.condition).length == 0);
		const removedBps = oldBps.filter(bp => currentBps.filter(obp => obp.condition == bp.condition).length == 0);

		// remove old breakpoints
		removedBps.forEach(bp => {
			// from zesarux
			this.removeBreakpoint(bp);
		});

		// Add new breakpoints and find free breakpoint ids
		newBps.forEach(bp => {
			// set breakpoint
			this.setBreakpoint(bp);
		});

		// get all breakpoints for the path
		const resultingBps = this.breakpoints.filter(bp => bp.filePath == path);

		// Return the real breakpoints for the file and sync with the socket.
		zSocket.executeWhenQueueIsEmpty( () => {
			handler(resultingBps);
		});

	}


	/**
	 * Returns a disassembly of the given address area.
	 * Can be used e.g. to disassemble ROM areas.
	 * @param start The start address for the disassembly.
	 * @param size The size of the memory area.
	 * @returns The disassembly as text. Format, e.g.:
	 *   0065 RST 38
	 *   0066 PUSH AF
	 *   0067 PUSH HL
	 *   0068 LD HL,(5CB0)
	 */
	public getDisassembly(start: number, size: number, handler:(text)=>void) {
		// get disassembly, get more than is required (because zesarux lacks a disassembly with size)
		const lines = size;	// number of lines is < size
		if(isNaN(start))
			Log.log("ERROR");
		zSocket.send('disassemble ' + start + ' ' + lines, (data) => {
			// Remove the superfluous lines
			const lineArr = data.split('\n');
			const resultArr = new Array<string>();
			const endAddr = start + size;
			for(var line of lineArr) {
				// check if size reached
				const addr = parseInt(line.substr(2,4),16);
				if(addr >= endAddr)
					break;
				// add line
				resultArr.push(line.substr(2));
			}
			// Create string
			const text = resultArr.join('\n');
			// Call handler
			handler(text);
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
	 * @param handler(data) The handler that receives the data.
	 */
	public getMemoryDump(address: number, size: number, handler:(data: Array<number>)=>void) {
		// Retrieve memory values
		zSocket.send( 'read-memory ' + address + ' ' + size, data => {
			const values = new Array<number>();
			const len = data.length;
			for(var i=0; i<len; i+=2) {
				const valueString = data.substr(i,2);
				const value = parseInt(valueString,16);
				values.push(value);
			}
			// send data to handler
			handler(values);
		});
	}


	/**
	 * Writes one memory value to zesarux.
	 * The write is followed by a read and the read value is returned
	 * in the handler.
	 * @param address The address to change.
	 * @param value The new value.
	 */
	public writeMemory(address, value, handler:(realValue: number) => void) {
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
		this.ZesaruxRegisterCache = undefined;
		zSocket.send( 'set-register PC=' + address.toString(16) + 'h', data => {
			handler();
		});
	}
}


export var Machine;
