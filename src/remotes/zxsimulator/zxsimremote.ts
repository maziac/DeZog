import * as assert from 'assert';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers} from '../z80registers';
import {WatchpointZxMemory} from './wpzxmemory';
import {ZxPorts} from './zxports';
//import {ZxSimulationView} from './zxulascreenview';
import {Z80Cpu} from './z80cpu';
import {Settings} from '../../settings';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Utility} from '../../utility';
import * as fs from 'fs';
//import {LogGlobal} from '../../log';




/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxSimulatorRemote extends DzrpRemote {

	// For emulation of the CPU.
	protected z80Cpu: any;	// Z80Cpu
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


	/// Constructor.
	constructor() {
		super();
		this.cpuRunning=false;
		this.lastBpId=0;
		// Create a Z80 CPU to emulate Z80 behaviour
		this.zxMemory=new WatchpointZxMemory();
		this.zxPorts=new ZxPorts();
		this.z80Cpu=new Z80Cpu(this.zxMemory, this.zxPorts, false);
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
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
		// Ready
		this.emit('initialized')
		// Open the ZX screen simulation view
		//this.zxSimulationView=new ZxSimulationView(this.zxMemory, this.zxPorts);
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
		let breakReasonNumber=0;
		let counter=10000;
		let breakReason;
		let breakCondition;
		let bp;
		let bpId;
		for (; counter>0; counter--) {
			try {
				this.z80Cpu.execute();
			}
			catch (errorText) {
				breakReason="Z80CPU Error: "+errorText;
				console.log(breakReason);
				breakReasonNumber=255;
				break;
			};
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
								breakCondition=condition;
							}
						}
					}
					catch (e) {
						bp=bpElem;
						breakCondition=e;
					}
				}

				// Check if at least one breakpoint for this address has a condition that
				// evaluates to true.
				if (bp) {
					breakReasonNumber=2;
					break;
				}
			}

			// Check if watchpoint is hit
			if (this.zxMemory.hitAddress>=0) {
				// Yes, read or write access
				breakReasonNumber=(this.zxMemory.hitAccess=='r')? 3:4;
				bpId=this.zxMemory.hitAddress;
				break;
			}

			// Check if stopped from outside
			if (!this.cpuRunning) {
				breakReasonNumber=1;	// Manual break
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
		setTimeout(() => {
			// Check if stopped or just the counter elapsed
			if (counter==0) {
				// Continue
				this.z80CpuContinue(bp1, bp2);
			}
			else {
				// Otherwise stop
				this.cpuRunning=false;
				// If no error text ...
				if (!breakReason) {
					switch (breakReasonNumber) {
						case 1:
							breakReason="Manual break";
							break;
						case 2:
							breakReason="Breakpoint hit";
							if (breakCondition)
								breakReason+=', '+breakCondition;
							break;
						case 3:
							breakReason="Watchpoint hit (read)";
							break;
						case 4:
							breakReason="Watchpoint hit (write)";
							break;
					}
				}

				// Get breakpoint ID
				if (bp)
					bpId=bp.bpId;

				// Send Notification
				//LogGlobal.log("cpuContinue, continueResolve="+(this.continueResolve!=undefined));
				assert(this.continueResolve);
				// Note: bpID is the break address in case of a watchpoint.
				if (this.continueResolve)
					this.continueResolve({bpId, breakReason, tStates: undefined, cpuFreq: undefined});
			}
		}, 100);
	}



	/**
	 * This is an 'intelligent' remote that does evaluate the breakpoint
	 * conditions on it's own.
	 * This is done primarily for performance reasons.
	 */
	public async continue(): Promise<{breakReason: string, tStates?: number, cpuFreq?: number}> {
		return new Promise<{breakReason: string, tStates?: number, cpuFreq?: number}>(resolve => {
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
		// Set the temporary breakpoints array
		this.tmpBreakpoints=this.createTemporaryBreakpoints([...this.breakpoints, ...enabledLogPoints, ...this.assertBreakpoints]);
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
	 * The simulator does not add any breakpoint here becasue it already
	 * has the breakpoint, logpoint wpmem and assert lists.
	 * @param bpAddress The breakpoint address. 0x0000-0xFFFF.
	 * @param condition The breakpoint condition as string. If there is n condition
	 * 'condition' may be undefined or an empty string ''.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		this.lastBpId++;
		this.cpuRunning=false;	// Break if running
		return this.lastBpId;
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * I.e. you can watch whole memory areas.
	 * @param condition The watchpoint condition as string. If there is n0 condition
	 * 'condition' may be undefined or an empty string ''.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string, condition?: string): Promise<void> {
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

}

