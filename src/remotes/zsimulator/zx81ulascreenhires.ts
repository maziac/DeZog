
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
 * Graphics modes:
 * - standard graphics: The standard graphics mode. I=0x1E. A character is taken from the ROM.
 *   Each char is defined by 8 bytes from the ROM.
 * - pseudo hires: The pseudo hires mode. I is switched to point to somewhere in the ROM (high 7 bits).
 *   Otherwise the  same as 'standard'.
 * - arx: I points to RAM in area 0x2000-0x3FFF. Requires 56k RAM pack. Otherwise like 'standard'.
 *   Was used be defining a different charset every 2 lines (every 64 bytes).
 * - udg (or chr$64): I points to area 0x2000-0x3FFF. Otherwise like 'standard'.
 *   Requires additional HW add on with RAM/ROM for the charsets.
 * - chr$128: I points to area 0x2000-0x3FFF. Like 'standard' but if bit 0 of I is set and bit 7 of the
 *   character code (the inverse bit) then 2 * 256 is added to the address to address the upper half
 *   of the character set with the inverse characters.
 *   Requires additional HW add on that checks for bit 0 of the I register.
 * - wrx: The true hires mode. I is outside the ROM area. The byte is taken from the RAM (I*256+R).
 *   A (simple) HW modification was required.
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

	// The tstates state at end of the hsync impulse. Is used to calculate the x-position of the
	// first write to the screen.
	//protected hsyncEndTstates: number = 0;


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
//		this.screenData = new Uint8Array(totalLines * (1 + 1 + Zx81UlaScreenHiRes.SCREEN_WIDTH / 8)); // TODO fix magic constant 416
		this.screenData = new Uint8Array(totalLines * (1 + 2 * 416 / 8) + 2);
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
		if ((data & 0b0100_0000) !== 0)
			return data;	// E.g. HALT

		let zx81Data = 0;

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
			zx81Data = ulaAddrLatch;
				const charcode_plus_linecounter = ulaAddrLatch * 8 + this.ulaLineCounter;
				addr = (i & 0xFE) * 256 + charcode_plus_linecounter;
				if (i & 0x01)	// CHR$128?
					addr += (data & 0b1000_0000) * 4;	// Bit 7 of the character code
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
			const xTstates = this.tstates - this.hsyncEndTstates;
			//const cmpTstates = Zx81UlaScreen.TSTATES_PER_SCANLINE - xTstates;
			// Do not write if written during the hsync impulse (minus 1 byte)
			//if (cmpTstates > Zx81UlaScreen.TSTATES_OF_HSYNC_LOW || cmpTstates < 4)
			{
				// 1 Byte is 4 cycles, if it would be written 4 cycles before the end of the line, it is not visible.
				this.screenData[this.screenDataIndex++] = xTstates;
				this.screenData[this.screenDataIndex++] = videoShiftRegister;
				// Increase length
				this.screenData[this.screenLineLengthIndex]++;

				this.logIfFirst('ulaM1Read8: xTstates=' + xTstates + ', zx81Data=' + zx81Data + ", value='" + this.cvtZx81ToAscii(zx81Data) + "'");
			}
		}

		// Return a NOP to be executed
		return 0x00;
	}

	protected cvtZx81ToAscii(byte: number): string {
		return this.tokens[byte];
	}

	public tokens = [
		// 0x0
		" ", "\\' ", "\\ '", "\\''", "\\. ", "\\: ", "\\.'", "\\:'", "\\##", "\\,,", "\\~~", "\"", "#", "$", ":", "?",
		// 0x1
		"(", ")", ">", "<", "=", "+", "-", "*", "/", ";", ",", ".", "0", "1", "2", "3",
		// 0x2
		"4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
		// 0x3
		"K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
		// 0x4
		"RND", "INKEY$", "PI", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x5
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x6
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x7
		//"UP", "DOWN", "LEFT", "RIGHT", "GRAPHICS", "EDIT", "NEWLINE", "RUBOUT", "K/L", "MODE", "FUNCTION", "", "", "", "NUMBER", "CURSOR",
		"", "", "", "", "", "", ""/*NL*/, "", "", "", "", "", "", "", "", "",
		// 0x8 Inverse graphics
		"\\::", "\\.:", "\\:.", "\\..", "\\':", "\\ :", "\\'.", "\\ .", "\@@", "\\;;", "\\!!", "\"", "#", "$", ":", "?",
		// 0x9 Inverse
		"(", ")", ">", "<", "=", "+", "-", "*", "/", ";", ",", ".", "0", "1", "2", "3",
		// 0xA Inverse
		"4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
		// 0xB Inverse
		"K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
		// 0xC
		"\\\"", "AT ", "TAB ", "", "CODE ", "VAL ", "LEN ", "SIN ", "COS ", "TAN ", "ASN ", "ACS ", "ATN ", "LN ", "EXP ", "INT ",
		// 0xD
		"SQR ", "SGN ", "ABS ", "PEEK ", "USR ", "STR$ ", "CHR$ ", "NOT ", "**", " OR ", " AND ", "<=", ">=", "<>", " THEN ", " TO ",
		// 0xE
		" STEP ", "LPRINT ", "LLIST ", "STOP ", "SLOW ", "FAST ", "NEW ", "SCROLL ", "CONT ", "DIM ", "REM ", "FOR ", "GOTO ", "GOSUB ", "INPUT ", "LOAD ",
		// 0xF
		"LIST ", "LET ", "PAUSE ", "NEXT ", "POKE ", "PRINT ", "PLOT ", "RUN ", "SAVE ", "RAND ", "IF ", "CLS ", "UNPLOT ", "CLEAR ", "RETURN ", "COPY "
	];


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


	/** Switches to the next line. */
	protected nextLine() {
		super.nextLine();
		if (this.isLineVisible()) {
			// Next line (graphics output)
			this.screenLineLengthIndex = this.screenDataIndex;
			this.screenData[this.screenLineLengthIndex] = 0;
			this.screenDataIndex++;
		}
	}

	/** Generate a HSYNC.
	 * Switch to next line in the screen buffer.
	 */
	protected checkHsyncxx(addTstates: number): boolean {
		const lineCounterIncremented = super.checkHsyncxx(addTstates);
		if (lineCounterIncremented) {
			if (this.isLineVisible()) {
				// Next line (graphics output)
				this.screenLineLengthIndex = this.screenDataIndex;
				this.screenData[this.screenLineLengthIndex] = 0;
				this.screenDataIndex++;
				// Remember the current cpu tstates.
				this.hsyncEndTstates = this.tstates;
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
		// TODO: save the x-position per line
		memBuffer.writeArrayBuffer(this.screenData);
		memBuffer.writeArrayBuffer(this.colorData);
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
		this.colorData = memBuffer.readArrayBuffer();
	}
}
