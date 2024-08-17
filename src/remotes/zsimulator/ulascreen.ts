
import {EventEmitter} from "stream";
import {Z80Cpu} from "./z80cpu";


/** The base class for the ULA implementation for ZX81 and ZX Spectrum.
 */
export class UlaScreen extends EventEmitter {
	// The vsync time of the ULA.
	protected static VSYNC_TIME = 0.020;	// 20ms

	// Required for memory and ports.
	protected z80Cpu: Z80Cpu;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super();
		this.z80Cpu = z80Cpu;
	}

	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param cpuFreq The CPU frequency in Hz.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 */
	public execute(cpuFreq: number, currentTstates: number) {
		throw Error("UlaScreen: execute not implemented");
	}


	/** Returns the ULA screen.
	 * Override this.
	 * @returns The ULA screen as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		throw Error("UlaScreen: getUlaScreen not implemented");
	}
}
