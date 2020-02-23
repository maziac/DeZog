import * as Z80js from 'z80js';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from './zxports';


export class Z80Cpu extends Z80js {

	// Easier access to 'this'
	//protected self: any;

	// Time until next interrupt.
	protected remaingInterruptTstates: number;

	// Time for interrupt in T-States
	protected INTERRUPT_TIME=0.02*3500000.0;  // 20MS * 3.5 MHz


	/// Constructor.
	constructor(memory: ZxMemory, ports: ZxPorts, debug = false) {
		super(memory, ports, debug);
		//this.self=this;
		this.remaingInterruptTstates=this.INTERRUPT_TIME;
		const self=this as any;
		self.im=2;	// ZX Spectrum
		//this.remaingInterruptTstates=2;
	}


	/**
	 * Executes one instruction.
	 */
	public execute() {
		const self=this as any;
		const tstatesPrev=self.tStates;
		self.deferInt=false;

		// Workaround error: https://github.com/viert/z80js/issues/2
		const opcode2=self.read16(self.pc);

		super.execute();

		// Workaround
		if (opcode2==0xCBFD||opcode2==0xCBDD)
			self.pc++;	// Correct the PC

		const tstatesDiff=self.tStates-tstatesPrev;
		this.remaingInterruptTstates-=tstatesDiff;
		//this.remaingInterruptTstates--;
		if (this.remaingInterruptTstates<=0) {
			// Interrupt
			this.remaingInterruptTstates=this.INTERRUPT_TIME;
			//this.remaingInterruptTstates=2;
			this.injectInterrupt();
		}
	}

	/**
	 * Simulates an interrupt.
	 */
	public injectInterrupt() {
		const self=this as any;
		// Check if interrupts enabled
		if (!self.iff1)
			return;
		if (self.deferInt)
			return;

		// Interrupts allowed.

		// Get PC
		let pc=self.pc;
		// Check if PC is on a HALT instruction
		const opcode=self.read8(pc);
		if (opcode==0x76)
			pc++;	// Step over HALT
		// put PC on the stack
		self.sp-=2;
		self.write16(self.sp, pc);
		// Get interrupt mode and next PC value accordingly
		let intAddr;
		switch (self.im) {
			case 1:	// IM1
				intAddr=0x38;
				break;
			case 2:	// IM2
				const intLocation=self.i<<8;
				intAddr=self.read16(intLocation);
				break;
			default:
				throw Error("IM "+self.im+" not supported.");
		}
		// Change PC to interrupt.
		self.pc=intAddr;
		// Disable further interrupts
		self.iff1=false;
		self.iff2=false;

		//const logstring="PC="+pc.toString(16)+" pushed to SP="+self.sp.toString(16);
		//console.log(logstring);
	}

}
