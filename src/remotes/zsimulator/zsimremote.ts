import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers} from '../z80registers';
import {Z80Ports} from './z80ports';
import {Z80Cpu} from './z80cpu';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {Labels} from '../../labels/labels';
import {MemBuffer} from '../../misc/membuffer';
import {CodeCoverageArray} from './codecovarray';
import {CpuHistoryClass, CpuHistory, DecodeStandardHistoryInfo} from '../cpuhistory';
import {ZSimCpuHistory} from './zsimcpuhistory';
import {Zx48Memory} from './zx48memory';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {MemoryModel, Zx128MemoryModel, Zx48MemoryModel, ZxNextMemoryModel} from '../Paging/memorymodel';
import {SimulatedMemory} from './simmemory';
import {Zx128Memory} from './zx128memory';
import {ZxNextMemory} from './zxnextmemory';
import {UlaScreen} from './ulascreen';
import {SnaFile} from '../dzrp/snafile';
import {NexFile} from '../dzrp/nexfile';
import {CustomCode} from './customcode';
import {readFileSync} from 'fs';



/**
 * The representation of a Z80 remote.
 * With options to simulate ZX Spectrum or some ZX Next features.
 */
export class ZSimRemote extends DzrpRemote {

	// For emulation of the CPU.
	public z80Cpu: Z80Cpu;
	public memory: SimulatedMemory;
	public ports: Z80Ports;

	// If ULA screen is enabled this holds a pointer to it.
	public ulaScreen: UlaScreen;

	// Stores the code coverage.
	protected codeCoverage: CodeCoverageArray;

	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true as long as the CPU is running.
	protected cpuRunning: boolean;

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

	// The number of t-states to pass before a 'tick()' is send to the
	// peripherals custom code.
	protected timeStep: number;
	// Used to determine the next tick() call.
	protected nextStepTstates: number;

