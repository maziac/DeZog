import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers} from '../z80registers';
import {Z80Ports} from './z80ports';
import {Z80Cpu} from './z80cpu';
import {Settings, ZSimType} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {MemBuffer} from '../../misc/membuffer';
import {CodeCoverageArray} from './codecovarray';
import {CpuHistoryClass, CpuHistory, DecodeStandardHistoryInfo} from '../cpuhistory';
import {ZSimCpuHistory} from './zsimcpuhistory';
import {MemoryModel} from '../MemoryModel/memorymodel';
import {SimulatedMemory} from './simulatedmemory';
import {SnaFile} from '../dzrp/snafile';
import {NexFile} from '../dzrp/nexfile';
import {CustomCode} from './customcode';
import {BeeperBuffer, ZxBeeper} from './zxbeeper';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {MemoryModelAllRam, MemoryModelColecoVision, MemoryModelZx128k, MemoryModelZx16k, MemoryModelZx48k, MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../MemoryModel/predefinedmemorymodels';
import {ZxUlaScreen} from './zxulascreen';
import {ZxnDma} from './zxndma';


/**
 * The representation of a Z80 remote.
 * With options to simulate ZX Spectrum or some ZX Next features.
 */
export class ZSimRemote extends DzrpRemote {

	// For emulation of the CPU.
	public z80Cpu: Z80Cpu;
	public memory: SimulatedMemory;
	public ports: Z80Ports;

	// The ULA screen simulation.
	public zxUlaScreen: ZxUlaScreen;

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

	// TBBlue register handling.
	protected tbblueRegisterSelectValue: number;

	// Maps function handlers to registers (the key). As key the tbblueRegisterSelectValue is used.
	protected tbblueRegisterWriteHandler: Map<number, (value: number) => void>;

	// Same for reading the register.
	protected tbblueRegisterReadHandler: Map<number, () => number>;

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

	// Is set/reset by the ZSimulatorView to request processing time.
	protected timeoutRequest: boolean;

	// ZX Beeper simulation
	public zxBeeper: ZxBeeper;

	// The current ZX border color.
	protected zxBorderColor: number;

	// Can be enabled through commands to break when an interrupt occurs.
	protected breakOnInterrupt: boolean;

	// The current TBBlue CPU speed.
	// b00 = 3.5MHz, b01 = 7MHz, b10 = 14MHz, b11 = 28MHz.
	protected tbblueCpuSpeed: number;

	// Called to execute an instruction. May point directly to the
	// Z80Cpu.execute() or to the DMA.
	protected executeInstruction: () => number;

	// The zxnDMA object. Or undefined if not used.
	public zxnDMA: ZxnDma;


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
		this.tbblueRegisterSelectValue = 0;
		this.tbblueRegisterWriteHandler = new Map<number, (value: number) => void>();
		this.tbblueRegisterReadHandler = new Map<number, () => number>();
		this.passedTstates = 0;
		this.prevPassedTstates = 0;
		this.timeStep = Settings.launch.zsim.customCode.timeStep;
		this.nextStepTstates = 0;
		this.stopCpu = true;
		this.lastBpId = 0;
		this.zxBorderColor = 7;	// White initially
		this.breakOnInterrupt = false;
		this.tbblueCpuSpeed = 0;
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
	 * Is set/reset by the ZSimulatorView to request processing time.
	 */
	public setTimeoutRequest(on: boolean) {
		this.timeoutRequest = on;
	}


	/** Selects active port for TBBlue/Next feature configuration.
	 * See https://wiki.specnext.dev/TBBlue_Register_Select
	 * The value is just stored, no further action.
	 * @param port The written port. (0x243B)
	 * @param value The tbblue register to select.
	 */
	protected tbblueRegisterSelect(port: number, value: number) {
		this.tbblueRegisterSelectValue = value;
	}


	/** Writes the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and tbblueRegisterSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * At the moment only the memory slot functions are executed.
	 * @param port The port.
	 * @param value The tbblue register to select.
	 */
	protected tbblueRegisterWriteAccess(port: number, value: number) {
		const func = this.tbblueRegisterWriteHandler.get(this.tbblueRegisterSelectValue);
		if (func)
			func(value);
	}


	/** Reads the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and tbblueRegisterSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * At the moment only the memory slot functions are executed.
	 * @param port The port.
	 */
	protected tbblueRegisterReadAccess(port: number): number {
		const func = this.tbblueRegisterReadHandler.get(this.tbblueRegisterSelectValue);
		if (!func)
			return 0;
		// Get value
		const value = func();
		return value;
	}


	/** Changes the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * tbblueRegisterSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 * @param value The bank to map.
	 */
	protected tbblueMemoryManagementSlotsWrite(value: number) {
		const slot = this.tbblueRegisterSelectValue & 0x07;
		if (value == 0xFF) {
			// Handle ROM specially
			if (slot > 1)
				return;	// not allowed
			// Choose ROM bank according slot
			if (slot == 0)
				value = 0xFE;
		}
		else if (value > 223)
			return;	// not existing bank

		// Change the slot/bank
		this.memory.setSlot(slot, value);
	}


	/** Reads the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * tbblueRegisterSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 */
	protected tbblueMemoryManagementSlotsRead(): number {
		const slot = this.tbblueRegisterSelectValue & 0x07;
		// Change the slot/bank
		let bank = this.memory.getSlots()[slot];
		// Check for ROM = 0xFE
		if (bank == 0xFE)
			bank = 0xFF;
		return bank;
	}


	/** Changes the cpu speed.
	 * @param value Last 2 bits = the new speed:
	 * b00 = 3.5MHz, b01 = 7MHz, b10 = 14MHz, b11 = 28MHz.
	 * Note: 28Mhz will add an extra NOP for each instruction.
	 * NOT IMPLEMENTED.
	 */
	protected tbblueCpuSpeedWrite(value: number) {
		const cpuSpeed = value & 0b11;
		// Set the cpu frequency
		const cpuFrequency = (1 << cpuSpeed) * 3500000;	// 3.5MHz, 7MHz, 14MHz, 28Mhz
		const extraTcycle = (cpuSpeed == 3) ? 1 : 0;
		this.z80Cpu.setExtraTstatesPerInstruction(extraTcycle);
		this.z80Cpu.setCpuFreq(cpuFrequency);
		// Update also the ZXBeeper
		this.zxBeeper?.setCpuFrequency(cpuFrequency);
		// Remember the speed
		this.tbblueCpuSpeed = cpuSpeed;
	}


	/** Reads the tbblue cpu speed.
	 * The real port read makes a difference between programmed and actual speed.
	 * This function here does not.
	 * @returns Bit 4-5: current speed, bits 0-1: programmed speed.
	 * b00 = 3.5MHz, b01 = 7MHz, b10 = 14MHz, b11 = 28MHz.
	 */
	protected tbblueCpuSpeedRead(): number {
		const cpuSpeed = this.tbblueCpuSpeed;
		const cpuSpeedBoth = (cpuSpeed << 4) | cpuSpeed;
		return cpuSpeedBoth;
	}


	/**
	 * Configures the machine.
	 * Loads the roms and sets up bank switching.
	 * @param zsim The zsim configuration, e.g. the memory model:
	 * - "RAM": One memory area of 64K RAM, no banks.
	 * - "ZX48": ROM and RAM as of the ZX Spectrum 48K.
	 * - "ZX128": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	 * - "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
   	 * - "COLECOVISION": Memory map for the Coleco Vision (8k slots, no banking).
	 * - "CUSTOM": User defined memory.
	 */
	protected configureMachine(zsim: ZSimType) {
		// For restoring the state
		this.serializeObjects = [];

		Z80Registers.decoder = new Z80RegistersStandardDecoder();	// Required for the memory model.

		// Create ports for paging
		this.ports = new Z80Ports(zsim.defaultPortIn);

		// Check for beeper and border (both use the same port)
		const zxBeeperEnabled = zsim.zxBeeper;
		const zxBorderWidth = zsim.zxBorderWidth;	// 0 = no border
		// Check if beeper enabled
		if (zxBeeperEnabled || zxBorderWidth > 0) {
			// Create the beeper simulation object
			this.zxBeeper = new ZxBeeper(zsim.cpuFrequency, zsim.audioSampleRate, Settings.launch.zsim.updateFrequency);
			this.serializeObjects.push(this.zxBeeper);
			// Add the port only if enabled
			this.ports.registerGenericOutPortFunction((port: number, value: number) => {
				// The port 0xFE. Every even port address will do.
				if (port & 0x01)
					return undefined;
				// Yes, it's an even address.

				// Border
				if (zxBorderWidth > 0) {
					// Only 3 bits color without brightness
					this.zxBorderColor = value & 0x07;
				}

				// Beeper
				if (zxBeeperEnabled) {
					// Write beeper (bit 4, EAR)
					this.zxBeeper.writeBeeper(this.passedTstates, (value & 0b10000) != 0);
				}
			});
		}

		// Check for tbblue port
		const regTurboMode = zsim.tbblue.REG_TURBO_MODE;
		if (regTurboMode) {
			// Register the tbblue register
			this.tbblueRegisterWriteHandler.set(0x07, this.tbblueCpuSpeedWrite.bind(this));
			this.tbblueRegisterReadHandler.set(0x07, this.tbblueCpuSpeedRead.bind(this));
		}

		// Configure different memory models
		switch (zsim.memoryModel) {
			case "RAM":
				// 64K RAM, no ZX
				// Memory Model
				this.memoryModel = new MemoryModelAllRam();
				break;
			case "ZX16K":
				// ZX 16K
				// Memory Model
				this.memoryModel = new MemoryModelZx16k();
				break;
			case "ZX48K":
				// ZX 48K
				// Memory Model
				this.memoryModel = new MemoryModelZx48k();
				break;
			case "ZX128K":
				// ZX 128K
				// Memory Model
				this.memoryModel = new MemoryModelZx128k();
				break;
			case "ZXNEXT":
				// ZX Next
				// Memory Model
				this.memoryModel = new MemoryModelZxNextTwoRom();
				// Bank switching.
				for (let tbblueRegister = 0x50; tbblueRegister <= 0x57; tbblueRegister++) {
					this.tbblueRegisterWriteHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsWrite.bind(this));
					this.tbblueRegisterReadHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsRead.bind(this));
				}
				break;
			case "COLECOVISION":
				// ZX 48K
				// Memory Model
				this.memoryModel = new MemoryModelColecoVision();
				break;
			case "CUSTOM":
				// Custom Memory Model
				this.memoryModel = new MemoryModel(zsim.customMemory);
				break;
			default:
				throw Error("Unknown memory model: '" + zsim.memoryModel + "'.");
		}

		// Create memory
		this.memory = new SimulatedMemory(this.memoryModel, this.ports);
		this.serializeObjects.push(this.memory);

		// Set slot and bank function.
		this.memoryModel.init();

		// Check if ULA screen is enabled
		const zxUlaScreenEnabled = zsim.ulaScreen;
		if (zxUlaScreenEnabled) {
			this.zxUlaScreen = new ZxUlaScreen(this.memoryModel, this.ports);
			this.serializeObjects.push(this.zxUlaScreen);
		}

		// Create a Z80 CPU to emulate Z80 behavior
		this.z80Cpu = new Z80Cpu(this.memory, this.ports, () => {
			this.emit('vertSync');
		});
		this.serializeObjects.push(this.z80Cpu);

		// If tbblue write or read handler are used, then
		// install them.
		if (this.tbblueRegisterWriteHandler.size ||
			this.tbblueRegisterReadHandler.size) {
			// Register out port 0x243B
			this.ports.registerSpecificOutPortFunction(0x243B, this.tbblueRegisterSelect.bind(this));
			// Register out port 0x253B
			this.ports.registerSpecificOutPortFunction(0x253B, this.tbblueRegisterWriteAccess.bind(this));
			// Register in port 0x253B
			this.ports.registerSpecificInPortFunction(0x253B, this.tbblueRegisterReadAccess.bind(this));
		}

		// Look for DMA. If present it will wrap the instruction execute function
		// and if a DMA operation is present it will do the DMA instead.
		const zxnDMA = zsim.zxnDMA;
		if (zxnDMA) {
			// Create the zxnDMA object
			this.zxnDMA = new ZxnDma(this.memory, this.ports);
			this.serializeObjects.push(this.zxnDMA);
			// Listen to zxndma logs
			this.zxnDMA.on('log', (text: string) => {
				this.emit('debug_console', text);
			});
			// Bind the DMA execution function
			this.executeInstruction = () => {
				// Execute the DMA function
				let tStates = this.zxnDMA.execute(this.z80Cpu.cpuFreq, this.passedTstates);
				// Afterwards run the CPU
				tStates += this.z80Cpu.execute();
				return tStates;
			}
			// Create the read/write port
			// Register out port $xx6B
			this.ports.registerGenericOutPortFunction((port: number, value: number) => {
				if ((port & 0x6B) !== 0x6B)
					return undefined;
				this.zxnDMA.writePort(value)
			});
			// Register in port $xx6B
			this.ports.registerGenericInPortFunction((port: number) => {
				if ((port & 0x6B) !== 0x6B)
					return undefined;
				return this.zxnDMA.readPort();
			});
		}
		else {
			// Bind directly the Z80 execution function
			this.executeInstruction = this.z80Cpu.execute.bind(this.z80Cpu);
		}


		// Initialize custom code e.g. for ports.
		// But the customCode is not yet executed. (Because of unit tests).
		const jsPath = Settings.launch.zsim.customCode.jsPath;
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
		this.configureMachine(Settings.launch.zsim);

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
		const limitSpeed = Settings.launch.zsim.limitSpeed;
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
				// timeoutRequest will be set by the ZSimulatorView.
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
	 * This is an 'intelligent' remote that does evaluate the breakpoint
	 * conditions on it's own.
	 * This is done primarily for performance reasons.
	 */
	/*
		public async continue(): Promise<string> {
			return new Promise<string>(async resolve => {
				// Save resolve function when break-response is received
				this.continueResolve=({breakReasonString}) => { // Note: here we need only breakReasonString
					// Clear registers
					this.postStep();
					resolve(breakReasonString);
				}

				// Send 'run' command
				await this.sendDzrpCmdContinue();
				// Clear registers
				this.postStep();
			});
		}
	*/


	/**
	 * Deserializes the CPU, memory etc. to restore the state.
	 */
	protected deserializeState(data: Uint8Array) {
		// Create mem buffer for reading
		const memBuffer = MemBuffer.from(data.buffer);

		// Deserialize own properties
		this.zxBorderColor = memBuffer.read8();

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

		// Serialize own properties
		memBuffer.write8(this.zxBorderColor);

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


	/**
	 * Returns the ULA screen with color attributes.
	 * @returns The screen as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		Utility.assert(this.zxUlaScreen);

		const ulaBank = this.zxUlaScreen.currentUlaBank;
		const bank = this.memory.getBankMemory(ulaBank);
		return bank.slice(0, 0x1B00);
	}


	/**
	 * Returns the buffer with beeper values.
	 * @returns Structure with:
	 * time: The start time of the buffer
	 * startValue: of the beeper (on/off)
	 * buffer: UInt16Array of beeper lengths, each indicating how long
	 * (in samples) the previous value lasted.
	 */
	public getZxBeeperBuffer(): BeeperBuffer {
		return this.zxBeeper.getBeeperBuffer(this.passedTstates);
	}


	/**
	 * Returns the ZX border color.
	 */
	public getZxBorderColor(): number {
		return this.zxBorderColor;
	}


	/**
	 * Loads a .sna file.
	 * Loading is intelligent. I.e. if a SNA file from a ZX128 is loaded into a ZX48 or a ZXNEXT
	 * it will work,
	 * as long as no memory is used that is not present in the memory model.
	 * E.g. as long as only 16k banks 0, 2 and 5 are used in the SNA file it
	 * is possible to load it onto a ZX48K.
	 * See https://faqwiki.zxnet.co.uk/wiki/SNA_format
	 */
	protected async loadBinSna(filePath: string): Promise<void> {
		// Load and parse file
		const snaFile = new SnaFile();
		snaFile.readFile(filePath);

		// If ZXNext is used then MemoryModelZxNextTwoROM should be used:
		Utility.assert(!(this.memoryModel instanceof MemoryModelZxNextOneROM));

		// 16K
		if (this.memoryModel instanceof MemoryModelZx16k)
			throw Error("Loading SNA file not supported for memory model '" + this.memoryModel.name + "'.");

		// 48K
		if (this.memoryModel instanceof MemoryModelZx48k) {
			if (snaFile.is128kSnaFile)
				throw Error("A 128K SNA file can't be loaded into a '" + this.memoryModel.name + "' memory model.");
			for (let i = 0; i < 3; i++) {
				const addr64k = (i + 1) * 0x4000;
				const slots = this.memoryModel.initialSlots;
				const {bank, offset} = this.memory.getBankAndOffsetForAddress(addr64k, slots);
				const snaMemBank = snaFile.memBanks[i];
				this.memory.writeMemoryData(bank, offset, snaMemBank.data, 0, snaMemBank.data.length);
			}
		}
		else if (this.memoryModel instanceof MemoryModelZxNextTwoRom) {
			// Bank numbers need to be doubled
			for (const memBank of snaFile.memBanks) {
				const nextBank = 2 * memBank.bank;
				this.memory.writeMemoryData(nextBank, 0, memBank.data, 0, 0x2000);
				this.memory.writeMemoryData(nextBank+1, 0, memBank.data, 0x2000, 0x2000);
			}
		}
		else {
			// Write banks
			try {
				for (const memBank of snaFile.memBanks) {
					this.memory.writeMemoryData(memBank.bank, 0, memBank.data, 0, memBank.data.length);
				}
			}
			catch (e) {
				const sna128String = (snaFile.is128kSnaFile) ? '128K ' : '';
				throw Error("A " + sna128String + "SNA file can't be loaded into a '" + this.memoryModel.name + "' memory model.");
			}
		}

		// Set the border
		await this.sendDzrpCmdSetBorder(snaFile.borderColor);

		// Set the registers
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, snaFile.pc);
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, snaFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF, snaFile.af);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC, snaFile.bc);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE, snaFile.de);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL, snaFile.hl);
		await this.sendDzrpCmdSetRegister(Z80_REG.IX, snaFile.ix);
		await this.sendDzrpCmdSetRegister(Z80_REG.IY, snaFile.iy);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF2, snaFile.af2);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC2, snaFile.bc2);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE2, snaFile.de2);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL2, snaFile.hl2);
		await this.sendDzrpCmdSetRegister(Z80_REG.R, snaFile.r);
		await this.sendDzrpCmdSetRegister(Z80_REG.I, snaFile.i);
		await this.sendDzrpCmdSetRegister(Z80_REG.IM, snaFile.im);
		await this.sendDzrpCmdSetRegister(Z80_REG.I, snaFile.im);

		// Interrupt (IFF2)
		const interrupt_enabled = (snaFile.iff2 & 0b00000100) !== 0;
		await this.sendDzrpCmdInterruptOnOff(interrupt_enabled);

		// Set ROM1 or ROM0
		if (snaFile.is128kSnaFile && (this.memoryModel instanceof MemoryModelZx128k || this.memoryModel instanceof MemoryModelZxNextTwoRom)) {
			// Write port 7FFD
			const port7ffd = snaFile.port7ffd;
			this.z80Cpu.ports.write(0x7FFD, port7ffd);
		}
	}


	/**
	 * Loads a .nex file.
	 * Loading is intelligent. I.e. if a NEX file is loaded into a ZX128,
	 * ZX48 or even a 64k RAM memory model it will work,
	 * as long as no memory is used that is not present in the memory model.
	 * E.g. as long as only 16k banks 0, 2 and 5 are used in the NEX file it
	 * is possible to load it onto a ZX48K.
	 * See https://wiki.specnext.dev/NEX_file_format
	 */
	protected async loadBinNex(filePath: string): Promise<void> {
		// Check for 128K
		if (!(this.memoryModel instanceof MemoryModelZxNextTwoRom))
			throw Error("A NEX file can only be loaded into a 'ZXNEXT' memory model. This is a '" + this.memoryModel.name + "' memory model.");

		// Load and parse file
		const nexFile = new NexFile();
		nexFile.readFile(filePath);

		// Set the border
		await this.sendDzrpCmdSetBorder(nexFile.borderColor);

		// Load memory banks
		for (const memBank of nexFile.memBanks) {
			// Convert 16K to 8K banks
			const bank = 2 * memBank.bank;
			this.memory.writeMemoryData(bank, 0, memBank.data, 0, 0x2000);
			this.memory.writeMemoryData(bank + 1, 0, memBank.data, 0x2000, 0x2000);
		}

		// Set the default slot/bank association if ZXNext
		// Convert 16k bank into 8k
		const entryBank8 = 2 * nexFile.entryBank;
		// Change banks in slot at 0xC000
		await this.sendDzrpCmdSetSlot(6, entryBank8);
		await this.sendDzrpCmdSetSlot(7, entryBank8 + 1);

		// Set the SP and PC registers
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, nexFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, nexFile.pc);

		// Set IM (Interrupt Mode) to 1 for ZX Spectrum.
		await this.sendDzrpCmdSetRegister(Z80_REG.IM, 1);
	}



	/**
	 * Executes a few zsim specific commands, e.g. for testing the custom javascript code.
	 * @param cmd E.g. 'out 0x9000 0xFE', 'in 0x8000', 'tstates set 1000' or 'tstates add 1000'.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		try {
			let response = '';
			const tokens = cmd.split(' ');
			const cmd_name = tokens.shift();
			if (cmd_name == "help") {
				// Add this to the help text
				response = `zsim specific commands:
out port value: Output 'value' to 'port'. E.g. "zsim out 0x9000 0xFE"
in port: Print input value from 'port'. E.g. "zsim in 0x8000"
tstates set value: set t-states to 'value', then create a tick event. E.g. "zsim tstates set 1000"
tstates add value: add 'value' to t-states, then create a tick event. E.g. "zsim tstates add 1000"
`;
				return response;
			}
			if (cmd_name == "out") {
				// Check count of arguments
				if (tokens.length != 2) {
					throw new Error("Wrong number of arguments: port and value expected.");
				}
				// Get port and value
				const port = Utility.parseValue(tokens[0]);
				const value = Utility.parseValue(tokens[1]);
				// Set port
				this.z80Cpu.ports.write(port, value);
				// Return
				response = "Wrote " + Utility.getHexString(value, 2) + "h to port " + Utility.getHexString(port, 4) + "h";
				return response;
			}
			if (cmd_name == "in") {
				// Check count of arguments
				if (tokens.length != 1) {
					throw new Error("Wrong number of arguments: port expected.");
				}
				// Get port and value
				const port = Utility.parseValue(tokens[0]);
				// Get port
				const value = this.z80Cpu.ports.read(port);
				// Return
				response = "Read port " + Utility.getHexString(port, 4) + "h: " + Utility.getHexString(value, 2) + "h";
				return response;
			}
			if (cmd_name == "tstates") {
				// Check count of arguments
				if (tokens.length != 2) {
					throw new Error("Wrong number of arguments.");
				}
				const subcmd = tokens[0];
				const value = Utility.parseValue(tokens[1]);
				if (subcmd == "set")
					this.passedTstates = value;
				else if (subcmd == "add")
					this.passedTstates += value;
				else
					throw Error("Expected 'set' or 'add' but got '" + subcmd + "'.");
				// Also inform customCode
				if (this.customCode) {
					this.customCode.setTstates(this.passedTstates);
					this.customCode.tick();
				}
				// Return
				response = "T-states set to " + this.passedTstates + ".";
				return response;
			}

			// Unknown command.
			throw Error("Error: not supported.");
		}
		catch (e) {	// NOSONAR: is here for debugging purposes to set a breakpoint
			// Rethrow
			throw e;
		}
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
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error=0 (no error).
	  */
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		// If ZXNext is used then MemoryModelZxNextTwoROM should be used:
		Utility.assert(!(this.memoryModel instanceof MemoryModelZxNextOneROM));

		// Special handling for ZXNext ROM:
		if (this.memoryModel instanceof MemoryModelZxNextTwoRom) {
			/*
			 * For ROM only 0xFF exists. But it is ambiguous,
			 * could be ROM0 (128k editor) or ROM1 (48k basic) (or even another ROM)
			 * be initialized to ROM0 anyway.
			 * So, we simply skip it. Is not called in normal operation anyway.
			*/
			if (bank === 0xFF) {
				// Ignore:
				return 1;	// Error: could not set slot
			}
		}
		this.memory.setSlot(slot, bank);
		return 0;
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

