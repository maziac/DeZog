import {zSocket, ZesaruxSocket} from './zesaruxsocket';
import {Utility} from '../../misc/utility';
import {Labels} from '../../labels/labels';
import {Settings} from '../../settings/settings';
import {GenericWatchpoint, GenericBreakpoint} from '../../genericwatchpoint';
import {RemoteBase, RemoteBreakpoint} from '../remotebase';
import {ZesaruxCpuHistory, DecodeZesaruxHistoryInfo} from './zesaruxcpuhistory';
import {Z80RegistersClass, Z80Registers} from '../z80registers';
import {DecodeZesaruxRegisters, DecodeZesaruxRegistersColecovision, DecodeZesaruxRegistersZx128k, DecodeZesaruxRegistersZx16k, DecodeZesaruxRegistersZx48k, DecodeZesaruxRegistersZxNext} from './decodezesaruxdata';
import {CpuHistory, CpuHistoryClass} from '../cpuhistory';
import {PromiseCallbacks} from '../../misc/promisecallbacks';import {MemoryModelColecoVision, MemoryModelUnknown, MemoryModelZx128k, MemoryModelZx16k, MemoryModelZx48k, MemoryModelZxNextTwoRom} from '../MemoryModel/predefinedmemorymodels';
import {MemoryModelZX81_16k} from '../MemoryModel/zx81predefinedmemorymodels'; // @zx81
import * as semver from 'semver';


/// Minimum required ZEsarUX version.
const MIN_ZESARUX_VERSION = '10.3';


// Some Zesarux constants.
class Zesarux {
	static MAX_ZESARUX_BREAKPOINTS = 100;	///< max count of breakpoints.
	static MAX_BREAKPOINT_CONDITION_LENGTH = 256; ///< breakpoint condition string length.
	static MAX_MESSAGE_CATCH_BREAKPOINT = 4 * 32 - 1;	///< breakpoint condition should also be smaller than this.
}




/**
 * The representation of the ZEsarUX emulator.
 * It receives the requests from the DebugAdapter and communicates with
 * the ZesaruxSocket.
 */
export class ZesaruxRemote extends RemoteBase {
	/// Max count of breakpoints. Note: Number 100 is used for stepOut.
	static MAX_USED_BREAKPOINTS = Zesarux.MAX_ZESARUX_BREAKPOINTS - 1;

	/// The breakpoint used for step-out.
	static STEP_BREAKPOINT_ID = 100;

	// The associated Promise resolve. Stored here to be called at dispose.
	protected continueResolve?: PromiseCallbacks<string|undefined>;

	/// Array that contains free breakpoint IDs.
	private freeBreakpointIds = new Array<number>();

