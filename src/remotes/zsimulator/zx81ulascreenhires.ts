
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
 *
 * Chroma81:
 * video_addr: Executed address.
 * character_code = [video_addr & 0x7FFF] & 0x3F
 * standard graphic:
 * - mode 0: [$C000 + character_code * 8 + ULA_line_counter]
 * - mode 1: [video_addr] (The dfile size and the color attributes size is: 24 * 32)
 * pseudo hires:
 * - mode 0: [$C000 + character_code * 8]
 * - mode 1: [video_addr] (The dfile size and the color attributes size is: 192 * 32)
 * wrx:
 * displayed_addr = i * 256 + r, not used by chroma81
 * - mode 0: [$C000 + character_code * 8]
 * - mode 1:  [video_addr] (The dfile size and the color attributes size is usually just 32)
 */
export class Zx81UlaScreenHiRes extends Zx81UlaScreen {
	// Holds the data for the screen, i.e. the generated screen.
	// The format is simple: upto 192 lines. Each line begins with a length byte.
	// Followed byte the pixel data (bits of the byte) for the line.
	protected screenData: Uint8Array;

	// The write index into the screen
	protected screenDataIndex: number;

	// The write index pointing to tje line length
	protected screenLineLengthIndex: number;

	// The first line to display.
	protected firstLine: number;

	// The last line to display (inclusive).
	protected lastLine: number;

	// Color (chroma81) data
	protected colorData: Uint8Array;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 * @param firstLine The first line to display.
	 * @param lastLine The last line to display (inclusive).
	 */
	constructor(z80Cpu: Z80Cpu, firstLine: number, lastLine: number) {
		super(z80Cpu);
		this.firstLine = firstLine;
		this.lastLine = lastLine;
		let totalLines = lastLine - firstLine + 1;
		if (totalLines < 0)
			totalLines = 0;
		this.screenDataIndex = 0;
		this.screenLineLengthIndex = 0;
		this.screenData = new Uint8Array(totalLines * (1 + Zx81UlaScreenHiRes.SCREEN_WIDTH / 8));
		this.colorData = new Uint8Array(this.screenData.length);
	}


	/** Resets the buffer indices */
	protected resetVideoBuffer() {
		this.screenLineLengthIndex = 0;
		this.screenDataIndex = 0;
	}


	/** Checks if the line is visible.
	 */
	protected isLineVisible(): boolean {
		const visible = (this.lineCounter >= this.firstLine && this.lineCounter <= this.lastLine);
		return visible;
	}


	/** Intercepts reading from the memory.
	 * For everything where A15 is set and data bit 6 is low, NOPs are returned.
	 * When data bit 6 is set it is expected to be the HALT instruction.
	 */
	protected ulaM1Read8(addr64k: number): number {
		// Read data from memory
		const data = this.memoryRead8(addr64k & 0x7FFF);
		if (addr64k < 0x8000)
			return data;	// Return the normal value

		// Check if bit 6 is low
		if ((data & 0b01000000) !== 0)
			return data;	// E.g. HALT

		// Check if line should be displayed
		if (this.isLineVisible()) {
			const i = this.z80Cpu.i;
			let addr;
			// Check for WRX (true hires)
			if (i >= 0x40) {
				// i (high byte of address) is outside the ROM (0-1FFF) and RAM (2000-3FFF) area -> WRX
				const r = this.z80Cpu.r;
				// Use previous r value
				addr = i * 256 + (r & 0x80) + ((r - 1) & 0x7F);
			}
			else {
				// i (high byte of address) is inside the ROM area or RAM (2000-3FFF) area -> normal display or pseudo hires, or ARX (2000-3FFF).
				// Interpret data
				const ulaAddrLatch = data & 0b0011_1111;	// 6 bits
				const charcode_plus_linecounter = ulaAddrLatch * 8 + this.ulaLineCounter;
				addr = (i & 0xFE) * 256 + charcode_plus_linecounter;
				// Write chroma81 (color) data
				if (this.chroma81Enabled) {
					let colorAddr = addr64k;	// Would be already OK for color mode 1
					if (this.chroma81Mode === 0) {
						// Character code mode.
						// Get the index into the character color data:
						colorAddr = 0xC000 + charcode_plus_linecounter;
						if (data & 0b1000_0000) {	// Inverted bit
							colorAddr += 64 * 8;	// Used to add 64 more characters for colors
						}
					}
					const color = this.memoryRead8(colorAddr);
					this.colorData[this.screenDataIndex] = color;
				}
			}
			// Load byte from character (ROM)
			let videoShiftRegister = this.memoryRead8(addr);
			// Check to invert the byte
			if (data & 0b1000_0000) {
				videoShiftRegister ^= 0xFF;
			}
			// Add byte to screen
			this.screenData[this.screenDataIndex++] = videoShiftRegister;
			// Increase length
			this.screenData[this.screenLineLengthIndex]++;
		}

		// Return a NOP for the graphics data
		return 0x00;
	}


	/** Returns the screen data.
	 * @returns The screen as a UInt8Array.
	 * Returns only the portion that is written.
	 * At the start this could be undefined.
	 * {data: Uint8Array}
	 */
	public getUlaScreen(): any {
		if (this.noDisplay)
			return {
				name: 'zx81-hires'
			};
		return {
			name: 'zx81-hires',
			data: this.screenData.slice(0, this.screenDataIndex),
			colorData: this.chroma81Enabled ? this.colorData.slice(0, this.screenDataIndex) : undefined
		};
	}


	/** Generate a HSYNC.
	 * Switch to next line in the screen buffer.
	 */
	protected checkHsync(addTstates: number): boolean {
		const lineCounterIncremented = super.checkHsync(addTstates);
		if (lineCounterIncremented) {
			if (this.isLineVisible()) {
				// Next line (graphics output)
				this.screenLineLengthIndex = this.screenDataIndex;
				this.screenData[this.screenLineLengthIndex] = 0;
				this.screenDataIndex++;
			}
		}
		return lineCounterIncremented;
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		super.serialize(memBuffer);
		// Write additional data
		memBuffer.writeNumber(this.firstLine);
		memBuffer.writeNumber(this.lastLine);
		memBuffer.writeNumber(this.screenDataIndex);
		memBuffer.writeNumber(this.screenLineLengthIndex);
		memBuffer.writeArrayBuffer(this.screenData);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		super.deserialize(memBuffer);
		// Read additional data
		this.firstLine = memBuffer.readNumber();
		this.lastLine = memBuffer.readNumber();
		this.screenDataIndex = memBuffer.readNumber();
		this.screenLineLengthIndex = memBuffer.readNumber();
		this.screenData = memBuffer.readArrayBuffer();
	}
}
