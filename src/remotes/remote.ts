
import * as assert from 'assert';
import {Z80Registers} from './z80registers';
import {RefList} from '../reflist';
import {CallStackFrame} from '../callstackframe';
import {RemoteBase, MachineType, EmulatorState, RemoteBreakpoint, MemoryPage} from './remotebase';
import {GenericWatchpoint, GenericBreakpoint} from '../genericwatchpoint';
import {StateZ80} from '../statez80';


// Re-export
export {MachineType, EmulatorState, RemoteBreakpoint, MemoryPage};

/**
 * The Remote class definition to derive from.
 * All methods that include an "assert" here need to be overridden by
 * your derived class.
 * The other methods might be overridden to provide special functionality
 * (like reverse debugging).
 * The debug adapter will check by itself if a certain method has been implemented
 * in your derived class and will enable the functionality automatically. TODO: check if this is really the case.
 */
export class RemoteClass extends RemoteBase {

	/// Constructor.
	/// Override this.
	constructor() {
		super();
	}


	/// Initializes the machine.
	public init() {
	}


	/**
	 * Stops a remote.
	 * This will e.g. disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * Very much like 'terminate' but does not send the 'terminated' event.
	 */
	public async disconnect(): Promise<void> {
		// please override.
	}


	/**
	 * Terminates the remote.
	 * This should disconnect the socket and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator or on a 'restartRequest'.
	 * Has to emit the "this.emit('terminated')".
	 */
	public async terminate(): Promise<void> {
		// please override.
	}


	/**
	* Gets the registers from cache. If cache is empty retrieves the registers from
	* the emulator.
    * Override.
	*/
	public async getRegisters(): Promise<void> {
		assert(false);
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
		assert(false);	// override this
		return 0;
	}


	/**
	 * Returns the stack frames.
	 */
	public async stackTraceRequest(): Promise<RefList<CallStackFrame>> {
		assert(false);	// override this
		return new RefList<CallStackFrame>();
	}


