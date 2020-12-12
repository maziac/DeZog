import {Z80Ports} from './z80ports';
import {Z80RegistersClass} from '../z80registers';
import {MemBuffer} from '../../misc/membuffer'
import {Settings} from '../../settings';
import * as Z80 from '../../3rdparty/z80.js/Z80.js';
import {SimulatedMemory} from './simmemory';



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
	public cpuWithHaltTstates: number;
	// cpuLoadTstates divided by cpuTotalTstates.
	public cpuLoad: number;
	// The number of interrupts to calculate the average from.
	protected cpuLoadRange: number;

	// Counts the current number of interrupts.
	protected cpuLoadRangeCounter: number;

	// Used to calculate the number of t-states for a step-over or similar.
	// Is reset by the remote.
	public cpuTstatesCounter: number;

	// Set to true if a ZX Spectrum like interrupt should be generated.
	protected vsyncInterrupt: boolean;

	// At the moment just a constant. CPU frequency.
	public cpuFreq: number;

	// Memory
	public memory: SimulatedMemory;

	// Ports
	public ports: Z80Ports;

	// Is set if there should be an update to the ZSimulationView.
	// Is synched with the vertical interrupt if enabled. But also
	// happens without.
	public update: boolean;

	// Used to indicate an error in peripherals, i.e. an error in the custom javascript code.
	// Will make the program break.
	// undefined = no error
	public error: string|undefined;


	/// Constructor.
	constructor(memory: SimulatedMemory, ports: Z80Ports) {
		this.error=undefined;
		this.update=false;
		this.memory=memory;
		this.ports=ports;
		this.cpuFreq = Settings.launch.zsim.cpuFrequency;	// e.g. 3500000.0 for 3.5MHz.
		this.INTERRUPT_TIME=0.02*this.cpuFreq;  // 20ms * 3.5 MHz
		this.remaingInterruptTstates=this.INTERRUPT_TIME;
		/*
		IM 0: Executes an instruction that is placed on the data bus by a peripheral.
		IM 1: Jumps to address &0038
		IM 2: Uses an interrupt vector table, indexed by value on data bus.
		*/
		this.cpuTstatesCounter=0
		this.cpuLoadTstates=0;
		this.cpuWithHaltTstates=0;
		this.cpuLoad=1.0;	// Start with full load
		this.cpuLoadRangeCounter=0;
		this.cpuLoadRange=Settings.launch.zsim.cpuLoadInterruptRange;
		this.vsyncInterrupt=Settings.launch.zsim.vsyncInterrupt;

		// Initialize Z80, call constructor
		const z80n_enabled=Settings.launch.zsim.Z80N;
		this.z80=new (Z80.Z80 as any)({
			mem_read: (address) => {return memory.read8(address);},
			mem_write: (address, val) => {memory.write8(address, val);
			},
			io_read: (address) => {
				try {
					return ports.read(address);
				}
				catch(e) {
					this.error="io_read: "+e.message;
					return 0;
				};
			},
			io_write: (address, val) => {
				try {
					ports.write(address, val);
				}
				catch (e) {
					this.error="io_write: "+e.message;
				};
			},
			z80n_enabled: z80n_enabled
		});
	}


	/**
	 * Executes one instruction.
	 * @returns The number of t-states used for execution.
	 * Sets also the 'update' variable:
	 * true if a (vertical) interrupt happened or would have happened.
	 * Also if interrupts are disabled at the Z80.
	 * And also if 'vsyncInterrupt' is false.
	 * The return value is used for regularly updating the ZSimulationView.
	 * And this is required even if interrupts are off. Or even if
	 * there is only Z80 simulation without ZX Spectrum.
	 */
	public execute(): number {
		const z80=this.z80;

		// Assume no update
		this.update=false;

		// Handle instruction
		const tStates=z80.run_instruction();

		// Statistics
		if (z80.halted) {
			// HALT instruction
			if (z80.interruptsEnabled && this.vsyncInterrupt) {
				// HALT instructions are treated specially:
				// If a HALT is found the t-states to the next interrupt are calculated.
				// The t-states are added and the interrupt is executed immediately.
				// So only one HALT is ever executed, skipping execution of the others
				// saves processing time.
				this.cpuWithHaltTstates += this.remaingInterruptTstates - tStates;
				this.remaingInterruptTstates = 0;
			}
			else {
				// Simply count the HALT instruction, no optimization
				this.cpuLoadTstates += tStates;
			}
		}
		else {
			// No HALT: Count everything besides the HALT instruction and add to cpu-load.
			this.cpuLoadTstates+=tStates;
		}

		// Add t-states
		this.cpuTstatesCounter+=tStates;
		this.cpuWithHaltTstates+=tStates;
		// Interrupt
			this.remaingInterruptTstates-=tStates;
		if (this.remaingInterruptTstates<=0) {
			// Interrupt
			this.remaingInterruptTstates=this.INTERRUPT_TIME;
			// Really generate interrupt?
			if (this.vsyncInterrupt) {
				this.generateInterrupt(false, 0);
			}
			// Vert. interrupt: Returns true even if interrupt is not executed. Used for updating the view.
			this.update=true;
		}

		return tStates;
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
		r.flags=this.revConvertFlags(value&0xFF);
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
		r.imode=value;
		this.z80.setState(r);
	}
	set iff1(value) {
		const r=this.z80.getState();
		r.iff1=value;
		this.z80.setState(r);
	}
	set iff2(value) {
		const r=this.z80.getState();
		r.iff2=value;
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
	 * Simulates pulsing the processor's INT (or NMI) pin.
	 * Is called for the ULA vertical sync and also from custom code.
	 * @param non_maskable - true if this is a non-maskable interrupt.
	 * @param data - the value to be placed on the data bus, if needed.
	 */
	public generateInterrupt(non_maskable: boolean, data: number) {
		this.z80.interrupt(non_maskable, data);
		// Measure CPU load
		this.cpuLoadRangeCounter++;
		if (this.cpuLoadRangeCounter>=this.cpuLoadRange) {
			if (this.cpuWithHaltTstates>0) {
				this.cpuLoad=this.cpuLoadTstates/this.cpuWithHaltTstates;
				this.cpuLoadTstates=0;
				this.cpuWithHaltTstates=0;
				this.cpuLoadRangeCounter=0;
			}
		}
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
		const slots=this.memory.getSlots()||[];
		const regData=Z80RegistersClass.getRegisterData(
			r.pc, r.sp,
			r.af, r.bc, r.de, r.hl,
			r.ix, r.iy,
			r.af2, r.bc2, r.de2, r.hl2,
			r.i, r.r, r.im,
			slots
		);
		return regData;
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
		// Store sp contents (2 bytes)
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
		let r=new Object() as any;
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
		r.imode=memBuffer.read8();
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
		this.cpuWithHaltTstates=0;
		this.cpuLoad=1.0;	// Start with full load
	}
}
