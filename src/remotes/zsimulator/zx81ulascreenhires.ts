
import {MemBuffer} from "../../misc/membuffer";
import {Z80Cpu} from "./z80cpu";
import {Zx81UlaScreen} from "./zx81ulascreen";


/** Handles the ZX81 ULA screen.
 * Is derived from the Zx81UlaScreen which simulates the dfile.
 * The Zx81UlaScreenHiRes simulates/emulates the ZX81 ULA more correctly.
 * I.e. it generates the graphics from the data on the CPU bus.
 * Therefore it is capable of High Resolution graphics.
 * Drawback is that for development/debugging changes to the display/dfile
 * are not immediately visible, i.e. not before the vsync.
 *
 * There are 4 basic steps in generation of a screen display:
 * 1.  VSYNC, frame count and keyboard - NMI off
 * 2.  Blank lines/application code    - NMI on
 * 3.  VIDEO DISPLAY routine           - NMI off
 * 4.  Blank lines/application code    - NMI on
 */
export class Zx81UlaScreenHiRes extends Zx81UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// The NMI interval of the ULA.
	// TODO : REMOVE: protected static NMI_TIME = 0.000064;	// 64us
	// Time for a horizontal line (PAL) . Used for lineCounter increments
	protected static HOR_LINE_TIME = 0.000064;	// 64us

	// The line 3-bit counter (0-7) to address the 8 lines of a character.
	protected lineCounter = 0;

	// Holds the data for the screen, i.e. the generated screen.
	// The format is simple: upto 192 lines. Each line begins with a length byte.
	// Followed byte the pixel data (bits of the byte) for the line.
	protected screenData: Uint8Array;

	// The write index into the screen
	protected screenDataIndex: number;

	// The write index pointing to tje line length
	protected screenLineLengthIndex: number;

	// Turn increments on/off
	protected lineCounterEnabled = false;

	// Incremented with every HSYNC, reset on VSYNC
	protected tstatesScanlineDraw = 0;

	// Used to force generate a VSYNC if no HSYNC is generated for a long time.
	protected tstatesScanlineDrawTimeout = 0;

	// The tstates counter TODO: can be changed to the global one, when -= is resolved
	protected tstates = 0;

	// The number of tstates required for a horizontal scanline.
	protected TSTATES_PER_SCANLINE = 207;

	// The total number of tstates for a full screen.
	protected TSTATES_PER_SCREEN = 65000;

	// The minimal number of tstates for a VSYNC
	protected VSYNC_MINIMAL_TSTATES = 280;

	// Mininum duration for a VSYNC
	protected VSYNC_TSTATES_MIN_DURATION = 518;

	// If scanline draw timeout is reached (400), a VSYNC is generated.
	protected VSYNC_LINE_TIMEOUT = 400;

	// The tstates at which the VSYNC starts
	protected vsyncStartTstates = 0;

	// The state of the HSYNC generator
	protected stateHsyncGeneratorOn = false;

	// Used to generate the hsync
	protected hsyncTstatesCounter = 0;

	// The current scanline.
	protected scanlineCounter = 0;

	// Is set when an interrupt should be generated in the next cycle.
	protected int38InNextCycle = false;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);
		this.lineCounter = 0;
		this.screenDataIndex = 0;
		this.screenLineLengthIndex = 0;
		this.stateHsyncGeneratorOn = false;
		this.screenData = new Uint8Array(256 * (1 + Zx81UlaScreenHiRes.SCREEN_WIDTH / 8));	// 256: in case more scan lines would be used. TODO: recalculate and limit while writing
	}


	/** Resets the buffer indices */
	protected resetBuffer() {
		this.screenLineLengthIndex = 0;
		this.screenDataIndex = 0;
	}


	/** Handles the ULA out ports.
	 * 1. out (0xfd),a - turns NMI generator off
	 * 2. out (0xfe),a - turns NMI generator on
	 * (3. in a,(0xfe) - turns HSYNC generator off (if NMI is off))
	 * (4. out (0xff),a - turns VSYNC off)
	 * Note: the value of a is not ignored.
	 */
	protected outPorts(port: number, _data: number): void {
		this.stateHsyncGeneratorOn = true;

		// Check for A0 = low
		if ((port & 0x0001) === 0) {
			// Reset line counter
			// if (this.vsync)	// TODO: Unclear if the LCNTR reset is required here
			// 	this.ulaLCNTR = 0;
		}

		// NMI generator off?
		if ((port & 0x0003) === 1) {
			// Usually 0xFD
			this.stateNmiGeneratorOn = false;
		}
		// NMI generator on?
		else if ((port & 0x0003) === 2) {
			// Usually 0xFE
			this.stateNmiGeneratorOn = true;		}

		// Vsync?
		let lengthOfVsync = this.tstates - this.vsyncStartTstates;
		if(lengthOfVsync <= 0)
			lengthOfVsync += this.TSTATES_PER_SCREEN;

		if (!this.lineCounterEnabled) {
			if (lengthOfVsync >= this.VSYNC_TSTATES_MIN_DURATION) {
				if (this.tstatesScanlineDrawTimeout > this.VSYNC_MINIMAL_TSTATES) {
					this.generateVsync();
				}
			}
			this.lineCounterEnabled = true;
		}
	}


	/** Handles the ULA in port.
	 * 1. ...
	 * 2. ...
	 * 3. in a,(0xfe) - turns VSYNC on (if NMI is off)
	 * 4. ...
	 */
	protected inPort(port: number): number | undefined {
		// Check for address line A0 = LOW
		if ((port & 0x0001) === 0) {
			if (!this.stateNmiGeneratorOn) {
				if (this.lineCounterEnabled) {
					if (this.tstatesScanlineDrawTimeout > this.VSYNC_MINIMAL_TSTATES) {
						this.vsyncStartTstates = this.tstates;
					}
				}
				this.lineCounter = 0;
				this.lineCounterEnabled = false;
				this.stateHsyncGeneratorOn = false;
			}
		}
		return undefined;
	}


	/** Intercepts reading from the memory.
	 * For everything where A15 is set and data bit 6 is low, NOPs are returned.
	 * When data bit 6 is set it is expected to be the HALT instruction.
	 */
	public ulaM1Read8(addr64k: number): number {
		// Read data from memory
		const data = this.memoryRead8(addr64k & 0x7FFF);

		// Check if it is character data
		if (addr64k & 0x8000) {
			// Check if bit 6 is low
			if ((data & 0b01000000) !== 0)
				return data;	// E.g. HALT

			// Interpret data
			const ulaAddrLatch = data & 0b0011_1111;	// 6 bits
			const i = this.z80Cpu.i;
			let ulaAddr = (i & 0xFE) * 256 + ulaAddrLatch * 8;
			// Is a hack, but seems to work:
			if (i == 0x1E)	// not = 0x1E =>hires 0 > linecounter = 0
				ulaAddr += (this.lineCounter & 0x07);
			// Load byte from character (ROM)
			let videoShiftRegister = this.memoryRead8(ulaAddr);
			// Check to invert the byte
			if (data & 0b1000_0000) {
				videoShiftRegister ^= 0xFF;
			}
			// Add byte to screen
			this.screenData[this.screenDataIndex++] = videoShiftRegister;
			// Increase length
			this.screenData[this.screenLineLengthIndex]++;
			// Return a NOP for the graphics data
			return 0x00;
		}

		// Otherwise return the normal value
		return data;
	}


	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param cpuFreq The CPU frequency in Hz.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 */
	public execute(cpuFreq: number, currentTstates: number) {
		this.tstates += currentTstates;

		// Execute int38 interrupt?
		if (this.int38InNextCycle) {
			this.int38InNextCycle = false;
			this.z80Cpu.interrupt(false, 0);
			this.screenLineLengthIndex = this.screenDataIndex;
			this.screenData[this.screenLineLengthIndex] = 0;
			this.screenDataIndex++;
		}

		// Check for the R-register
		const r = this.z80Cpu.r;
		if ((r & 0b0100_0000) === 0) {
			// Bit 6 is low
			if ((this.prevRregister & 0b0100_0000) !== 0) {
				// Bit 6 changed from high to low -> interrupt in next cycle
				this.int38InNextCycle = true;
			}
		}
		this.prevRregister = r;

		this.hsyncTstatesCounter += currentTstates;
		if (this.hsyncTstatesCounter >= this.TSTATES_PER_SCANLINE) {
			this.generateHsync();
			this.scanlineCounter++;
			this.hsyncTstatesCounter = this.hsyncTstatesCounter % this.TSTATES_PER_SCANLINE;
		}
	}


	/** Returns the screen data.
	 * @returns The screen as a UInt8Array.
	 * Returns only the portion that is written.
	 * At the start this could be undefined.
	 */
	public getUlaScreen(): Uint8Array {
		return this.screenData?.slice(0, this.screenDataIndex);
	}


	/** Generate a VSYNC. Updates the display (emit).
	 */
	protected generateVsync() {
		this.tstatesScanlineDraw = 0;
		this.tstatesScanlineDrawTimeout = 0;
		this.hsyncTstatesCounter = 0;

		// VSYNC
		this.emit('VSYNC');
		this.resetBuffer();
	}


	/** Generate a HSYNC.
	 */
	protected generateHsync() {
		if (this.lineCounterEnabled)
			this.lineCounter++;	// TODO: is it the same as scanlineCounter ?

		this.tstatesScanlineDraw++;
		this.tstatesScanlineDrawTimeout++;

		// Force a vsync if scan line too long
		if (this.tstatesScanlineDrawTimeout >= this.VSYNC_LINE_TIMEOUT) {
			this.generateVsync();	// Happens only sometimes if the VSYNC is not generated by SW
			this.lineCounterEnabled = true;
		}

		// Generate NMI on every HSYNC (if NMI generator is on)
		if (this.stateNmiGeneratorOn) {
			this.z80Cpu.interrupt(true, 0);	// NMI
		}
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		super.serialize(memBuffer);
		// TODO: Do I need the serialize() functions?
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		super.deserialize(memBuffer);
	}
}
