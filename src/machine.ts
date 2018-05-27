

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


// Max number of Zesarux breakpoints.
const MAX_ZESARUX_BREAKPOINTS = 100;


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
export class Machine extends EventEmitter {



	/// The machine type, e.g. 48k or 128k etc.
	public machineType = MachineType.UNKNOWN;

	/// Current state, e.g. RUNNING
	private state = MachineState.UNINITIALIZED;

	/// A list for the frames (call stack items)
	private listFrames = new RefList();

	/// Mirror of the machine's breakpoints.
	private breakpoints = new Array<MachineBreakpoint>();

	/// Is responsible to serialize asynchronous calls (e.g. to zesarux).
	//private serializer = new CallSerializer("Main", true);

	/**
	 * Creates a new Z80 machine.
	 */
	public constructor() {
		super();

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
	public stop() {
		zSocket.removeAllListeners();
		zSocket.end();
		zSocket.destroy();
		//var sleep = require('sleep');
		//sleep.sleep(3);	// 3 secs
	}


	/**
	 * Factory: At the moment this static method just creates a new Machine.
	 * Later it may create different machines depending on the type (48K 128).
	 */
	public static getMachine() {
		return new Machine();
	}


	/**
	 * Initializes the socket to zesarux but does not connect yet.
	 * Installs handlers to react on connect and error.
	 */
	protected setupSocket() {
		zSocket.init();
		zSocket.on('error', err => {
			// and terminate
			err.message += " (Could not connect ZEsarUX!)";
			this.emit('error', err);
		});
		zSocket.on('close', err => {
			this.listFrames.length = 0;
			this.breakpoints.length = 0;
			// and terminate
			this.emit('error', err);	// TODO: Ist das richtig hier einen Error zu returnen?
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
				//this.clearAllZesaruxBreakpoints(); //TODO: enable
			}

			// Send 'initialize' to Machine.
			zSocket.executeWhenQueueIsEmpty( () => {
				this.state = MachineState.IDLE;
				this.emit('initialized');
			});
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
				const labelCallAddr = (labelCallAddrArr) ? labelCallAddrArr[0] : callAddrString+'h';
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
		zSocket.send('get-registers', data => {
			// Parse the PC value
			const pc = Z80Registers.parsePC(data);
			const file = Labels.getFileAndLineForAddress(pc);

			const sp = Z80Registers.parseSP(data);
			const lastCallIndex = frames.addObject(new Frame(pc, sp, 'PC',file.fileName, file.lineNr));

			// calculate the depth of the call stack
			var depth = Labels.topOfStack - sp;
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
		zSocket.send('get-registers', data => {
			const pc = Z80Registers.parsePC(data);
			zSocket.send('disassemble ' + pc, data => {
				const opcode = data.substr(7,4);
				// Check if this was a "CALL something" or "CALL n/z,something"
				const cmd = (opcode=="CALL" || opcode=="LDIR" || opcode=="LDDR") ? 'cpu-step-over' : 'cpu-step';

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
		zSocket.send('get-registers', data => {
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
								const freeBps = this.getFreeBreakpointIds(1);
								if(freeBps.length < 1) {
									// No breakpoint available
									handler();
									return;
								}

								// set action first (no action)
								const bpId = freeBps[0];
								zSocket.send('set-breakpointaction ' + bpId + ' pause', data => {
									// set the breakpoint (conditions are evaluated by order. 'and' does not take precedence before 'or').
									const condition = 'SP>' + sp;
									zSocket.send('set-breakpoint ' + bpId + ' ' + condition, data => {

										// Run
										this.state = MachineState.RUNNING;
										zSocket.send('run', data => {
											// takes a little while, then step-over RET
											// Remove breakpoint
											zSocket.send('set-breakpoint ' + bpId, data => {
												this.state = MachineState.IDLE;
												handler();
												return;
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
	 * Returns the first free breakpoint indexes of zesarux.
	 * Breakpoint indices start at 1 (Zesarux).
	 * @param count The number of free breakpoint indices to return.
	 * @return An array with free brakpoint IDs or an empty array.
	 */
	private getFreeBreakpointIds(count: number): Array<number> {
		const freeIndices = new Array<number>();
		// Check all IDs
		for( var index=1; index<=MAX_ZESARUX_BREAKPOINTS; index++ ) {
			var filteredBps = this.breakpoints.filter(bp => bp.bpId == index);
			if(filteredBps.length == 0) {
				freeIndices.push(index);
				count--;
				if(count <= 0)
					break;
			}
		}
		return freeIndices;
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID.
	 * @param bp The breakpoint.
	 */
	protected setBreakpoint(bp: MachineBreakpoint) {
		// get free id
		const freeBps = this.getFreeBreakpointIds(1);
		if(freeBps.length < 1)
			return;	// no free ID
		bp.bpId = freeBps[0];

		// set action first (no action)
		zSocket.send('set-breakpointaction ' + bp.bpId + ' pause', (data) => {
			// set the breakpoint
			zSocket.send('set-breakpoint ' + bp.bpId + ' ' + bp.condition);
		});

		// Add to list
		this.breakpoints.push(bp);
	}


	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpoint(bp: MachineBreakpoint) {
		// set breakpoint with no condition = disable/remove
		zSocket.send('set-breakpoint ' + bp.bpId);

		// Remove from list
		var index = this.breakpoints.indexOf(bp);
		var assert = require('assert');
		assert(index !== -1, 'Breakpoint should be removed but does not exist.');
		this.breakpoints.splice(index, 1);
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
			console.log("ERROR");
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

}
