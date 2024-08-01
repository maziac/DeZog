import { Settings, ZX81SimType } from "../../settings/settings";
import { DzrpRemote } from "../dzrp/dzrpremote";
import { Z80RegistersStandardDecoder } from "../z80registersstandarddecoder";
import { CodeCoverageArray } from "../zsimulator/codecovarray";
import { CustomCode } from "../zsimulator/customcode";
import { SimulatedMemory } from "../zsimulator/simulatedmemory";
import { Z80Cpu } from "../zsimulator/z80cpu";
import { Z80Ports } from "../zsimulator/z80ports";
import {Z80_REG, Z80Registers} from '../z80registers';
import { ZSimCpuHistory } from "../zsimulator/zsimcpuhistory";
import { CpuHistory, CpuHistoryClass, DecodeStandardHistoryInfo } from "../cpuhistory";
import {MemoryModelZX81_1k, MemoryModelZX81_2k, MemoryModelZX81_16k, MemoryModelZX81_32k, MemoryModelZX81_48k, MemoryModelZX81_56k} from '../MemoryModel/zx81predefinedmemorymodels'; // @zx81
import { BREAK_REASON_NUMBER } from "../remotebase";
import { Utility } from "../../misc/utility";
import { MemBuffer } from "../../misc/membuffer";
import { GenericBreakpoint } from "../../genericwatchpoint";

// It would be better to have a commom ancestor for ZX81SimRemote and ZSimRemote, but it would
// change the structure of the code and I do not want to touch it as much as I can.
// So several methods are duplicated here.

/**
 * The representation of a ZX81 remote.
 */
export class ZX81SimRemote extends DzrpRemote {
    // For emulation of the CPU.
	public z80Cpu: Z80Cpu;
	public memory: SimulatedMemory;
	public ports: Z80Ports;
    
    // Stores the code coverage.
	protected codeCoverage: CodeCoverageArray;

	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true to stop the CPU from running. Is set when the user presses "break".
	protected stopCpu: boolean;

	// Push here all objects that should be serialized.
	// I.e. that are relevant for the saving/restoring the state.
	protected serializeObjects: any[];

	// History info will not occupy a new element but replace the old element
	// if PC does not change. Used for LDIR, HALT.
	protected previouslyStoredPCHistory: number;

	// Custom code to simulate peripherals (in/out)
	public customCode: CustomCode;

    // The number of passed t-states. Starts at 0 and is never reset.
	// Is increased with every executed instruction.
	protected passedTstates: number;

	// Used to calculate the passed instruction time.
	protected prevPassedTstates: number;

	// The number of t-states to pass before a 'tick()' is send to the
	// peripherals custom code.
	protected timeStep: number;
	// Used to determine the next tick() call.
	protected nextStepTstates: number;

	// Is set/reset by the ZX81SimulatorView to request processing time.
	protected timeoutRequest: boolean;

    // Can be enabled through commands to break when an interrupt occurs.
	protected breakOnInterrupt: boolean;

    // Called to execute an instruction. May point directly to the
	// Z80Cpu.execute() or to the DMA.
	protected executeInstruction: () => number;


    /// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = true;
		this.supportsLOGPOINT = true;
		this.supportsBreakOnInterrupt = true;

