import * as assert from 'assert';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers} from '../z80registers';
import {WatchpointZxMemory} from './wpzxmemory';
import {ZxPorts} from './zxports';
//import {ZxSimulationView} from './zxulascreenview';
import {Z80Cpu} from './z80cpu';
import {Settings} from '../../settings';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Utility} from '../../misc/utility';
import * as fs from 'fs';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {Labels} from '../../labels';
import {MemBuffer} from '../../misc/membuffer';
//import {LogGlobal} from '../../log';




/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxSimulatorRemote extends DzrpRemote {

	// For emulation of the CPU.
	public z80Cpu: any;	// Z80Cpu
	public zxMemory: WatchpointZxMemory;
	public zxPorts: ZxPorts;
	//protected zxSimulationView: ZxSimulationView;


	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true as long as the CPU is running.
	protected cpuRunning: boolean;

	// A temporary array with the set breakpoints and conditions.
	// Undefined=no breakpoint is set.
	// The tmpBreakpoints are created out of the other breakpoints, assertBreakpoints and logpoints
	// as soon as the z80CpuContinue is called.
	// It allows access of the breakpoint by it's address.
	// This may happen seldom, but it can happen that 2 breakpoints share
	// the same address. Therefore the Array contains an Array of GenericBreakpoints.
	// normally the inner array contains only 1 element.
	protected tmpBreakpoints: Array<Array<GenericBreakpoint>>;

	// Push here all objects that should be serialized.
	// I.e. that are relevant for the saving/restoring the state.
	protected serializeObjects: any[];


	/// Constructor.
	constructor() {
		super();
		this.cpuRunning=false;
		this.lastBpId=0;
		// Create a Z80 CPU to emulate Z80 behaviour
		this.zxMemory=new WatchpointZxMemory();
		this.zxPorts=new ZxPorts();
		this.z80Cpu=new Z80Cpu(this.zxMemory, this.zxPorts, false);
		// For restoring the state
		this.serializeObjects=[
			this.z80Cpu,
			this.zxMemory,
			this.zxPorts
		];
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
		try {
			// Simulator capabilities
			this.supportsZxNextRegisters=false;

			// For now only one machine is supported
			if (Settings.launch.zxsim.machine=="48k") {
				// Load the rom
				try {
					const romFilePath=Utility.getExtensionPath()+'/data/48.rom';
					const romBuffer=fs.readFileSync(romFilePath);
					const rom1=new Uint8Array(0x2000);
					const rom2=new Uint8Array(0x2000);
					romBuffer.copy(rom1, 0, 0, 0x2000);
					romBuffer.copy(rom2, 0, 0x2000, 0x4000);
					this.zxMemory.writeBank(254, rom1);
					this.zxMemory.writeBank(255, rom2);
				}
				catch (e) {
					this.emit('warning', e.message);
				}
			}

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
					await this.loadObj(loadPath, start);
				}
			}

			// Set Program Counter to execAddress
			if (Settings.launch.execAddress) {
				const execAddress=Labels.getNumberFromString(Settings.launch.execAddress);
				if (isNaN(execAddress))
					throw Error("Cannot evaluate 'execAddress' ("+Settings.launch.execAddress+").");
				// Set PC
				this.setProgramCounter(execAddress);
			}

			// Ready
			this.emit('initialized')
		}
		catch (e) {
			// Some error occurred
			this.emit('error', e);
		}
	}


	/**
	 * Override.
	 * Stops the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		//this.zxSimulationView?.close();
		//this.zxSimulationView=undefined as any;
		this.emit('closed')
	}


	/**
	 * Override.
	 * Terminates the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 */
	public async terminate(): Promise<void> {
		//this.zxSimulationView?.close();
		//this.zxSimulationView=undefined as any;
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
				this.z80Cpu.r1.af=value;
				break;
			case Z80_REG.BC:
				this.z80Cpu.r1.bc=value;
				break;
			case Z80_REG.DE:
				this.z80Cpu.r1.de=value;
				break;
			case Z80_REG.HL:
				this.z80Cpu.r1.hl=value;
				break;
			case Z80_REG.IX:
				this.z80Cpu.r1.ix=value;
				break;
			case Z80_REG.IY:
				this.z80Cpu.r1.iy=value;
				break;
			case Z80_REG.AF2:
				this.z80Cpu.r2.af=value;
				break;
			case Z80_REG.BC2:
				this.z80Cpu.r2.bc=value;
				break;
			case Z80_REG.DE2:
				this.z80Cpu.r2.de=value;
				break;
			case Z80_REG.HL2:
				this.z80Cpu.r2.hl=value;
				break;

			case Z80_REG.IM:
				this.z80Cpu.im=value;
				break;

			case Z80_REG.F:
				this.z80Cpu.r1.f=value;
				break;
			case Z80_REG.A:
				this.z80Cpu.r1.a=value;
				break;
			case Z80_REG.C:
				this.z80Cpu.r1.c=value;
				break;
			case Z80_REG.B:
				this.z80Cpu.r1.b=value;
				break;
			case Z80_REG.E:
				this.z80Cpu.r1.e=value;
				break;
			case Z80_REG.D:
				this.z80Cpu.r1.d=value;
				break;
			case Z80_REG.L:
				this.z80Cpu.r1.l=value;
				break;
			case Z80_REG.H:
				this.z80Cpu.r1.h=value;
				break;
			case Z80_REG.IXL:
				this.z80Cpu.r1.ixl=value;
				break;
			case Z80_REG.IXH:
				this.z80Cpu.r1.ixh=value;
				break;
			case Z80_REG.IYL:
				this.z80Cpu.r1.iyl=value;
				break;
			case Z80_REG.IYH:
				this.z80Cpu.r1.iyh=value;
				break;

			case Z80_REG.F2:
				this.z80Cpu.r2.f=value;
				break;
			case Z80_REG.A2:
				this.z80Cpu.r2.a=value;
				break;
			case Z80_REG.C2:
				this.z80Cpu.r2.c=value;
				break;
			case Z80_REG.B2:
				this.z80Cpu.r2.b=value;
				break;
			case Z80_REG.E2:
				this.z80Cpu.r2.e=value;
				break;
			case Z80_REG.D2:
				this.z80Cpu.r2.d=value;
				break;
			case Z80_REG.L2:
				this.z80Cpu.r2.l=value;
				break;
			case Z80_REG.H2:
				this.z80Cpu.r2.h=value;
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
	 * Runs the cpu in time chunks in order to give tiem to other
	 * processes. E.g. to receive a pause command.
	 * @param bp1 Breakpoint 1 address or -1 if not used.
	 * @param bp2 Breakpoint 2 address or -1 if not used.
	 */
	protected async z80CpuContinue(bp1: number, bp2: number): Promise<void> {
		//		Utility.timeDiff();
		// Run the Z80-CPU in a loop
		let breakNumber=BREAK_REASON_NUMBER.NO_REASON;
		let counter=10000;
		let breakReasonString;
		let bp;
		let breakData;
		for (; counter>0; counter--) {
			const prevPc=this.z80Cpu.pc;
			try {
				this.z80Cpu.execute();
			}
			catch (errorText) {
				breakReasonString="Z80CPU Error: "+errorText;
				console.log(breakReasonString);
				breakNumber=BREAK_REASON_NUMBER.UNKNOWN;
				break;
			};
			// Update visual memory
			this.zxMemory.setVisualProg(prevPc);

			// Check if any real breakpoint is hit
			// Note: Because of step-out this needs to be done before the other check.
			const pc=this.z80Cpu.pc;
			const bpInner=this.tmpBreakpoints[pc];
			if (bpInner) {
				// Get registers
				const regs=this.z80Cpu.getRegisterData(); // TODO: Wieder rückbauen und ann mit "await".
				this.z80Registers.setCache(regs);
				// Now check if condition met or if logpoint
				for (const bpElem of bpInner) {
					try {
						const {condition, log}=this.checkConditionAndLog(bpElem);
						// Emit log?
						if (log) {
							// Convert and print
							const evalLog = await Utility.evalLogString(log)
							this.emit('log', evalLog);
						}
						else {
							// Not a logpoint.
							// Condition met?
							if (condition!=undefined) {
								bp=bpElem;
							}
						}
					}
					catch (e) {
						bp=bpElem;
					}
				}

				// Check if at least one breakpoint for this address has a condition that
				// evaluates to true.
				if (bp) {
					breakNumber=BREAK_REASON_NUMBER.BREAKPOINT_HIT;
					break;
				}
			}

			// Check if watchpoint is hit
			if (this.zxMemory.hitAddress>=0) {
				// Yes, read or write access
				breakNumber=(this.zxMemory.hitAccess=='r')? BREAK_REASON_NUMBER.WATCHPOINT_READ:BREAK_REASON_NUMBER.WATCHPOINT_WRITE;
				breakData=this.zxMemory.hitAddress;
				break;
			}

			// Check if stopped from outside
			if (!this.cpuRunning) {
				breakNumber=BREAK_REASON_NUMBER.MANUAL_BREAK;	// Manual break
				break;
			}

			// Check if breakpoints are hit
			if (pc==bp1||pc==bp2)
				break;
		}
		//		const time=Utility.timeDiff();
		//		console.log("Time="+time+" ms");

		//LogGlobal.log("cpuContinue, counter="+counter);

		// Update the screen
		//this.zxSimulationView.update();
		this.emit('update')

		// Give other tasks a little time
		setTimeout(async () => {
			// Check if stopped or just the counter elapsed
			if (counter==0) {
				// Continue
				this.z80CpuContinue(bp1, bp2);
			}
			else {
				// Otherwise stop
				let condition='';
				this.cpuRunning=false;
				// Get breakpoint ID
				if (bp) {
					breakData=bp.bpId;
					condition=bp.condition;
				}

				// Create reason string
				breakReasonString=await this.constructBreakReasonString(breakNumber, breakData, condition, breakReasonString);

				// Send Notification
				//LogGlobal.log("cpuContinue, continueResolve="+(this.continueResolve!=undefined));
				assert(this.continueResolve);
				if (this.continueResolve)
					this.continueResolve({breakNumber, breakData, breakReasonString, tStates: undefined, cpuFreq: undefined});
			}
		}, 100);
	}



	/**
	 * This is an 'intelligent' remote that does evaluate the breakpoint
	 * conditions on it's own.
	 * This is done primarily for performance reasons.
	 */
	public async continue(): Promise<{breakNumber: number, breakData: number, breakReasonString: string, tStates?: number, cpuFreq?: number}> {
		return new Promise<{breakNumber: number, breakData: number, breakReasonString: string, tStates?: number, cpuFreq?: number}>(resolve => {
			// Save resolve function when break-response is received
			this.continueResolve=resolve;

			// Clear registers
			this.z80Registers.clearCache();
			// Send 'run' command
			this.sendDzrpCmdContinue();
		});
	}


	/**
	 * Creates a temporary array from the given array.
	 * The structure is more performant for use in the Z80 continue
	 * loop:
	 * The array contains of 65536 entries, i.e. addresses. If no BP
	 * is set for an address the entry is undefined.
	 * If one is set the entry contains a pointer to the breakpoint.
	 * Or better it contains an array of breakpoints that all share the
	 * same address.
	 * Note: normally this array contains only one entry.
	 */
	protected createTemporaryBreakpoints(bps: Array<GenericBreakpoint>): Array<Array<GenericBreakpoint>> {
		const tmpBps=new Array<Array<GenericBreakpoint>>(0x10000);
		bps.map(bp => {
			let bpInner=
				tmpBps[bp.address];
			if (!bpInner) {
				// Create new array
				bpInner=new Array<GenericBreakpoint>();
				tmpBps[bp.address]=bpInner;
			}
			bpInner.push(bp);
		});
		return tmpBps;
	}


	/**
	 * Deserializes the CPU, memory etc. to restore the state.
	 */
	protected deserializeState(data: Uint8Array) {
		// Create mem buffer fro reading
		const memBuffer=MemBuffer.from(data);
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


	//------- Send Commands -------

	/**
	 * Not used.
	 */
	protected async sendDzrpCmdGetconfig(): Promise<{zxNextRegs: boolean}> {
		assert(false);	// Not used
		return {zxNextRegs: false};
	}


	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	protected async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		const cpu=this.z80Cpu;
		const r1=cpu.r1;
		const r2=cpu.r2;
		// Convert regs
		const regData=Z80Registers.getRegisterData(
			cpu.pc, cpu.sp,
			r1.af, r1.bc, r1.de, r1.hl,
			r1.ix, r1.iy,
			r2.af, r2.bc, r2.de, r2.hl,
			cpu.i, cpu.r, cpu.im);
		return new Uint16Array(regData);
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
		// Get all breakpoints from the enabled logpoints
		const enabledLogPoints=this.getEnabledLogpoints();
		// Assert breakpoints
		const assertBps=(this.assertBreakpointsEnabled)? this.assertBreakpoints:[];
		// Set the temporary breakpoints array
		this.tmpBreakpoints=this.createTemporaryBreakpoints([...this.breakpoints, ...enabledLogPoints, ...assertBps]);
		// Run the Z80-CPU in a loop
		this.cpuRunning=true;
		this.zxMemory.clearHit();
		this.z80CpuContinue(bp1Address, bp2Address);
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
	 * @param bpAddress The breakpoint address. 0x0000-0xFFFF.
	 * @param condition The breakpoint condition as string. If there is n condition
	 * 'condition' may be undefined or an empty string ''.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		this.lastBpId++;
		this.cpuRunning=false;
		return this.lastBpId;
	}


	/**
	 * The simulator does not remove any breakpoint here because it already
	 * has the breakpoint, logpoint and assert lists.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		this.cpuRunning=false;
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
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array) {
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
}

