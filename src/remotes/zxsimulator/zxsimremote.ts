import * as assert from 'assert';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers} from '../z80registers';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from './zxports';
import {ZxSimulationView} from './zxulascreenview';
import {Z80Cpu} from './z80cpu';
import {Settings} from '../../settings';




/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxSimulatorRemote extends DzrpRemote {

	// For emulation of the CPU.
	protected z80Cpu: any;	// Z80Cpu
	protected zxMemory: ZxMemory;
	protected zxPorts: ZxPorts;
	protected zxSimulationView: ZxSimulationView;


	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true as long as the CPU is running.
	protected cpuRunning: boolean;

	// A temporary array with the set breakpoints and conditions.
	// Undefined=no breakpoint is set.
	// At the moment conditions are not supported. A BP is an empty string ''
	protected tmpBreakpoints: Array<string>;


	/// Constructor.
	constructor() {
		super();
		// Create a Z80 CPU to emulate Z80 behaviour
		this.zxMemory=new ZxMemory();
		this.zxPorts=new ZxPorts();
		this.z80Cpu=new Z80Cpu(this.zxMemory, this.zxPorts, false);
		this.cpuRunning=false;
		this.lastBpId=0;
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
		// Simulator capabilities
		this.supportsZxNextRegisters=false;
		// Load sna or nex file
		const loadPath=Settings.launch.load;
		if (loadPath)
			await this.loadBin(loadPath);
		// Ready
		this.emit('initialized')
		// Open the ZX screen simulation view
		this.zxSimulationView=new ZxSimulationView(this.zxMemory, this.zxPorts);
	}


	/**
	 * Override.
	 * Stops the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		this.zxSimulationView?.close();
		this.zxSimulationView=undefined as any;
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
		this.zxSimulationView?.close();
		this.zxSimulationView=undefined as any;
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
	protected z80CpuContinue(bp1: number, bp2: number) {
		//		Utility.timeDiff();
		// Run the Z80-CPU in a loop
		let breakReasonNumber=0;
		let counter=100000;
		let breakReason;
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
			const bpHit=(this.tmpBreakpoints[pc]!=undefined);	 // TODO: Check also the condition.
			if (bpHit) {
				breakReasonNumber=2;
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

		// Update the screen
		this.zxSimulationView.update();

		// Check if stopped or just the counter elapsed
		if (counter==0) {
			// Restart
			setTimeout(() => {
				this.z80CpuContinue(bp1, bp2);
			}, 10);
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
						break;
				}
			}

			// Send Notification
			if(this.continueResolve)
				this.continueResolve({breakReason, tStates: undefined, cpuFreq: undefined});
		}
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
			cpu.i, cpu.r);
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
		// Set the breakpoints array
		const pcBps=Array.from(this.breakpoints.values());
		this.tmpBreakpoints=new Array<string>(0x10000);
		pcBps.map(bp => this.tmpBreakpoints[bp.address]=bp.condition||'');
		// Run the Z80-CPU in a loop
		this.cpuRunning=true;
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
	 * Sends the command to add a breakpoint.
	 * @param bpAddress The breakpoint address. 0x0000-0xFFFF.
	 * @param condition The breakpoint condition as string. If there is n condition
	 * 'condition' may be undefined or an empty string ''.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition: string): Promise<number> {
		this.lastBpId++;
		this.cpuRunning=false;	// Break if running
		return this.lastBpId;
	}


	/**
	 * Sends the command to remove a breakpoint.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		// Does nothing.
		this.cpuRunning=false;	// Break if running
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

