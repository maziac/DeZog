
import {EventEmitter} from "stream";
import {Serializable, MemBuffer} from "../../misc/membuffer";
import {Z80Cpu} from "./z80cpu";


/** The base class for the ULA implementation for ZX81 and ZX Spectrum.
 */
export class UlaScreen extends EventEmitter implements Serializable{
	// The vsync time of the ULA.
	protected static VSYNC_TIME = 0.020;	// 20ms

	// The time counter for the vertical sync.
	protected vsyncTimeCounter: number;

	// Required for memory and ports.
	protected z80Cpu: Z80Cpu;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super();
		this.z80Cpu = z80Cpu;
		this.vsyncTimeCounter = 0;
	}

	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param cpuFreq The CPU frequency in Hz.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 */
	public execute(cpuFreq: number, currentTstates: number) {
		// Check for vertical interrupt
		const timeAdd = currentTstates / cpuFreq;
		this.vsyncTimeCounter += timeAdd;
		if (this.vsyncTimeCounter >= UlaScreen.VSYNC_TIME) {
			this.vsyncTimeCounter %= UlaScreen.VSYNC_TIME;
			this.vsyncSignal();
		}
	}


	/** Override if you need additional behavior on a vsync.
	 */
	protected vsyncSignal() {
		this.emit("VSYNC");
	}


	/** Returns the ULA screen.
	 * Override this.
	 * @returns The ULA screen as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		throw Error("getUlaScreen not implemented");
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write data
		memBuffer.writeNumber(this.vsyncTimeCounter);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read data
		this.vsyncTimeCounter = memBuffer.readNumber();
	}
}
