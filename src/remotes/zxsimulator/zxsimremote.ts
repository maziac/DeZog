import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers, Z80RegistersStandardDecoder} from '../z80registers';
import {WatchpointZxMemory} from './wpzxmemory';
import {ZxPorts} from './zxports';
import {Z80Cpu} from './z80cpu';
import {Settings} from '../../settings';
//import {GenericBreakpoint} from '../../genericwatchpoint';
import {Utility} from '../../misc/utility';
import * as fs from 'fs';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {Labels} from '../../labels/labels';
import {MemBuffer} from '../../misc/membuffer';
import {CodeCoverageArray} from './codecovarray';
import {CpuHistoryClass, CpuHistory, DecodeStandardHistoryInfo} from '../cpuhistory';
import {ZxSimCpuHistory} from './zxsimcpuhistory';
import {ZxMemory} from './zxmemory';
import {GenericBreakpoint} from '../../genericwatchpoint';



/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxSimulatorRemote extends DzrpRemote {

	// For emulation of the CPU.
	public z80Cpu: Z80Cpu;
	public zxMemory: WatchpointZxMemory;
	public zxPorts: ZxPorts;


	// The ZX128 stores its ROM here as it has 2.
	protected romBuffer: Uint8Array;

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
	protected previouslyStoredPCHistory;

	// TBBlue register handling.
	protected tbblueRegisterSelectValue;

	// Maps function handlers to registers (the key). As key the tbblueRegisterSelectValue is used.
	protected tbblueRegisterWriteHandler: Map<number, (value: number) => void>;

	// Same for reading the register.
	protected tbblueRegisterReadHandler: Map<number, () => number>;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.previouslyStoredPCHistory=-1;
		this.tbblueRegisterSelectValue=0;
		this.tbblueRegisterWriteHandler=new Map<number, (value: number) => void>();
		this.tbblueRegisterReadHandler=new Map<number, () => number>();
		// Set decoder
		Z80Registers.decoder=new Z80RegistersStandardDecoder();
		this.cpuRunning=false;
		this.lastBpId=0;
		// Reverse debugging / CPU history
		if (Settings.launch.history.reverseDebugInstructionCount>0) {
			CpuHistoryClass.setCpuHistory(new ZxSimCpuHistory());
			CpuHistory.decoder=new DecodeStandardHistoryInfo();
		}
		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled)
			this.codeCoverage=new CodeCoverageArray();
		// Create a Z80 CPU to emulate Z80 behaviour
		this.zxMemory=new WatchpointZxMemory();
		this.zxPorts=new ZxPorts();
		this.z80Cpu=new Z80Cpu(this.zxMemory, this.zxPorts);
		// For restoring the state
		this.serializeObjects=[
			this.z80Cpu,
			this.zxMemory,
			this.zxPorts
		];
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
	    const mem=this.zxMemory;
		const ramBank=value&0x07;
		const ramBank0=ramBank*2;
		const ramBank1=ramBank0+1
		// Change the slots
		mem.setSlot(6, ramBank0);
		mem.setSlot(7, ramBank1);

		// bit 3: Select normal(0) or shadow(1) screen to be displayed.
		const shadowScreen=value&0b01000;
		const screenBank=(shadowScreen!=0)? 7:5;
		this.zxMemory.setUlaScreenBank(2*screenBank);

		// bit 4: ROM select. ROM 0 is the 128k editor and menu system; ROM 1 contains 48K BASIC.
		const romIndex=(value&0b010000)? 1:0;
		const size=ZxMemory.MEMORY_BANK_SIZE;
		const rom0=new Uint8Array(this.romBuffer.buffer, romIndex*2*size, size);
		const rom1=new Uint8Array(this.romBuffer.buffer, romIndex*2*size+size, size);
		this.zxMemory.writeBank(254, rom0);
		this.zxMemory.writeBank(255, rom1);

		// bit 5: If set, memory paging will be disabled
		if (value&0b0100000) {
			// Disable further writes to this port
			this.zxPorts.registerOutPortFunction(0x7FFD, undefined);
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
	 * i.e. calls the mapped fucntion for the selected register.
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
	 * i.e. calls the mapped fucntion for the selected register.
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
		this.zxMemory.setSlot(slot, value);
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
		let bank=this.zxMemory.getSlots()[slot];
		// Check for ROM = 0xFE
		if (bank==0xFE)
			bank=0xFF;
		return bank;
	}


	/**
	 * Configures the machine.
	 * Loads the roms and sets up bank switching.
	 */
	protected configureMachine(loadZxRom: boolean, memoryPagingControl: boolean, tbblueMemoryManagementSlots: boolean) {
		try {

			// "loadZxRom"
			if (loadZxRom) {
				// Load the rom
				if (memoryPagingControl) {
					// ZX 128K
					const size=ZxMemory.MEMORY_BANK_SIZE;
					const romFilePath=Utility.getExtensionPath()+'/data/128.rom';
					this.romBuffer=fs.readFileSync(romFilePath);
					const rom0=new Uint8Array(this.romBuffer.buffer, 2*size, size);
					const rom1=new Uint8Array(this.romBuffer.buffer, 3*size, size);
					this.zxMemory.writeBank(254, rom0);
					this.zxMemory.writeBank(255, rom1);
				}
				else {
					// ZX 48K
					const size=ZxMemory.MEMORY_BANK_SIZE;
					const romFilePath=Utility.getExtensionPath()+'/data/48.rom';
					const romBuffer=fs.readFileSync(romFilePath);
					// use USR 0 mode, i.e. preload the 48K ROM
					const rom0=new Uint8Array(romBuffer.buffer, 0, size);
					const rom1=new Uint8Array(romBuffer.buffer, size, size);
					this.zxMemory.writeBank(254, rom0);
					this.zxMemory.writeBank(255, rom1);
				}
			}

			// "memoryPagingControl"
			if (memoryPagingControl) {
				// Bank switching.
				this.zxPorts.registerOutPortFunction(0x7FFD, this.zx128BankSwitch.bind(this));
			}

			// TBBlue

			// "tbblueMemoryManagementSlots"
			if (tbblueMemoryManagementSlots) {
				// Bank switching.
				for (let tbblueRegister=0x50; tbblueRegister<=0x57; tbblueRegister++) {
					this.tbblueRegisterWriteHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsWrite.bind(this));
					this.tbblueRegisterReadHandler.set(tbblueRegister, this.tbblueMemoryManagementSlotsRead.bind(this));
				}
			}

			// If any tbblue register is used then enable tbblue ports
			if (this.tbblueRegisterWriteHandler.size>0) {
				this.zxPorts.registerOutPortFunction(0x243B, this.tbblueRegisterSelect.bind(this));
				this.zxPorts.registerOutPortFunction(0x253B, this.tbblueRegisterWriteAccess.bind(this));
				this.zxPorts.registerInPortFunction(0x253B, this.tbblueRegisterReadAccess.bind(this));
			}
		}
		catch (e) {
			this.emit('warning', e.message);
		}
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Decide what machine
		this.configureMachine(Settings.launch.zsim.loadZxRom, Settings.launch.zsim.memoryPagingControl, Settings.launch.zsim.tbblueMemoryManagementSlots);

		// Load sna or nex file
		const loadPath=Settings.launch.load;
		if (loadPath)
			await this.loadBin(loadPath);

		// Load obj file(s) unit
		for (let loadObj of Settings.launch.loadObjs) {
			if (loadObj.path) {
				// Convert start address
				const start=Labels.getNumberFromString(loadObj.start);
				if (isNaN(start))
					throw Error("Cannot evaluate 'loadObjs[].start' ("+loadObj.start+").");
				await this.loadObj(loadObj.path, start);
			}
		}

		// Set Program Counter to execAddress
		if (Settings.launch.execAddress) {
			const execAddress=Labels.getNumberFromString(Settings.launch.execAddress);
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
	 * Loads .nex or .sna files.
	 * Assures that the memory banks are copied to the Z80 memory.
	 */
	protected async loadBin(filePath: string): Promise<void> {
		await super.loadBin(filePath);
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
	 * @param pc The pc for the line.
	 */
	protected storeHistoryInfo(pc: number) {
		// Get history element
		const hist=this.z80Cpu.getHistoryData();
		// Check if pc changed
		const exchange=(pc==this.previouslyStoredPCHistory);
		this.previouslyStoredPCHistory=pc;
		// Store
		CpuHistory.pushHistoryInfo(hist, exchange);
	}


	/**
	 * Runs the cpu in time chunks in order to give time to other
	 * processes. E.g. to receive a pause command.
	 * @param bp1 Breakpoint 1 address or -1 if not used.
	 * @param bp2 Breakpoint 2 address or -1 if not used.
	 */
	protected async z80CpuContinue(bp1: number, bp2: number): Promise<void> {
		//		Utility.timeDiff();
		let breakReasonString='';
		let breakNumber=BREAK_REASON_NUMBER.NO_REASON;
		let counter=5000;
		//let bp;
		let breakAddress;
		let updateCounter=0;
		try {
			// Run the Z80-CPU in a loop
			for (; counter>0; counter--) {
				// Store current registers and opcode
				const prevPc=this.z80Cpu.pc;
				if (CpuHistory)
					this.storeHistoryInfo(prevPc);

				// Execute one instruction
				const vertInterrupt=this.z80Cpu.execute();

				// Update visual memory
				this.zxMemory.setVisualProg(prevPc); // Fully correct would be to update all opcodes. But as it is compressed anyway this only gives a more accurate view at a border but on the other hand reduces the performance.

				// Store the pc for coverage
				this.codeCoverage?.storeAddress(prevPc);

				// Do visual update
				if (vertInterrupt) {
					updateCounter--;
					if (updateCounter<=0) {
						// Update the screen etc.
						this.emit('update')
						updateCounter=1;
					}
				}

				// Check if given breakpoints are hit
				const pc=this.z80Cpu.pc;
				if (pc==bp1||pc==bp2) {
					breakAddress=pc;
					break;
				}

				// Check if any real breakpoint is hit
				// Note: Because of step-out this needs to be done before the other check.
				const bpInner=this.tmpBreakpoints.get(pc);
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
								this.emit('log', evalLog);
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
						breakAddress=pc;
						break;	// stop loop
					}
				}

				// Check if watchpoint is hit
				if (this.zxMemory.hitAddress>=0) {
					// Yes, read or write access
					breakNumber=(this.zxMemory.hitAccess=='r')? BREAK_REASON_NUMBER.WATCHPOINT_READ:BREAK_REASON_NUMBER.WATCHPOINT_WRITE;
					breakAddress=this.zxMemory.hitAddress;
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
		setTimeout(async () => {
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

			// Otherwise continue
			this.z80CpuContinue(bp1, bp2);
		}, 10);
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
		// Create mem buffer fro reading
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


	//------- Send Commands -------

	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	protected async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		return this.z80Cpu.getRegisterData();
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	protected async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		this.setRegValue(regIndex, value);
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		if (bp1Address==undefined) bp1Address=-1;	// unreachable
		if (bp2Address==undefined) bp2Address=-1;	// unreachable
		// Set the temporary breakpoints array
		// Run the Z80-CPU in a loop
		this.cpuRunning=true;
		this.zxMemory.clearHit();
		await this.z80CpuContinue(bp1Address, bp2Address);
	}


	/**
	 * Sends the command to pause a running program.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		// If running then pause
		this.cpuRunning=false;
	}


	/**
	 * The simulator does not add any breakpoint here because it already
	 * has the breakpoint, logpoint and assert lists.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		this.lastBpId++;
		bp.bpId=this.lastBpId;
	}


	/**
	 * The simulator does not remove any breakpoint here because it already
	 * has the breakpoint, logpoint and assert lists.
	 * @param bp The breakpoint to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * I.e. you can watch whole memory areas.
	 * @param condition The watchpoint condition as string. If there is n0 condition
	 * 'condition' may be undefined or an empty string ''.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string, condition: string): Promise<void> {
		this.zxMemory.setWatchpoint(address, size, access, condition);
	}


	/**
	 * Override.
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number): Promise<void> {
		this.zxMemory.removeWatchpoint(address, size);
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		const buffer = this.zxMemory.readBlock(address, size);
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer|Uint8Array): Promise<void> {
		this.zxMemory.writeBlock(address, dataArray);
	}


	/**
	 * Sends the command to write a memory bank.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array): Promise<void> {
		this.zxMemory.writeBank(bank, dataArray);
	}


	/**
	 * Sends the command to read the slot/bank associations (8k banks).
	 * @returns A Promise with an number array of 8 slots.
	 *  Each entry contains the correspondent bank number.
 	*/
	public async sendDzrpCmdGetSlots(): Promise<number[]> {
		const slots=this.zxMemory.getSlots();
		return slots;
	}


	/**
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error=0 (no error).
 	*/
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		this.zxMemory.setSlot(slot, bank);
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
		this.zxPorts.write(0xFE, borderColor);
	}
}