	/**
	 * 'continue' debugger program execution.
	 * @returns A Promise with {reason, tStates, cpuFreq}.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public async continue(): Promise<{reason: string, tStates?: number, cpuFreq?: number}> {
		assert(false);	// override this
		return {reason: ""};
	}


	/**
	 * 'pause' the debugger.
	 */
	public pause(): void {
		assert(false);	// override this
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * The Promise resolves when it's stopped e.g. when a breakpoint is hit.
	 * @returns A string with the break reason. (Never undefined)
	 */
	public async reverseContinue(): Promise<string> {
		assert(false);	// override this
		return "";
	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @returns A Promise with:
	 * 'instruction' is the disassembly of the current line.
	 * 'tStates' contains the number of tStates executed.
	 * 'cpuFreq' contains the CPU frequency at the end.
	 * 'breakReason' a possibly text with the break reason.
	 */
	public async stepOver(): Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}> {
		assert(false);	// override this
		return {
			instruction: ""
		};
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @returns A Promise:
	 * 'instruction' is the disassembly of the current line.
	 * 'tStates' contains the number of tStates executed.
	 * 'cpuFreq' contains the CPU frequency at the end.
	 * 'breakReason' a possibly text with the break reason. This is mainly to keep the
	 * record consistent with stepOver. But it is e.g. used to inform when the
	 * end of the cpu history is reached.
	 */
	public async stepInto(): Promise<{instruction: string, tStates?: number, cpuFreq?: number, breakReason?: string}> {
		assert(false);	// override this
		return {
			instruction: ""
		};
	}


	/**
	 * 'step out' of current subroutine.
	 * @param A Promise that returns {tStates, cpuFreq, breakReason}
	 * 'tStates' contains the number of tStates executed.
	 * 'cpuFreq' contains the CPU frequency at the end.
	 * 'breakReason' a possibly text with the break reason.
	 */
	public async stepOut(): Promise<{tStates?: number, cpuFreq?: number, breakReason?: string}> {
		assert(false);	// override this
		return {};
	}


/**
  * 'step backwards' the program execution in the debugger.
  * @returns {instruction, breakReason} Promise.
  * instruction: e.g. "081C NOP"
  * breakReason: If not undefined it holds the break reason message.
  */
	public async stepBack(): Promise<{instruction: string, breakReason: string|undefined}> {
		assert(false);	// override this
		return {instruction: "", breakReason: undefined};
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * Promise is called when method finishes.
	 * @param enable true=enable, false=disable.
	 */
	public async enableWPMEM(enable: boolean): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * Promises is execute when last watchpoint has been set.
	 * @param watchPoints A list of addresses to put a guard on.
	 */
	public async setWatchpoints(watchPoints: Array<GenericWatchpoint>): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Set all assert breakpoints.
	 * Called only once.
	 * @param assertBreakpoints A list of addresses to put an assert breakpoint on.
	 */
	public setAssertBreakpoints(assertBreakpoints: Array<GenericBreakpoint>) {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * Promise is called when ready.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertBreakpoints(enable: boolean): Promise<void>{
		assert(false);	// override this
	}


	/**
	 * Set all log points.
	 * Called only once.
	 * Promise is called after the last logpoint is set.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 */
	public async setLogpoints(logpoints: Array<GenericBreakpoint>): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * Promise is called all logpoints are set.
	 * @param group The group to enable/disable. If undefined: all groups. E.g. "UNITTEST".
	 * @param enable true=enable, false=disable.
	 */
	public async enableLogpoints(group: string, enable: boolean): Promise<void> {
		assert(false);	// override this
	}


	/*
	 * Sets breakpoint in the Remote.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public setBreakpoint(bp: RemoteBreakpoint): number {
		assert(false);	// override this
		// return
		return 0;
	}


	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpoint(bp: RemoteBreakpoint) {
		assert(false);	// override this
	}


	/**
	 * Sends a command to the emulator.
	 * @param cmd E.g. 'get-registers'.
	 * @returns A Promise in remote (emulator) dependent format.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		return "";
	}


	/**
	 * Reads a memory dump and converts it to a number array.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public async getMemoryDump(address: number, size: number): Promise<Uint8Array> {
		assert(false);	// override this
		return new Uint8Array();
	}


	/**
	 * Writes a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Writes one memory value to the emulator.
	 * The write is followed by a read and the read value is returned
	 * by tehe Promise.
	 * @param address The address to change.
	 * @param value The new (byte) value.
	 * @returns A Promise with the real value.
	 */
	public async writeMemory(address: number, value: number): Promise<number> {
		assert(false);	// override this
		return 0;
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @returns A Promise with an array with the available memory pages.
	 */
	public async getMemoryPages(): Promise<MemoryPage[]> {
		return [];
	}


	// ZX Next related ---------------------------------

	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @returns A promise with the value of the register.
	 */
	public async getTbblueRegister(registerNr: number): Promise<number> {
		// TODO: Check if function is implemented before allowing e.g. to display sprites etc.
		return 0;
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @returns A Promise that returns a 256 byte Array<number> with the palette values.
	 */
	public async getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {
		return [];
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions (xl, xr, yt, yb).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number}> {
		return {xl: 0, xr: 0, yt: 0, yb: 0};
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @returns A Promise with an array of sprite data.
	 */
	public async getTbblueSprites(slot: number, count: number): Promise<Array<Uint8Array>> {
		return [];
	}

	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @preturns A Promise with an array of sprite pattern data.
	 */
	public async getTbblueSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		return [];
	}


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @returns A Promise called after being quiet for the given timeout.
	 */
	public async executeAfterBeingQuietFor(timeout: number): Promise<void> {
		assert(false);	// override this
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM + the registers.
	 * Override.
	  * @returns State data.
	 */
	public async stateSave(): Promise<StateZ80> {
		return null as any;
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * Override.
	 * @param state Pointer to the data to restore.
	 */
	public async stateRestore(state: StateZ80): Promise<void> {
	}


	/**
	 * Reads the short history and emits it.
	 * Is used to display short history decoration.
	 * Is called by the EmulDebugAdapter.
	 */
	public handleHistorySpot() {
	}
}