	/// The read ZEsarUx version number as string, e.g. 7.1. Is read directly after socket connection setup.
	public zesaruxVersion = "";

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = true;
		this.supportsLOGPOINT = false;
		this.supportsBreakOnInterrupt = false;
		// Reverse debugging / CPU history
		CpuHistoryClass.setCpuHistory(new ZesaruxCpuHistory());
		CpuHistory.decoder = new DecodeZesaruxHistoryInfo();
	}


	/**
	 * Checks if there still is an open promise and runs it.
	 */
	public dispose() {
		// Check for open promise
		if (this.continueResolve) {
			// Call just to end
			this.continueResolve.resolve('');
			this.continueResolve = undefined;
		}
		// As last
		super.dispose();
	}


	/// Initializes the machine.
	public async doInitialization(): Promise<void> {
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
		await super.disconnect();
		if (!zSocket)
			return;
		return new Promise<void>(resolve => {
			// Terminate the socket
			(async () => {
				try {
					await zSocket.quit();
				}
				catch {};
				resolve();
			})();

		});
	}


	/**
	 * Override removeAllListeners to remove listeners also from socket.
	 * @param event
	 */
	public removeAllListeners(event?: string | symbol | undefined): this {
		super.removeAllListeners();
		// Additionally remove listeners from socket.
		zSocket?.removeAllListeners();
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
			this.emit('debug_console', "Log: " + msg);
		});

		zSocket.on('warning', msg => {
			if (this.terminating)
				return;
			// Error message from Zesarux
			msg = "ZEsarUX: " + msg;
			this.emit('warning', msg);
		});

		zSocket.on('error', err => {
			if (this.terminating)
				return;
			// and terminate
			err.message += " (Error in connection to ZEsarUX!)";
			try {
				this.emit('error', err);
			}
			catch {};
		});
		zSocket.on('close', () => {
			if (this.terminating)
				return;
			this.listFrames.clear();
			this.breakpoints.length = 0;
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});
		zSocket.on('end', () => {
			if (this.terminating)
				return;
			// and terminate
			const err = new Error('ZEsarUX terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});
		zSocket.on('connected', () => {
			if (this.terminating)
				return;

			(async () => {
				try {
					// Initialize
					await zSocket.sendAwait('close-all-menus');
					await zSocket.sendAwait('about');
					this.zesaruxVersion = await zSocket.sendAwait('get-version');
					const version = semver.coerce(this.zesaruxVersion);
					const min_version = semver.coerce(MIN_ZESARUX_VERSION);
					// Check version. E.g. "7.1-SN", "10.3" or "10.10"
					if (semver.lt(version, min_version)) {
						try {
							// Version too low
							await zSocket.quit();
						}
						catch {};
						try {
							const err = new Error('Please update ZEsarUX. Need at least version ' + MIN_ZESARUX_VERSION + '.');
							this.emit('error', err);
						}
						catch {};
						return;
					}

					// Allow extensions
					this.zesaruxConnected();

					// Wait for previous command to finish
					await zSocket.executeWhenQueueIsEmpty();

					const debug_settings = (Settings.launch.zrcp.skipInterrupt) ? 32 : 0;
					await zSocket.sendAwait('set-debug-settings ' + debug_settings);

					// Reset the cpu before loading.
					if (Settings.launch.zrcp.resetOnLaunch)
						await zSocket.sendAwait('hard-reset-cpu');

					// Enter step-mode (stop)
					await zSocket.sendAwait('enter-cpu-step');

					//await zSocket.executeWhenQueueIsEmpty();
					const waitBeforeMs = Settings.launch.zrcp.loadDelay;
					await Utility.timeout(waitBeforeMs);

					// Load executable
					await this.load();

					// Get the machine type, e.g. tbblue, zx48k etc.
					// Is required to find the right slot/bank paging.
					// Distinguished are only: 48k, 128k and tbblue.
					const mtResp = await zSocket.sendAwait('get-current-machine') as string;
					const machineType = mtResp.toLowerCase();
					if (machineType.includes("tbblue") || machineType.includes("zx spectrum next")) {
						// "ZX Spectrum Next" since zesarux 9.2.
						// 8x8k banks
						Z80Registers.decoder = new DecodeZesaruxRegistersZxNext();
						this.memoryModel = new MemoryModelZxNextTwoRom();
					}
					else if (machineType.includes("128k")) {
						// 4x16k banks
						Z80Registers.decoder = new DecodeZesaruxRegistersZx128k();
						this.memoryModel = new MemoryModelZx128k();
					}
					else if (machineType.includes("48k")) {
						// 4x16k banks
						Z80Registers.decoder = new DecodeZesaruxRegistersZx48k();
						this.memoryModel = new MemoryModelZx48k();
					}
					else if (machineType.includes("16k")) {
						// 4x16k banks
						Z80Registers.decoder = new DecodeZesaruxRegistersZx16k();
						this.memoryModel = new MemoryModelZx16k();
					}
					else if (machineType.includes("colecovision")) {
						// 4 Banks
						Z80Registers.decoder = new DecodeZesaruxRegistersColecovision();
						this.memoryModel = new MemoryModelColecoVision();
					}
					else if (machineType.includes("zx81")) { // @zx81
						// 1 Bank (i.e. no banks, just memory)
						Z80Registers.decoder = new DecodeZesaruxRegisters(1);
						this.memoryModel = new MemoryModelZX81_16k();
					}
					else {
						// For all others:
						Z80Registers.decoder = new DecodeZesaruxRegisters(1);
						this.memoryModel = new MemoryModelUnknown();
					}
					// Init
					this.memoryModel.init();

					// Initialize more
					await this.initAfterLoad();

					// Send 'initialize' to Machine.
					this.emit('initialized');
				}
				catch (e) {
					// Some error occurred
					try {
						this.emit('error', e);
					}
					catch {};
				}
			})();
		});
	}


	/**
	 * Does the initialization necessary after a load or state restore.
	 */
	protected async initAfterLoad(): Promise<void> {
		// Initialize breakpoints
		await this.initBreakpoints();

		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled) {
			await zSocket.sendAwait('cpu-code-coverage enabled yes', true);	// suppress any error
			await zSocket.sendAwait('cpu-code-coverage clear');
		}
		else
			await zSocket.sendAwait('cpu-code-coverage enabled no', true);	// suppress any error

		// Reverse debugging.
		CpuHistory.init();

		// Enable extended stack
		await zSocket.sendAwait('extended-stack enabled no', true);	// bug in ZEsarUX
		await zSocket.sendAwait('extended-stack enabled yes');
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
	protected async initBreakpoints(): Promise<void> {
		// Clear memory breakpoints (watchpoints)
		await zSocket.sendAwait('clear-membreakpoints');

		// Clear all breakpoints
		await zSocket.sendAwait('enable-breakpoints', true);
		await this.clearAllZesaruxBreakpoints();

		// Init breakpoint array
		this.freeBreakpointIds.length = 0;
		for (let i = ZesaruxRemote.MAX_USED_BREAKPOINTS; i > 0; i--)  // 1-99
			this.freeBreakpointIds.push(i);
	}


	/**
	 * Retrieves the slots from zesarux directly.
	 */
	protected async getSlotsFromEmulator(): Promise<number[]> {
		// Check if in reverse debugging mode
		// In this mode registersCache should be set and thus this function is never called.
		Utility.assert(CpuHistory);
		Utility.assert(!CpuHistory.isInStepBackMode());

		// Decode
		const slotsString: string = await zSocket.sendAwait('get-memory-pages');
		const slotsStringArray = slotsString.split(' ');
		// Check for no slots
		let slots;
		let count = slotsStringArray.length - 1;
		switch (count) {
			case 4:
				// ZX128, e.g. RO1 RA5 RA2 RA0
				for (let i = 0; i < count; i++)
					slotsStringArray[i] = slotsStringArray[i].substring(1);	// Skip "R"
			// Flow through
			case 8:
				// ZXNext
				slots = new Array<number>(count);
				for (let i = 0; i < count; i++) {
					const bankString = slotsStringArray[i];
					const type = bankString.substring(0, 1);
					const rest = bankString.substring(1);
					let bankNumber = parseInt(rest);
					if (type == 'O') {
						// Beginning with 0xFE is ROM
						bankNumber += 0xFE;
					}
					slots[i] = bankNumber;
				}
				break;
			default:
				// No slots
				slots = new Array<number>(count);
				break;
		}
		return slots;
	}


	/**
	 * If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		// Check if in reverse debugging mode
		// In this mode registersCache should be set and thus this function is never called.
		Utility.assert(CpuHistory);
		Utility.assert(!CpuHistory.isInStepBackMode());

		// Get new (real emulator) data
		const data = await zSocket.sendAwait('get-registers');
		// Store data: e.g: "PC=8000 SP=6000 AF=0054 BC=8000 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0 MMU=80028003000a000b0004000500000001"
		Z80Registers.setCache(data);
	}


	/**
	 * Sets the value for a specific register.
	 * Reads the value from the emulator and returns it in the promise.
	 * Note: if in reverse debug mode the function should do nothing and the promise should return the previous value.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 */
	public async setRegisterValue(register: string, value: number) {
		// Set value
		await zSocket.sendAwait('set-register ' + register + '=' + value);
		// Get real value (should be the same as the set value)
		await this.getRegistersFromEmulator();
	}


	/**
	 * Sets the slot to a specific bank.
	 * Used by the unit tests.
	 * Supports only tbblue.
	 * @param slot The slot to set.
	 * @param bank The bank for the slot.
	 */
	public async setSlot(slotIndex: number, bank: number): Promise<void> {
		await zSocket.sendAwait('tbblue-set-register ' + (0x50 + slotIndex) + ' ' + bank);
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
	protected getStackEntryType(stackEntryValue: string): Promise<{name: string, callerAddr: number} | undefined> {
		// Get type
		const type = stackEntryValue.substring(5);
		if (type == 'call' || type == 'rst') {
			// Get the addresses
			return super.getStackEntryType(stackEntryValue);
		}

		return new Promise<{name: string, callerAddr: number} | undefined>(resolve => {
			if (type.includes('interrupt')) {
				// Interrupt
				const retAddr = parseInt(stackEntryValue, 16);
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
	 * 64k addresses.
	 * @returns The stack, i.e. the word values from topOfStack to SP.
	 * But no more than about 100 elements.
	 * The values are returned as hex string with additional from the
	 * ZEsarUX extended stack, e.g.:
	 *  15F7H maskable_interrupt
	 * FFFFH push
	 * 15E1H call
	 * 0000H default
	 */
	public async getStackFromEmulator(): Promise<Array<string>> {
		// Get normal callstack
		const stack = await super.getStackFromEmulator();
		// Get e-stack
		const depth = stack.length;
		if (depth == 0) {
			return stack;
		}
		// Get extended stack from zesarux
		let data = await zSocket.sendAwait('extended-stack get ' + depth);
		data = data.replace(/\r/gm, "");
		const zStack = data.split('\n');
		let len = zStack.length - 1;
		zStack.splice(len);	// ignore last (is empty)
		if (depth < len)
			len = depth;
		// Mix stacks
		for (let i = 0; i < len; i++) {
			const type = zStack[i].substring(5);
			// Add to original stack
			stack[depth - 1 - i] += type;
		}
		return stack;
	}


	/**
	 * 'continue' debugger program execution.
	 * @returns A Promise with a string containing the break reason.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 */
	public async continue(): Promise<string> {
		return new Promise<string>(resolve => {
			// Remember the promise resolve for dispose
			Utility.assert(!this.continueResolve);
			this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

			// Run
			zSocket.sendInterruptableRunCmd(text => {
				(async () => {
					// (could take some time, e.g. until a breakpoint is hit)
					// Clear register cache
					await this.getRegistersFromEmulator();
					await this.getCallStackFromEmulator();
					// Handle code coverage
					await this.handleCodeCoverage();
					// The reason is the 2nd line
					let breakReasonString = this.getBreakReason(text);

					// Check if it was an ASSERTION
					const pcLong = this.getPCLong();
					const abps = this.assertionBreakpoints.filter(abp => abp.longAddress == pcLong);
					for (const abp of abps) {
						let conditionTrue = true;
						if (abp.condition != undefined) {
							try {
								const evalCond = Utility.evalExpression(abp.condition, true);
								conditionTrue = (evalCond != 0);
							}
							catch (e) {}	// Ignore errors
						}
						if (conditionTrue) {
							const assertionCond = Utility.getAssertionFromCondition(abp.condition);
							//reasonString = "Assertion failed: " + assertionCond;
							const replaced = Utility.replaceVarsWithValues(assertionCond);
							breakReasonString = "Assertion failed: " + replaced;
						}
					}

					// Read the spot history
					await CpuHistory.getHistorySpotFromRemote();
					// Call handler
					this.continueResolve!.resolve(breakReasonString);
				})();
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
		const textArray = text.split('\n');
		for (const reason of textArray)
			if ((reason.indexOf('point hit') >= 0) || (reason.indexOf('point fired') >= 0)) {
				result = reason;
				break;
			}
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
	 * 'step over' an instruction in the debugger.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason.
	 */
	public async stepOver(): Promise<string | undefined> {
		return new Promise<string | undefined>(resolve => {
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
			// Therefore the CALL and RST are executed with a "run".
			// All others are executed with a step-into.
			// Only exception is LDDR etc. Those are executed as step-over.

			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				const pc = Z80Registers.getPC();
				const disasm = await zSocket.sendAwait('disassemble ' + pc);
				// Check if this was a "CALL something" or "CALL n/z,something"
				const opcode = disasm.substring(7, 7 + 4);

				// For RST and CALL we break when SP reaches the current SP again.
				// This is better than setting a PC breakpoint. A PC breakpoint is maybe never
				// reached if the stack is manipulated.
				// A SP breakpoint might be hit when the stack is being manipulated, but at least it
				// is hit and does not run forever.
				if (opcode == "RST " || opcode == "CALL") {
					// Set condition
					const sp = Z80Registers.getSP();
					const condition = 'SP>=' + sp;
					// We do a "run" instead of a step-into/over
					// Set action first (no action).
					const bpId = ZesaruxRemote.STEP_BREAKPOINT_ID;
					// Clear register cache
					//Z80Registers.clearCache();
					// Set breakpoint
					await this.sendSetBreakpoint(bpId, condition);

					// Run
					zSocket.sendInterruptableRunCmd(text => {
						(async () => {
							// (could take some time, e.g. until a breakpoint is hit)
							// Clear register cache
							await this.getRegistersFromEmulator();
							await this.getCallStackFromEmulator();
							// Handle code coverage
							await this.handleCodeCoverage();

							// Break reason
							let breakReasonString;
							// Check if temporary breakpoint hit
							const spAfter = Z80Registers.getSP();
							if (spAfter < sp) {
								// Some other breakpoint was hit.
								// The break reason is in the returned text
								breakReasonString = this.getBreakReason(text);
							}

							// Disable breakpoint
							await zSocket.sendAwait('disable-breakpoint ' + bpId);
							// Read the spot history
							await CpuHistory.getHistorySpotFromRemote();

							this.continueResolve!.resolve(breakReasonString);
						})();
					});
				}
				else {
					// "normal" opcode, just check for repetitive ones
					const cmd = (opcode == "LDIR" || opcode == "LDDR" || opcode == "CPIR" || opcode == "CPDR") ? 'cpu-step-over' : 'cpu-step';
					// Clear register cache
					//Z80Registers.clearCache();
					const result = await zSocket.sendAwait(cmd);
					// Clear cache
					await this.getRegistersFromEmulator();
					await this.getCallStackFromEmulator();
					// Handle code coverage
					await this.handleCodeCoverage();
					// Call handler
					const breakReasonString = this.getBreakReason(result);
					// Read the spot history
					await CpuHistory.getHistorySpotFromRemote();
					this.continueResolve.resolve(breakReasonString);
				}
			})();
		});
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason.
	 */
	public async stepInto(): Promise<string | undefined> {
		return new Promise<string | undefined>(resolve => {
			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				// Normal step into.
				await zSocket.sendAwait('cpu-step');
				// Clear cache
				await this.getRegistersFromEmulator();
				await this.getCallStackFromEmulator();
				// Handle code coverage
				await this.handleCodeCoverage();
				// Read the spot history
				await CpuHistory.getHistorySpotFromRemote();
				this.continueResolve.resolve(undefined);
			})();
		});
	}


	/**
	 * Resets the T-States counter. Used before stepping to measure the
	 * time.
	 */
	public async resetTstates(): Promise<void> {
		await zSocket.sendAwait('reset-tstates-partial');
	}


	/**
	 * Returns the number of T-States (since last reset).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getTstates(): Promise<number> {
		const data = await zSocket.sendAwait('get-tstates-partial');
		const tStates = parseInt(data);
		return tStates;
	}


	/**
	 * Returns the current CPU frequency
	 * @returns The CPU frequency in Hz (e.g. 3500000 for 3.5MHz) or 0 if not supported.
	 */
	public async getCpuFrequency(): Promise<number> {
		const data = await zSocket.sendAwait('get-cpu-frequency');
		const cpuFreq = parseInt(data);
		return cpuFreq;
	}


	/**
	 * Reads the coverage addresses and clears them in ZEsarUX.
	 */
	protected async handleCodeCoverage(): Promise<void> {
		// Check if code coverage is enabled
		if (!Settings.launch.history.codeCoverageEnabled)
			return;

		// Get coverage
		const data = await zSocket.sendAwait('cpu-code-coverage get');
		// Check for error
		if (data.startsWith('Error'))
			return;
		// Get slots
		//this.getRegisters().then(() => {
		// Get current slots
		const slots = Z80Registers.getSlots();
		// Parse data and collect addresses
		const addresses = new Set<number>();
		const length = data.length;
		for (let k = 0; k < length; k += 5) {
			const addressString = data.substring(k, k + 4);
			const address = parseInt(addressString, 16);
			// Change to long address
			// Note: this is not 100% correct, i.e. if the slots have changed during execution the wrong values are displayed here.
			// But since ZEsarUX only returns 64k addresses it is all that
			// can be done here.
			const longAddress = Z80Registers.createLongAddress(address, slots);
			addresses.add(longAddress);
		}
		// Clear coverage in ZEsarUX
		await zSocket.sendAwait('cpu-code-coverage clear');
		// Emit code coverage event
		this.emit('coverage', addresses);
	}


	/**
	 * 'step out' of current subroutine.
	 * @returns A Promise with a string containing the break reason.
	 */
	public async stepOut(): Promise<string | undefined> {
		return new Promise<string | undefined>(resolve => {
			// Zesarux does not implement a step-out. Therefore we analyze the call stack to
			// find the first return address.
			// Then a breakpoint is created that triggers when an executed RET is found  the SP changes to that address.
			// I.e. when the RET (or (RET cc) gets executed.
			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				// Get SP
				const sp = Z80Registers.getSP();

				// calculate the depth of the call stack
				let depth = this.topOfStack - sp;
				if (depth > ZesaruxRemote.MAX_STACK_ITEMS)
					depth = ZesaruxRemote.MAX_STACK_ITEMS;
				if (depth == 0) {
					// no call stack, nothing to step out, i.e. immediately return
					this.continueResolve.resolve("Call stack empty");
					return;
				}
				else if (depth < 0) {
					// Callstack corrupted?
					this.continueResolve.resolve("SP above topOfStack. Stack corrupted?");
					return;
				}

				// get stack from zesarux
				let data: string = await zSocket.sendAwait('extended-stack get ' + depth);
				data = data.replace(/\r/gm, "");
				const zStack = data.split('\n');
				zStack.splice(zStack.length - 1);	// ignore last (is empty)

				// Loop through stack:
				let bpSp = sp;
				for (const addrTypeString of zStack) {
					// Increase breakpoint address
					bpSp += 2;
					// Split address and type
					const type = addrTypeString.substring(6);
					if (type == "call" || type == "rst" || type.includes("interrupt")) {
						//const addr = parseInt(addrTypeString,16);
						// Caller found, set breakpoint: when SP gets 2 bigger than the current value.
						const bpId = ZesaruxRemote.STEP_BREAKPOINT_ID;
						// Note: PC=PEEKW(SP-2) finds an executed RET.
						const condition = 'PC=PEEKW(SP-2) AND SP>=' + bpSp;
						// Set breakpoint
						await this.sendSetBreakpoint(bpId, condition);

						// Clear register cache
						//Z80Registers.clearCache();
						// Run
						zSocket.sendInterruptableRunCmd(async text => {	// NOSONAR
							// (could take some time, e.g. until a breakpoint is hit)
							// Clear register cache
							await this.getRegistersFromEmulator();
							await this.getCallStackFromEmulator();
							// Handle code coverage
							await this.handleCodeCoverage();

							// Break reason
							let breakReasonString;
							// Check if temporary breakpoint hit
							const pcAfter = Z80Registers.getPC();
							const spAfter = Z80Registers.getSP();
							const data = await this.readMemoryDump(spAfter - 2, 2);
							const peekw = data[0] + 256 * data[1];
							if (spAfter < bpSp || pcAfter != peekw) {
								// Some other breakpoint was hit.
								// The break reason is in the returned text
								breakReasonString = this.getBreakReason(text);
							}

							// Disable breakpoint
							await zSocket.sendAwait('disable-breakpoint ' + bpId);
							// Read the spot history
							await CpuHistory.getHistorySpotFromRemote();
							this.continueResolve!.resolve(breakReasonString);
						});

						// Return on a CALL etc.
						return;
					}
				}

				// If we reach here the stack was either empty or did not contain any call, i.e. nothing to step out to.
				this.continueResolve.resolve(undefined);
			})();
		});
	}



	/**
	 * Sets one watchpoint in the remote.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * It uses ZEsarUX new fast 'memory breakpoints' for this if the breakpoint has no additional condition.
	 * If it has a condition: not implemented.
	 * @param wp The watchpoint to set.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		// Check if condition is used
		if (wp.condition && wp.condition.length > 0) {
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
			let addr = wp.longOr64kAddress & 0xFFFF;
			await zSocket.sendAwait('set-membreakpoint ' + addr.toString(16) + 'h ' + type + ' ' + size);
		}
	}


	/**
	 * Removes one watchpoint from the remote and removes it from the 'watchpoints' list.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to remove. Will set 'bpId' in the 'watchPoint' to undefined.
	 */
	public async removeWatchpoint(wp: GenericWatchpoint): Promise<void> {
		// Clear watchpoint with range
		const size = wp.size;
		let addr = wp.longOr64kAddress & 0xFFFF;
		await zSocket.sendAwait('set-membreakpoint ' + addr.toString(16) + 'h 0 ' + size);
	}


	/**
	 * Enables/disables all assertion breakpoints set from the sources.
	 * Promise is called when ready.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertionBreakpoints(enable: boolean): Promise<void> {
		if (enable) {
			for (let abp of this.assertionBreakpoints) {
				// Set breakpoint
				if (!abp.bpId) {
					abp.bpId = await this.setBreakpointZesarux(abp.longAddress, abp.condition);
				}

			}
		}
		else {
			// Loop reverse (just to re-use the same IDs if multiple disable/enable are done)
			for (let i = this.assertionBreakpoints.length - 1; i >= 0; i--) {
				const abp = this.assertionBreakpoints[i];
				// Remove breakpoint
				if (abp.bpId) {
					await this.removeBreakpointZesarux(abp.bpId);
					abp.bpId = undefined;
				}
			}
		}
		this.assertionBreakpointsEnabled = enable;
	}


	/**
	 * Set all log points.
	 * Called only once.
	 * Promise is called after the last logpoint is set.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param enable Enable or disable the logpoints.
	 */
	public async enableLogpoints(logpoints: Array<GenericBreakpoint>, enable: boolean): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * Promise is called all logpoints are set.
	 * @param group The group to enable/disable. If undefined: all groups. E.g. "UNITTEST".
	 * @param enable true=enable, false=disable.
	 */
	public async enableLogpointGroup(group: string, enable: boolean): Promise<void> {
		if (this.logpoints.size > 0)
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
	 * Labels: ZEsarUX does not know the labels only addresses. Therefore all
	 * labels need to be evaluated first and converted to addresses.
	 * @param condition The general condition format, e.g. "A < 10 && HL != 0".
	 * Even complex parenthesis forms are supported, e.g. "(A & 0x7F) == 127".
	 * @returns The zesarux format.
	 */
	protected convertCondition(condition?: string): string | undefined {
		if (!condition || condition.length == 0)
			return '';	// No condition

		// Simplify assertions
		if (condition == '!(false)')
			return '';	// Always true

		// Convert labels
		let regex = /\b[_a-z][.0-9a-z_]*\b/gi;
		let conds = condition.replace(regex, label => {
			// Check if register
			if (Z80RegistersClass.isRegister(label))
				return label;
			// Convert label to number.
			let addr = Labels.getNumberForLabel(label);
			// If undefined, don't touch it.
			if (addr == undefined)
				return label;
			addr &= 0xFFFF;	// for conditions only 64k are used
			return addr.toString();
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
			const valh = value.substring(2) + 'H';
			return valh;
		});

		//console.log('Converted condition "' + condition + '" to "' + conds);
		return conds;
	}



	/**
	 * Sets the breakpoint at zesarux but does not update this.breakpoints.
	 * I.e. this function can be used by ASSERTIONs as well.
	 * @param address The (long) address to break on. If address is < 0 then only the condition is used.
	 * @param bpCondition An additional condition. May also be undefined or ''.
	 * @returns A breakpoint ID (1-100 for zesarux). Or 0 if an error occurred.
	 */
	public async setBreakpointZesarux(address: number, bpCondition?: string): Promise<number> {
		// Get condition
		let zesaruxCondition = this.convertCondition(bpCondition);
		if (zesaruxCondition == undefined) {
			this.emit('warning', "Breakpoint: Can't set condition: " + (bpCondition ?? ''));
			return 0;
		}

		// Get free id
		const bpId = this.freeBreakpointIds.pop();
		if (bpId == undefined)
			return 0;	// no free ID

		// Create condition from address and bp.condition
		let condition = '';
		if (address >= 0) {
			condition = 'PC=0' + Utility.getHexString(address & 0xFFFF, 4) + 'h';
			// Add check for long BP
			let bank = Z80RegistersClass.getBankFromAddress(address);
			if (bank != -1) {
				// Yes, it's a long address
				// Check for ZX128K: ZEsarUX uses different wording:
				if (this.memoryModel instanceof MemoryModelZx128k) {
					// ZX128K:
					// 0000-3FFF:	ROM
					// 4000-BFFF: 	-
					// C000-FFFF:	RAM
					const addr = address & 0xFFFF;
					if (addr <= 0x3FFF) {
						// Treat ROM banks special for ZEsarUX
						bank = (bank & 0x01);
						condition += ' and ROM=' + bank;
					}
					else if (addr >= 0xC000) {
						// RAM
						condition += ' and RAM=' + bank;
					}
				}
				else if (this.memoryModel instanceof MemoryModelZxNextTwoRom) {
					// ZXNext
					const slot = Z80Registers.getSlotFromAddress(address);
					// Treat ROM banks special for ZEsarUX
					if (bank >= 0xFC && bank <= 0xFF) {	// 252 - 255
						// 0xFC = 252 -> 8000h
						// 0xFD = 253 -> 8001h
						// 0xFE = 254 -> 8002h
						// 0xFF = 255 -> 8003h
						bank = 0x8000 + (bank & 0x3)
					}
					condition += ' and SEG' + slot + '=' + bank;
				}
			}
			// Add BP condition
			if (zesaruxCondition.length > 0) {
				condition += ' and ';
				zesaruxCondition = '(' + zesaruxCondition + ')';
			}
		}
		if (zesaruxCondition.length > 0)
			condition += zesaruxCondition;

		// Set breakpoint
		await this.sendSetBreakpoint(bpId, condition);

		// Return
		return bpId;
	}


	/** The setting of the breakpoint for zrcp was centralized in this function to ease
	 * making changes for the zesarux versions.
	 * With zesarux version 10.3 this was finally changed (about May-2023).
	 * Version 10.2 is not supported (as it opens a window after the zrcp connection).
	 * Version 10.1 is supported with the old breakpoint actions ("prints"). This is also
	 * the only version that DeZog 2.7.x supports.
	 * DeZog 3.3.0 only supports ZEsarUX 10.3 and up.
	 * @param bpId The breakpoint id to use.
	 * @param condition A breakpoint condition.
	 */
	protected async sendSetBreakpoint(bpId: number, condition: string) {
		// For zesarux version 10.1:
		// Set action first (no action)
		// await zSocket.sendAwait('set-breakpointaction ' + bpId + ' prints breakpoint ' + bpId);
		// // Set the breakpoint
		// await zSocket.sendAwait('set-breakpoint ' + bpId + ' ' + condition);
		// // Enable the breakpoint
		// await zSocket.sendAwait('enable-breakpoint ' + bpId);

		// For zesarux version 10.3:
		// Set action first (no action)
		await zSocket.sendAwait('set-breakpointaction ' + bpId);	// Since ZEsarUX 10.2 an empty breakpoint action is required.
		// Set the breakpoint
		await zSocket.sendAwait('set-breakpoint ' + bpId + ' ' + condition);
		// Enable the breakpoint
		await zSocket.sendAwait('enable-breakpoint ' + bpId);
	}


	/**
	 * Clears one breakpoint at zesarux.
	 * Does not affect the this.breakpoints list.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async removeBreakpointZesarux(bpId: number): Promise<void> {
		// Disable breakpoint
		await zSocket.sendAwait('disable-breakpoint ' + bpId);
		this.freeBreakpointIds.push(bpId);
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint. If bp.address is >= 0 then it adds the condition "PC=address".
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public async setBreakpoint(bp: RemoteBreakpoint): Promise<number> {
		// Check for logpoint (not supported)
		if (bp.log) {
			this.emit('warning', 'ZEsarUX does not support logpoints ("' + bp.log + '").');
			// set to unverified
			bp.longAddress = -1;
			return 0;
		}

		// Set breakpoint
		const bpId = await this.setBreakpointZesarux(bp.longAddress, bp.condition);
		// Check for error
		if (bpId <= 0) {
			// set to unverified
			bp.longAddress = -1;
			return 0
		}

		// Add bp Id
		bp.bpId = bpId;

		// Add to list
		this.breakpoints.push(bp);
		// Return
		return bp.bpId;
	}


	/**
	 * Clears one breakpoint.
	 */
	public async removeBreakpoint(bp: RemoteBreakpoint): Promise<void> {
		const bpId = bp.bpId;
		if (!bpId)
			return;	// 0 or undefined
		// Disable breakpoint
		await this.removeBreakpointZesarux(bpId);
		// Remove from list
		let index = this.breakpoints.indexOf(bp);
		Utility.assert(index !== -1, 'Breakpoint should be removed but does not exist.');
		this.breakpoints.splice(index, 1);
	}


	/**
	 * Disables all breakpoints set in zesarux on startup.
	 */
	protected async clearAllZesaruxBreakpoints(): Promise<void> {
		//console.time("send-disable-breakpoint");
		// Note: I measured that sometimes zesarux requires 0.5 secs to answer for one disable breakpoint.
		// Therefore I now send all at once, not with await and wait at the end.
		for (let i = 1; i <= Zesarux.MAX_ZESARUX_BREAKPOINTS; i++) {
			zSocket.send('disable-breakpoint ' + i);
		}
		await zSocket.executeWhenQueueIsEmpty();
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
	public async setBreakpoints(path: string, givenBps: Array<RemoteBreakpoint>): Promise<Array<RemoteBreakpoint>> {
		// Do most of the work
		const bps = await super.setBreakpoints(path, givenBps);
		// But wait for the socket.
		await zSocket.executeWhenQueueIsEmpty();
		return bps;
	}


	/**
	 * Sends a command to ZEsarUX.
	 * @param cmd E.g. 'get-registers'.
	 * @returns A Promise with the result of the command.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		cmd = cmd.trim();
		if (cmd.length == 0) {
			// No command given
			throw new Error('No command given.');
		}

		// Send command to ZEsarUX
		const data = await zSocket.sendAwait(cmd);
		// Call handler
		return data;
	}


	/**
	 * Reads a memory dump from zesarux and converts it to a number array.
	 * @param addr64k
	 *  The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public async readMemoryDump(address: number, size: number): Promise<Uint8Array> {
		// Use chunks
		const chunkSize = 0x10000;// 0x1000;
		// Retrieve memory values
		const values = new Uint8Array(size);
		let k = 0;
		while (size > 0) {
			const retrieveSize = (size > chunkSize) ? chunkSize : size;
			const data = await zSocket.sendAwait('read-memory ' + address + ' ' + retrieveSize);
			const len = data.length;
			Utility.assert(len / 2 == retrieveSize);
			for (let i = 0; i < len; i += 2) {
				const valueString = data.substring(i, i + 2);
				const value = parseInt(valueString, 16);
				values[k++] = value;
			}
			// Next chunk
			size -= chunkSize;
		}

		// Return
		return values;
	}


	/**
	 * Writes a memory dump to zesarux.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		// Use chunks
		const chunkSize = 0x10000; //0x1000;
		let k = 0;
		let size = dataArray.length;
		while (size > 0) {
			const sendSize = (size > chunkSize) ? chunkSize : size;
			// Convert array to long hex string.
			let bytes = '';
			for (let i = 0; i < sendSize; i++) {
				bytes += Utility.getHexString(dataArray[k++], 2);
			}
			// Send
			await zSocket.sendAwait('write-memory-raw ' + address + ' ' + bytes);
			// Next chunk
			size -= chunkSize;
		}
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
		// Write byte
		await zSocket.sendAwait('write-memory ' + address + ' ' + value);
		// Read byte
		const data = await zSocket.sendAwait('read-memory ' + address + ' 1');
		// call handler
		const readValue = parseInt(data, 16);
		return readValue;
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM, registers etc.
	 * @param filePath The file path to store to.
	 * @returns State data.
	 */
	public async stateSave(filePath: string): Promise<void> {
		// Save as zsf
		filePath += ".zsf";
		await zSocket.sendAwait('snapshot-save ' + filePath);
	}


	/**
	 * Called from "-state restore" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param filePath The file path to retore from.
	 */
	public async stateRestore(filePath: string): Promise<void> {
		// Load as zsf
		filePath += ".zsf";
		await zSocket.sendAwait('snapshot-load ' + filePath);
		// Initialize more
		await this.initAfterLoad();
		// Clear register cache
		await this.getRegistersFromEmulator();
		await this.getCallStackFromEmulator();
	}


	// ZX Next related ---------------------------------


	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @returns A promise with the value of the register.
	 */
	public async getTbblueRegister(registerNr: number): Promise<number> {
		const data = await zSocket.sendAwait('tbblue-get-register ' + registerNr);
		// Check for error
		if (data.startsWith("ERROR")) {
			return 0;
		}
		// Value is returned as 2 digit hex number followed by "H", e.g. "00H"
		const valueString = data.substring(0, 2);
		const value = parseInt(valueString, 16);
		// Call handler
		return value;
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @returns A Promise that returns a 256 byte Array<number> with the palette values.
	 */
	public async getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {

		const paletteNrString = (paletteNr == 0) ? 'first' : 'second';
		const data = await zSocket.sendAwait('tbblue-get-palette sprite ' + paletteNrString + ' 0 256');
		const palette = new Array<number>(256);
		// Check for error
		if (!data.startsWith("ERROR")) {
			// Palette is returned as 3 digit hex separated by spaces, e.g. "02D 168 16D 000"
			for (let i = 0; i < 256; i++) {
				const l = i * 4;
				const colorString = data.substring(l, l + 3);
				const color = parseInt(colorString, 16);
				// ZEsarUX sends the data as RRRGGGBBB, we need to
				// change this first to RRRGGGBB, 0000000B.
				palette[i] = (color >>> 1);
				if (color & 0x01)
					palette[i] += 0x100;
			}
		}
		// Call handler
		return palette;
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions and the control byte(xl, xr, yt, yb, control).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		const data = await zSocket.sendAwait('tbblue-get-clipwindow sprite');
		// Check for error
		if (data.startsWith("ERROR")) {
			return {xl: 0, xr: 0, yt: 0, yb: 0, control: 0};
		}
		// Returns 4 decimal numbers, e.g. "0 175 0 192 "
		const clip = data.split(' ');
		const xl = parseInt(clip[0]);
		const xr = parseInt(clip[1]);
		const yt = parseInt(clip[2]);
		const yb = parseInt(clip[3]);

		// Get the control byte
		const control = await this.getTbblueRegister(0x15);
		// Call handler
		return {xl, xr, yt, yb, control};
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @returns A Promise with an array of sprite data.
	 */
	public async getTbblueSprites(slot: number, count: number): Promise<Array<Uint8Array>> {
		const data = await zSocket.sendAwait('tbblue-get-sprite ' + slot + ' ' + count);
		const sprites = new Array<Uint8Array>();
		// Check for error
		if (!data.startsWith("ERROR")) {
			// Sprites are returned one line per sprite, each line consist of 4x 2 digit hex values, e.g.
			// "00 00 00 00"
			// "00 00 00 00"
			const spriteLines = data.split('\n');
			for (const line of spriteLines) {
				if (line.length == 0)
					continue;
				const sprite = new Uint8Array(5);
				for (let i = 0; i < 5; i++) {
					const l = i * 3;
					const attrString = line.substring(l, l + 2);
					if (attrString.length > 0) {
						const attribute = parseInt(attrString, 16);
						sprite[i] = attribute;
					}
				}
				sprites.push(sprite);
			}
		}
		// Call handler
		return sprites;
	}


	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @preturns A Promise with an array of sprite pattern data.
	 */
	public async getTbblueSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		const data = await zSocket.sendAwait('tbblue-get-pattern ' + index + ' 8 ' + count);
		const patterns = new Array<Array<number>>();
		// Check for error
		if (!data.startsWith("ERROR")) {
			// Sprite patterns are returned one line per pattern, each line consist of
			// 256x 2 digit hex values, e.g. "E3 E3 E3 E3 E3 ..."
			const patternLines = data.split('\n');
			patternLines.pop();	// Last element is a newline only
			for (const line of patternLines) {
				const pattern = new Array<number>(256);
				for (let i = 0; i < 256; i++) {
					const l = i * 3;
					const attrString = line.substring(l, l + 2);
					const attribute = parseInt(attrString, 16);
					pattern[i] = attribute;
				}
				patterns.push(pattern);
			}
		}
		// Call handler
		return patterns;
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
	public async waitForBeingQuietFor(timeout: number): Promise<void> {
		return new Promise<void>(resolve => {
			(async () => {
				let timerId;
				const timer = () => {
					clearTimeout(timerId);
					timerId = setTimeout(() => {
						// Now there is at least 100ms quietness:
						// Stop listening
						zSocket.removeListener('queueChanged', timer);
						// Load the initial unit test routine (provided by the user)
						resolve();
					}, timeout);
				};

				// 2 triggers
				zSocket.on('queueChanged', timer);
				await zSocket.executeWhenQueueIsEmpty();
				timer();
			})();
		});
	}



	/**
	 * Loads sna, nex or tap file.
	 * @param path The (absolute) path to the file.
	 */
	public async loadBin(path: string): Promise<void> {
		await zSocket.sendAwait('smartload "' + Settings.launch.load + '"');	// Note: this also changes cpu to tbblue
	}


	/**
	 * Loads a obj file.
	 * @param path The (absolute) path to the obj file.
	 * @param address The address where the obj file starts.
	 */
	public async loadObj(path: string, address: number): Promise<void> {
		await zSocket.sendAwait('load-binary "' + path + '" ' + address + ' 0');	// 0 = load entire file
	}
}

