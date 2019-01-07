
import * as assert from 'assert';
import { Z80Registers } from './z80Registers';
import { RefList } from './reflist';
import { Frame } from './frame';
import { EventEmitter } from 'events';
import { GenericWatchpoint } from './genericwatchpoint';
import { Labels } from './labels';
//import { Opcode } from './disassembler/opcode';
//import { Memory } from './disassembler/memory';
//import { Format } from './disassembler/format';


/**
 * The breakpoint representation.
 */
export interface EmulatorBreakpoint {
	bpId: number;	/// The breakpoint ID/number (>0)
	filePath: string;	/// The file to which the breakpoint belongs
	lineNr: number;	/// The line number in the file starting at 0
	address: number;	/// Usually the pc value  to stop at (e.g. 0A7f)
	condition: string;	/// An additional condition.
}


/// The machine type, e.g. ZX81, Spectrum 16k, Spectrum 128k, etc.
/// NOT USED:
export enum MachineType {
	UNKNOWN = 0,
	ZX80,
	ZX81,
	SPECTRUM16K,
	SPECTRUM48K,
	SPECTRUM128K,
	TBBLUE

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
export enum EmulatorState {
	UNINITIALIZED = 0,	///< before connection to ZEsarUX.
	IDLE,				///< The normal state. Waiting for a new command.
	RUNNING,			///< When a 'continue' or 'stepOut' has benn requested. Until the next break.
	RUNNING_REVERSE,	///< Not yet used. Same as 'RUNNING' but in reverse direction.
};


/**
 * The representation of the Z80 emulator (e.g. Zesarux or MAME).
 * It receives the requests from the EmulDebugAdapter and communicates with
 * the EmulConnector.
 */
export class EmulatorClass extends EventEmitter {

	/// The machine type, e.g. 48k or 128k etc.
	public machineType = MachineType.UNKNOWN;

	/// Current state, e.g. RUNNING
	protected state = EmulatorState.UNINITIALIZED;

	/// A list for the frames (call stack items)
	protected listFrames = new RefList();

	/// Mirror of the emulator's breakpoints.
	protected breakpoints = new Array<EmulatorBreakpoint>();

	/// The register cache for values retrieved from emulator.
	/// Is a simple string that needs to get parsed.
	public RegisterCache: string|undefined = undefined;


	/// Initializes the machine.
	public init() {
		// Init the registers
		Z80Registers.init();
	}


	/**
	 * Stops an emulator/the debugger.
	 * E.g. disconnect the socket to the emulator here.
	 */
	public stop(handler: () => void) {
		// please override.
	}


	/**
	 * Override this to retrieve the registers from the emulator.
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	public getRegistersFromEmulator(handler: (registersString: string) => void) {
		assert(false);	// override this
	}


	/**
	* Override this to retrieve the registers from the emulator.
	*
	* @param handler(registersString) Passes 'registersString' to the handler.
	*/
   public getRegisters(handler: (registersString: string) => void) {
	   if(this.RegisterCache) {
		   // Already exists, return immediately
		   handler(this.RegisterCache);
	   }
	   else {
		   // get new data
		   this.getRegistersFromEmulator( regs => {
			   // Store received data
			   this.RegisterCache = regs;
			   //const regs = data || '';	// Just to remove warning
			   handler(regs);
		   });
	   }
   }


	/**
	 * Returns a specific register value.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param handler(value) The handler that is called with the value when command has finished.
	 */
	public getRegisterValue(register: string, handler: (value: number) => void) {
		this.getRegisters((regsString) => {
			const value = Z80Registers.getRegValueByName(register, regsString);
			handler(value);
		});
	}


