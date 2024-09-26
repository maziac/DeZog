import {MemBuffer} from "../../misc/membuffer";
import {Chroma81Type} from "../../settings/settings";
import {UlaScreen} from "./ulascreen";
import {Z80Cpu} from "./z80cpu";
import {ZSimRemote} from "./zsimremote";
import {Zx81LoadColorization} from "./zx81loadcolorization";


const logOn = false;	// TODO: REMOVE

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
 *
 * Chroma81 details:
 * http://www.fruitcake.plus.com/Sinclair/ZX81/Chroma/Files/Documents/Chroma81_TechnicalDescription.txt
 */
export class Zx81UlaScreen extends UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// The previous state of the R-register.
	protected prevRregister = 0;

	// The state of the NMI generator
	protected stateNmiGeneratorOn = false;

	// The line 3-bit counter (0-7) to address the 8 lines of a character.
	protected ulaLineCounter = 0;

	// Counts lines independent of the ulaLineCounter. Is reset on a vsync.
	protected lineCounter = 0;

	// The tstates counter
	protected tstates = 0;

	// The number of tstates required for a horizontal scanline.
	protected static TSTATES_PER_SCANLINE = 207;

	// The number of tstates for one full screen.
	protected static TSTATES_PER_SCREEN = 65000;	// ~20ms

	// The HSYNC signal stay low for 16 tstates.
	protected static TSTATES_OF_HSYNC_LOW = 16;

	// The minimal number of tstates for a VSYNC should be ~1ms => 3250 tstates.
	// But the generated vsync by the zx81 seems to be much smaller: 1233 tstates -> ~0.38ms
	// So the about the half is used for vsync recognition.
	protected static VSYNC_MINIMAL_TSTATES = 500;

	// The tstates at which the VSYNC starts
	protected vsyncStartTstates = 0;

	// Used to generate the hsync
	protected hsyncTstatesCounter = 0;

	// Is set when an interrupt should be generated in the next cycle.
	protected int38InNextCycle = false;

	// The state of the HSYNC signal: on (low) or off (high).
	protected hsync = false;

	// The vsync signal
	protected vsync = false;

	// No display.
	protected noDisplay = false;

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
		if(chroma81.colourizationFile) {
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
		// NMI generator off?
		if ((port & 0x0003) === 1) {
			// Usually 0xFD
			this.stateNmiGeneratorOn = false;
		}
		// NMI generator on?
		else if ((port & 0x0003) === 2) {
			// Usually 0xFE
			this.stateNmiGeneratorOn = true;
		}

		// Vsync?
		this.generateVsync(false);
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
			this.generateVsync(true);
		}
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
		this.tstates += zsim.executeTstates;

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

		this.checkHsync(zsim.executeTstates);

		// No vsync/no display detection: no display if for 2*20 ms no Vsync was found
		if (this.tstates > this.vsyncStartTstates + 2 * Zx81UlaScreen.TSTATES_PER_SCREEN) {
			if (!this.noDisplay) {
				// Change to no display
				this.noDisplay = true;
				this.emit('updateScreen');
			}
		}
	}


	/** Returns the dfile.
	 * @returns The screen as dfile (UInt8Array) plus the charset.
	 * If in FAST mode no display might be available. In this case only the charset is returned.
	 * { charset: Uint8Array, dfile: Uint8Array }
	 */
	public getUlaScreen(): any {
		// Read the charset 0x1E00-0x1FFF (512 bytes)
		const memory = this.z80Cpu.memory;
		const charset = memory.readBlock(0x1E00, 512);
		// Check for available VSYNC
		if (this.noDisplay)
			return {
				name: 'zx81',
				charset
			};
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
			chroma
		};
	}

	/* For debugging only: */
	/*
	protected displayUseRomChars = false;
	protected displayUseNoColors = false;
	protected romChars = new Uint8Array([
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0xf0, 0xf0, 0xf0, 0xf0, 0x00, 0x00, 0x00, 0x00,
		0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x00, 0x00, 0x00,
		0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0xf0, 0xf0, 0xf0, 0xf0,
		0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0,
		0x0f, 0x0f, 0x0f, 0x0f, 0xf0, 0xf0, 0xf0, 0xf0,
		0xff, 0xff, 0xff, 0xff, 0xf0, 0xf0, 0xf0, 0xf0,
		0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55,
		0x00, 0x00, 0x00, 0x00, 0xaa, 0x55, 0xaa, 0x55,
		0xaa, 0x55, 0xaa, 0x55, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x24, 0x24, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x1c, 0x22, 0x78, 0x20, 0x20, 0x7e, 0x00,
		0x00, 0x08, 0x3e, 0x28, 0x3e, 0x0a, 0x3e, 0x08,
		0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x10, 0x00,
		0x00, 0x3c, 0x42, 0x04, 0x08, 0x00, 0x08, 0x00,
		0x00, 0x04, 0x08, 0x08, 0x08, 0x08, 0x04, 0x00,
		0x00, 0x20, 0x10, 0x10, 0x10, 0x10, 0x20, 0x00,
		0x00, 0x00, 0x10, 0x08, 0x04, 0x08, 0x10, 0x00,
		0x00, 0x00, 0x04, 0x08, 0x10, 0x08, 0x04, 0x00,
		0x00, 0x00, 0x00, 0x3e, 0x00, 0x3e, 0x00, 0x00,
		0x00, 0x00, 0x08, 0x08, 0x3e, 0x08, 0x08, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x14, 0x08, 0x3e, 0x08, 0x14, 0x00,
		0x00, 0x00, 0x02, 0x04, 0x08, 0x10, 0x20, 0x00,
		0x00, 0x00, 0x10, 0x00, 0x00, 0x10, 0x10, 0x20,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x08, 0x10,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00,
		0x00, 0x3c, 0x46, 0x4a, 0x52, 0x62, 0x3c, 0x00,
		0x00, 0x18, 0x28, 0x08, 0x08, 0x08, 0x3e, 0x00,
		0x00, 0x3c, 0x42, 0x02, 0x3c, 0x40, 0x7e, 0x00,
		0x00, 0x3c, 0x42, 0x0c, 0x02, 0x42, 0x3c, 0x00,
		0x00, 0x08, 0x18, 0x28, 0x48, 0x7e, 0x08, 0x00,
		0x00, 0x7e, 0x40, 0x7c, 0x02, 0x42, 0x3c, 0x00,
		0x00, 0x3c, 0x40, 0x7c, 0x42, 0x42, 0x3c, 0x00,
		0x00, 0x7e, 0x02, 0x04, 0x08, 0x10, 0x10, 0x00,
		0x00, 0x3c, 0x42, 0x3c, 0x42, 0x42, 0x3c, 0x00,
		0x00, 0x3c, 0x42, 0x42, 0x3e, 0x02, 0x3c, 0x00,
		0x00, 0x3c, 0x42, 0x42, 0x7e, 0x42, 0x42, 0x00,
		0x00, 0x7c, 0x42, 0x7c, 0x42, 0x42, 0x7c, 0x00,
		0x00, 0x3c, 0x42, 0x40, 0x40, 0x42, 0x3c, 0x00,
		0x00, 0x78, 0x44, 0x42, 0x42, 0x44, 0x78, 0x00,
		0x00, 0x7e, 0x40, 0x7c, 0x40, 0x40, 0x7e, 0x00,
		0x00, 0x7e, 0x40, 0x7c, 0x40, 0x40, 0x40, 0x00,
		0x00, 0x3c, 0x42, 0x40, 0x4e, 0x42, 0x3c, 0x00,
		0x00, 0x42, 0x42, 0x7e, 0x42, 0x42, 0x42, 0x00,
		0x00, 0x3e, 0x08, 0x08, 0x08, 0x08, 0x3e, 0x00,
		0x00, 0x02, 0x02, 0x02, 0x42, 0x42, 0x3c, 0x00,
		0x00, 0x44, 0x48, 0x70, 0x48, 0x44, 0x42, 0x00,
		0x00, 0x40, 0x40, 0x40, 0x40, 0x40, 0x7e, 0x00,
		0x00, 0x42, 0x66, 0x5a, 0x42, 0x42, 0x42, 0x00,
		0x00, 0x42, 0x62, 0x52, 0x4a, 0x46, 0x42, 0x00,
		0x00, 0x3c, 0x42, 0x42, 0x42, 0x42, 0x3c, 0x00,
		0x00, 0x7c, 0x42, 0x42, 0x7c, 0x40, 0x40, 0x00,
		0x00, 0x3c, 0x42, 0x42, 0x52, 0x4a, 0x3c, 0x00,
		0x00, 0x7c, 0x42, 0x42, 0x7c, 0x44, 0x42, 0x00,
		0x00, 0x3c, 0x40, 0x3c, 0x02, 0x42, 0x3c, 0x00,
		0x00, 0xfe, 0x10, 0x10, 0x10, 0x10, 0x10, 0x00,
		0x00, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3c, 0x00,
		0x00, 0x42, 0x42, 0x42, 0x42, 0x24, 0x18, 0x00,
		0x00, 0x42, 0x42, 0x42, 0x42, 0x5a, 0x24, 0x00,
		0x00, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x00,
		0x00, 0x82, 0x44, 0x28, 0x10, 0x10, 0x10, 0x00,
		0x00, 0x7e, 0x04, 0x08, 0x10, 0x20, 0x7e, 0x00
	]);
	*/

	/** Generate a VSYNC. Updates the display (emit).
	 * Is called by software: in-port -> vsync active, out-port -> vsync off
	 * @param on true to turn VSYNC on, false to turn it off.
	 * Note: The VSYNC is emitted only if the vsync active tiem (low)
	 * is long enough.
	 * Otherwise only the line counter is reset.
	 */
	protected generateVsync(on: boolean) {
		if (this.vsync == on)
			return;

		logOn && console.log(this.tstates, "generateVsync: " + (on ? "on (low)" : "off (high)"));

		// Vsync has changed
		if (on) {
			// VSYNC on (low)
			if (!this.stateNmiGeneratorOn) {
				logOn && console.log("  inPort A0=0: VSYNC?");
				logOn && console.log("  -> VSYNC on (low)");
				this.vsyncStartTstates = this.tstates;
				logOn && console.log(this.tstates, "  reset hsyncCounter");
				this.vsync = on;
			}
			return;
		}

		// VSYNC off (high)
		logOn && console.log(this.tstates, "vsync off:  !this.lineCounterEnabled == true");
		const lengthOfVsync = this.tstates - this.vsyncStartTstates;
		if (lengthOfVsync >= Zx81UlaScreen.VSYNC_MINIMAL_TSTATES) {
			logOn && console.log(this.tstates, "  lengthOfVsync >= VSYNC_MINIMAL_TSTATES, lengthOfVsync=" + lengthOfVsync);

			// VSYNC
			//console.log('updateScreen', Date.now());
			this.noDisplay = false;
			this.lineCounter = 0;
			this.emit('updateScreen');
			this.resetVideoBuffer();
		}
		this.vsync = on;
		this.ulaLineCounter = 0;
		this.hsyncTstatesCounter = 0;  // Normal display would be one off if this was done in the VSYNC on (low) part.
	}


	/** Generate a HSYNC.
	 * Is called every instruction. Depending on tstates it generates the HSYNC.
	 * This is the High/Low switch ^^^^^^\_/^^^
	 * After ~191 tstates the HSYNC is low for 16 tstates. In total this is
	 * 207 tstates (=64us).
	 * On this switch the line counter is incremented.
	 * During the HSYNC being low a small (undetected) VSYNC may happen
	 * that resets the line counter for hires.
	 * @param addTstates The number of tstates to add to the HSYNC tstates counter.
	 * @returns true if line counter was incremented.
	 */
	protected checkHsync(addTstates: number): boolean {
		this.hsyncTstatesCounter += addTstates;

		// Check for HSYNC on or off
		if (this.hsync) {
			// HSYNC is on, check for off
			if (this.hsyncTstatesCounter < Zx81UlaScreen.TSTATES_PER_SCANLINE)
				return false;	// No HSYNC on yet
			// HSYNC off
			this.hsyncTstatesCounter %= Zx81UlaScreen.TSTATES_PER_SCANLINE;
			this.hsync = false;
			logOn && console.log(this.hsyncTstatesCounter, "HSYNC off (high)");
			// Increase line counter
			this.ulaLineCounter = (this.ulaLineCounter + 1) & 0x07;
			this.lineCounter++;
			return true;
		}

		// HSYNC is off, check for on
		if (this.hsyncTstatesCounter < Zx81UlaScreen.TSTATES_PER_SCANLINE - Zx81UlaScreen.TSTATES_OF_HSYNC_LOW)
			return false;	// No HSYNC on yet

		// HSYNC on
		// Generate NMI on every HSYNC (if NMI generator is on)
		if (this.stateNmiGeneratorOn) {
			this.z80Cpu.interrupt(true, 0);	// NMI
		}

		this.hsync = true;
		logOn && console.log(this.hsyncTstatesCounter, "HSYNC on (low)");
		return false;
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
		// Write data
		memBuffer.write8(this.prevRregister);
		memBuffer.writeBoolean(this.stateNmiGeneratorOn);
		memBuffer.writeNumber(this.ulaLineCounter);
		memBuffer.writeNumber(this.tstates);
		memBuffer.writeNumber(this.vsyncStartTstates);
		memBuffer.writeNumber(this.hsyncTstatesCounter);
		memBuffer.writeBoolean(this.int38InNextCycle);
		memBuffer.writeBoolean(this.hsync);
		memBuffer.writeBoolean(this.vsync);
		memBuffer.writeBoolean(this.noDisplay);
		memBuffer.write8(this.borderColor);
		memBuffer.write8(this.chroma81Mode);
		memBuffer.writeBoolean(this.chroma81Enabled);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read data
		this.prevRregister = memBuffer.read8();
		this.stateNmiGeneratorOn = memBuffer.readBoolean();
		this.ulaLineCounter = memBuffer.readNumber();
		this.tstates = memBuffer.readNumber();
		this.vsyncStartTstates = memBuffer.readNumber();
		this.hsyncTstatesCounter = memBuffer.readNumber();
		this.int38InNextCycle = memBuffer.readBoolean();
		this.hsync = memBuffer.readBoolean();
		this.vsync = memBuffer.readBoolean();
		this.noDisplay = memBuffer.readBoolean();
		this.borderColor = memBuffer.read8();
		this.chroma81Mode = memBuffer.read8();
		this.chroma81Enabled = memBuffer.readBoolean();
	}
}
