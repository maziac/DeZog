
import {Serializable, MemBuffer} from "../../misc/membuffer";
import {SimulatedMemory} from "./simulatedmemory";
import {Z80Ports} from "./z80ports";


/** Handles the ZX81 ULA screen.
 */
export class Zx81UlaScreen implements Serializable {
	// The vsync time of the ULA.
	protected static VSYNC_TIME = 0.020;	// 20ms

	// The memory model. Used to obtain the address of the dfile.
	protected memory: SimulatedMemory;

	// The time since the last vertical interrupt.
	protected time: number;

	// A function that is called when the vertical interrupt is generated.
	protected vertInterruptFunc: () => void;

	// For debug measuring the time between two vertical interrupts.
	//protected lastIntTime: number = 0;


	/** Constructor.
	 * @param memoryModel The used memory model.
	 * @param ports The Z80 ports.
	 * @param vertInterruptFunc A function that is called on a vertical interrupt.
	 * Can be used by the caller to sync the display.
	 */
	constructor(memory: SimulatedMemory, ports: Z80Ports, vertInterruptFunc = () => {}) {
		this.memory = memory;
		this.vertInterruptFunc = vertInterruptFunc;
		this.time = 0;
	}


	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param cpuFreq The CPU frequency in Hz.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 * @returns The number of t-states the ULA provoked NMI
	 * would have taken.
	 * Note: this is not very accurate.
	 */
	public execute(cpuFreq: number, currentTstates: number): number {
		let tstates = 0;
		// Check for vertical interrupt
		this.time += currentTstates / cpuFreq;
		if (this.time >= Zx81UlaScreen.VSYNC_TIME) {
			this.vertInterruptFunc();
			// Measure time
			// const timeInMs = Date.now();27
			// const timeDiff = timeInMs - this.lastIntTime;
			// console.log("VSYNC: " + timeDiff + "ms");
			// this.lastIntTime = timeInMs;
		}
		// Calculate time inside vertical sync
		this.time %= Zx81UlaScreen.VSYNC_TIME;
		// Check if inside "drawing" area: ca. 3.8ms - 16.1ms (for 20ms)
		const upper = 0.0161;	// 16.1 ms
		const lower = 0.0038;	// 3.8 ms
		if (this.time > lower && this.time < upper) {
			// Use up the remaining tstates
			tstates = Math.ceil((upper - this.time) * cpuFreq);
			this.time = upper;
		}
		return tstates;
	}


	/** Returns the dfile.
	 * @returns The dfile as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		// Get the content of the D_FILE system variable (2 bytes).
		const dfile_ptr = this.memory.getMemory16(0x400c);
		// 24 lines of 33 bytes (could be less).
		return this.memory.readBlock(dfile_ptr, 33 * 24);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write passed time
		memBuffer.writeNumber(this.time);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read passed time
		this.time = memBuffer.readNumber();
	}
}
