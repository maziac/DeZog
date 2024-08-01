import {LogZsimHardware} from "../../log";
import {Serializable, MemBuffer} from "../../misc/membuffer";
import {SimulatedMemory} from "./simulatedmemory";
import {Z80Ports} from "./z80ports";


/** The zxnDMA simulation.
 * See https://wiki.specnext.dev/DMA.
 *
 * The ZX Next DMA controller is a simple device that allows the Z80 to transfer data with the peripherals without the need for the CPU to be involved in the process.
 *
 * The whole of the zxnDMA is implemented.
 * (The Zilog DMA compatiblity mode is not implemented.)
 */
export class ZxnDma implements Serializable {
	// Gets the memory handler for the DMA.
	protected memory: SimulatedMemory;

	// Gets the IO handler for the DMA.
	protected ports: Z80Ports;

	// Use to switch functions from decodeWRGroup to writeWR0-6.
	protected wrFunc: number = -1;	// -1 == decodeWRGroup

	// State of the DMA. Active or not.
	protected dmaActive: boolean = false;

	// The next bit to decode.
	protected nextDecodeBitMask: number = 0;

	// Decode transfer direction: true: A->B, false: B->A
	protected transferDirectionPortAtoB: boolean = true;

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

	// The number of t-states to wait until the next byte is copied in burst mode with prescalar
	protected nextTstates: number = 0;

	// auto-restart: true = auto-restart, false = stop on end of block.
	protected autoRestart: boolean = false;

	// The read mask. A read from port 0x7F cycles through the values
	// associated with the flags.
	protected readMask: number = 0b0111_1111;

	// Used to remember the last sent data from the readMask.
	protected lastReadSequenceBit: number = 0b0000_0000;

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
	protected statusByteRR0: number = 0b0011_1010;	// E=1, T=0

	// The byte counter (how many bytes are transferred).
	protected blockCounterRR12: number = 0;

	// The port A address counter.
	protected portAaddressCounterRR34: number = 0;

	// The port B address counter.
	protected portBaddressCounterRR56: number = 0;

	// The last copy operation that was executed. Stays until next copy operation
	protected lastOperation: string = "-";


	/** Constructor.
	 */
	constructor(memory: SimulatedMemory, ports: Z80Ports) {
		this.memory = memory;
		this.ports = ports;
		this.reset();
		this.initializeReadSequence();
	}


	/** Logs to LogZsimHardware.
	 */
	protected log(text: string) {
		LogZsimHardware.log("zxnDMA: " + text);
	}


	/** Returns the internal state.
	 * Is used to visualize the internal registers in
	 * the simulator web view.
	 * @returns An object with all the internal state.
	 */
	public getState(): any {
		return {
			"dmaActive": this.dmaActive,
			"blockLength": this.blockLength,
			"portAstartAddress": this.portAstartAddress,
			"portBstartAddress": this.portBstartAddress,
			"transferDirectionPortAtoB": this.transferDirectionPortAtoB,
			"portAmode": this.portAisIo ? "IO" : "Memory",
			"portBmode": this.portBisIo ? "IO" : "Memory",
			"portAadd": this.portAadd,
			"portBadd": this.portBadd,
			"portAcycleLength": this.portAcycleLength,
			"portBcycleLength": this.portBcycleLength,
			"mode": this.burstMode ? "Burst" : "Continuous",
			"zxnPrescalar": this.zxnPrescalar,
			"eobAction": this.autoRestart ? "Auto-Restart" : "Stop",
			"readMask": this.readMask & 0x7F,
			"lastReadSequenceBit": this.lastReadSequenceBit,
			"statusByteRR0": this.statusByteRR0,
			"blockCounterRR12": this.blockCounterRR12,
			"portAaddressCounterRR34": this.portAaddressCounterRR34,
			"portBaddressCounterRR56": this.portBaddressCounterRR56,
			"lastOperation": this.lastOperation
		};
	}


	/** Activates/deactivates the dma transfer.
	 */
	protected setDmaActive(active: boolean) {
		this.dmaActive = active;
		this.log("DMA " + (active ? "active" : "stopped"));
	}

	/** Checks for the last byte of a sequence and resets the write function
	 * appropriately.
	 */
	protected checkLastByte() {
		if (this.nextDecodeBitMask == 0) {
			this.wrFunc = -1;
		}
	}


