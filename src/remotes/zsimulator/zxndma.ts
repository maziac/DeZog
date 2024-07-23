import {Log} from "../../log";
import {Serializable, MemBuffer} from "../../misc/membuffer";


/** The zxnDMA simulation.
 * See https://www.specnext.com/the-zxndma/.
 *
 * The ZX Next DMA controller is a simple device that allows the Z80 to transfer data with the peripherals without the need for the CPU to be involved in the process.
 *
 * Not the whole zxnDMA is implemented:
 * - No compatibility with Z80 DMA
 * - TODO: What else is missing?
 *
 */
export class ZxnDma implements Serializable {


	/** Constructor.
	 */
	constructor() {
	}



	/** Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		return 0;
	}


	/** Serializes the object.
	 * Basically the last beeper value.
	 */
	public serialize(memBuffer: MemBuffer) {
		// TODO: Implement Serializable interface
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
	}
}
