import * as Z80js from 'z80js';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from './zxports';
import {Z80RegistersClass} from '../z80registers';
import {MemBuffer} from '../../misc/membuffer'
import {Settings} from '../../settings';


const signed8=(val) => {
	if (val<128)
		return val;
	else
		return val-256;
}

export class Z80Cpu extends Z80js {

	// Easier access to 'this'
	//protected self: any;

	// Time until next interrupt.
	protected remaingInterruptTstates: number;

	// Time for interrupt in T-States
	protected INTERRUPT_TIME=0.02*3500000.0;  // 20ms * 3.5 MHz

	// For calculation of the CPU load.
	// Summarizes all instruction besides HALT.
	protected cpuLoadTstates: number;
	// Summarizes all instruction includding HALT.
	protected cpuTotalTstates: number;
	// cpuLoadTstates divided by cpuTotalTstates.
	protected cpuLoad: number;
	// The number of interrupts to calculate the average from.
	protected cpuLoadRange: number;

	// Counts the current number of interrupts.
	protected cpuLoadRangeCounter: number;

	// Set to true to enable the Z80N instruction set.
	protected z80n: boolean;

	// Set to true if a ZX Spectrum like interrupt should be generated.
	protected vsyncInterrupt: boolean;


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
		this.cpuLoadTstates=0;
		this.cpuTotalTstates=0;
		this.cpuLoad=1.0;	// Start with full load
		this.cpuLoadRangeCounter=0;
		this.cpuLoadRange=Settings.launch.zsim.cpuLoadInterruptRange;
		this.z80n=Settings.launch.zsim.Z80N;
		this.vsyncInterrupt=Settings.launch.zsim.vsyncInterrupt;
	}


	/**
	 * Executes one instruction.
	 * @returns true if a vertical interrupt happened.
	 */
	public execute(): boolean {
		const self=this as any;
		const tstatesPrev=self.tStates;
		self.deferInt=false;

		// For checking on halt and Z80N
		const opcode=self.memory.getMemory8(self.pc);

		// Check if it a Z80N instruction
		if (this.z80n&&opcode==0xED) {
			// Yes, maybe a Z80N
			this.executeZ80n();
		}
		else {
			// Normal Z80 instruction
			super.execute();
		}

		// Statistics
		const tstatesDiff=self.tStates-tstatesPrev;
		if (opcode==0x76) {
			// HALT instruction
			if (this.interruptsEnabled()) {
				// HALT instructions are treated specially:
				// If a HALT is found the t-states to the next interrupt are calculated.
				// The t-states are added and the interrupt is executed immediately.
				// So only one HALT is ever executed, skipping execution of the others
				// saves processing time.
				this.cpuTotalTstates+=this.remaingInterruptTstates-tstatesDiff;
				this.remaingInterruptTstates=0;
			}
		}
		else {
			// No HALT: Count everything besides the HALT instruction and add to cpu-load.
			this.cpuLoadTstates+=tstatesDiff;
		}

		// Add t-states
		this.cpuTotalTstates+=tstatesDiff;
		// Interrupt
		if (this.vsyncInterrupt) {
			this.remaingInterruptTstates-=tstatesDiff;
			if (this.remaingInterruptTstates<=0) {
				// Interrupt
				this.remaingInterruptTstates=this.INTERRUPT_TIME;
				//this.remaingInterruptTstates=2;
				this.injectInterrupt();
				// Measure CPU load
				this.cpuLoadRangeCounter++;
				if (this.cpuLoadRangeCounter>=this.cpuLoadRange) {
					if (this.cpuTotalTstates>0) {
						this.cpuLoad=this.cpuLoadTstates/this.cpuTotalTstates;
						this.cpuLoadTstates=0;
						this.cpuTotalTstates=0;
						this.cpuLoadRangeCounter=0;
					}
				}
				// Vert. interrupt
				return true;
			}
		}

		// No vert. interrupt
		return false;
	}


	/**
	 * Checks if interrupts are enabled.
	 */
	protected interruptsEnabled(): boolean{
		const self=this as any;
		// Check if interrupts enabled
		if (!self.iff1)
			return false;
		if (self.deferInt)
			return false;
		return true;
	}


	/**
	 * Simulates an interrupt.
	 */
	protected injectInterrupt() {
		const self=this as any;
		// Check if interrupts enabled
		if (!this.interruptsEnabled())
			return;

		// Interrupts allowed.

		// Get PC
		let pc=self.pc;
		// Check if PC is on a HALT instruction
		const opcode=self.memory.getMemory8(pc);
		if (opcode==0x76)
			pc++;	// Step over HALT
		// put PC on the stack
		self.sp-=2;
		self.memory.setMemory16(self.sp, pc);
		// Get interrupt mode and next PC value accordingly
		let intAddr;
		switch (self.im) {
			case 1:	// IM1
				intAddr=0x38;
				break;
			case 2:	// IM2
				const intLocation=self.i<<8;
				intAddr=self.memory.getMemory16(intLocation);
				break;
			default:
				throw Error("IM "+self.im+" not supported.");
		}
		// Change PC to interrupt.
		self.pc=intAddr;
		// Disable further interrupts
		self.iff1=false;
		self.iff2=false;
	}


	/**
	 * Returns the register data in the Z80Registers format.
	 */
	protected getRegisterData(): Uint16Array {
		const self=this as any;
		const r1=self.r1;
		const r2=self.r2;
		// Convert regs
		const regData=Z80RegistersClass.getRegisterData(
			self.pc, self.sp,
			r1.af, r1.bc, r1.de, r1.hl,
			r1.ix, r1.iy,
			r2.af, r2.bc, r2.de, r2.hl,
			self.i, self.r, self.im);
		return regData;
	}


	/**
	 * Returns the register, opcode and sp contents data,
	 */
	protected getHistoryData(): Uint16Array {
		const self=this as any;
		// Get registers
		const regData=this.getRegisterData();
		// Add opcode and sp contents
		const startHist=regData.length;
		const histData=new Uint16Array(startHist+3);
		// Copy registers
		histData.set(regData);
		// Store opcode (4 bytes)
		const pc=self.pc;
		const opcodes=self.memory.getMemory32(pc);
		histData[startHist]=opcodes&0xFFFF;
		histData[startHist+1]=opcodes>>>16;
		// Store sp contents
		const sp=self.sp;
		const spContents=self.memory.getMemory16(sp);
		histData[startHist+2]=spContents;
		// return
		return histData;
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer=new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size=memBuffer.getSize();
		return size;
	}


	/**
	 * Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Save all registers etc.
		const self=this as any;
		const r1=self.r1;
		const r2=self.r2;
		// Store
		memBuffer.write16(self.pc);
		memBuffer.write16(self.sp);
		memBuffer.write16(r1.af);
		memBuffer.write16(r1.bc);
		memBuffer.write16(r1.de);
		memBuffer.write16(r1.hl);
		memBuffer.write16(r1.ix);
		memBuffer.write16(r1.iy);
		memBuffer.write16(r2.af);
		memBuffer.write16(r2.bc);
		memBuffer.write16(r2.de);
		memBuffer.write16(r2.hl);
		// Also the 1 byte data is stored in 2 bytes for simplicity:
		memBuffer.write8(self.i);
		memBuffer.write8(self.r);
		memBuffer.write8(self.im);
		memBuffer.write8(self.iff1);
		memBuffer.write8(self.iff2);

		// Additional state
		memBuffer.write32(this.remaingInterruptTstates);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Restore all registers etc.
		const self=this as any;
		const r1=self.r1;
		const r2=self.r2;
		// Store
		self.pc=memBuffer.read16();
		self.sp=memBuffer.read16();
		r1.af=memBuffer.read16();
		r1.bc=memBuffer.read16();
		r1.de=memBuffer.read16();
		r1.hl=memBuffer.read16();
		r1.ix=memBuffer.read16();
		r1.iy=memBuffer.read16();
		r2.af=memBuffer.read16();
		r2.bc=memBuffer.read16();
		r2.de=memBuffer.read16();
		r2.hl=memBuffer.read16();
		// Also the 1 byte data is stored in 2 bytes for simplicity:
		self.i=memBuffer.read8();
		self.r=memBuffer.read8();
		self.im=memBuffer.read8();
		self.iff1=memBuffer.read8();
		self.iff2=memBuffer.read8();

		// Additional state
		this.remaingInterruptTstates=memBuffer.read32();

		// Reset statistics
		this.cpuLoadTstates=0;
		this.cpuTotalTstates=0;
		this.cpuLoad=1.0;	// Start with full load
	}


	/**
	 * Workaround for error:  "PC incorrect after FDCB instruction", https://github.com/viert/z80js/issues/2
	 */
	protected doBitIndexed(b, addr) {
		super.doBitIndexed(b, addr);
		// Workaround
		const self=this as any;
		self.pc++;	// Correct the PC
	}


	/**
	 * ld__[ix,iy]_d__[a,b,c,d,e,h,l]
	 * Workaround for error:  "ld (ix+0),l not working", https://github.com/viert/z80js/issues/3
	 */
	protected ld__ix_d__a() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.a);
	}
	protected ld__ix_d__b() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.b);
	}
	protected ld__ix_d__c() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.c);
	}
	protected ld__ix_d__d() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.d);
	}
	protected ld__ix_d__e() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.e);
	}
	protected ld__ix_d__h() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.h);
	}
	protected ld__ix_d__l() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.ix+offset, self.r1.l);
	}

	protected ld__iy_d__a() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.a);
	}
	protected ld__iy_d__b() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.b);
	}
	protected ld__iy_d__c() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.c);
	}
	protected ld__iy_d__d() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.d);
	}
	protected ld__iy_d__e() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.e);
	}
	protected ld__iy_d__h() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.h);
	}
	protected ld__iy_d__l() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));
		self.write8(self.r1.iy+offset, self.r1.l);
	}

	/**
	 * LD (IX/IY+d),n
	 * Workaround for error:  "ld (ix+0),l not working", https://github.com/viert/z80js/issues/3
	 */
	protected ld__ix_d__n() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));	// d
		let value=signed8(self.read8(self.pc++));	// n
		self.write8(self.r1.ix+offset, value);
	}
	protected ld__iy_d__n() {
		const self=this as any;
		self.tStates+=19;
		let offset=signed8(self.read8(self.pc++));	// d
		let value=signed8(self.read8(self.pc++));	// n
		self.write8(self.r1.iy+offset, value);
	}



	// --- Z80N instructions ---------------------------

	/**
	 * The first opcode is already decoded as 0xED.
	 * Now the rest of the opcodes are checked, decoded and executed.
	 * If it is not found to be a Z80N instruction the original
	 * parent's class 'execute' is called.
	 */
	protected executeZ80n() {
		const self=this as any;
		let pc=(self.pc+1)&0xFFFF;
		const opcode1=self.memory.getMemory8(pc);
		switch (opcode1) {
			case 0xA4:
				{	// LDIX
					this.ldidx(+1);
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0xA5:
				{	// LDWS
					self.tStates+=14;
					const hlContent=self.memory.read8(self.r1.hl);
					self.memory.write8(self.r1.de, hlContent);
					self.r1.l++;
					self.r1.l&=0xFF;
					self.r1.d++;
					self.r1.d&=0xFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0xB4:
				{	// LDIRX, loop
					this.ldidx(+1);
					if (self.r1.bc==0) {
						// Next
						self.pc+=2;
						self.pc&=0xFFFF;
					}
					else
						self.tStates+=5;
				}
				break;

			case 0xAC:
				{	// LDDX
					this.ldidx(-1);
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0xBC:
				{	// LDDRX, loop
					this.ldidx(-1);
					if (self.r1.bc==0) {
						// Next
						self.pc+=2;
						self.pc&=0xFFFF;
					}
					else
						self.tStates+=5;
				}
				break;

			case 0xB7:
				{	// LDPIRX, loop
					self.tStates+=16;
					const addr=(self.r1.hl&0xFFF8)+(self.r1.e&0x07);
					const t=self.memory.read8(addr);
					if (t!=self.r1.a)
						self.memory.write8(self.r1.de, t);
					self.r1.de++;
					self.r1.bc--;
					// Loop finished
					if (self.r1.bc==0) {
						// Next
						self.pc+=2;
						self.pc&=0xFFFF;
					}
					else
						self.tStates+=5;
				}
				break;

			case 0x90:
				{	// OUTINB
					self.tStates+=16;
					const t=self.memory.read8(self.r1.hl);
					self.io.write(self.r1.bc, t);
					self.r1.hl++;
					self.r1.hl&=0xFFFF;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x30:
				{	// MUL D,E
					self.tStates+=8;
					self.r1.de=self.r1.d*self.r1.e;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;


			case 0x31:
				{	// ADD HL,A
					self.tStates+=8;
					self.r1.hl+=self.r1.a;
					self.r1.hl&=0xFFFF;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x32:
				{	// ADD DE,A
					self.tStates+=8;
					self.r1.de+=self.r1.a;
					self.r1.de&=0xFFFF;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x33:
				{	// ADD BC,A
					self.tStates+=8;
					self.r1.bc+=self.r1.a;
					self.r1.bc&=0xFFFF;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x34:
				{	// ADD HL,nn
					self.tStates+=16;
					const nn=self.memory.getMemory16((self.pc+2)&0xFFFF);
					self.r1.hl+=nn;
					self.r1.hl&=0xFFFF;
					// Next
					self.pc+=4;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x35:
				{	// ADD DE,nn
					self.tStates+=16;
					const nn=self.memory.getMemory16((self.pc+2)&0xFFFF);
					self.r1.de+=nn;
					self.r1.de&=0xFFFF;
					// Next
					self.pc+=4;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x36:
				{	// ADD BC,nn
					self.tStates+=16;
					const nn=self.memory.getMemory16((self.pc+2)&0xFFFF);
					self.r1.bc+=nn;
					self.r1.bc&=0xFFFF;
					// Next
					self.pc+=4;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x23:
				{	// SWAPNIB
					self.tStates+=8;
					const a=self.r1.a;
					self.r1.a=((a>>>4)+(a<<4))&0xFF;
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x24:
				{	// MIRROR
					self.tStates+=8;
					const a=self.r1.a;
					self.r1.a=
					((a>>>7)&0b00000001)+
					((a>>>5)&0b00000010)+
					((a>>>3)&0b00000100)+
					((a>>>1)&0b00001000)+
					((a<<1)&0b00010000)+
					((a<<3)&0b00100000)+
					((a<<5)&0b01000000)+
					((a<<7)&0b10000000);
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x8A:
				{	// PUSH nn
					self.tStates+=23;
					const nnh=self.memory.getMemory8((self.pc+2)&0xFFFF);
					const nnl=self.memory.getMemory8((self.pc+3)&0xFFFF);
					const nn=nnl+256*nnh;
					self.sp--;
					self.sp&=0xFFFF;
					self.memory.write8(self.sp, nn>>>8);
					self.sp--;
					self.sp&=0xFFFF;
					self.memory.write8(self.sp, nn&0xFF);
					// Next
					self.pc+=4;
					self.pc&=0xFFFF;
				}
				break;

			case 0x91:
				{	// NEXTREG r,n
					self.tStates+=20;
					const reg=self.memory.getMemory8((self.pc+2)&0xFFFF);
					const val=self.memory.getMemory8((self.pc+3)&0xFFFF);
					self.io.write(0x243B, reg);
					self.io.write(0x253B, val);
					// Next
					self.pc+=4;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x92:
				{	// NEXTREG r,A
					self.tStates+=17;
					const reg=self.memory.getMemory8((self.pc+2)&0xFFFF);
					self.io.write(0x243B, reg);
					self.io.write(0x253B, self.r1.a);
					// Next
					self.pc+=3;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x93:
				{	// PIXELDN
					self.tStates+=8;
					let hl=self.r1.hl;
					if ((hl&0x0700)!=0x0700)
						hl+=256;
					else if ((hl&0xe0)!=0xe0)
						hl=(hl&0xF8FF)+0x20;
					else
						hl=(hl&0xF81F)+0x0800;
					self.r1.hl=(hl&0xFFFF);
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x94:
				{	// PIXELAD
					self.tStates+=8;
					const d=self.r1.d;
					const e=self.r1.e;
					self.r1.hl=0x4000+((d&0xC0)<<5)+((d&0x07)<<8)+((d&0x38)<<2)+(e>>>3);
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x95:
				{	// SETAE
					self.tStates+=8;
					const e=self.r1.e;
					self.r1.a=(0x80)>>>(e&0x07)
					// Next
					self.pc+=2;
					self.r1.pc&=0xFFFF;
				}
				break;

			case 0x27:
				{	// TEST n
					// Flags:
					//  7 6 5 4  3  2  1 0
					//  S Z X H  X P/V N C
					self.tStates+=11;
					const n=self.memory.getMemory8((self.pc+2)&0xFFFF);
					const result=self.r1.a&n;
					let flags=self.r1.f;
					flags&=0b10101010;
					flags|=result&0x80;	// sign
					if(result==0)
						flags|=0x40;	// zero
					self.r1.f=flags;
					// Next
					self.pc+=3;
					self.r1.pc&=0xFFFF;
				}
				break;

			default:
				// No Z80N instruction, use normal execute
				super.execute();
				break;
		}
	}


	/**
	 * function of LDIX, LDDX, LDIRX, LDDRX.
	 * @param add Use +1 for LDIX and -1 for LDDX.
	 */
	protected ldidx(add: number) {
		const self=this as any;
		self.tStates+=16;
		// {if HL*!=A DE*:=HL*;} DE++; HL++; BC--
		const hlContent=self.memory.read8(self.r1.hl);
		if (hlContent!=self.r1.a)
			self.memory.write8(self.r1.de, hlContent);
		self.r1.de++;
		self.r1.de&=0xFFFF;
		self.r1.hl+=add;
		self.r1.hl&=0xFFFF;
		self.r1.bc--;
		self.r1.bc&=0xFFFF;
	}
}
