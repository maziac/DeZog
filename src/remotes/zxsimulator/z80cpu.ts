import * as Z80js from 'z80js';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from './zxports';
import {Z80Registers} from '../z80registers';


const signed8=(val) => {
	if (val<128)
		return val;
	else
		return val-256;
}

/*
Z80js.Z80.prototype.$0=function () {
	this.tStates+=5
	let offset=signed8(this.read8(this.pc++))
	this.write8(this.$2+offset, this.r1.$1)
}
*/


export class Z80Cpu extends Z80js {

	// Easier access to 'this'
	//protected self: any;

	// Time until next interrupt.
	protected remaingInterruptTstates: number;

	// Time for interrupt in T-States
	protected INTERRUPT_TIME=0.02*3500000.0;  // 20ms * 3.5 MHz


	/// Constructor.
	constructor(memory: ZxMemory, ports: ZxPorts, debug = false) {
		super(memory, ports, debug);
		//this.self=this;
		this.remaingInterruptTstates=this.INTERRUPT_TIME;
		const self=this as any;
		/*
		IM 0: Executes an instruction that is placed on the data bus by a peripheral.
		IM 1: Jumps to address &0038
		IM 2: Uses an interrupt vector table, indexed by value on data bus.
		*/
		self.im=0;	// Just as after interrupt.
	}


	/**
	 * Executes one instruction.
	 */
	public execute() {
		const self=this as any;
		const tstatesPrev=self.tStates;
		self.deferInt=false;

		// Workaround for error: https://github.com/viert/z80js/issues/2
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


	/**
	 * Returns the register data in the Z80Registers format.
	 */
	protected getRegisterData(): Uint16Array {
		const self=this as any;
		const r1=self.r1;
		const r2=self.r2;
		// Convert regs
		const regData=Z80Registers.getRegisterData(
			self.pc, self.sp,
			r1.af, r1.bc, r1.de, r1.hl,
			r1.ix, r1.iy,
			r2.af, r2.bc, r2.de, r2.hl,
			self.i, self.r, self.im);
		return regData;
	}


	/**
	 * ld__[ix,iy]_d__[a,b,c,d,e,h,l]
	 * Workaround for error:  "ld (ix+0),l not working", https://github.com/viert/z80js/issues/3
	 */
	protected ld__ix_d__a() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.a);
	}
	protected ld__ix_d__b() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.b);
	}
	protected ld__ix_d__c() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.c);
	}
	protected ld__ix_d__d() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.d);
	}
	protected ld__ix_d__e() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.e);
	}
	protected ld__ix_d__h() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.h);
	}
	protected ld__ix_d__l() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.l);
	}

	protected ld__iy_d__a() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.a);
	}
	protected ld__iy_d__b() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.b);
	}
	protected ld__iy_d__c() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.c);
	}
	protected ld__iy_d__d() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.d);
	}
	protected ld__iy_d__e() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.e);
	}
	protected ld__iy_d__h() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.h);
	}
	protected ld__iy_d__l() {
		const self=this as any;
		self.tStates+=5;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.l);
	}
}
