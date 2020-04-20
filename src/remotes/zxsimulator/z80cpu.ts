//import * as Z80js from 'z80js';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from './zxports';
import {Z80RegistersClass} from '../z80registers';
import {MemBuffer} from '../../misc/membuffer'
import {Settings} from '../../settings';
//import {Utility} from '../../misc/utility';

//import * as zzz80 from '../../3rdparty/z80.js/ZZZ80.js';
//import * as Z80 from '../../3rdparty/z80.js/ZZZ80.js';
import Z80 = require('../../3rdparty/z80.js/Z80.js');
//const zz80=require('../../3rdparty/z80.js/Z80.js');


/*
const signed8=(val) => {
	if (val<128)
		return val;
	else
		return val-256;
}
*/


export class Z80Cpu {

	// Pointer to the Z80.js (Z80.ts) simulator
	protected z80: any;

	// Time until next interrupt.
	protected remaingInterruptTstates: number;

	// Time for interrupt in T-States
	protected INTERRUPT_TIME: number;

	// For calculation of the CPU load.
	// Summarizes all instruction besides HALT.
	protected cpuLoadTstates: number;
	// Summarizes all instruction including HALT.
	public cpuTotalTstates: number;
	// cpuLoadTstates divided by cpuTotalTstates.
	public cpuLoad: number;
	// The number of interrupts to calculate the average from.
	protected cpuLoadRange: number;

	// Counts the current number of interrupts.
	protected cpuLoadRangeCounter: number;

	// Used to calculate thenumber of t-states for a step-over or similar.
	public cpuTstatesCounter: number;

	// Set to true to enable the Z80N instruction set.
	protected z80n: boolean;

	// Set to true if a ZX Spectrum like interrupt should be generated.
	protected vsyncInterrupt: boolean;

	// At the moment just a constant. CPU frequency.
	public cpuFreq: number;

	// Memory
	public memory: ZxMemory;

	// Ports
	public ports: ZxPorts;


	/// Constructor.
	constructor(memory: ZxMemory, ports: ZxPorts) {
		this.memory=memory;
		this.ports=ports;
		this.cpuFreq=3500000.0;	// 3.5MHz.
		this.INTERRUPT_TIME=0.02*this.cpuFreq;  // 20ms * 3.5 MHz
		this.remaingInterruptTstates=this.INTERRUPT_TIME;
		/*
		IM 0: Executes an instruction that is placed on the data bus by a peripheral.
		IM 1: Jumps to address &0038
		IM 2: Uses an interrupt vector table, indexed by value on data bus.
		*/
		this.cpuTstatesCounter=0
		this.cpuLoadTstates=0;
		this.cpuTotalTstates=0;
		this.cpuLoad=1.0;	// Start with full load
		this.cpuLoadRangeCounter=0;
		this.cpuLoadRange=Settings.launch.zsim.cpuLoadInterruptRange;
		this.z80n=Settings.launch.zsim.Z80N;
		this.vsyncInterrupt=Settings.launch.zsim.vsyncInterrupt;

		// Initialize Z80, call constructor
		this.z80=new (Z80.Z80 as any)(
			{
			// TODO: Improve by passing functions directly not lambdas
			mem_read: (address) => {return memory.read8(address);},
			mem_write: (address, val) => {memory.write8(address, val);},
			io_read: (address) => {return ports.read(address);},
			io_write: (address, val) => {ports.write(address, val);}
			});
	}