	// Is set/reset by the ZSimulatorView to request processing time.
	protected timeoutRequest: boolean;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.timeoutRequest=false;
		this.previouslyStoredPCHistory=-1;
		this.tbblueRegisterSelectValue=0;
		this.tbblueRegisterWriteHandler=new Map<number, (value: number) => void>();
		this.tbblueRegisterReadHandler=new Map<number, () => number>();
		this.passedTstates=0;
		this.timeStep=Settings.launch.zsim.customCode.timeStep;
		this.nextStepTstates=0;
		// Set decoder
		Z80Registers.decoder=new Z80RegistersStandardDecoder();
		this.cpuRunning=false;
		this.lastBpId=0;
		// Reverse debugging / CPU history
		if (Settings.launch.history.reverseDebugInstructionCount>0) {
			CpuHistoryClass.setCpuHistory(new ZSimCpuHistory());
			CpuHistory.decoder=new DecodeStandardHistoryInfo();
		}
		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled)
			this.codeCoverage=new CodeCoverageArray();
	}


	/**
	 * Is set/reset by the ZSimulatorView to request processing time.
	 */
	public setTimeoutRequest(on: boolean) {
		this.timeoutRequest=on;
	}


	/**
	 * Switches the memory bank.
	 * See https://www.worldofspectrum.org/faq/reference/128kreference.htm
	 * @param port The written port.
	 * @param value:
	 *   bit 0-2:  RAM page (0-7) to map into memory at 0xc000.
	 *   bit 3: Select normal(0) or shadow(1) screen to be displayed. The normal screen is in bank 5, whilst the shadow screen is in bank 7. Note that this does not affect the memory between 0x4000 and 0x7fff, which is always bank 5.
	 *   bit 4: ROM select. ROM 0 is the 128k editor and menu system; ROM 1 contains 48K BASIC.
	 *   bit 5: If set, memory paging will be disabled and further output to this port will be ignored until the computer is reset.
	 */
	protected zx128BankSwitch(port: number, value: number) {
		// bit 0-2:  RAM page (0-7) to map into memory at 0xc000.
	    const mem=this.memory;
		const ramBank=value&0x07;
		// Change the slots
		mem.setSlot(3, ramBank);

		// bit 3: Select normal(0) or shadow(1) screen to be displayed.
		const shadowScreen=value&0b01000;
		const screenAddress=(shadowScreen==0)? 5*0x4000 : 7*0x4000;
		Utility.assert(this.ulaScreen);
		this.ulaScreen.setUlaScreenAddress(screenAddress);

		// bit 4: ROM select. ROM 0 is the 128k editor and menu system; ROM 1 contains 48K BASIC.
		const romIndex=(value&0b010000)? 1:0;
		this.memory.setSlot(0, 8+romIndex);

		// bit 5: If set, memory paging will be disabled
		if (value&0b0100000) {
			// Disable further writes to this port
			this.ports.registerSpecificOutPortFunction(0x7FFD, undefined);
		}
	}


	/**
	 * Selects active port for TBBlue/Next feature configuration.
	 * See https://wiki.specnext.dev/TBBlue_Register_Select
	 * The value is just stored, no further action.
	 * @param port The written port. (0x243B)
	 * @param value The tbblue register to select.
	 */
	protected tbblueRegisterSelect(port: number, value: number) {
		this.tbblueRegisterSelectValue=value;
	}


	/**
	 * Writes the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and tbblueRegisterSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * At the moment only the memory slot functions are executed.
	 * @param port The port.
	 * @param value The tbblue register to select.
	 */
	protected tbblueRegisterWriteAccess(port: number, value: number) {
		const func=this.tbblueRegisterWriteHandler.get(this.tbblueRegisterSelectValue);
		if (func)
			func(value);
	}


	/**
	 * Reads the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and tbblueRegisterSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * At the moment only the memory slot functions are executed.
	 * @param port The port.
	 */
	protected tbblueRegisterReadAccess(port: number): number {
		const func=this.tbblueRegisterReadHandler.get(this.tbblueRegisterSelectValue);
		if (!func)
			return 0;
		// Get value
		const value=func();
		return value;
	}


	/**
	 * Changes the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * tbblueRegisterSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 * @param value The bank to map.
	 */
	protected tbblueMemoryManagementSlotsWrite(value: number) {
		const slot=this.tbblueRegisterSelectValue&0x07;
		if (value==0xFF) {
			// Handle ROM specially
			if (slot>1)
				return;	// not allowed
			// Choose ROM bank according slot
			if (slot==0)
				value=0xFE;
		}
		else if (value>223)
			return;	// not existing bank

		// Change the slot/bank
		this.memory.setSlot(slot, value);
	}


	/**
	 * Reads the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * tbblueRegisterSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 */
	protected tbblueMemoryManagementSlotsRead(): number {
		const slot=this.tbblueRegisterSelectValue&0x07;
		// Change the slot/bank
		let bank=this.memory.getSlots()![slot];
		// Check for ROM = 0xFE
		if (bank==0xFE)
			bank=0xFF;
		return bank;
	}


	/**
	 * Configures the machine.
	 * Loads the roms and sets up bank switching.
	 * @param memModel The memory model:
	 * - "RAM": One memory area of 64K RAM, no banks.
	 * - "ZX48": ROM and RAM as of the ZX Spectrum 48K.
	 * - "ZX128": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	 *  - "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
	 */
	protected configureMachine(memModel: string) {
		Z80Registers.decoder=new Z80RegistersStandardDecoder();	// Required for the memory model.

		// Create ports for paging
		this.ports=new Z80Ports();

		// Configure different memory models
		switch (memModel) {
			case "RAM":
				{
					// 64K RAM, no ZX
					// Memory Model
					this.memoryModel=new MemoryModel();
					this.memory=new SimulatedMemory(1, 1);
					// Check if ULA enabled
					if (Settings.launch.zsim.ulaScreen)
						this.ulaScreen=new UlaScreen(this.memory);
				}
				break;
			case "ZX48K":
				{
					// ZX 48K
					// Memory Model
					this.memoryModel=new Zx48MemoryModel();
					this.memory=new Zx48Memory();
					// Check if ULA enabled
					if (Settings.launch.zsim.ulaScreen)
						this.ulaScreen=new UlaScreen(this.memory);
				}
				break;
			case "ZX128K":
				{
					// ZX 128K
					// Memory Model
					this.memoryModel=new Zx128MemoryModel();
					this.memory=new Zx128Memory();
					// Bank switching.
					this.ports.registerSpecificOutPortFunction(0x7FFD, this.zx128BankSwitch.bind(this));
					// Check if ULA enabled
					if (Settings.launch.zsim.ulaScreen) {
						this.ulaScreen=new UlaScreen(this.memory);
						this.ulaScreen.setUlaScreenAddress(5*0x4000);	// Bank 5
					}
				}
				break;
			case "ZXNEXT":
				{
					// ZX Next
					// Memory Model
					this.memoryModel=new ZxNextMemoryModel();
					this.memory=new ZxNextMemory();
					// Bank switching.
					for (let tbblueRegister=0x50; tbblueRegister<=0x57; tbblueRegister++) {
						this.tbblueRegisterWriteHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsWrite.bind(this));
						this.tbblueRegisterReadHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsRead.bind(this));
					}
					// Connect to port
					this.ports.registerSpecificOutPortFunction(0x243B, this.tbblueRegisterSelect.bind(this));
					this.ports.registerSpecificOutPortFunction(0x253B, this.tbblueRegisterWriteAccess.bind(this));
					this.ports.registerSpecificInPortFunction(0x253B, this.tbblueRegisterReadAccess.bind(this));
					// Check if ULA enabled
					if (Settings.launch.zsim.ulaScreen) {
						this.ulaScreen=new UlaScreen(this.memory);
						this.ulaScreen.setUlaScreenAddress(10*0x2000);	// Initially bank 10
					}
				}
				break;
			default:
				throw Error("Unknown memory model: '"+memModel+"'.");
		}

		// Convert labels if necessary.
		this.memoryModel.init();
		Labels.convertLabelsTo(this.memoryModel);

		// Create a Z80 CPU to emulate Z80 behavior
		this.z80Cpu=new Z80Cpu(this.memory, this.ports);
		// For restoring the state
		this.serializeObjects=[
			this.z80Cpu,
			this.memory,
			this.ports
		];

		// Initialize custom code e.g. for ports
		const jsPath=Settings.launch.zsim.customCode.jsPath;
		if (jsPath) {
			// Can throw an error
			const jsCode=readFileSync(jsPath).toString();
			//jsCode="<b>Error: reading file '"+jsPath+"':"+e.message+"</b>";
			this.customCode=new CustomCode(jsCode);
			// Register custom code
			this.ports.registerGenericInPortFunction(port => {
				this.customCode.setTstates(this.passedTstates);
				const value=this.customCode.readPort(port);
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
		}
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Decide what machine
		this.configureMachine(Settings.launch.zsim.memoryModel);

		// Load sna or nex file
		const loadPath=Settings.launch.load;
		if (loadPath)
			await this.loadBin(loadPath);

		// Load obj file(s) unit
		for (let loadObj of Settings.launch.loadObjs) {
			if (loadObj.path) {
				// Convert start address
				const start=Labels.getNumberFromString64k(loadObj.start);
				if (isNaN(start))
					throw Error("Cannot evaluate 'loadObjs[].start' ("+loadObj.start+").");
				await this.loadObj(loadObj.path, start);
			}
		}

		// Set Program Counter to execAddress
		if (Settings.launch.execAddress) {
			const execAddress=Labels.getNumberFromString64k(Settings.launch.execAddress);
			if (isNaN(execAddress))
				throw Error("Cannot evaluate 'execAddress' ("+Settings.launch.execAddress+").");
			// Set PC
			await this.setRegisterValue("PC", execAddress);
		}

		// Ready
		this.emit('initialized')
	}


	/**
	 * Stops the simulator.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		// Stop running cpu
		this.cpuRunning=false;
		this.emit('closed')
	}


	/**
	 * Sets a specific register value.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @param value The value to set.
	 */
	protected setRegValue(reg: Z80_REG, value: number) {
		// Set register in z80 cpu
		switch (reg) {
			case Z80_REG.PC:
				this.z80Cpu.pc=value;
				break;
			case Z80_REG.SP:
				this.z80Cpu.sp=value;
				break;
			case Z80_REG.AF:
				this.z80Cpu.af=value;
				break;
			case Z80_REG.BC:
				this.z80Cpu.bc=value;
				break;
			case Z80_REG.DE:
				this.z80Cpu.de=value;
				break;
			case Z80_REG.HL:
				this.z80Cpu.hl=value;
				break;
			case Z80_REG.IX:
				this.z80Cpu.ix=value;
				break;
			case Z80_REG.IY:
				this.z80Cpu.iy=value;
				break;
			case Z80_REG.AF2:
				this.z80Cpu.af2=value;
				break;
			case Z80_REG.BC2:
				this.z80Cpu.bc2=value;
				break;
			case Z80_REG.DE2:
				this.z80Cpu.de2=value;
				break;
			case Z80_REG.HL2:
				this.z80Cpu.hl2=value;
				break;

			case Z80_REG.IM:
				this.z80Cpu.im=value;
				break;

			case Z80_REG.F:
				this.z80Cpu.f=value;
				break;
			case Z80_REG.A:
				this.z80Cpu.a=value;
				break;
			case Z80_REG.C:
				this.z80Cpu.c=value;
				break;
			case Z80_REG.B:
				this.z80Cpu.b=value;
				break;
			case Z80_REG.E:
				this.z80Cpu.e=value;
				break;
			case Z80_REG.D:
				this.z80Cpu.d=value;
				break;
			case Z80_REG.L:
				this.z80Cpu.l=value;
				break;
			case Z80_REG.H:
				this.z80Cpu.h=value;
				break;
			case Z80_REG.IXL:
				this.z80Cpu.ixl=value;
				break;
			case Z80_REG.IXH:
				this.z80Cpu.ixh=value;
				break;
			case Z80_REG.IYL:
				this.z80Cpu.iyl=value;
				break;
			case Z80_REG.IYH:
				this.z80Cpu.iyh=value;
				break;

			case Z80_REG.F2:
				this.z80Cpu.f=value;
				break;
			case Z80_REG.A2:
				this.z80Cpu.a=value;
				break;
			case Z80_REG.C2:
				this.z80Cpu.c=value;
				break;
			case Z80_REG.B2:
				this.z80Cpu.b=value;
				break;
			case Z80_REG.E2:
				this.z80Cpu.e=value;
				break;
			case Z80_REG.D2:
				this.z80Cpu.d=value;
				break;
			case Z80_REG.L2:
				this.z80Cpu.l=value;
				break;
			case Z80_REG.H2:
				this.z80Cpu.h=value;
				break;
			case Z80_REG.R:
				this.z80Cpu.r=value;
				break;
			case Z80_REG.I:
				this.z80Cpu.i=value;
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
		const hist=this.z80Cpu.getHistoryData();
		// Check if pc changed
		if (pc!=this.previouslyStoredPCHistory) {
			this.previouslyStoredPCHistory=pc;
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
		while (true) {
			//		Utility.timeDiff();
			this.z80Cpu.error=undefined;
			let breakReasonString='';
			let breakNumber=BREAK_REASON_NUMBER.NO_REASON;
			let counter=5000;
			//let bp;
			let breakAddress;
			let updateCounter=0;
			let slots;
			const longAddressesUsed=Labels.AreLongAddressesUsed();
			if(longAddressesUsed)
				slots=this.memory.getSlots();
			let pcLong=Z80Registers.createLongAddress(this.z80Cpu.pc, slots);
			try {
				// Run the Z80-CPU in a loop
				for (; counter>0; counter--) {
					// Store current registers and opcode
					const prevPc=this.z80Cpu.pc;
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
					const tStates=this.z80Cpu.execute();

					// For custom code: Increase passed t-states
					this.passedTstates += tStates;

					// Update visual memory
					this.memory.setVisualProg(prevPc); // Fully correct would be to update all opcodes. But as it is compressed anyway this only gives a more accurate view at a border but on the other hand reduces the performance.

					// Store the pc for coverage (previous pcLong)
					this.codeCoverage?.storeAddress(pcLong);

					// Do visual update
					if (this.z80Cpu.update) {
						updateCounter--;
						if (updateCounter<=0) {
							// Update the screen etc.
							this.emit('update')
							updateCounter=1;
						}
					}

					// Check if some CPU error occurred
					if (this.z80Cpu.error!=undefined) {
						// E.g. an error in the custom code
						breakNumber=BREAK_REASON_NUMBER.CPU_ERROR;
						breakReasonString="CPU error: "+this.z80Cpu.error;
						break;
					}

					const pc = this.z80Cpu.pc;

					// Check if any real breakpoint is hit
					// Note: Because of step-out this needs to be done before the other check.
					// Convert to long address
					if (longAddressesUsed)
						slots=this.memory.getSlots();
					pcLong=Z80Registers.createLongAddress(pc, slots);
					const bpInner=this.tmpBreakpoints.get(pcLong);
					if (bpInner) {
						// To improve performance of condition and log breakpoints the condition check is also done below.
						// So it is not required to go back up to the debug adapter, just to return here in case the condition is wrong.
						// If condition is not true then don't consider the breakpoint.
						// Get registers
						const regs=this.z80Cpu.getRegisterData();
						Z80Registers.setCache(regs);
						// Now check if condition met or if logpoint
						let bp;
						for (const bpElem of bpInner) {
							try {
								const {condition, log}=this.checkConditionAndLog(bpElem);
								// Emit log?
								if (log) {
									// Convert and print
									const evalLog=await Utility.evalLogString(log)
									this.emit('debug_console', "Log: "+evalLog);
								}
								else {
									// Not a logpoint.
									// Condition met?
									if (condition!=undefined) {
										bp=bpElem;
										break;
									}
								}
							}
							catch (e) {
								// Some problem occurred, pass evaluation to DebugSessionClass
								bp=bpElem;
								break;
							}
						}
						// Breakpoint and condition OK
						if (bp) {
							breakNumber=BREAK_REASON_NUMBER.BREAKPOINT_HIT;
							breakAddress=pcLong;
							break;	// stop loop
						}
					}

					// Check if watchpoint is hit
					if (this.memory.hitAddress>=0) {
						// Yes, read or write access
						breakNumber=(this.memory.hitAccess=='r')? BREAK_REASON_NUMBER.WATCHPOINT_READ:BREAK_REASON_NUMBER.WATCHPOINT_WRITE;
						const memAddress=this.memory.hitAddress;
						// Calculate long address
						breakAddress=Z80Registers.createLongAddress(memAddress, slots);
						// NOTE: Check for long watchpoint address could be done already here.
						// However it is done anyway in the DzrpRemote.
						break;
					}


					// Check if given breakpoints are hit (64k address compare, not long addresses)
					if (pc == bp1 || pc == bp2) {
						breakAddress = pc;
						break;
					}

					// Check if stopped from outside
					if (!this.cpuRunning) {
						breakNumber=BREAK_REASON_NUMBER.MANUAL_BREAK;	// Manual break
						break;
					}
				}

			}
			catch (errorText) {
				breakReasonString="Z80CPU Error: "+errorText;
				console.log(breakReasonString);
				breakNumber=BREAK_REASON_NUMBER.UNKNOWN;
			};

			if (counter!=0) {
				// Stop immediately
				//let condition='';
				this.cpuRunning=false;
				// Get breakpoint Address
				/*
				if (bp) {
					breakAddress=bp.address;
					//condition=bp.condition;
				}
				*/

				// Create reason string
				//breakReasonString=await this.constructBreakReasonString(breakNumber, breakAddress, condition, breakReasonString);

				// Send Notification
				//LogGlobal.log("cpuContinue, continueResolve="+(this.continueResolve!=undefined));
				Utility.assert(this.continueResolve);
				this.continueResolve!({breakNumber, breakAddress, breakReasonString});

				return;
			}

			// Give other tasks a little time and continue
			await Utility.timeout(10);

			// Check if additional time is required for the webview
			while (this.timeoutRequest) {
				// timeoutRequest will be set by the ZSimulatorView.
				await Utility.timeout(100);
			}

			// Check if meanwhile a manual break happened
			if (!this.cpuRunning) {
				// Manual break: Create reason string
				breakNumber=BREAK_REASON_NUMBER.MANUAL_BREAK;
				breakAddress=0;
				breakReasonString=await this.constructBreakReasonString(breakNumber, breakAddress, '', '');

				// Send Notification
				//LogGlobal.log("cpuContinue, continueResolve="+(this.continueResolve!=undefined));
				Utility.assert(this.continueResolve);
				if (this.continueResolve)
					this.continueResolve({breakNumber, breakAddress, breakReasonString});
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
		this.codeCoverage.clearAll();
	}


	/**
	 * This method should be called after a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 * It will clear e.g. the register and the call stack cache.
	 * So that the next time they are accessed they are immediately refreshed.
	 */
	public stopProcessing() {
		super.stopProcessing();

		// Update the screen etc.
		this.emit('update');

		// Emit code coverage event
		if (this.codeCoverage) {
			this.emit('coverage', this.codeCoverage.getAddresses());
			this.codeCoverage.clearAll();
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
		const memBuffer=MemBuffer.from(data.buffer);
		// Deserialize objects
		for (const obj of this.serializeObjects)
			obj.deserialize(memBuffer);

		return memBuffer.getUint8Array();
	}


	/**
	 * Serializes the CPU, memory etc. to save the state.
	 */
	protected serializeState(): Uint8Array {
		// Get size of all serialized objects
		let size=0;
		for (const obj of this.serializeObjects)
			size+=obj.getSerializedSize();
		// Allocate memory
		const memBuffer=new MemBuffer(size);
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
		this.z80Cpu.cpuTstatesCounter = 0;
	}


	/**
	 * Returns the number of T-States (since last reset).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getTstates(): Promise<number> {
		return this.z80Cpu.cpuTstatesCounter;
	}


	/**
	 * Returns the current CPU frequency
	 * @returns The CPU frequency in Hz (e.g. 3500000 for 3.5MHz) or 0 if not supported.
	 */
	public async getCpuFrequency(): Promise<number> {
		return this.z80Cpu.cpuFreq;
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
		const snaFile=new SnaFile();
		snaFile.readFile(filePath);

		// Set the border
		await this.sendDzrpCmdSetBorder(snaFile.borderColor);

		// Transfer 16k memory banks
		const slots=this.memory.getSlots();
		const slotCount=(slots) ?slots.length : 1;
		const bankSize=0x10000/slotCount;
		const convAddresses=[ // 0x10000 would be out of range,
			0xC000, 0x10000, 0x8000, 0x10000,
			0x10000, 0x4000, 0x10000, 0x10000
		];
		for (const memBank of snaFile.memBanks) {
			let addr17;
			// Convert banks to 17 bit addresses (128K Spectrum)
			if (!slots) {
				// For e.g. ZX48 without banks
				addr17=convAddresses[memBank.bank];
			}
			else {
				// For another banked machine
				addr17=memBank.bank*0x4000;
			}
			// Write data
			let offs=0;
			while (offs<=0x4000) {
				const data=memBank.data.slice(offs, offs+bankSize);	// Assumes that bankSize is always smaller as 0x4000 which is used in sna format
				this.memory.writeMemoryData(addr17+offs, data);
				// Next
				offs+=bankSize;
			}
		}

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
		// Load and parse file
		const nexFile=new NexFile();
		nexFile.readFile(filePath);

		// Set the border
		await this.sendDzrpCmdSetBorder(nexFile.borderColor);

		// Transfer 16k memory banks
		const slots=this.memory.getSlots();
		const slotCount=(slots)? slots.length:1;
		const bankSize=0x10000/slotCount;
		const convAddresses=[ // 0x10000 would be out of range,
			0xC000, 0x10000, 0x8000, 0x10000,
			0x10000, 0x4000, 0x10000, 0x10000
		];
		for (const memBank of nexFile.memBanks) {
			let addr17;
			// Convert banks to 17 bit addresses (128K Spectrum)
			if (!slots) {
				// For e.g. ZX48 without banks
				addr17=convAddresses[memBank.bank];
			}
			else {
				// For another banked machine
				addr17=memBank.bank*0x4000;
			}
			// Write data
			let offs=0;
			while (offs<=0x4000) {
				const data=memBank.data.slice(offs, offs+bankSize);	// Assumes that bankSize is always smaller as 0x4000 which is used in sna format
				this.memory.writeMemoryData(addr17+offs, data);
				// Next
				offs+=bankSize;
			}
		}

		// Set the SP and PC registers
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, nexFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, nexFile.pc);
	}



	/**
	 * Executes a few zsim specific commands, e.g. for testing the custom javascript code.
	 * @param cmd E.g. 'out 0x9000 0xFE', 'in 0x8000', 'tstates set 1000' or 'tstates add 1000'.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		try {
			let response='';
			const tokens=cmd.split(' ');
			const cmd_name=tokens.shift();
			if (cmd_name=="help") {
				// Add this to the help text
				response=`zsim specific commands:
out port value: Output 'value' to 'port'. E.g. "zsim out 0x9000 0xFE"
in port: Print input value from 'port'. E.g. "zsim in 0x8000"
tstates set value: set t-states to 'value', then create a tick event. E.g. "zsim tstastes set 1000"
tstates add value: add 'value' to t-states, then create a tick event. E.g. "zsim tstastes add 1000"
`;
			}
			else if (cmd_name=="out") {
				// Check count of arguments
				if (tokens.length!=2) {
					throw new Error("Wrong number of arguments: port and value expected.");
				}
				// Get port and value
				const port=Utility.parseValue(tokens[0]);
				const value=Utility.parseValue(tokens[1]);
				// Set port
				this.z80Cpu.ports.write(port, value);
				// Return
				response="Wrote "+Utility.getHexString(value, 2)+"h to port "+Utility.getHexString(port, 4)+"h";
				return response;
			}
			else if (cmd_name=="in") {
				// Check count of arguments
				if (tokens.length!=1) {
					throw new Error("Wrong number of arguments: port expected.");
				}
				// Get port and value
				const port=Utility.parseValue(tokens[0]);
				// Get port
				const value=this.z80Cpu.ports.read(port);
				// Return
				response="Read port "+Utility.getHexString(port, 4)+"h: "+Utility.getHexString(value, 2)+"h";
				return response;
			}
			else if (cmd_name=="tstates") {
				// Check count of arguments
				if (tokens.length!=2) {
					throw new Error("Wrong number of arguments.");
				}
				const subcmd=tokens[0];
				const value=Utility.parseValue(tokens[1]);
				if (subcmd=="set")
					this.passedTstates=value;
				else if (subcmd=="add")
					this.passedTstates+=value;
				else
					throw Error("Expected 'set' or 'add' but got '"+subcmd+"'.");
				this.customCode.setTstates(this.passedTstates);
				this.customCode.tick();
				// Return
				response="T-states set to "+this.passedTstates+".";
				return response;
			}

			// Otherwise pass to super class
			response+=super.dbgExec(cmd);
			return response;
		}
		catch (e) {
			// Rethrow
			throw e;
		}
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
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		if (bp1Address==undefined) bp1Address=-1;	// unreachable
		if (bp2Address==undefined) bp2Address=-1;	// unreachable
		// Set the temporary breakpoints array
		// Run the Z80-CPU in a loop
		this.cpuRunning=true;
		this.memory.clearHit();
		await this.z80CpuContinue(bp1Address, bp2Address);
	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		// If running then pause
		this.cpuRunning=false;
	}


	/**
	 * The simulator does not add any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		this.lastBpId++;
		bp.bpId=this.lastBpId;
	}


	/**
	 * The simulator does not remove any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
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
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		const buffer = this.memory.readBlock(address, size);
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer|Uint8Array): Promise<void> {
		this.memory.writeBlock(address, dataArray);
	}


	/**
	 * Sends the command to write a memory bank.
	 * This is e.g. used by loadBinSna. The bank number given here is always for a ZXNext memory model
	 * and need to be scaled to other memory models.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
	 * @throws An exception if e.g. the bank size does not match.
 	*/
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array): Promise<void> {
		this.memory.writeBank(bank, dataArray);
	}


	/**
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error=0 (no error).
 	*/
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
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
		// Update the screen etc.
		this.emit('update')
	}


	/**
	 * Sends the command to set the border.
 	*/
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
		// Set port for border
		this.ports.write(0xFE, borderColor);
	}
}

