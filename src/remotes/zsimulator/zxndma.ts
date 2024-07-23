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

	// The function is switched from wrtiePort to writeWR0-6.
	protected writePortFunc: (value: number) => void;

	// The written bitmask.
	protected bitmask: number;

	// The next bit to decode.
	protected nextDecodeBitMask: number;

	// Decode transfer direction: true: A->B, false: B->A
	protected transferDirectionPortAtoB: boolean = false;

	// The port A start address.
	protected portAstartAddress: number = 0;

	// The block length to copy.
	protected blockLength: number = 0;

	// Port A is IO (true) or memory (false).
	protected portAisIo: boolean = false;

	// Port B is IO (true) or memory (false).
	protected portBisIo: boolean = false;

	// The number to add on each loop for port A address (-1, 1, 0)
	protected portAadd: number = 0;

	// The number to add on each loop for port B address (-1, 1, 0)
	protected portBadd: number = 0;

	// The cycle length.
	protected cycleLength: number = 2;

	// ZX Next prescalar. If non-zero a delay is inserted after each byte transfer.
	protected zxnPrescalar: number = 0;


	/** Constructor.
	 */
	constructor() {
		this.writePortFunc = this.writePort
	}



	/** Write to the port of the zxnDMA.
	 * @param value The value that is written.
	 */
	public writePort(value: number) {
		// Store
		this.bitmask = value;
		// Decode the Write Register (WR0-WR6)
		const AA = value & 0b11;
		if (value & 0x80) {
			// WR3-6
			switch (AA) {
				case 0:
					this.writeWR3(value);
					break;
				case 1:
					this.writeWR4(value);
					break;
				case 2:
					this.writeWR5(value);
					break;
				case 3:
					this.writeWR6(value);
					break;
			}
		}
		// WR0-2
		else if (AA == 0) {
			// WR1-2
			if (value & 0b100) {
				// WR1
				// Decode
				this.portAisIo = (value & 0b0_1000) === 0b0_1000;	// memory or IO
				if (value & 0b10_0000) {
					this.portAadd = 0;	// fixed
				} else if (value & 0b01_0000) {
					this.portAadd = 1;	// Increment
				} else {
					this.portAadd = -1;	// Decrement
				}
				// Next byte
				this.nextDecodeBitMask = value & 0b0100_0000;
				if (this.nextDecodeBitMask) {
					this.writePortFunc = this.writeWR1;
				}
			}
			else {
				// WR2
				// Decode
				this.portBisIo = (value & 0b0_1000) === 0b0_1000;	// memory or IO
				if (value & 0b10_0000) {
					this.portBadd = 0;	// fixed
				} else if (value & 0b01_0000) {
					this.portBadd = 1;	// Increment
				} else {
					this.portBadd = -1;	// Decrement
				}
				// Next byte
				this.nextDecodeBitMask = value & 0b0100_0000;
				if (this.nextDecodeBitMask) {
					this.writePortFunc = this.writeWR2;
				}
			}
		}
		else {
			// WR0
			// Decode transfer direction
			this.transferDirectionPortAtoB = (value & 0b100) === 0b100;
			// Next byte
			this.nextDecodeBitMask = value & 0b0111_1000;
			if (this.nextDecodeBitMask) {
				this.writePortFunc = this.writeWR0;
			}
		}
	}


	/** Write to to WR0.
	 * Sets port A starting address and length.
	 * @param value The value that is written.
	 */
	public writeWR0(value: number) {
		// Decode the value
		if (this.nextDecodeBitMask & 0b0_1000) {
			// Port A starting address (low)
			this.portAstartAddress = (this.portAstartAddress & 0xFF00) | value;
			this.nextDecodeBitMask &= ~0b0_1000;
		}
		else if (this.nextDecodeBitMask & 0b1_0000) {
			// Port A starting address (high)
			this.portAstartAddress = (this.portAstartAddress & 0x00FF) | (value << 8);
			this.nextDecodeBitMask &= ~0b1_0000;
		}
		else if (this.nextDecodeBitMask & 0b10_0000) {
			// Block length (low)
			this.blockLength = (this.blockLength & 0xFF00) | value;
			this.nextDecodeBitMask &= ~0b10_0000;
		}
		else if (this.nextDecodeBitMask & 0b100_0000) {
			// Block length (high)
			this.blockLength = (this.blockLength & 0x00FF) | (value << 8);
			this.nextDecodeBitMask &= ~0b100_0000;
		}
		// End reached
		if (this.nextDecodeBitMask === 0) {
			// Start again
			this.writePortFunc = this.writePort;
		}
	}


	/** Write to to WR1.
	 * Sets:
	 * - Port A fixed, incrementing, decrementing.
	 * - Cycle length.
	 * @param value The value that is written.
	 */
	public writeWR1(value: number) {
		// Cycle length
		const clBits = (value & 0b011);
		if (clBits !== 0b011) {
			this.cycleLength = 1 + (clBits ^ 0b011);
		}
		// Start again
		this.writePortFunc = this.writePort;
	}


	/** Write to to WR2.
	 * Sets:
	 * - Port B fixed, incrementing, decrementing.
	 * - Cycle length.
	 * @param value The value that is written.
	 */
	public writeWR2(value: number) {
		// Decode the value
		if (this.nextDecodeBitMask & 0b0100_0000) {
			// Cycle length
			const clBits = (value & 0b011);
			if (clBits !== 0b011) {
				this.cycleLength = 1 + (clBits ^ 0b011);
			}
			// Next
			this.nextDecodeBitMask = (value & 0b0010_0000);
		}
		else if (this.nextDecodeBitMask & 0b0010_0000) {
			// ZXN prescalar
			this.zxnPrescalar = value;
		}
		else {
			// Probably a write error.
			this.nextDecodeBitMask = 0;
		}
		// End reached
		if (this.nextDecodeBitMask === 0) {
			// Start again
			this.writePortFunc = this.writePort;
		}
	}


	/** Write to to WR3.
	 * DMA enable.
	 * @param value The value that is written.
	 */
	public writeWR3(value: number) {
	}


	/** Write to to WR4.
	 * Sets:
	 * - Burst/Continuous mode.
	 * - Port B starting address.
	 * @param value The value that is written.
	 */
	public writeWR4(value: number) {
	}


	/** Write to to WR5.
	 * Sets auto-restart/stop behavior.
	 * @param value The value that is written.
	 */
	public writeWR5(value: number) {
	}



	/** Write to to WR6.
	 * Sets the command (Load, Continue, Enable DMA, etc.)
	 * Or sets a read mask for the counter, port A or port B
	 * address.
	 * @param value The value that is written.
	 */
	public writeWR6(value: number) {
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
