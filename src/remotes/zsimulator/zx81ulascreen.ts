import {MemBuffer} from "../../misc/membuffer";
import {Utility} from "../../misc/utility";
import {Chroma81Type} from "../../settings/settings";
import {UlaScreen} from "./ulascreen";
import {Z80Cpu} from "./z80cpu";
import {ZSimRemote} from "./zsimremote";
import {Zx81LoadColorization} from "./zx81loadcolorization";


const logOn = false;	// Set to true to enable logging.

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
 * For details of the zx81 ULA display see:
 * https://k1.spdns.de/Vintage/Sinclair/80/Sinclair%20ZX80/Tech%20specs/Wilf%20Rigter%27s%20ZX81%20Video%20Display%20Info.htm
 * https://8bit-museum.de/heimcomputer-2/sinclair/sinclair-scans/scans-zx81-video-display-system/
 * https://problemkaputt.de/zxdocs.htm
 * For details of the ULA HW and signals see:
 * https://oldcomputer.info/8bit/zx81/ULA/ula.htm
 * http://blog.tynemouthsoftware.co.uk/2023/10/how-the-zx81-generates-video.html
 * http://searle.x10host.com/zx80/zx80nmi.html
 * https://www.sinclairzxworld.com/viewtopic.php?t=5096
 *
 * Chroma81 details:
 * http://www.fruitcake.plus.com/Sinclair/ZX81/Chroma/Files/Documents/Chroma81_TechnicalDescription.txt
 */