	/** Provides internal state data through a port read.
	 * @returns Status byte, Port A/B adress or Block counter
	 * depending on the read mask.
	 * Data of the read mask is read in circles.
	 */
	public readPort(): number {
		let readValue = 0;
		// Safety check
		if (this.readMask === 0) {
			// No read mask set, return status byte
			readValue = this.statusByteRR0;
		}
		else {
			// Find the next bit
			do {
				// Rotate
				this.lastReadSequenceBit <<= 1;
				if (this.lastReadSequenceBit > 0x7F) {
					this.lastReadSequenceBit = 1;
				}
			} while ((this.readMask & this.lastReadSequenceBit) === 0);
			// Bit 0?
			if (this.lastReadSequenceBit & 0b0000_0001)
				readValue = this.statusByteRR0;
			// Bit 1?
			else if (this.lastReadSequenceBit & 0b0000_0010)
				readValue = this.blockCounterRR12 & 0xFF;
			// Bit 2?
			else if (this.lastReadSequenceBit & 0b0000_0100)
				readValue = (this.blockCounterRR12 >> 8) & 0xFF;
			// Bit 3?
			else if (this.lastReadSequenceBit & 0b0000_1000)
				readValue = this.portAaddressCounterRR34 & 0xFF;
			// Bit 4?
			else if (this.lastReadSequenceBit & 0b0001_0000)
				readValue = (this.portAaddressCounterRR34 >> 8) & 0xFF;
			// Bit 5?
			else if (this.lastReadSequenceBit & 0b0010_0000)
				readValue = this.portBaddressCounterRR56 & 0xFF;
			// Otherwise it is bit 6
			else readValue = (this.portBaddressCounterRR56 >> 8) & 0xFF;
		}
		// Log the read
		const text = "Port read: 0x" + readValue.toString(16).toUpperCase().padStart(2, '0') + " (0b" + readValue.toString(2).padStart(8, '0') + ")";
		this.log(text);
		// Return
		return readValue;
	}


	/** Writes a byte to the port and logs it.
	 */
	public writePort(value: number) {
		// Log the write
		const text = "Port write: 0x" + value.toString(16).toUpperCase().padStart(2, '0') + " (0b" + value.toString(2).padStart(8, '0') + ")";
		this.log(text);
		// Call right function
		this.callWritePortFunc(value);
	}


	/** Calls the righ write port function depending on this.wrFunc.
	 */
	protected callWritePortFunc(value: number) {
		// Call the write function
		switch (this.wrFunc) {
			case 0: this.writeWR0(value); break;
			case 1: this.writeWR1(value); break;
			case 2: this.writeWR2(value); break;
			case 3: this.writeWR3(value); break;
			case 4: this.writeWR4(value); break;
			case 5: this.writeWR5(value); break;
			case 6: this.writeWR6(value); break;
			default: this.decodeWRGroup(value); break;
		}
	}


	/** Decodes the first byte written to the port.
	 * @param value The value that is written.
	 */
	protected decodeWRGroup(value: number) {
		// Decode the Write Register (WR0-WR6)
		const AA = value & 0b11;
		if (value & 0x80) {
			// WR3-6
			this.wrFunc = AA + 3;
		}
		// WR0-2
		else if (AA == 0) {
			// WR1-2
			this.wrFunc = (value & 0b100) ? 1 : 2;
		}
		else {
			// WR0
			this.wrFunc = 0;
		}
		// Call the Wrx function
		this.callWritePortFunc(value);
	}


