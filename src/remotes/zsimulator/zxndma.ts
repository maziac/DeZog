import {Log} from "../../log";	// TODO: implement logging for the zxndma
import {Serializable, MemBuffer} from "../../misc/membuffer";


/** The zxnDMA simulation.
 * See https://www.specnext.com/the-zxndma/.
 *
 * The ZX Next DMA controller is a simple device that allows the Z80 to transfer data with the peripherals without the need for the CPU to be involved in the process.
 *
 * Not the whole zxnDMA is implemented:
 * - No compatibility with Z80 DMA (bit 6 of nextreg 0x06 is ignored).
 * - No interrupts
 * - TODO: What else is missing?
 *
 */
export class ZxnDma implements Serializable {

	// The function is switched from wrtiePort to writeWR0-6.
	protected writePortFunc: (value: number) => void;

	// The next bit to decode.
	protected nextDecodeBitMask: number = 0;

	// Decode transfer direction: true: A->B, false: B->A
	protected transferDirectionPortAtoB: boolean = false;

	// The port A start address.
	protected portAstartAddress: number = 0;

	// The port B start address.
	protected portBstartAddress: number = 0;

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

	// The cycle length for port A. 0 = no variable cycle timing is used.
	protected portAcycleLength: number = 0;

	// The cycle length for port B. 0 = no variable cycle timing is used.
	protected portBcycleLength: number = 0;

	// ZX Next prescalar. If non-zero a delay is inserted after each byte transfer.
	protected zxnPrescalar: number = 0;

	// The burst mode. true = burst, false = continuous.
	protected burstMode: boolean = true;

	// auto-restart: true = auto-restart, false = stop on end of block.
	protected autoRestart: boolean = false;

	// The read mask. A read from port 0x7F cycles through the values
	// associated with the flags.
	protected readMask: number = 0b0111_1111;

	// State of the DMA. Enabled or disabled.
	protected enabled: boolean = false;

	/** The status byte:
	Bit 0: 1 = DMA operation has occurred
	Bit 1: 0 = Ready Active
	Bit 2: Undefined
	Bit 3: 0 = Interrupt pending
	Bit 4: 0 = Match found (not used)
	Bit 5: 0 = End of block
	Bit 6: Undefined
	Bit 7: Undefined
	*/
	protected statusByteRR0: number = 0;

	// The byte counter (how many bytes are transferred).
	protected blockCounterRR12: number = 0;

	// The port A address counter.
	protected portAaddressCounterRR34: number = 0;

	// The port B address counter.
	protected portBaddressCounterRR56: number = 0;



	/** Constructor.
	 */
	constructor() {
		this.writePortFunc = this.writePort
		this.reset();
	}


	/** Checks for the last byte of a sequence and resets the write function
	 * appropriately.
	 */
	protected checkLastByte() {
		if (this.nextDecodeBitMask == 0) {
			this.writePortFunc = this.writePort;
		}
	}


	/** Write to the port of the zxnDMA.
	 * @param value The value that is written.
	 */
	public writePort(value: number) {	// TODO: make writePort functions protected.
		// Decode the Write Register (WR0-WR6)
		const AA = value & 0b11;
		if (value & 0x80) {
			// WR3-6
			switch (AA) {
				case 0:
					this.writePortFunc = this.writeWR3;
					break;
				case 1:
					this.writePortFunc = this.writeWR4;
					break;
				case 2:
					this.writePortFunc = this.writeWR5;
					break;
				case 3:
					this.writePortFunc = this.writeWR6;
					break;
			}
		}
		// WR0-2
		else if (AA == 0) {
			// WR1-2
			if (value & 0b100) {
				// WR1
				this.writePortFunc = this.writeWR1;
			}
			else {
				// WR2
				this.writePortFunc = this.writeWR2;
			}
		}
		else {
			// WR0
			this.writePortFunc = this.writeWR0;
		}
		// Call the Wrx function
		this.writePortFunc(value);
	}


	/** Write to to WR0.
	 * Sets port A starting address and length.
	 * @param value The value that is written.
	 */
	protected writeWR0(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
			// Decode transfer direction
			// Note: bit0,1 are not decoded (always transfer)
			this.transferDirectionPortAtoB = (value & 0b100) === 0b100;
			// Next byte
			this.nextDecodeBitMask = value & 0b0111_1000;
		}
		// Check next byte in sequence
		else if (this.nextDecodeBitMask & 0b0_1000) {
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

		// Check if last byte in sequence
		this.checkLastByte();
	}


	/** Write to to WR1.
	 * Sets:
	 * - Port A fixed, incrementing, decrementing.
	 * - Cycle length.
	 * @param value The value that is written.
	 */
	protected writeWR1(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
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
		}
		else {
			// Cycle length
			const clBits = (value & 0b011);
			if (clBits !== 0b011) {
				this.portAcycleLength = 1 + (clBits ^ 0b011);
			}
			// End sequence
			this.nextDecodeBitMask = 0;
		}