export class Zx81UlaScreen extends UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// The number of tstates required for a horizontal scanline.
	protected static TSTATES_PER_SCANLINE = 207;

	// The number of tstates for one full screen.
	protected static TSTATES_PER_SCREEN = 65000;	// ~20ms

	// The HSYNC signal stay low for 15 tstates.
	protected static TSTATES_OF_HSYNC_LOW = 15;

	// The minimal number of tstates for a VSYNC should be ~1ms => 3250 tstates.
	// But the generated vsync by the zx81 seems to be much smaller: 1233 tstates -> ~0.38ms
	// So the about the half is used for vsync recognition.
	protected static VSYNC_MINIMAL_TSTATES = 500;

	// No display.
	protected noDisplay = false;

	// The signals required for the ULA HW simulation.
	protected IORD = false;
	protected IOWR = false;
	protected A0 = false;
	protected A1 = false;
	protected VSYNC = false;
	protected HSYNC = false;
	protected NMION = false;
	protected vsyncStartTstates = 0;
	protected vsyncEndTstates = 0;
	protected hsyncEndTstates = 0;
	protected prevRregister = 0;	// The previous state of the R-register.
	protected ulaLineCounter = 0;	// The line 3-bit counter (0-7) to address the 8 lines of a character.
	protected lineCounter = 0;	// Counts lines independent of the ulaLineCounter. Is reset on a vsync.
	protected tstates = 0;	// The tstates counter (is never reset). Copy of passedTstates + executeTstates.
	protected int38InNextCycle = false;	// Is set when an interrupt should be generated in the next cycle.


	// The original memory read function.
	protected memoryRead8: (addr64k: number) => number;

	// Chroma81-------------
	// The chroma mode: 0=Character code, 1=Attribute file:
	protected chroma81Mode = 0
	// Chroma81 enabled programmatically:
	protected chroma81Enabled = false;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);

		// Register ULA ports
		z80Cpu.ports.registerGenericOutPortFunction(this.outPort.bind(this));
		z80Cpu.ports.registerGenericInPortFunction(this.inPort.bind(this));

		// m1read8 (opcode fetch) is modified to emulate the ZX81 ULA.
		this.memoryRead8 = z80Cpu.memory.read8.bind(z80Cpu.memory);
		z80Cpu.memory.m1Read8 = this.ulaM1Read8.bind(this);
	}


	/** Sets the Chroma81 state.
	 * @param chroma81 The chroma81 state.
	 * @param debug If true, initialize the color RAM.
	 */
	public setChroma81(chroma81: Chroma81Type, debug: boolean) {
		if (!chroma81.available)
			return;

		// Store initial values
		this.chroma81Enabled = chroma81.enabled;
		this.chroma81Mode = chroma81.mode;
		this.borderColor = chroma81.borderColor;

		// Register the Chroma81 ports
		this.z80Cpu.ports.registerSpecificOutPortFunction(0x7FEF, this.chroma81OutPort.bind(this));
		this.z80Cpu.ports.registerSpecificInPortFunction(0x7FEF, this.chroma81InPort.bind(this));
		// Init the color memory, otherwise it would be black on black.
		if (debug) {
			const attribColors = new Uint8Array(0x4000);	// Init all possible area
			attribColors.fill(0x26);	// yellow on red
			// for (let i = 0; i < 0x4000; i++)
			// 	attribColors[i] = i & 0xFF;
			this.z80Cpu.memory.writeBlock(0xC000, attribColors);
		}

		// Read an optional colourization file
		if (chroma81.colourizationFile) {
			// Load the colorization file
			const colourization = Zx81LoadColorization.fromFile(chroma81.colourizationFile);
			this.z80Cpu.memory.writeBlock(0xC000, colourization.colorMap);
			this.borderColor = colourization.borderColor;
		}
	}


	/** Resets the video buffer. */
	protected resetVideoBuffer() {
		// Override if needed
	}


	/** Handles the ULA out ports.
	 * 1. out (0xfd),a - turns NMI generator off
	 * 2. out (0xfe),a - turns NMI generator on
	 * (3. in a,(0xfe) - turns HSYNC generator off (if NMI is off))
	 * (4. out (0xff),a - turns VSYNC off)
	 * Note: the value of a is not ignored.
	 */
	protected outPort(port: number, _data: number): void {
		this.IOWR = true;
		this.A0 = (port & 0x0001) !== 0;
		this.A1 = (port & 0x0002) !== 0;
		logOn && this.log('outPort($' + Utility.getHexString(port, 4) + ', ' + _data.toString(2).padStart(8, '0') + ')');
	}


	/** Handles the ULA in port.
	 * 1. ...
	 * 2. ...
	 * 3. in a,(0xfe) - turns VSYNC on (if NMI is off)
	 * 4. ...
	 */
	protected inPort(port: number): number | undefined {
		this.IORD = true;
		this.A0 = ((port & 0x0001) !== 0);
		logOn && this.log('inPort($' + Utility.getHexString(port, 4) + ')');
		return undefined;
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

		// Otherwise return a NOP to be executed
		return 0x00;
	}


	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 */
	public execute(zsim: ZSimRemote) {
		this.tstates = zsim.passedTstates + zsim.executeTstates;

		// Execute int38 interrupt?
		if (this.int38InNextCycle) {
			this.int38InNextCycle = false;
			this.z80Cpu.interrupt(false, 0);
		}

		// Check for the R-register
		const r = this.z80Cpu.r;
		// Bit 6 changed from high to low
		if ((r & 0b0100_0000) === 0 && (this.prevRregister & 0b0100_0000) !== 0) {
			// -> interrupt in next cycle
			this.int38InNextCycle = true;
		}
		this.prevRregister = r;

		// Simulate HW
		const prevVSYNC = this.VSYNC;
		const prevHSYNC = this.HSYNC;

		// VSYNC
		if (this.IOWR) {
			// VSYNC off on out port
			this.VSYNC = false;
			if (this.A0 === false) {
				// Turn NMI on (in port)
				this.NMION = true;
			}
			if (this.A1 === false) {
				// Turn NMI off (in port)
				this.NMION = false;
			}
		}
		if (this.IORD && !this.A0 && !this.NMION) {
			// Start VSYNC
			this.VSYNC = true;
		}

		// HSYNC
		if (prevVSYNC) {
			// Reset HSYNC counter
			this.hsyncEndTstates = this.tstates;
			this.HSYNC = false;
			logOn && this.log('VSYNC corrected hsyncEndTstates=' + this.hsyncEndTstates);
		}

		let hsyncTstates = this.tstates - this.hsyncEndTstates;
		if (this.HSYNC) {
			// Check for the end of the HSYNC
			if (hsyncTstates >= Zx81UlaScreen.TSTATES_PER_SCANLINE)
				this.HSYNC = false;
		}
		else {
			// Check for the start of the HSYNC
			if (hsyncTstates >= Zx81UlaScreen.TSTATES_PER_SCANLINE - Zx81UlaScreen.TSTATES_OF_HSYNC_LOW)
				this.HSYNC = true;
		}

		if (hsyncTstates >= Zx81UlaScreen.TSTATES_PER_SCANLINE)
			hsyncTstates %= Zx81UlaScreen.TSTATES_PER_SCANLINE;

		if (prevHSYNC !== this.HSYNC) {
			// HSYNC changed
			if (this.HSYNC) {
				// HSYNC pulse started, the horizontal line ends, a new line starts
				this.nextLine();
			}
			else {
				// HSYNC pulse ended, the horizontal line starts
				this.hsyncEndTstates = this.tstates - hsyncTstates;	// HSYNC ended hsyncTstates in the past
				logOn && this.log('HSYNC: hsyncEndTstates=' + this.hsyncEndTstates + ', hsyncTstates=' + hsyncTstates + ', remainder to csync=' + ((this.hsyncEndTstates - this.vsyncEndTstates) % 207));
			}
		}

		// NMI
		if (this.NMION && (prevHSYNC !== this.HSYNC) && this.HSYNC) {
			// Simulate the "Wait Circuit"
			if (this.z80Cpu.isHalted) {
				// Adjust the tstates. The "Wait Circuit" synchronizes the CPU with the ULA.
				const tstatesNMI = this.tstates - this.hsyncEndTstates;
				let diffTstatesNMI = tstatesNMI % (Zx81UlaScreen.TSTATES_PER_SCANLINE - Zx81UlaScreen.TSTATES_OF_HSYNC_LOW);
				const extendTstates = Zx81UlaScreen.TSTATES_OF_HSYNC_LOW - 3 - diffTstatesNMI - 1; // -1 because /WAIT is evaluated in T2
				// I had to subtract another 3 tstates to get the correct timing, I don't know why.
				zsim.executeTstates += extendTstates;
			}
			// Generate NMI
			this.z80Cpu.interrupt(true, 0);
		}

		// ULA line counter is reset when VSYNC is on
		if (this.VSYNC)
			this.ulaLineCounter = 0;

		// Check for VSYNC change
		if (prevVSYNC !== this.VSYNC) {
			// VSYNC changed
			if (this.VSYNC) {
				// VSYNC pulse started
				this.vsyncStartTstates = this.tstates;
			}
			else {
				// VSYNC pulse ended
				// Check if VSYNC is long enough to be recognized as VSYNC by a TV.
				const lengthOfVsync = this.tstates - this.vsyncStartTstates;
				if (lengthOfVsync >= Zx81UlaScreen.VSYNC_MINIMAL_TSTATES) {
					// VSYNC recognized
					this.noDisplay = false;
					this.lineCounter = 0;
					this.emit('updateScreen');
					this.resetVideoBuffer();
					this.vsyncEndTstates = this.tstates;
					logOn && this.log('==================================================================================');
				}
			}
		}

		// Log on changes
		if (logOn) {
			if (prevVSYNC !== this.VSYNC)
				logOn && this.log('VSYNC: ' + (this.VSYNC ? 'ON' : 'OFF'));
			if (prevHSYNC !== this.HSYNC)
				logOn && this.log('HSYNC: ' + (this.HSYNC ? 'ON' : 'OFF'));
			logOn && this.log('--');
		}

		// Reset
		this.IORD = false;
		this.IOWR = false;

		// No vsync/no display detection: no display if for 2*20 ms no Vsync was found
		if (this.tstates > this.vsyncStartTstates + 2 * Zx81UlaScreen.TSTATES_PER_SCREEN) {
			if (!this.noDisplay) {
				// Change to no display
				this.noDisplay = true;
				this.emit('updateScreen');
			}
		}
	}


	/** Switches to the next line. */
	protected nextLine() {
		this.ulaLineCounter = (this.ulaLineCounter + 1) & 0x07;
		this.lineCounter++;
	}

	/** Returns the dfile.
	 * @returns The screen as dfile (UInt8Array) plus the charset.
	 * If in FAST mode no display might be available. In this case only the charset is returned.
	 * { charset: Uint8Array, dfile: Uint8Array }
	 */
	public getUlaScreen(): any {
		// Check for available VSYNC
		if (this.noDisplay)
			return {
				name: 'zx81',
				borderColor: this.borderColor
			};

		// Read the charset 0x1E00-0x1FFF (512 bytes)
		const memory = this.z80Cpu.memory;
		const charset = memory.readBlock(0x1E00, 512);
		// Get the content of the D_FILE system variable (2 bytes).
		const dfile_ptr = memory.getMemory16(0x400c);
		// 24 lines of 33 bytes (could be less).
		const dfile_maxlen = 33 * 24;
		const dfile = memory.readBlock(dfile_ptr, dfile_maxlen);

		// Color / Chroma 81
		let chroma;
		if (this.chroma81Enabled) {
			const mode = this.chroma81Mode;
			let data;
			if (mode === 0) {
				// Character code mode, mapping table at $C000-$C3FF
				data = memory.readBlock(0xC000, 0x0400);
			}
			else {
				// Attribute file mode, colors at DFILE+$8000
				const addr = (dfile_ptr + 0x8000) & 0xFFFF;
				data = memory.readBlock(addr, dfile_maxlen);
			}
			chroma = {
				mode,
				data
			};
		}

		/* For debugging only: */
		/*
		if (this.displayUseRomChars) {
			// Use ROM chars
			charset.set(this.romChars);
		}
		if (this.displayUseNoColors) {
			chroma = undefined;
		}
		*/

		return {
			name: 'zx81',
			dfile,
			charset,
			chroma,
			borderColor: this.borderColor
		};
	}


	/** Chroma 81 out port function.
	 * Port $7FEF (01111111 11101111) - OUT:
	 * +---+---+---+---+---+---+---+---+
	 * | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
	 * +---+---+---+---+---+---+---+---+
	 *   |   |   |   |   |   |   |   |
	 *   |   |   |   |   |   +---+---+-------- Border color (format: GRB).
	 *   |   |   |   |   +-------------------- Border color bright bit.
	 *   |   |   |   +------------------------ Mode (0=Character code, 1=Attribute file).
	 *   |   |   +---------------------------- 1=Enable color mode.
	 *   +---+-------------------------------- Reserved for future use (always set to 0)
	 */
	protected chroma81OutPort(port: number, value: number) {
		this.borderColor = value & 0x0F;
		this.chroma81Mode = (value & 0b0001_0000) >>> 4;	// 0 or 1
		this.chroma81Enabled = (value & 0b0010_0000) !== 0;
	}


	/** Chroma 81 in port function.
	 * Port $7FEF (01111111 11101111) - IN:
	 * +---+---+---+---+---+---+---+---+
	 * | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
	 * +---+---+---+---+---+---+---+---+
	 *   |   |   |   |   |   |   |   |
	 *   |   |   |   +---+---+---+---+-------- X=Not used (reserved for future use).
	 *   |   |   +---------------------------- 0=Color modes available, i.e. configuration switch 6 is set to ON.
	 *   +---+-------------------------------- X=Not used (reserved for future use).
	 */
	protected chroma81InPort(port: number): number {
		return 0b1101_1111;	// Color modes available (otherwise this function is never called)
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		super.serialize(memBuffer);
		// Write data
		memBuffer.writeBoolean(this.noDisplay);
		memBuffer.writeBoolean(this.VSYNC);
		memBuffer.writeBoolean(this.HSYNC);
		memBuffer.writeNumber(this.vsyncStartTstates);
		memBuffer.writeNumber(this.vsyncEndTstates);
		memBuffer.writeNumber(this.hsyncEndTstates);
		memBuffer.write8(this.prevRregister);
		memBuffer.write8(this.ulaLineCounter);
		memBuffer.writeNumber(this.lineCounter);
		memBuffer.writeNumber(this.tstates);
		memBuffer.writeBoolean(this.int38InNextCycle);
		memBuffer.write8(this.chroma81Mode);
		memBuffer.writeBoolean(this.chroma81Enabled);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		super.deserialize(memBuffer);
		// Read data
		this.noDisplay = memBuffer.readBoolean();
		this.VSYNC = memBuffer.readBoolean();
		this.HSYNC = memBuffer.readBoolean();
		this.vsyncStartTstates = memBuffer.readNumber();
		this.vsyncEndTstates = memBuffer.readNumber();
		this.hsyncEndTstates = memBuffer.readNumber();
		this.prevRregister = memBuffer.read8();
		this.ulaLineCounter = memBuffer.read8();
		this.lineCounter = memBuffer.readNumber();
		this.tstates = memBuffer.readNumber();
		this.int38InNextCycle = memBuffer.readBoolean();
		this.chroma81Mode = memBuffer.read8();
		this.chroma81Enabled = memBuffer.readBoolean();
	}


	// TODO: Once this is all working comment the lines that use the log
	/** Log	 */
	protected log(message: string) {
		if (this.lineCounter >= 57 && this.lineCounter <= 302)
			return
		//return;
		// total tstates, line counter, diff since last csync end, rel. diff since last csync end, diff since last hsync end, rel. diff since last hsync end, message
		const diffLastCsyncEnd = this.tstates - this.vsyncEndTstates;
		const diffLastHsyncEnd = this.tstates - this.hsyncEndTstates;
		const relDiffLastCsyncEnd = (diffLastCsyncEnd / 207).toFixed(2).padStart(16, '0');
		const relDiffLastHsyncEnd = (diffLastHsyncEnd / 207).toFixed(2).padStart(16, '0');
		console.log(this.tstates, this.lineCounter, "since csync:" + diffLastCsyncEnd, relDiffLastCsyncEnd, "since hsync:" + diffLastHsyncEnd, relDiffLastHsyncEnd, message);
	}

	/** Logs only the first log for a line */
	protected lastLoggedLine = -1;
	protected logIfFirst(message: string) {
		if (this.lineCounter === this.lastLoggedLine)
			return;
		this.lastLoggedLine = this.lineCounter;
		logOn && this.log(message);
	}
}