	/** Write to to WR0.
	 * Sets port A starting address and length.
	 * @param value The value that is written.
	 */
	protected writeWR0(value: number) {
		// Check for first byte in sequence
		if (this.nextDecodeBitMask == 0) {
			// Log
			this.log('Decoded as WR0');
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
			// Log
			this.log('Decoded as WR1');
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
			// Log
			this.log('Decoded as WR2');
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
		// Log
		this.log('Decoded as WR3');
		// Very simple function, just set DMA
		if (value & 0b0100_0000)
			this.enableDma(true);
		// End
		this.wrFunc = -1;
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
			// Log
			this.log('Decoded as WR4');
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
		// Log
		this.log('Decoded as WR5');
		// Very simple function, just set auto restart
		// Decode (/ce and /wait is HW -> ignored):
		this.autoRestart = (value & 0b0010_0000) !== 0;
		// End
		this.wrFunc = -1;
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
			// Log
			this.log('Decoded as WR6');
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
		// Like read mask = Status Byte
		this.readMask = 0b0000_0001;
		this.lastReadSequenceBit = 0b1000_0000;	// Next rotate will be at 0b0000_0001
	}


	// Resets (1) the block ended and the T flag.
	protected reinitializeStatusByte() {
		this.statusByteRR0 |= 0b0011_1010;	// E=1, T=0
	}


	// Resets the read sequence
	protected initializeReadSequence() {
		this.lastReadSequenceBit = 0b1000_0000;	// Next rotate will be at 0b0000_0001
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
		this.nextTstates = 0;
		this.setDmaActive(on);
	}


	/** Copies a complete block.
	 * Copies blockLength bytes from portAstartAddress to portBstartAddress.
	 * Or vice versa.
	 * The DMA will not give away time for the CPU until the block is completely copied.
	 * Prescalar only delays the timing. Even with a prescalar no time is given to the CPU.
	 * @param cpuFreq The CPU frequency in Hz. Required to calculate the t-states if prescalar is used.
	 * @returns The number of t-states the DMA needed. If 0 is returned, the DMA didn't occupy the bus.
	 */
	protected copyWholeBlock(cpuFreq: number): number {
		// Simple copy
		for (let i = 0; i < this.blockLength; i++) {
			// Read
			const value = this.readSrc();
			// Write
			this.writeDst(value);
			// Next
			this.portAaddressCounterRR34 = (this.portAaddressCounterRR34 + this.portAadd) & 0xFFFF;
			this.portBaddressCounterRR56 = (this.portBaddressCounterRR56 + this.portBadd) & 0xFFFF;
		}

		// End
		this.blockCounterRR12 = 0;
		// Set flags: End-of-block, T (1=at least one byte transferred) etc.
		this.statusByteRR0 = 0b0011_1010 | (this.blockLength === 0 ? 0 : 0b01);
		// Calculate required t-states
		let tStates = (this.portAtstates() + this.portBtstates()) * this.blockLength;
		// Check for prescalar
		if (this.zxnPrescalar !== 0) {
			// Frate = 875kHz / prescalar, independent of CPU speed
			const transferTime = this.zxnPrescalar / 875000;
			const transferTstates = transferTime * cpuFreq;
			tStates += transferTstates * this.blockLength;
		}
		// Status byte
		this.statusByteRR0 = 0b0001_1010 | (this.blockLength === 0 ? 0 : 0b01);
		// Last operation
		let src, dst;
		const incrA = this.portAadd === 0 ? "" : (this.portAadd > 0 ? "++" : "--"); // NOSONAR
		const incrB = this.portBadd === 0 ? "" : (this.portBadd > 0 ? "++" : "--"); // NOSONAR
		const portA = "0x" + this.portAstartAddress.toString(16) + incrA + (this.portAisIo ? ", IO" : "");
		const portB = "0x" + this.portBstartAddress.toString(16) + incrB + (this.portBisIo ? ", IO" : "");
		if (this.transferDirectionPortAtoB) {
			src = portA;
			dst = portB;
		}
		else {
			src = portB;
			dst = portA;
		}
		this.lastOperation = "" + this.blockLength + "x: (" + src + ") -> (" + dst + ")";
		//this.log(this.lastOperation);
		// Check for auto-restart
		if (this.autoRestart)
			this.load();	// Re-load
		else
			this.setDmaActive(false);	// Stop
		return tStates;
	}


	/** Copies one byte, increments the addresses and the counter.
	 * Depending on the prescalar time is given to the CPU.
	 * @param cpuFreq The CPU frequency in Hz. Required to calculate the t-states if prescalar is used.
	 * @param pastTstates The t-states that have passed since starting the zsimulator. Used to
	 * calculate the next time a byte will be copied if the prescalar is used.
	 * @returns The number of t-states the DMA needed. If 0 is returned, the DMA didn't occupy the bus.
	 */
	protected copyByteByByte(cpuFreq: number, pastTstates: number): number {
		// Check if block is finished
		if (this.blockLength === 0) {
			return 0;
		}
		// Check if enough time has passed
		if (pastTstates < this.nextTstates)
			return 0;	// Not enough time has passed
		// Copy one byte and return:
		const value = this.readSrc();
		this.writeDst(value);
		// Last operation
		let src, dst;
		const incrA = this.portAadd === 0 ? "" : (this.portAadd > 0 ? "++" : "--"); // NOSONAR
		const incrB = this.portBadd === 0 ? "" : (this.portBadd > 0 ? "++" : "--"); // NOSONAR
		const portA = "0x" + this.portAaddressCounterRR34.toString(16) + incrA + (this.portAisIo ? ", IO" : "");
		const portB = "0x" + this.portBaddressCounterRR56.toString(16) + incrB + (this.portBisIo ? ", IO" : "");
		if (this.transferDirectionPortAtoB) {
			src = portA;
			dst = portB;
		}
		else {
			src = portB;
			dst = portA;
		}
		this.lastOperation = "(" + src + ") -> (" + dst + ")";
		//this.log(this.lastOperation);
		// Next
		this.portAaddressCounterRR34 = (this.portAaddressCounterRR34 + this.portAadd) & 0xFFFF;
		this.portBaddressCounterRR56 = (this.portBaddressCounterRR56 + this.portBadd) & 0xFFFF;
		this.blockCounterRR12++;
		// Calculate required t-states
		const tStates = this.portAtstates() + this.portBtstates();
		// Calculate next time to copy a byte
		const transferTime = this.zxnPrescalar / 875000;
		const transferTstates = transferTime * cpuFreq;
		const k = Math.floor(pastTstates / transferTstates);
		this.nextTstates = Math.ceil((k + 1) * transferTstates);
		// Set T (1=at least one byte transferred) etc.
		this.statusByteRR0 |= 0b01;
		// Check for end of block
		if (this.blockCounterRR12 >= this.blockLength) {
			// Status byte: set E to 0
			this.statusByteRR0 &= 0b11011111;
			// Check for auto-restart
			if (this.autoRestart)
				this.load();	// Re-load
			else
				this.setDmaActive(false);	// Stop
		}
		return tStates;
	}


	/** Copies a block in burst or continuous mode.
	 * Copies blockLength bytes from portAstartAddress to portBstartAddress.
	 * Or vice versa.
	 * If prescalar set:
	 *   DMA will give away time for the CPU.
	 *   After each copied byte the CPU gets some time until the DMA kicks in again.
	 * If no prescalar set:
	 *   Same as continuous mode.
	 * @param cpuFreq The CPU frequency in Hz. Required to calculate the t-states if prescalar is used.
	 * @param pastTstates The t-states that have passed since starting the zsimulator. Used to
	 * calculate the next time a byte will be copied if the prescalar is used.
	 * @returns The number of t-states the DMA needed. If 0 is returned, the DMA didn't occupy the bus.
	 */
	protected copy(cpuFreq: number, pastTstates: number): number {
		// Blocking?
		if (this.zxnPrescalar === 0 || !this.burstMode) {
			// If no prescalar or if in contnuous mode, it is a blocking operation.
			// The whole block is copied at once
			return this.copyWholeBlock(cpuFreq);
		}
		else {
			// Not Blocking: Copy byte by byte.
			return this.copyByteByByte(cpuFreq, pastTstates);
		}
	}


	/** Reads a byte from either Port A or B.
	 */
	protected readSrc(): number {
		if (this.transferDirectionPortAtoB) {
			// Read Port A
			return this.getSrcAtAddress(this.portAaddressCounterRR34, this.portAisIo);
		}
		else {
			// Read Port B
			return this.getSrcAtAddress(this.portBaddressCounterRR56, this.portBisIo);
		}
	}


	/** Reads a byte from either memory or IO.
	 * @param address The address to read from.
	 * @param isIo True if IO, false if memory.
	 */
	protected getSrcAtAddress(address: number, isIo: boolean): number {
		if (isIo) {
			// IO port read
			const value = this.ports.read(address);
			return value;
		}
		else {
			// Memory read
			const value = this.memory.read8(address);
			return value;
		}
	}


	/** Writes a byte to either Port A or B.
	 * @param value The value to write.
	 */
	protected writeDst(value: number) {
		if (this.transferDirectionPortAtoB) {
			// Write Port B
			this.setDstAtAddress(this.portBaddressCounterRR56, this.portBisIo, value);
		}
		else {
			// Write Port A
			this.setDstAtAddress(this.portAaddressCounterRR34, this.portAisIo, value);
		}
	}


	/** Writes a byte to either memory or IO.
	 * @param address The address to write to.
	 * @param isIo True if IO, false if memory.
	 * @param value The value to write.
	 */
	protected setDstAtAddress(address: number, isIo: boolean, value: number) {
		if (isIo) {
			// IO port write
			this.ports.write(address, value);
		}
		else {
			// Memory write
			this.memory.write8(address, value);
		}
	}


	/** Returns the number of t-states needed to read/write a byte for port A.
	 */
	protected portAtstates(): number {
		if (this.portAcycleLength === 0) {
			// Standard Z80 timing. Depends on the memory or IO.
			if (this.portAisIo)
				return 4;
			// Memory
			return 3;
		}
		// Otherwise return the set cycle length
		return this.portAcycleLength;
	}


	/** Returns the number of t-states needed to read/write a byte for port B.
	 */
	protected portBtstates(): number {
		if (this.portBcycleLength === 0) {
			// Standard Z80 timing. Depends on the memory or IO.
			if (this.portBisIo)
				return 4;
			// Memory
			return 3;
		}
		// Otherwise return the set cycle length
		return this.portBcycleLength;
	}


	/** Executes the DMA. Is called by ZSimRemote executeInstruction
	 * and is just called similar as the Z80.execute.
	 * It is called before the Z80 would execute it's instruction.
	 * @param cpuFreq The CPU frequency in Hz. Required to calculate the t-states if prescalar is used.
	 * @param pastTstates The t-states that have passed since starting the zsimulator. Used to
	 * calculate the next time a byte will be copied if the prescalar is used.
	 * @returns The number of t-states the DMA needed. If 0 is returned, the DMA didn't occupy the bus.
	 */
	public execute(cpuFreq: number, pastTstates: number): number {
		// Check if enabled at all
		if (!this.dmaActive)
			return 0;
		// Copy bytes
		return this.copy(cpuFreq, pastTstates);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		memBuffer.writeBoolean(this.dmaActive);
		memBuffer.write8(this.wrFunc);
		memBuffer.write8(this.nextDecodeBitMask);
		memBuffer.writeBoolean(this.transferDirectionPortAtoB);
		memBuffer.write16(this.portAstartAddress);
		memBuffer.write16(this.portBstartAddress);
		memBuffer.write16(this.blockLength);
		memBuffer.writeBoolean(this.portAisIo);
		memBuffer.writeBoolean(this.portBisIo);
		memBuffer.write8(this.portAadd);
		memBuffer.write8(this.portBadd);
		memBuffer.write8(this.portAcycleLength);
		memBuffer.write8(this.portBcycleLength);
		memBuffer.write8(this.zxnPrescalar);
		memBuffer.writeBoolean(this.burstMode);
		memBuffer.writeNumber(this.nextTstates);
		memBuffer.writeBoolean(this.autoRestart);
		memBuffer.write8(this.readMask);
		memBuffer.write8(this.lastReadSequenceBit);
		memBuffer.write8(this.statusByteRR0);
		memBuffer.write8(this.blockCounterRR12);
		memBuffer.write8(this.portAaddressCounterRR34);
		memBuffer.write8(this.portBaddressCounterRR56);
		memBuffer.writeString(this.lastOperation);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		this.dmaActive = memBuffer.readBoolean();
		this.wrFunc = memBuffer.read8();
		this.nextDecodeBitMask = memBuffer.read8();
		this.transferDirectionPortAtoB = memBuffer.readBoolean();
		this.portAstartAddress = memBuffer.read16();
		this.portBstartAddress = memBuffer.read16();
		this.blockLength = memBuffer.read16();
		this.portAisIo = memBuffer.readBoolean();
		this.portBisIo = memBuffer.readBoolean();
		this.portAadd = memBuffer.read8();
		this.portBadd = memBuffer.read8();
		this.portAcycleLength = memBuffer.read8();
		this.portBcycleLength = memBuffer.read8();
		this.zxnPrescalar = memBuffer.read8();
		this.burstMode = memBuffer.readBoolean();
		this.nextTstates = memBuffer.readNumber();
		this.autoRestart = memBuffer.readBoolean();
		this.readMask = memBuffer.read8();
		this.lastReadSequenceBit = memBuffer.read8();
		this.statusByteRR0 = memBuffer.read8();
		this.blockCounterRR12 = memBuffer.read8();
		this.portAaddressCounterRR34 = memBuffer.read8();
		this.portBaddressCounterRR56 = memBuffer.read8();
		this.lastOperation = memBuffer.readString();
	}
}
