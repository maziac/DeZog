
import {MemBuffer} from "../../misc/membuffer";
import {UlaScreen} from "./ulascreen";
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

	// The counter for "generating" HSYNC/incrementing the line counter
	protected hsyncTimeCounter: number;

	// The line 3-bit counter (0-7) to address the 8 lines of a character.
	protected lineCounter: number;

	protected fullLineCounter: number;

	// Holds the data for the screen, i.e. the generated screen.
	// The format is simple: upto 192 lines. Each line begins with a length byte.
	// Followed byte the pixel data (bits of the byte) for the line.
	protected screenData: Uint8Array;

	// The write index into the screen
	protected screenDataIndex: number;

	// The write index pointing to tje line length
	protected screenLineLengthIndex: number;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);
		this.hsyncTimeCounter = 0;
		this.lineCounter = 0;
		this.fullLineCounter = 0;
		this.screenDataIndex = 0;
		this.screenLineLengthIndex = 0;
		this.screenData = new Uint8Array(256 * (1+Zx81UlaScreenHiRes.SCREEN_WIDTH/8));	// 256: in case more scan lines would be used
	}


	/** Handles the ULA out ports.
	 * 1. out (0xfd),a - turns NMI generator off
	 * 2. out (0xfe),a - turns NMI generator on
	 * (3. in a,(0xfe) - turns HSYNC generator off (if NMI is off))
	 * (4. out (0xff),a - turns VSYNC off)
	 * Note: the value of a is not ignored.
	 */
	protected outPorts(port: number, _data: number): void {
		// NMI generator off?
		if ((port & 0x0002) === 0) {
			// Just A1 needs to be 0, usually 0xFD
			this.stateNmiGeneratorOn = false;
			this.nmiGeneratorAccessed = true;	// Used for FAST/SLOW mode detection
			//console.log(this.logTimeCounter, "zx81 ULA: NMI generator off");
		}
		// NMI generator on?
		else if ((port & 0x0001) === 0) {
			// Just A0 needs to be 0, usually 0xFE
			this.stateNmiGeneratorOn = true;
			this.nmiGeneratorAccessed = true;	// Used for FAST/SLOW mode detection
			this.vsyncTimeCounter = 0;
			//console.log(this.logTimeCounter, "zx81 ULA: NMI generator on");
		}

		// Writing to any port also resets the vsync
		if (this.vsync) {
			// FAST/SLOW mode detection:
			// If NMI generator was turned on since last VSYNC,
			// we are in SLOW mode.
			let fastMode = true;
			if (this.nmiGeneratorAccessed) {
				fastMode = false;
				this.nmiGeneratorAccessed = false;
			}
			if (fastMode !== this.fastMode) {
				this.fastMode = fastMode;
				console.log("zx81 ULA: mode: ", this.fastMode ? "FAST" : "SLOW");
			}

			// No display detection
			this.vsyncTimeCounter = 0;
			// if (this.noDisplay)
			// 	console.log(this.logTimeCounter, "zx81 ULA: No VSYNC -> No display = false");
			this.noDisplay = false;
			//console.log();
			//console.log(this.logTimeCounter, "zx81 ULA: OUT VSYNC Off ********");
		}
		this.vsync = false;
	}


	/** Handles the ULA in port.
	 * 1. ...
	 * 2. ...
	 * 3. in a,(0xfe) - turns VSYNC on (if NMI is off)
	 * 4. ...
	 */
	protected inPort(port: number): number | undefined {
		// Check for address line A0 = LOW, and nmi generator off
		if ((port & 0x01) === 0 && !this.stateNmiGeneratorOn) {
			// Start VSYNC signal
			this.vsync = true;
			this.emit('VSYNC');
			// Clear the dfile
			this.screenLineLengthIndex = 0;
			this.screenDataIndex = 0;
			this.lineCounter = 0;
			this.fullLineCounter = 0;
			//console.log(this.logTimeCounter, "zx81 ULA: IN VSYNC On ********");
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
			// Interpret data
			const ulaAddrLatch = data & 0b0011_1111;	// 6 bits
			const i = this.z80Cpu.i;
			let ulaAddr = (i << 8) + (ulaAddrLatch << 3) + this.lineCounter;
			// Load byte from character (ROM)
			let videoShiftRegister = this.memoryRead8(ulaAddr);
			// Check to invert the byte
			if(data & 0b1000_0000) {
				videoShiftRegister ^= 0xFF;
			}
			// Add byte to dfile
			this.screenData[this.screenDataIndex++] = videoShiftRegister;
			// Increase length
			this.screenData[this.screenLineLengthIndex]++;
	//		const bin = videoShiftRegister.toString(2);
	//		console.log("zx81-hires ULA: nmi on=" + this.stateNmiGeneratorOn + ", lineCounter=" + this.fullLineCounter + ", lineCounter%8=" + this.lineCounter + ", 0x" + ulaAddr.toString(16) + " -> 0x" + videoShiftRegister.toString(16) + ",\t" + bin);
		}

		// Check if above 32k, and data bit 6 is low.
		// Then return NOPs.
		if (addr64k & 0x8000) {
			// Bit 15 is set
			// Check if bit 6 is low
			if ((data & 0b01000000) === 0) {
				// Return a NOP
				return 0x00;
			}
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
		const timeAdd = currentTstates / cpuFreq;
		this.vsyncTimeCounter += timeAdd;
		this.hsyncTimeCounter += timeAdd;
		//this.logTimeCounter += timeAdd * 1000;

		// Check for "no display", i.e. no vsync
		if (this.vsyncTimeCounter >= UlaScreen.VSYNC_TIME) {
			// No VSYNC -> No display
			// if (!this.noDisplay)
			// 	console.log(this.logTimeCounter, "zx81 ULA: No VSYNC -> No display = true");
			this.noDisplay = true;
			this.vsyncTimeCounter = 0;
		}

		// Check for HSYNC
		if (this.hsyncTimeCounter >= Zx81UlaScreenHiRes.HOR_LINE_TIME) {
			// HSYNC -> Next line
			this.hsyncTimeCounter %= Zx81UlaScreenHiRes.HOR_LINE_TIME;
			this.lineCounter = (this.lineCounter + 1) & 0b111;
			this.fullLineCounter++;
			this.screenLineLengthIndex = this.screenDataIndex;
			this.screenData[this.screenLineLengthIndex] = 0;
			this.screenDataIndex++;
//			console.log("zx81-hires ULA: HSYNC, lineCounter=" + this.fullLineCounter);
		}

		// Check for the R-register
		const r = this.z80Cpu.r;
		if ((r & 0b0100_0000) === 0) {
			// Bit 6 is low
			if ((this.prevRregister & 0b0100_0000) !== 0) {
				// Bit 6 changed from high to low -> interrupt
				//console.log("zx81 ULA: 0x0038 interrupt");
				this.z80Cpu.interrupt(false, 0);
			}
		}
		this.prevRregister = r;

		// Check for NMI interrupt generation
		if (this.stateNmiGeneratorOn) {
			if (this.vsyncTimeCounter >= Zx81UlaScreen.NMI_TIME) {
				// NMI interrupt
				//console.log("zx81 ULA: NMI interrupt");
				this.z80Cpu.interrupt(true, 0);
				// Next
				this.vsyncTimeCounter %= Zx81UlaScreen.NMI_TIME;
			}
		}
	}


	/** Returns the dfile.
	 * @returns The dfile as a UInt8Array.
	 * Returns only the portion that is written.
	 */
	public getUlaScreen(): Uint8Array {
		return this.screenData.slice(0, this.screenDataIndex);
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
