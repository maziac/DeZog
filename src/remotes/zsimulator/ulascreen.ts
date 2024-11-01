
import {EventEmitter} from "stream";
import {Z80Cpu} from "./z80cpu";
import {MemBuffer, Serializable} from "../../misc/membuffer";
import {ExecuteInterface} from "./executeinterface";
import {ZSimRemote} from "./zsimremote";


/** The base class for the ULA implementation for ZX81 and ZX Spectrum.
 */
export class UlaScreen extends EventEmitter implements Serializable, ExecuteInterface {
	// Required for memory and ports.
	protected z80Cpu: Z80Cpu;

	// The border color:
	protected borderColor = 0x0F; // White with brightness

	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super();
		this.z80Cpu = z80Cpu;
	}

	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 */
	public execute(zsim: ZSimRemote) {
		throw Error("UlaScreen: execute not implemented");
	}


	/** Returns the ULA screen.
	 * Override this.
	 * @returns The ULA screen in different formats.
	 */
	public getUlaScreen(): any {
		throw Error("UlaScreen: getUlaScreen not implemented");
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
