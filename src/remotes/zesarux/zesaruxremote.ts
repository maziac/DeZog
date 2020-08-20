import { zSocket, ZesaruxSocket } from './zesaruxsocket';
import { Utility } from '../../misc/utility';
import { Labels } from '../../labels/labels';
import { Settings } from '../../settings';
import {GenericWatchpoint, GenericBreakpoint} from '../../genericwatchpoint';
import {RemoteBase, RemoteBreakpoint, MemoryBank } from '../remotebase';
import { ZesaruxCpuHistory, DecodeZesaruxHistoryInfo } from './zesaruxcpuhistory';
import { Z80RegistersClass, Z80Registers } from '../z80registers';
import {DecodeZesaruxRegisters} from './decodezesaruxdata';
import {CpuHistory, CpuHistoryClass} from '../cpuhistory';



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

	/// Set to true after 'terminate()' is called. Errors will not be sent
	/// when terminating.
	protected terminating = false;


	/// Constructor.
	constructor() {
		super();
		// Set decoder
		Z80Registers.decoder=new DecodeZesaruxRegisters();
		// Reverse debugging / CPU history
		CpuHistoryClass.setCpuHistory(new ZesaruxCpuHistory());
		CpuHistory.decoder = new DecodeZesaruxHistoryInfo();
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
		if (!zSocket)
			return;
		return new Promise<void>(resolve => {
			// Terminate the socket
			zSocket.quit(() => {
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
		zSocket.on('connected', async () => {
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

				// Allow extensions
				this.zesaruxConnected();

				// Wait for previous command to finish
				await zSocket.executeWhenQueueIsEmpty();

				var debug_settings = (Settings.launch.zrcp.skipInterrupt) ? 32 : 0;
				zSocket.send('set-debug-settings ' + debug_settings);

				// Reset the cpu before loading.
				if(Settings.launch.resetOnLaunch)
					zSocket.send('hard-reset-cpu');

				// Enter step-mode (stop)
				zSocket.send('enter-cpu-step');

				await zSocket.executeWhenQueueIsEmpty();
				const waitBeforeMs=Settings.launch.zrcp.loadDelay;
				await Utility.timeout(waitBeforeMs);

				// Load sna, nex or tap file
				const loadPath = Settings.launch.load;
				if (loadPath) {
					zSocket.send('smartload "'+Settings.launch.load+'"');
					await zSocket.executeWhenQueueIsEmpty();
				}

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
					await this.setRegisterValue("PC", execAddress);
				}

				// Initialize more
				this.initAfterLoad();

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
	 * Does the initialization necessary after a load or state restore.
	 */
	protected initAfterLoad() {
		// Initialize breakpoints
		this.initBreakpoints();

		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled) {
			zSocket.send('cpu-code-coverage enabled yes', () => {}, true);	// suppress any error
			zSocket.send('cpu-code-coverage clear');
		}
		else
			zSocket.send('cpu-code-coverage enabled no', () => {}, true);	// suppress any error

		// Reverse debugging.
		CpuHistory.init();

		// Enable extended stack
		zSocket.send('extended-stack enabled no', () => {}, true);	// bug in ZEsarUX
		zSocket.send('extended-stack enabled yes');
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
		Utility.assert(CpuHistory);
		Utility.assert(!CpuHistory.isInStepBackMode());

		return new Promise<void>(resolve => {
			// Get new (real emulator) data
			zSocket.send('get-registers', data => {
				// convert received data to right format ...
				// data is e.g: "PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0 """
				Z80Registers.setCache(data);
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
		if (!Z80Registers.getCache()) {
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
	 * @returns A Promise with a string containing the break reason.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 */
	public async continue(): Promise<string> {
		return new Promise<string>(resolve => {
			// Run
			zSocket.sendInterruptableRunCmd(async text => {
				// (could take some time, e.g. until a breakpoint is hit)
				// Clear register cache
				Z80Registers.clearCache();
				this.clearCallStack();
				// Handle code coverage
				this.handleCodeCoverage();
				// The reason is the 2nd line
				const breakReasonString=this.getBreakReason(text);
				// Read the spot history
				await CpuHistory.getHistorySpotFromRemote();
				// Call handler
				resolve(breakReasonString);
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
		const textArray=text.split('\n');
		for (const reason of textArray)
			if ((reason.indexOf('point hit')>=0)||(reason.indexOf('point fired')>=0)) {
				result=reason;
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
	 * @returns A Promise with:
	 * 'disasm' is the disassembly of the current line.
	 * 'breakReasonString' a possibly text with the break reason
	 */
	public async stepOver(): Promise<{instruction: string, breakReasonString?: string}> {
		return new Promise<{instruction: string, breakReasonString?: string}>(resolve => {
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
				const pc=Z80Registers.getPC();
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
						const sp=Z80Registers.getSP();
						const condition='SP>='+sp;
						// We do a "run" instead of a step-into/over
						// Set action first (no action).
						const bpId=ZesaruxRemote.STEP_BREAKPOINT_ID;
						// Clear register cache
						Z80Registers.clearCache();
						// Note "prints" is required, so that a normal step over will not produce a breakpoint decoration.
						zSocket.send('set-breakpointaction '+bpId+' prints step-over', () => {
							// set the breakpoint
							zSocket.send('set-breakpoint '+bpId+' '+condition, () => {
								// enable breakpoint
								zSocket.send('enable-breakpoint '+bpId, () => {
									// Run
									zSocket.sendInterruptableRunCmd(text => {
										// (could take some time, e.g. until a breakpoint is hit)
										// Clear register cache
										Z80Registers.clearCache();
										this.clearCallStack();
										// Handle code coverage
										this.handleCodeCoverage();
										// The break reason is in the returned text
										const breakReasonString=this.getBreakReason(text);
										// Disable breakpoint
										zSocket.send('disable-breakpoint '+bpId, async () => {
											// Read the spot history
											await CpuHistory.getHistorySpotFromRemote();

											resolve({instruction: disasm, breakReasonString});
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
						Z80Registers.clearCache();
						zSocket.send(cmd, async result => {
							// Clear cache
							Z80Registers.clearCache();
							this.clearCallStack();
							// Handle code coverage
							this.handleCodeCoverage();
							// Call handler
							const breakReasonString=this.getBreakReason(result);
							// Read the spot history
							await CpuHistory.getHistorySpotFromRemote();
							resolve({instruction: disasm, breakReasonString});

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
	 * 'breakReasonString' E.g. "End of history reached"
	 */
	public async stepInto(): Promise<{instruction: string, breakReasonString?: string}> {
		return new Promise<{instruction: string, breakReasonString?: string}>(resolve => {
			// Normal step into.
			this.getRegisters().then(() => {
				const pc=Z80Registers.getPC();
				zSocket.send('disassemble '+pc, instruction => {
					// Clear register cache
					Z80Registers.clearCache();
					zSocket.send('cpu-step', async result => {
						// Clear cache
						Z80Registers.clearCache();
						this.clearCallStack();
						// Handle code coverage
						this.handleCodeCoverage();
						// Read the spot history
						await CpuHistory.getHistorySpotFromRemote();
						resolve({instruction});
					});
				});
			});
		});
	}


	/**
	 * Resets the T-States counter. Used before stepping to measure the
	 * time.
	 */
	public async resetTstates(): Promise<void> {
		return new Promise<void>(resolve => {
			zSocket.send('reset-tstates-partial', data => {
				resolve();
			});
		});
	}


	/**
	 * Returns the number of T-States (since last reset).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getTstates(): Promise<number> {
		return new Promise<number>(resolve => {
			zSocket.send('get-tstates-partial', data => {
				const tStates=parseInt(data);
				resolve(tStates);
			});
		});
	}


	/**
	 * Returns the current CPU frequency
	 * @returns The CPU frequency in Hz (e.g. 3500000 for 3.5MHz) or 0 if not supported.
	 */
	public async getCpuFrequency(): Promise<number> {
		return new Promise<number>(resolve => {
			zSocket.send('get-cpu-frequency', data => {
				const cpuFreq=parseInt(data);
				resolve(cpuFreq);
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
	 * 'step out' of current subroutine.
	 * @returns A Promise with a string containing the break reason.
	 */
	public async stepOut(): Promise<string> {
		return new Promise<string>(resolve => {
			// Zesarux does not implement a step-out. Therefore we analyze the call stack to
			// find the first return address.
			// Then a breakpoint is created that triggers when an executed RET is found  the SP changes to that address.
			// I.e. when the RET (or (RET cc) gets executed.

			// Get current stackpointer
			this.getRegisters().then(() => {
				// Get SP
				const sp=Z80Registers.getSP();

				// calculate the depth of the call stack
				var depth=this.topOfStack-sp;
				if (depth>ZesaruxRemote.MAX_STACK_ITEMS)
					depth=ZesaruxRemote.MAX_STACK_ITEMS;
				if (depth==0) {
					// no call stack, nothing to step out, i.e. immediately return
					resolve("Call stack empty");
					return;
				}
				else if (depth<0) {
					// Callstack corrupted?
					resolve("SP above topOfStack. Stack corrupted?");
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
										Z80Registers.clearCache();
										// Run
										zSocket.sendInterruptableRunCmd(text => {
											// (could take some time, e.g. until a breakpoint is hit)
											// Clear register cache
											Z80Registers.clearCache();
											this.clearCallStack();
											// Handle code coverage
											this.handleCodeCoverage();
											// The reason is the 2nd line
											const breakReasonString=this.getBreakReason(text);
											// Disable breakpoint
											zSocket.send('disable-breakpoint '+bpId, async () => {
												// Read the spot history
												await CpuHistory.getHistorySpotFromRemote();
												resolve(breakReasonString);
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
					resolve(undefined);
				});
			});
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
		Utility.assert(false);	// override this
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
			if(Z80RegistersClass.isRegister(label))
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

		//console.log('Converted condition "' + condition + '" to "' + conds);
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
				Utility.assert(index!==-1, 'Breakpoint should be removed but does not exist.');
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
	public async setBreakpoints(path: string, givenBps:Array<RemoteBreakpoint>): Promise<Array<RemoteBreakpoint>> {
		// Do most of the work
		const bps = super.setBreakpoints(path, givenBps);
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
					Utility.assert(len/2==retrieveSize);
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
	 * and converts it to an arry of MemoryBanks.
	 * @returns A Promise with an array with the available memory pages.
	 */
	public async getMemoryBanks(): Promise<MemoryBank[]> {
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

		return new Promise<MemoryBank[]>(resolve => {
			zSocket.send('get-memory-pages verbose', data => {
				const pages: Array<MemoryBank>=[];
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
				// Initialize more
				this.initAfterLoad();
				// At last:
				zSocket.executeWhenQueueIsEmpty().then(() => {
					// Clear register cache
					Z80Registers.clearCache();
					this.clearCallStack();
					resolve();
				});
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
				// Check for error
				if (data.startsWith("ERROR")) {
					resolve(0);
					return;
				}
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
	public async getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {
		return new Promise<Array<number>>(resolve => {
			const paletteNrString=(paletteNr==0)? 'first':'second';
			zSocket.send('tbblue-get-palette sprite '+paletteNrString+' 0 256', data => {
				const palette=new Array<number>(256);
				// Check for error
				if (!data.startsWith("ERROR")) {
					// Palette is returned as 3 digit hex separated by spaces, e.g. "02D 168 16D 000"
					for (let i=0; i<256; i++) {
						const colorString=data.substr(i*4, 3);
						const color=parseInt(colorString, 16);
						// ZEsarUX sends the data as RRRGGGBBB, we need to
						// change this first to RRRGGGBB, 0000000B.
						palette[i]=(color>>>1);
						if (color&0x01)
							palette[i]+=0x100;
					}
				}
				// Call handler
				resolve(palette);
			});
		});
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions and teh control byte(xl, xr, yt, yb, control).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		return new Promise<{xl: number, xr: number, yt: number, yb: number, control: number}>(resolve => {
			zSocket.send('tbblue-get-clipwindow sprite', data => {
				// Check for error
				if (data.startsWith("ERROR")) {
					resolve({xl: 0, xr: 0, yt: 0, yb: 0, control: 0});
					return;
				}
				// Returns 4 decimal numbers, e.g. "0 175 0 192 "
				const clip=data.split(' ');
				const xl=parseInt(clip[0]);
				const xr=parseInt(clip[1]);
				const yt=parseInt(clip[2]);
				const yb=parseInt(clip[3]);

				// Get the control byte
				this.getTbblueRegister(0x15).then(control => {
					// Call handler
					resolve({xl, xr, yt, yb, control});
				});
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
				const sprites=new Array<Uint8Array>();
				// Check for error
				if (!data.startsWith("ERROR")) {
					// Sprites are returned one line per sprite, each line consist of 4x 2 digit hex values, e.g.
					// "00 00 00 00"
					// "00 00 00 00"
					const spriteLines=data.split('\n');
					for (const line of spriteLines) {
						if (line.length==0)
							continue;
						const sprite=new Uint8Array(5);
						for (let i=0; i<5; i++) {
							const attrString=line.substr(i*3, 2);
							if (attrString.length>0) {
								const attribute=parseInt(attrString, 16);
								sprite[i]=attribute;
							}
						}
						sprites.push(sprite);
					}
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
				const patterns=new Array<Array<number>>();
				// Check for error
				if (!data.startsWith("ERROR")) {
					// Sprite patterns are returned one line per pattern, each line consist of
					// 256x 2 digit hex values, e.g. "E3 E3 E3 E3 E3 ..."
					const patternLines=data.split('\n');
					patternLines.pop();	// Last element is a newline only
					for (const line of patternLines) {
						const pattern=new Array<number>(256);
						for (let i=0; i<256; i++) {
							const attrString=line.substr(i*3, 2);
							const attribute=parseInt(attrString, 16);
							pattern[i]=attribute;
						}
						patterns.push(pattern);
					}
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

}