	/**
	 * Sets the value for a specific register.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 * @param handler The handler that is called when command has finished.
	 */
	public setRegisterValue(register: string, value: number, handler?: (resp) => void) {
		assert(false);	// override this
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
	 * Returns the stack frames.
	 * @param handler The handler to call when ready.
	 */
	public stackTraceRequest(handler:(frames: RefList)=>void): void {
		assert(false);	// override this
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
	  * @param contExecHandler The handler that is called when the run command is executed.
	  * @param contStoppedHandler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	  */
	 public continue(contExecHandler: ()=>void, contStoppedHandler: (data)=>void): void {
		assert(false);	// override this
	}


	/**
	 * 'pause' the debugger.
	 */
	public pause(): void {
		assert(false);	// override this
	}


	 /**
	  * 'reverse continue' debugger program execution.
	  * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	  */
	 public reverseContinue(handler:()=>void) : void {
		assert(false);	// override this
	}

	 /**
	  * 'step over' an instruction in the debugger.
	  * @param handler The handler that is called after the step is performed.
	  */
	 public stepOver(handler:()=>void): void {
		assert(false);	// override this
	}


	 /**
	  * 'step into' an instruction in the debugger.
	  * @param handler The handler that is called after the step is performed.
	  */
	 public stepInto(handler:()=>void): void {
		assert(false);	// override this
	}


	 /**
	 * 'step out' of current call.
	 * @param handler The handler that is called after the step out is performed.
	 */
	public stepOut(handler:()=>void): void {
		assert(false);	// override this
	}


	/**
	 * 'step backwards' the program execution in the debugger.
	 * @param handler The handler that is called after the step is performed.
	 */
	public stepBack(handler:()=>void): void {
		assert(false);	// override this
	}


	/**
	 * If sytem state is running, a break is done.
	 */
	protected breakIfRunning() {
		// Break if currently running
		if(this.state == EmulatorState.RUNNING || this.state == EmulatorState.RUNNING_REVERSE) {
			// Break
			this.pause();
		}
	}


	/**
	 * Sets the watchpoint array.
	 * @param watchPoints A list of addresses to put a guard on.
	 */
	public setWPMEM(watchPoints: Array<GenericWatchpoint>) {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableWPMEM(enable: boolean, handler: () => void) {
		assert(false);	// override this
	}


	/**
	 * Sets the ASSERTs array.
	 * @param assertBreakpoints A list of addresses to put a guard on.
	 */
	public setASSERT(assertBreakpoints: Array<GenericWatchpoint>) {
		assert(false);	// override this
	}


	/**
	 * Set all assert breakpoints.
	 * Called only once.
	 * @param assertBreakpoints A list of addresses to put an assert breakpoint on.
	 * @param handler() Is called after the last watchpoint is set.
	 */
	public setAssertBreakpoints(assertBreakpoints: Array<GenericWatchpoint>, handler: () => void) {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableAssertBreakpoints(enable: boolean, handler: () => void) {
		assert(false);	// override this
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	protected setBreakpoint(bp: EmulatorBreakpoint): number {
		assert(false);	// override this
		// return
		return 0;
	}


	/**
	 * Set all ASSERT breakpoints.
	 * Called only once.
	 * @param asserts A list of addresses with asserts (conditions). If the condition is not true the
	 * breakpoint will fire.
	 * Note: the emulator will change the generic condition format into a proprietary one
	 * on its own.
	 * @param handler() Is called after the last asssert is set.
	 * @param errorHandler(errText) Is called if an error occurs. E.g.
	 * if a condition cannot be parsed.
	 */
	public setASSERTs(asserts: Array<EmulatorBreakpoint>, finalHandler: () => void, errorHandler: (errText: string) => void) {
		assert(false);	// override this
	}


	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpoint(bp: EmulatorBreakpoint) {
	}


	/**
	 * Set all breakpoints for a file.
	 * Determines which breakpoints already exist, which are new and which need to be removed.
	 * Calls setBreakpoint and removeBreakpoint which communicate with the emulator.
	 * If system is running, first break, then set the breakpoint(s).
	 * But, because the run-handler is not known here, the 'run' is not continued afterwards.
	 * @param path The file (which contains the breakpoints).
	 * @param givenBps The breakpoints in the file.
	 * @param handler(bps) On return the handler is called with all breakpoints.
	 * @param tmpDisasmFileHandler(bp) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 */
	public setBreakpoints(path: string, givenBps:Array<EmulatorBreakpoint>,
		handler:(bps: Array<EmulatorBreakpoint>)=>void,
		tmpDisasmFileHandler:(bp: EmulatorBreakpoint)=>EmulatorBreakpoint) {

		try {
			// get all old breakpoints for the path
			const oldBps = this.breakpoints.filter(bp => bp.filePath == path);

			// Create new breakpoints
			const currentBps = new Array<EmulatorBreakpoint>();
			givenBps.forEach( bp => {
				let ebp;
				// get PC value of that line
				let addr = Labels.getAddrForFileAndLine(path, bp.lineNr);
				// Check if valid line
				if(addr >= 0) {
					// Now search last line with that pc
					const file = Labels.getFileAndLineForAddress(addr);
					// Check if right file
					if(path.valueOf() == file.fileName.valueOf()) {
						// create breakpoint object
						ebp = { bpId: 0, filePath: file.fileName, lineNr: file.lineNr, address: addr, condition: bp.condition };
					}
				}
				else {
					// Check if there is a routine for the temporary disassembly file
					ebp = tmpDisasmFileHandler(bp);
				}

				// add to array
				if(!ebp) {
					// Breakpoint position invalid
					ebp = { bpId: 0, filePath: path, lineNr: bp.lineNr, address: -1, condition: '' };
				}
				currentBps.push(ebp);
			});

			// Now check which breakpoints are new or removed (this includes 'changed').
			const newBps = currentBps.filter(bp => bp.address >= 0 && oldBps.filter(obp => (obp.condition == bp.condition) && (obp.address == bp.address)).length == 0);
			const removedBps = oldBps.filter(bp => bp.address >= 0  && currentBps.filter(obp => (obp.condition == bp.condition) && (obp.address == bp.address)).length == 0);

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
			//const resultingBps = this.breakpoints.filter(bp => bp.filePath == path);

			// call handler
			handler(currentBps);
		}
		catch(e) {
			console.log("Error: ", e);
		}
	}


	/**
	 * Returns a disassembly of the given address area.
	 * Can be used e.g. to disassemble ROM areas.
	 * Note 1: in the past the disassembly capabilities of the emulator's disassembler
	 * have been used. Now the internal disassembler is used.
	 * I.e. no need to override this anymore.
	 * Note 2: Unfortunately I cannot use the advanced z80dismblr here: it showed that
	 * when e.g. disassembling the ZX Spectrum only few parts of the ROM are disassembled
	 * because a lot is done via hidden calls, i.e. calls that are hidden in data areas.
	 * So it is better to use the 'stupid' brute force disassembly: It may decode some
	 * data as code but at least it decodes all the area.
	 * @param start The start address for the disassembly.
	 * @param size The size of the memory area.
	 * @returns The disassembly as text. Format, e.g.:
	 *   0065 RST 38
	 *   0066 PUSH AF
	 *   0067 PUSH HL
	 *   0068 LD HL,(5CB0)
	 */
/*
	public getDisassembly(start: number, size: number, handler:(text)=>void) {
		this.getMemoryDump(start, size, (data) => {
			// data contains an array of bytes.

			// convert hex values to bytes
			const buffer = new Memory();
			buffer.setMemory(start, data);

			// disassemble all lines
			let address = start;
			const end = start + size;
			let text = '';
			while(address < end) {
				// Get opcode
				const opcode = Opcode.getOpcodeAt(buffer, address);
				// disassemble
				const opCodeDescription = opcode.disassemble();
				const line = Format.formatDisassembly(buffer, false, 4, 12, 5, 8, address, opcode.length, opCodeDescription.mnemonic);
				// add to disassembly
				text += line + '\n';
				// Next address
				address += opcode.length;
			}

			// Use
			handler(text);
		});
	}
*/

	/**
	 * Sends a command to the emulator.
	 * @param cmd E.g. 'get-registers'.
	 * @param handler The response (data) is returned.
	 */
	public dbgExec(cmd: string, handler:(data)=>void) {
		assert(false);	// override this
	}


	/**
	 * Reads a memory dump and converts it to a number array.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public getMemoryDump(address: number, size: number, handler:(data: Uint8Array, addr: number)=>void) {
		assert(false);	// override this
	}


	/**
	 * Writes a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 * @param handler(response) The handler that is called when zesarux has received the data.
	 */
	public writeMemoryDump(address: number, dataArray: Uint8Array, handler:() => void) {
		assert(false);	// override this
	}


	/**
	 * Writes one memory value to the emulator.
	 * The write is followed by a read and the read value is returned
	 * in the handler.
	 * @param address The address to change.
	 * @param value The new value.
	 */
	public writeMemory(address, value, handler:(realValue: number) => void) {
		assert(false);	// override this
	}


	/**
	 * Change the program counter.
	 * @param address The new address for the program counter.
	 * @param handler that is called when the PC has been set.
	 */
	public setProgramCounter(address: number, handler:() => void) {
		assert(false);	// override this
	}


	// ZX Next related ---------------------------------

	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @param value(value) Calls 'handler' with the value of the register.
	 */
	public getTbblueRegister(registerNr: number, handler: (value)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @param handler(paletteArray) Calls 'handler' with a 256 byte Array<number> with the palette values.
	 */
	public getTbblueSpritesPalette(paletteNr: number, handler: (paletteArray)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @param handler(xl, xr, yt, yb) Calls 'handler' with the clipping dimensions.
	 */
	public getTbblueSpritesClippingWindow(handler: (xl: number, xr: number, yt: number, yb: number)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @param handler(sprites) Calls 'handler' with an array of sprite data.
	 */
	public getTbblueSprites(slot: number, count: number, handler: (sprites)=>void) {
		assert(false);	// override this
	}

	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @param handler(patterns) Calls 'handler' with an array of sprite pattern data.
	 */
	public getTbblueSpritePatterns(index: number, count: number, handler: (patterns)=>void) {
		assert(false);	// override this
	}

}

