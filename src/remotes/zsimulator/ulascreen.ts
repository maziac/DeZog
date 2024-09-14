
import {EventEmitter} from "stream";
import {Z80Cpu} from "./z80cpu";
import {MemBuffer, Serializable} from "../../misc/membuffer";


/** The base class for the ULA implementation for ZX81 and ZX Spectrum.
 */
export class UlaScreen extends EventEmitter implements Serializable {
	// Required for memory and ports.
	protected z80Cpu: Z80Cpu;

	// The border color:
	protected borderColor = 0x07; // White without brightness

	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super();
		this.z80Cpu = z80Cpu;
	}

	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 */
	public execute(currentTstates: number) {
		throw Error("UlaScreen: execute not implemented");
	}


	/** Returns the ULA screen.
	 * Override this.
	 * @returns The ULA screen in different formats.
	 */
	public getUlaScreen(): any {
		throw Error("UlaScreen: getUlaScreen not implemented");
	}


	/** Returns the border color.
	 */
	public getBorderColor() {
		return this.borderColor;
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		memBuffer.write8(this.borderColor);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		this.borderColor = memBuffer.read8();
	}
}