		// Check if last byte in sequence
		this.checkLastByte();
	}


	/** Write to to WR2.
	 * Sets:
	 * - Port B fixed, incrementing, decrementing.
	 * - Cycle length.
	 * @param value The value that is written.
	 */
	protected writeWR2(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
			// Decode
			this.portBisIo = (value & 0b0_1000) === 0b0_1000;	// memory or IO
			if (value & 0b10_0000) {
				this.portBadd = 0;	// fixed
			} else if (value & 0b01_0000) {
				this.portBadd = 1;	// Increment
			} else {
				this.portBadd = -1;	// Decrement
			}
			// Next
			this.nextDecodeBitMask = value & 0b0100_0000;
		}
		// Check next byte in sequence
		else if (this.nextDecodeBitMask & 0b0100_0000) {
			// Cycle length
			const clBits = (value & 0b011);
			if (clBits !== 0b011) {
				this.portBcycleLength = 1 + (clBits ^ 0b011);
			}
			// Next
			this.nextDecodeBitMask = (value & 0b0010_0000);
		}
		else if (this.nextDecodeBitMask & 0b0010_0000) {
			// ZXN prescalar
			this.zxnPrescalar = value;
			// End sequence
			this.nextDecodeBitMask = 0;
		}
		else {
			// Probably a write error.
			this.nextDecodeBitMask = 0;
		}

		// Check if last byte in sequence
		this.checkLastByte();
	}


	/** Write to to WR3.
	 * DMA enable.
	 * @param value The value that is written.
	 */
	protected writeWR3(value: number) {
		// Very simple function, just set DMA
		this.enableDma((value & 0b0100_0000) !== 0);
		// End
		this.writePortFunc = this.writePort;
	}


	/** Write to to WR4.
	 * Sets:
	 * - Burst/Continuous mode.
	 * - Port B starting address.
	 * @param value The value that is written.
	 */
	protected writeWR4(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
			// Decode
			const mode = (value & 0b0110_0000) >> 5;
			if (mode !== 0b11) {	// 0b11: Do not use
				// Burst/Continuous mode
				this.burstMode = (mode === 0b10);
			}
			// Next
			this.nextDecodeBitMask = value & 0b1100;
		}
		// Check next byte in sequence
		else if (this.nextDecodeBitMask & 0b0100) {
			// Port A starting address (low)
			this.portBstartAddress = (this.portBstartAddress & 0xFF00) | value;
			this.nextDecodeBitMask &= ~0b0100;
		}
		else if (this.nextDecodeBitMask & 0b1000) {
			// Port A starting address (high)
			this.portBstartAddress = (this.portBstartAddress & 0x00FF) | (value << 8);
			this.nextDecodeBitMask &= ~0b1000;
			// Next
			this.nextDecodeBitMask = 0;
		}

		// Check if last byte in sequence
		this.checkLastByte();
	}


	/** Write to to WR5.
	 * Sets auto-restart/stop behavior.
	 * @param value The value that is written.
	 */
	protected writeWR5(value: number) {
		// Very simple function, just set auto restart
		// Decode (/ce and /wait is HW -> ignored):
		this.autoRestart = (value & 0b0010_0000) !== 0;
		// End
		this.writePortFunc = this.writePort;
	}


	/** Write to to WR6.
	 * Sets the command (Load, Continue, Enable DMA, etc.)
	 * Or sets a read mask for the counter, port A or port B
	 * address.
	 * @param value The value that is written.
	 */
	protected writeWR6(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
			// Decode
			switch (value) {	// Command
				case 0xC3: this.reset(); break;
				case 0xC7: this.resetPortAtiming(); break;
				case 0xCB: this.resetPortBtiming(); break;
				case 0xBF: this.readStatusByte(); break;
				case 0x8B: this.reinitializeStatusByte(); break;
				case 0xA7: this.initializeReadSequence(); break;
				case 0xCF: this.load(); break;
				case 0xD3: this.continue(); break;
				case 0x87: this.enableDma(true); break;
				case 0x83: this.enableDma(false); break;
				// Next read read-mask
				case 0xBB: this.nextDecodeBitMask = value & 0b1000_0000; break;
			}
		}
		// Check read mask
		else if (this.nextDecodeBitMask & 0b1000_0000) {
			// Decode read mask
			this.readMask = value & 0b0111_1111;
			// End
			this.nextDecodeBitMask = 0;
		}
		// Check if last byte in sequence
		this.checkLastByte();
	}


	// Resets to standard Z80 timing.
	protected resetPortAtiming() {
		this.portAcycleLength = 0;
	}


	// Resets to standard Z80 timing.
	protected resetPortBtiming() {
		this.portBcycleLength = 0;
	}


	protected readStatusByte() {
	// TODO: implement
	}


	// Resets (1) the block ended (and the search) flag.
	protected reinitializeStatusByte() {
		this.statusByteRR0 |= 0b0011_0000;
	}


	protected initializeReadSequence() {
	// TODO: implement
	}


	// Loads the starting addresses to the counters.
	protected load() {
		this.portAaddressCounterRR34 = this.portAstartAddress;
		this.portBaddressCounterRR56 = this.portBstartAddress;
		this.blockCounterRR12 = 0;
	}


	// Clears the block counter.
	protected continue() {
		this.blockCounterRR12 = 0;
	}


	protected reset() {
		this.autoRestart = false;
		this.portAcycleLength = 0;
		this.portBcycleLength = 0;
	}


	/** Sets the DMA enable.
	 * This starts the DMA transfer.
	 */
	protected enableDma(on: boolean) {
		this.enabled = on;
		// TODO: implement
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