	/**
	 * Executes one instruction.
	 * @returns true if a vertical interrupt happened.
	 */
	public execute(): boolean {
		const z80=this.z80;
		const pc=z80.pc;

		// For checking on halt and Z80N
		const opcode=this.memory.getMemory8(pc);

		// Check if it a Z80N instruction
		let tstatesDiff=0;
		if (this.z80n&&opcode==0xED) {
			// Yes, maybe a Z80N
			this.executeZ80n(); // TODO: Handle Z80N differently
		}
		else {
			// Normal Z80 instruction
			tstatesDiff=z80.run_instruction();
		}

		// Statistics
		if (opcode==0x76) { // TODO: can be done with "halted"
			// HALT instruction
			if (z80.interruptsEnabled) {
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
		this.cpuTstatesCounter+=tstatesDiff;
		this.cpuTotalTstates+=tstatesDiff;
		// Interrupt
		if (this.vsyncInterrupt) {
			this.remaingInterruptTstates-=tstatesDiff;
			if (this.remaingInterruptTstates<=0) {
				// Interrupt
				this.remaingInterruptTstates=this.INTERRUPT_TIME;
				//this.remaingInterruptTstates=2;
				z80.interrupt(false, 0);
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
	 * Properties to set flags.
	 */
	set pc(value) {
		this.z80.pc=value;
	}
	get pc() {return this.z80.pc;}
	set sp(value) {this.z80.sp=value;}
	get sp() {return this.z80.sp;}

	set af(value) {
		const r=this.z80.getState();
		r.a=value>>>8;
		r.f=this.revConvertFlags(value&0xFF);
		this.z80.setState(r);
	}
	set bc(value) {
		const r=this.z80.getState();
		r.b=value>>>8;
		r.c=value&0xFF;
		this.z80.setState(r);
	}
	set de(value) {
		const r=this.z80.getState();
		r.d=value>>>8;
		r.e=value&0xFF;
		this.z80.setState(r);
	}
	set hl(value) {
		const r=this.z80.getState();
		r.h=value>>>8;
		r.l=value&0xFF;
		this.z80.setState(r);
	}

	set ix(value) {
		const r=this.z80.getState();
		r.ix=value;
		this.z80.setState(r);
	}
	set iy(value) {
		const r=this.z80.getState();
		r.iy=value;
		this.z80.setState(r);
	}


	set af2(value) {
		const r=this.z80.getState();
		r.a_prime=value>>>8;
		r.flags_prime=this.revConvertFlags(value&0xFF);
		this.z80.setState(r);
	}
	set bc2(value) {
		const r=this.z80.getState();
		r.b_prime=value>>>8;
		r.c_prime=value&0xFF;
		this.z80.setState(r);
	}
	set de2(value) {
		const r=this.z80.getState();
		r.d_prime=value>>>8;
		r.e_prime=value&0xFF;
		this.z80.setState(r);
	}
	set hl2(value) {
		const r=this.z80.getState();
		r.h_prime=value>>>8;
		r.l_prime=value&0xFF;
		this.z80.setState(r);
	}

	set im(value) {
		const r=this.z80.getState();
		r.im=value;
		this.z80.setState(r);
	}
	set r(value) {
		const r=this.z80.getState();
		r.r=value;
		this.z80.setState(r);
	}
	set i(value) {
		const r=this.z80.getState();
		r.i=value;
		this.z80.setState(r);
	}

	set a(value) {
		const r=this.z80.getState();
		r.a=value;
		this.z80.setState(r);
	}
	set f(value) {
		const r=this.z80.getState();
		r.f=this.revConvertFlags(value);
		this.z80.setState(r);
	}
	set b(value) {
		const r=this.z80.getState();
		r.b=value;
		this.z80.setState(r);
	}
	set c(value) {
		const r=this.z80.getState();
		r.c=value;
		this.z80.setState(r);
	}
	set d(value) {
		const r=this.z80.getState();
		r.d=value;
		this.z80.setState(r);
	}
	set e(value) {
		const r=this.z80.getState();
		r.e=value;
		this.z80.setState(r);
	}
	set h(value) {
		const r=this.z80.getState();
		r.h=value;
		this.z80.setState(r);
	}
	set l(value) {
		const r=this.z80.getState();
		r.l=value;
		this.z80.setState(r);
	}
	set ixl(value) {
		const r=this.z80.getState();
		r.ix=(r.ix&0xFF00)+value;
		this.z80.setState(r);
	}
	set ixh(value) {
		const r=this.z80.getState();
		r.ix=(r.ix&0xFF)+256*value;
		this.z80.setState(r);
	}
	set iyl(value) {
		const r=this.z80.getState();
		r.iy=(r.iy&0xFF00)+value;
		this.z80.setState(r);
	}
	set iyh(value) {
		const r=this.z80.getState();
		r.iy=(r.iy&0xFF)+256*value;
		this.z80.setState(r);
	}

	/**
	 * Converts the Z80 flags object into a number.
	 */
	protected convertFlags(flags: {
		S: number,
		Z: number,
		Y: number,
		H: number,
		X: number,
		P: number,
		N: number,
		C: number
	}): number {
		const f=128*flags.S+64*flags.Z+32*flags.Y+16*flags.H+8*flags.X+4*flags.P+2*flags.N+flags.C;
		return f;
	}


	/**
	 * Returns all registers.
	 */
	protected getAllRegisters(): {
		pc: number,
		sp: number,
		af: number,
		bc: number,
		de: number,
		hl: number,
		ix: number,
		iy: number,
		af2: number,
		bc2: number,
		de2: number,
		hl2: number,
		i: number,
		r: number,
		im: number,
		iff1: number,
		iff2: number,
	} {
		const r=this.z80.getState();
		const flags=this.convertFlags(r.flags);
		const flags2=this.convertFlags(r.flags_prime);
		const regs={
			pc: r.pc,
			sp: r.sp,
			af: r.a*256+flags,
			bc: r.b*256+r.c,
			de: r.d*256+r.e,
			hl: r.h*256+r.l,
			ix: r.ix,
			iy: r.iy,
			af2: r.a_prime*256+flags2,
			bc2: r.b_prime*256+r.c_prime,
			de2: r.d_prime*256+r.e_prime,
			hl2: r.h_prime*256+r.l_prime,
			i: r.i,
			r: r.r,
			im: r.imode,
			iff1: r.iff1,
			iff2: r.iff2
		};
		return regs;
	}


	/**
	 * Returns the register data in the Z80Registers format.
	 */
	public getRegisterData(): Uint16Array {
		const r=this.getAllRegisters();
		// Convert regs
		const regData=Z80RegistersClass.getRegisterData(
			r.pc, r.sp,
			r.af, r.bc, r.de, r.hl,
			r.ix, r.iy,
			r.af2, r.bc2, r.de2, r.hl2,
			r.i, r.r, r.im);
		return new Uint16Array(regData);;
	}


	/**
	 * Returns the register, opcode and sp contents data,
	 */
	public getHistoryData(): Uint16Array {
		// Get registers
		const regData=this.getRegisterData();
		// Add opcode and sp contents
		const startHist=regData.length;
		const histData=new Uint16Array(startHist+3);
		// Copy registers
		histData.set(regData);
		// Store opcode (4 bytes)
		const z80=this.z80;
		const pc=z80.pc;
		const opcodes=this.memory.getMemory32(pc);
		histData[startHist]=opcodes&0xFFFF;
		histData[startHist+1]=opcodes>>>16;
		// Store sp contents
		const sp=z80.sp;
		const spContents=this.memory.getMemory16(sp);
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
	 * Converts the Z80 flags object into a number.
	 */
	protected revConvertFlags(flags: number): {
		S: number,
		Z: number,
		Y: number,
		H: number,
		X: number,
		P: number,
		N: number,
		C: number
	} {
		const f={
			S: (flags>>>7)&0x01,
			Z: (flags>>>6)&0x01,
			Y: (flags>>>5)&0x01,
			H: (flags>>>4)&0x01,
			X: (flags>>>3)&0x01,
			P: (flags>>>2)&0x01,
			N: (flags>>>1)&0x01,
			C: flags&0x01,
		};
		return f;
	}


	/**
	 * Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Save all registers etc.
		const r=this.getAllRegisters();
		// Store
		memBuffer.write16(r.pc);
		memBuffer.write16(r.sp);
		memBuffer.write16(r.af);
		memBuffer.write16(r.bc);
		memBuffer.write16(r.de);
		memBuffer.write16(r.hl);
		memBuffer.write16(r.ix);
		memBuffer.write16(r.iy);
		memBuffer.write16(r.af2);
		memBuffer.write16(r.bc2);
		memBuffer.write16(r.de2);
		memBuffer.write16(r.hl2);
		// Also the 1 byte data is stored in 2 bytes for simplicity:
		memBuffer.write8(r.i);
		memBuffer.write8(r.r);
		memBuffer.write8(r.im);
		memBuffer.write8(r.iff1);
		memBuffer.write8(r.iff2);

		// Additional
		const s=this.z80.getState();
		memBuffer.write8(Number(s.halted));
		memBuffer.write8(Number(s.do_delayed_di));
		memBuffer.write8(Number(s.do_delayed_ei));
		//memBuffer.write8(s.cycle_counter);

		// Additional state
		memBuffer.write32(this.remaingInterruptTstates);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Store
		let r: any;
		r.pc=memBuffer.read16();
		r.sp=memBuffer.read16();
		const af=memBuffer.read16();
		r.a=af>>>8;
		r.flags=this.revConvertFlags(af&0xFF);
		const bc=memBuffer.read16();
		r.b=bc>>>8;
		r.c=bc&0xFF;
		const de=memBuffer.read16();
		r.d=de>>>8;
		r.e=de&0xFF;
		const hl=memBuffer.read16();
		r.h=hl>>>8;
		r.l=hl&0xFF;
		r.ix=memBuffer.read16();
		r.iy=memBuffer.read16();

		const af2=memBuffer.read16();
		r.a_prime=af2>>>8;
		r.flags_prime=this.revConvertFlags(af2&0xFF);
		const bc2=memBuffer.read16();
		r.b_prime=bc2>>>8;
		r.c_prime=bc2&0xFF;
		const de2=memBuffer.read16();
		r.d_prime=de2>>>8;
		r.e_prime=de2&0xFF;
		const hl2=memBuffer.read16();
		r.h_prime=hl2>>>8;
		r.l_prime=hl2&0xFF;

		// Also the 1 byte data is stored in 2 bytes for simplicity:
		r.i=memBuffer.read8();
		r.r=memBuffer.read8();
		r.im=memBuffer.read8();
		r.iff1=memBuffer.read8();
		r.iff2=memBuffer.read8();

		// Additional
		r.halted=(memBuffer.read8()!=0);
		r.do_delayed_di=(memBuffer.read8()!=0);
		r.do_delayed_ei=(memBuffer.read8()!=0);
		r.cycle_counter=0;

		// Restore all registers etc.
		const z80=this.z80;
		z80.setState(r);

		// Additional state
		this.remaingInterruptTstates=memBuffer.read32();

		// Reset statistics
		this.cpuLoadTstates=0;
		this.cpuTotalTstates=0;
		this.cpuLoad=1.0;	// Start with full load
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
				}
				break;

			case 0x30:
				{	// MUL D,E
					self.tStates+=8;
					self.r1.de=self.r1.d*self.r1.e;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;


			case 0x31:
				{	// ADD HL,A
					self.tStates+=8;
					self.r1.hl+=self.r1.a;
					self.r1.hl&=0xFFFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x32:
				{	// ADD DE,A
					self.tStates+=8;
					self.r1.de+=self.r1.a;
					self.r1.de&=0xFFFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x33:
				{	// ADD BC,A
					self.tStates+=8;
					self.r1.bc+=self.r1.a;
					self.r1.bc&=0xFFFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
				}
				break;

			case 0x23:
				{	// SWAPNIB
					self.tStates+=8;
					const a=self.r1.a;
					self.r1.a=((a>>>4)+(a<<4))&0xFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
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
					self.pc&=0xFFFF;
				}
				break;

			case 0x95:
				{	// SETAE
					self.tStates+=8;
					const e=self.r1.e;
					self.r1.a=(0x80)>>>(e&0x07)
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
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
					if (result==0)
						flags|=0x40;	// zero
					self.r1.f=flags;
					// Next
					self.pc+=3;
					self.pc&=0xFFFF;
				}
				break;

			case 0x28:
				{	// BSLA DE,B
					self.tStates+=8;
					const shifts=self.r1.b&0x1F
					const result=(self.r1.de<<shifts)&0xFFFF;
					self.r1.de=result;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x29:
				{	// BSRA DE,B
					self.tStates+=8;
					const shifts=self.r1.b&0x1F
					// Sticky shift right
					let dePrev=self.r1.de;
					if (dePrev&0x8000)
						dePrev+=0xFFFF0000;
					const result=(dePrev>>>shifts)&0xFFFF;
					self.r1.de=result;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x2A:
				{	// BSRL DE,B
					self.tStates+=8;
					const shifts=self.r1.b&0x1F
					const result=self.r1.de>>>shifts;
					self.r1.de=result;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x2B:
				{	// BSRF DE,B
					self.tStates+=8;
					const shifts=self.r1.b&0x1F
					const dePrev=0xFFFF0000+self.r1.de;	// 1-fill right
					const result=(dePrev>>>shifts)&0xFFFF;
					self.r1.de=result;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;

			case 0x2C:
				{	// BRLC DE,B
					self.tStates+=8;
					const shifts=self.r1.b&0x0F
					const result=self.r1.de<<shifts;
					self.r1.de=(result|(result>>>16))&0xFFFF;
					// Next
					self.pc+=2;
					self.pc&=0xFFFF;
				}
				break;


			case 0x98:
				{	// JP (C)
					self.tStates+=13;
					const inp=self.io.read(self.r1.bc);
					let pc=(self.pc+2)&0xC000;
					pc+=(inp<<6);
					// Next
					self.pc=pc;
					self.pc&=0xFFFF;
				}
				break;


			default:
				// No Z80N instruction, use normal execute
			//	super.execute();
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