		this.timeoutRequest = false;
		this.previouslyStoredPCHistory = -1;
		this.passedTstates = 0;
		this.prevPassedTstates = 0;
		this.timeStep = Settings.launch.zx81sim.customCode.timeStep;
		this.nextStepTstates = 0;
		this.stopCpu = true;
		this.lastBpId = 0;
		this.breakOnInterrupt = false;
		// Set decoder
		Z80Registers.decoder = new Z80RegistersStandardDecoder();
		// Reverse debugging / CPU history
		if (Settings.launch.history.reverseDebugInstructionCount > 0) {
			CpuHistoryClass.setCpuHistory(new ZSimCpuHistory());
			CpuHistory.decoder = new DecodeStandardHistoryInfo();
		}
		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled)
			this.codeCoverage = new CodeCoverageArray();
	}


	/**
	 * Is set/reset by the ZX81SimulatorView to request processing time.
	 */
	public setTimeoutRequest(on: boolean) {
		this.timeoutRequest = on;
	}

    /**
	 * Configures the machine.
	 * Loads the roms and sets up bank switching.
	 * @param zsim The zx81sim configuration, e.g. the memory model:
	 * - "RAM": One memory area of 64K RAM, no banks.
	 * - "ZX48": ROM and RAM as of the ZX Spectrum 48K.
	 * - "ZX128": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	 * - "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
   	 * - "COLECOVISION": Memory map for the Coleco Vision (8k slots, no banking).
	 * - "CUSTOM": User defined memory.
	 */
	protected configureMachine(zsim: ZX81SimType) {
		// For restoring the state
		this.serializeObjects = [];

		Z80Registers.decoder = new Z80RegistersStandardDecoder();	// Required for the memory model.

		// Create ports for paging
		this.ports = new Z80Ports(zsim.defaultPortIn);

		// Configure different memory models
		switch (zsim.memoryModel) {
			case "ZX81-1K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_1k();
				break;			
			case "ZX81-2K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_2k();
				break;			
			case "ZX81-16K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_16k();
				break;			
			case "ZX81-32K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_32k();
				break;			
			case "ZX81-48K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_48k();
				break;			
			case "ZX81-56K":
				// ZX81 16K
				// Memory Model
				this.memoryModel = new MemoryModelZX81_56k();
				break;			
			default:
				throw Error("Unknown memory model: '" + zsim.memoryModel + "'.");
		}

		// Create memory
		this.memory = new SimulatedMemory(this.memoryModel, this.ports);
		this.serializeObjects.push(this.memory);

		// Set slot and bank function.
		this.memoryModel.init();

		// Create a Z80 CPU to emulate Z80 behavior
		this.z80Cpu = new Z80Cpu(this.memory, this.ports, () => {
			this.emit('vertSync');
		});
		this.serializeObjects.push(this.z80Cpu);

        // Bind directly the Z80 execution function
        this.executeInstruction = this.z80Cpu.execute.bind(this.z80Cpu);

		// Initialize custom code e.g. for ports.
		// But the customCode is not yet executed. (Because of unit tests).
		const jsPath = Settings.launch.zx81sim.customCode.jsPath;
		if (jsPath) {
			//jsCode="<b>Error: reading file '"+jsPath+"':"+e.message+"</b>";
			this.customCode = new CustomCode(jsPath);
			// Register custom code
			this.ports.registerGenericInPortFunction(port => {
				this.customCode.setTstates(this.passedTstates);
				const value = this.customCode.readPort(port);
				return value;
			});
			this.ports.registerGenericOutPortFunction((port, value) => {
				this.customCode.setTstates(this.passedTstates);
				this.customCode.writePort(port, value);
			});
			// Register on interrupt event
			this.customCode.on('interrupt', (non_maskable: boolean, data: number) => {
				this.z80Cpu.generateInterrupt(non_maskable, data);
			});
			this.serializeObjects.push(this.customCode);
		}
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Decide what machine
		this.configureMachine(Settings.launch.zx81sim);

		// Load sna/nex and loadObjs:
		this.customCode?.execute();	// Need to be initialized here also because e.g. nex loading sets the border (port).
		await this.load();

		// Ready
		this.emit('initialized')
	}

	/**
	 * Stops the simulator.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		// Stop running cpu
		this.stopCpu = true;
		this.emit('closed')
	}


	/**
	 * Sets a specific register value.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @param value The value to set.
	 */
	protected setRegValue(reg: Z80_REG, value: number) {
		// Set register in z80 cpu
		switch (reg) {	// NOSONAR
			case Z80_REG.PC:
				this.z80Cpu.pc = value;
				break;
			case Z80_REG.SP:
				this.z80Cpu.sp = value;
				break;
			case Z80_REG.AF:
				this.z80Cpu.af = value;
				break;
			case Z80_REG.BC:
				this.z80Cpu.bc = value;
				break;
			case Z80_REG.DE:
				this.z80Cpu.de = value;
				break;
			case Z80_REG.HL:
				this.z80Cpu.hl = value;
				break;
			case Z80_REG.IX:
				this.z80Cpu.ix = value;
				break;
			case Z80_REG.IY:
				this.z80Cpu.iy = value;
				break;
			case Z80_REG.AF2:
				this.z80Cpu.af2 = value;
				break;
			case Z80_REG.BC2:
				this.z80Cpu.bc2 = value;
				break;
			case Z80_REG.DE2:
				this.z80Cpu.de2 = value;
				break;
			case Z80_REG.HL2:
				this.z80Cpu.hl2 = value;
				break;

			case Z80_REG.IM:
				this.z80Cpu.im = value;
				break;

			case Z80_REG.F:
				this.z80Cpu.f = value;
				break;
			case Z80_REG.A:
				this.z80Cpu.a = value;
				break;
			case Z80_REG.C:
				this.z80Cpu.c = value;
				break;
			case Z80_REG.B:
				this.z80Cpu.b = value;
				break;
			case Z80_REG.E:
				this.z80Cpu.e = value;
				break;
			case Z80_REG.D:
				this.z80Cpu.d = value;
				break;
			case Z80_REG.L:
				this.z80Cpu.l = value;
				break;
			case Z80_REG.H:
				this.z80Cpu.h = value;
				break;
			case Z80_REG.IXL:
				this.z80Cpu.ixl = value;
				break;
			case Z80_REG.IXH:
				this.z80Cpu.ixh = value;
				break;
			case Z80_REG.IYL:
				this.z80Cpu.iyl = value;
				break;
			case Z80_REG.IYH:
				this.z80Cpu.iyh = value;
				break;

			case Z80_REG.F2:
				this.z80Cpu.f = value;
				break;
			case Z80_REG.A2:
				this.z80Cpu.a = value;
				break;
			case Z80_REG.C2:
				this.z80Cpu.c = value;
				break;
			case Z80_REG.B2:
				this.z80Cpu.b = value;
				break;
			case Z80_REG.E2:
				this.z80Cpu.e = value;
				break;
			case Z80_REG.D2:
				this.z80Cpu.d = value;
				break;
			case Z80_REG.L2:
				this.z80Cpu.l = value;
				break;
			case Z80_REG.H2:
				this.z80Cpu.h = value;
				break;
			case Z80_REG.R:
				this.z80Cpu.r = value;
				break;
			case Z80_REG.I:
				this.z80Cpu.i = value;
				break;
		}
	}


	/**
	 * Stores the current registers, opcode and sp contents
	 * in the cpu history.
	 * Called on every executed instruction.
	 * @param pc The pc for the line. Is only used to compare with previous storage.
	 * I.e. to see if it is a LDIR instruction or similar.
	 * In that case no new entry is stored.
	 * Therefore it can be a 64k address, i.e. it does not need to be a long address.
	 */
	protected storeHistoryInfo(pc: number) {
		// Get history element
		const hist = this.z80Cpu.getHistoryData();
		// Check if pc changed
		if (pc != this.previouslyStoredPCHistory) {
			this.previouslyStoredPCHistory = pc;
			// Store
			CpuHistory.pushHistoryInfo(hist);
		}
	}


	/**
	 * Runs the cpu in time chunks in order to give time to other
	 * processes. E.g. to receive a pause command.
	 * @param bp1 Breakpoint 1 address or -1 if not used.
	 * @param bp2 Breakpoint 2 address or -1 if not used.
	 */
	protected async z80CpuContinue(bp1: number, bp2: number): Promise<void> {
		const limitSpeed = Settings.launch.zx81sim.limitSpeed;
		let limitSpeedPrevTime = Date.now();
		let limitSpeedPrevTstates = this.passedTstates;

		while (true) {
			//		Utility.timeDiff();
			this.z80Cpu.error = undefined;
			let breakReasonString = '';
			let breakNumber = BREAK_REASON_NUMBER.NO_REASON;
			//let bp;
			let longBreakAddress;
			let slots = this.memory.getSlots();	// Z80 Registers may not be filled yet.
			let pcLong = Z80Registers.createLongAddress(this.z80Cpu.pc, slots);
			const leaveAtTstates = this.passedTstates + 5000 * 4;	// Break from loop at least after 2000 instructions (on average). This is to break in case of a halt.
			let break_happened = false;	// will be set to true if loop is left because of some break (e.g. breakpoint)
			try {
				// Run the Z80-CPU in a loop
				while (this.passedTstates < leaveAtTstates) {
					// Store current registers and opcode
					const prevPc = this.z80Cpu.pc;
					if (CpuHistory)
						this.storeHistoryInfo(prevPc);

					// For custom code: Call tick before the execution of the opcode
					if (this.passedTstates >= this.nextStepTstates) {
						this.nextStepTstates += this.timeStep;
						if (this.customCode) {
							this.customCode.setTstates(this.passedTstates);
							this.customCode.tick();
						}
					}

					// Execute one instruction
					const tStates = this.executeInstruction();

					// For custom code: Increase passed t-states
					this.passedTstates += tStates;

					// Update visual memory
					this.memory.setVisualProg(prevPc); // Fully correct would be to update all opcodes. But as it is compressed anyway this only gives a more accurate view at a border but on the other hand reduces the performance.

					// Store the pc for coverage (previous pcLong)
					this.codeCoverage?.storeAddress(pcLong);

					// Check if some CPU error occurred
					if (this.z80Cpu.error != undefined) {
						// E.g. an error in the custom code or in the memory model ioMmu
						breakNumber = BREAK_REASON_NUMBER.CPU_ERROR;
						breakReasonString = "CPU error: " + this.z80Cpu.error;
						break_happened = true;
						break;
					}

					const pc = this.z80Cpu.pc;

					// Check if any real breakpoint is hit
					// Note: Because of step-out this needs to be done before the other check.
					// Convert to long address
					slots = this.memory.getSlots();
					pcLong = Z80Registers.createLongAddress(pc, slots);
					const bpInner = this.tmpBreakpoints.get(pcLong);
					if (bpInner) {
						// To improve performance of condition and log breakpoints the condition check is also done below.
						// So it is not required to go back up to the debug adapter, just to return here in case the condition is wrong.
						// If condition is not true then don't consider the breakpoint.
						// Get registers
						const regs = this.z80Cpu.getRegisterData();
						Z80Registers.setCache(regs);
						// Now check if condition met or if logpoint
						let bp;
						for (const bpElem of bpInner) {
							try {
								const {condition, log} = this.checkConditionAndLog(bpElem);
								// Emit log?
								if (log) {
									// Convert and print
									const evalLog = await Utility.evalLogString(log)
									this.emit('debug_console', "Log: " + evalLog);
								}
								// Not a logpoint.
								// Condition met?
								else if (condition != undefined) {
									bp = bpElem;
									break_happened = true;
									break;
								}
							}
							catch (e) {
								// Some problem occurred, pass evaluation to DebugSessionClass
								bp = bpElem;
								break_happened = true;
								break;
							}
						}
						// Breakpoint and condition OK
						if (bp) {
							breakNumber = BREAK_REASON_NUMBER.BREAKPOINT_HIT;
							longBreakAddress = pcLong;
							break_happened = true;
							break;	// stop loop
						}
					}

					// Check if watchpoint is hit
					if (this.memory.hitAddress >= 0) {
						// Yes, read or write access
						breakNumber = (this.memory.hitAccess == 'r') ? BREAK_REASON_NUMBER.WATCHPOINT_READ : BREAK_REASON_NUMBER.WATCHPOINT_WRITE;
						const memAddress = this.memory.hitAddress;
						// Calculate long address
						longBreakAddress = Z80Registers.createLongAddress(memAddress, slots);
						// NOTE: Check for long watchpoint address could be done already here.
						// However it is done anyway in the DzrpRemote.
						break_happened = true;
						break;
					}


					// Check if given breakpoints are hit (64k address compare, not long addresses)
					if (pc == bp1 || pc == bp2) {
						longBreakAddress = pcLong;
						break_happened = true;
						break;
					}

					// Check if an interrupt happened and it should be breaked on an interrupt
					if (this.z80Cpu.interruptOccurred) {
						this.z80Cpu.interruptOccurred = false;
						if (this.breakOnInterrupt) {
							breakNumber = BREAK_REASON_NUMBER.BREAK_INTERRUPT;	// Interrupt break
							break_happened = true;
							break;
						}
					}

					// Check if stopped from outside
					if (this.stopCpu) {
						breakNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;	// Manual break
						break_happened = true;
						break;
					}
				}

			}
			catch (errorText) {
				breakReasonString = "Z80CPU Error: " + errorText;
				//console.log(breakReasonString);
				breakNumber = BREAK_REASON_NUMBER.UNKNOWN;
			}

			// Check to leave
			if (break_happened) {
				// Stop immediately
				this.stopCpu = true;
				// Send Notification
				Utility.assert(this.funcContinueResolve);
				await this.funcContinueResolve!({
						reasonNumber: breakNumber,
						reasonString: breakReasonString,
						longAddr: longBreakAddress,
					});
				return;
			}

			// Check if the CPU frequency should be simulated as well
			if (limitSpeed) {
				const currentTime = Date.now();
				const usedTime = currentTime - limitSpeedPrevTime;
				// Check for too small values to get a better accuracy
				if (usedTime > 20) { // 20 ms
					const usedTstates = this.passedTstates - limitSpeedPrevTstates;
					const targetTime = 1000 * usedTstates / this.z80Cpu.cpuFreq;
					let remainingTime = targetTime - usedTime;
					if (remainingTime >= 1) {
						// Safety check: no longer than 500ms
						if (remainingTime > 500)
							remainingTime = 500;
						// Wait additional time
						await Utility.timeout(remainingTime);
					}
					// Use new time
					limitSpeedPrevTime = Date.now();
					limitSpeedPrevTstates = this.passedTstates;
				}
			}

			// Give other tasks a little time and continue
			await Utility.timeout(1);

			// Check if additional time is required for the webview.
			// Mainly required for custom code.
			while (this.timeoutRequest) {
				// timeoutRequest will be set by the ZX81SimulatorView.
				await Utility.timeout(100);
			}

			// Check if meanwhile a manual break happened
			if (this.stopCpu) {
				// Can be undefined on disconnect, if disposed
				if (this.funcContinueResolve) {
					// Manual break: Create reason string
					breakNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;
					longBreakAddress = 0;
					breakReasonString = await this.constructBreakReasonString(breakNumber, longBreakAddress, '', '');

					// Send Notification
					//LogGlobal.log("cpuContinue, continueResolve="+(this.continueResolve!=undefined));
					await this.funcContinueResolve({
						reasonNumber: breakNumber,
						reasonString: breakReasonString,
						longAddr: longBreakAddress,
					});
				}
				return;
			}
		}
	}


	/**
	 * This method is called before a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 * Takes care of code coverage.
	 */
	public startProcessing() {
		super.startProcessing();
		// Clear code coverage
		this.codeCoverage?.clearAll();
	}


	/**
	 * This method should be called after a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 * It will clear e.g. the register and the call stack cache.
	 * So that the next time they are accessed they are immediately refreshed.
	 */
	public stopProcessing() {
		super.stopProcessing();

		// General update
		this.emit('update');

		// Emit code coverage event
		if (this.codeCoverage) {
			this.emit('coverage', this.codeCoverage.getAddresses());
		}
	}

    	/**
	 * Deserializes the CPU, memory etc. to restore the state.
	 */
	protected deserializeState(data: Uint8Array) {
		// Create mem buffer for reading
		const memBuffer = MemBuffer.from(data.buffer);

		// Deserialize objects
		for (const obj of this.serializeObjects)
			obj.deserialize(memBuffer);

		// Update the simulation view
		this.emit('restored');

		return memBuffer.getUint8Array();
	}


	/**
	 * Serializes the CPU, memory etc. to save the state.
	 */
	protected serializeState(): Uint8Array {
		// Get size of all serialized objects
		let size = 0;
		for (const obj of this.serializeObjects)
			size += obj.getSerializedSize();

		// Allocate memory
		const memBuffer = new MemBuffer(size + 1);	// +1 for border color

		// Serialize objects
		for (const obj of this.serializeObjects)
			obj.serialize(memBuffer);

		return memBuffer.getUint8Array();
	}


	/**
	 * Resets the T-States counter. Used before stepping to measure the
	 * time.
	 */
	public async resetTstates(): Promise<void> {
		//this.z80Cpu.cpuTstatesCounter = 0;
		this.prevPassedTstates = this.passedTstates;
	}


	/**
	 * Returns the number of T-States (since last reset).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getTstates(): Promise<number> {
		//return this.z80Cpu.cpuTstatesCounter;
		return this.passedTstates - this.prevPassedTstates;
	}
	// Same as sync function.
	public getTstatesSync(): number {
		//return this.z80Cpu.cpuTstatesCounter;
		return this.passedTstates - this.prevPassedTstates;
	}


	/**
	 * Returns the passed T-states since start of simulation.
	 */
	public getPassedTstates(): number {
		return this.passedTstates;
	}


	/**
	 * Returns the current CPU frequency
	 * @returns The CPU frequency in Hz (e.g. 3500000 for 3.5MHz) or 0 if not supported.
	 */
	public async getCpuFrequency(): Promise<number> {
		return this.z80Cpu.cpuFreq;
	}
	// Same as sync function.
	public getCpuFrequencySync(): number {
		return this.z80Cpu.cpuFreq;
	}


	/** zsim returns here the code coverage addresses since the last step.
	 * This is an additional information for the disassembler.
	 * The addresses are not in a specific order.
	 * Note: It is b intention that not the complete trace is returned.
	 * Processing could take too long.
	 * So only the addresses since last stepping are returned.
	 * Maybe one could experiment with the value.
	 * @returns An array with long addresses.
	 */
	public async getTraceBack(): Promise<number[]> {
		if (this.codeCoverage)
			return Array.from(this.codeCoverage.getAddresses());
		return [];
	}


	/** Enables to break on an interrupt.
	 * @param enable true=enable,break on interrupt, other disable.
	 * @returns 'enable'
	 */
	public async enableBreakOnInterrupt(enable: boolean): Promise<boolean> {
		this.breakOnInterrupt = enable;
		return this.breakOnInterrupt;
	}


	//------- Send Commands -------

	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		return this.z80Cpu.getRegisterData();
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		this.setRegValue(regIndex, value);
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		if (bp1Addr64k == undefined) bp1Addr64k = -1;	// unreachable
		if (bp2Addr64k == undefined) bp2Addr64k = -1;	// unreachable
		// Set the temporary breakpoints array
		// Run the Z80-CPU in a loop
		this.stopCpu = false;
		this.memory.clearHit();
		await this.z80CpuContinue(bp1Addr64k, bp2Addr64k);
	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		// If running then pause
		this.stopCpu = true;
	}


	/**
	 * The simulator does not add any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		this.lastBpId++;
		bp.bpId = this.lastBpId;
	}


	/**
	 * The simulator does not remove any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		//
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		this.memory.setWatchpoint(address, size, access);
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		this.memory.removeWatchpoint(address, size, access);
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
		const buffer = this.memory.readBlock(addr64k, size);
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param addr64k The memory start address.
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		this.memory.writeBlock(addr64k, dataArray);
	}


	/**
	 * Sends the command to write a memory bank.
	 * This is e.g. used by loadBinSna. The bank number given here is always for a ZXNext memory model
	 * and need to be scaled to other memory models.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
	 * @throws An exception if e.g. the bank size does not match.
	  */
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer | Uint8Array): Promise<void> {
		this.memory.writeBank(bank, dataArray);
	}


	/**
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
	  */
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		return this.serializeState();
	}


	/**
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param The state data. Format is unknown (remote specific).
	  */
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		this.deserializeState(stateData);
	}


	/**
	 * Sends the command to set the border.
	  */
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
		// Set port for border
		this.ports.write(0xFE, borderColor);
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdReadPort(port: number): Promise<number> {
		throw Error("'sendDzrpCmdReadPort' is not implemented.");
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		throw Error("'sendDzrpCmdWritePort' is not implemented.");
	}


	/**
	 * Not used/supported.
	 */
	protected async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
		throw Error("'sendDzrpCmdExecAsm' is not implemented.");
		//return {error: 0, f: 0, a: 0, bc: 0, de: 0, hl: 0};
	}


	/**
	 * Sends the command to enable or disable the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		const enableInterrupt = (enable) ? 1 : 0;
		this.z80Cpu.iff1 = enableInterrupt;
		this.z80Cpu.iff2 = enableInterrupt;
	}
}
