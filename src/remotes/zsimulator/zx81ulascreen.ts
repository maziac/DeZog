
import {MemBuffer, Serializable} from "../../misc/membuffer";
import {UlaScreen} from "./ulascreen";
import {Z80Cpu} from "./z80cpu";


/** Handles the ZX81 ULA screen.
 * Listen to ports and creates the nmi and the 0x0038 interrupts.
 * The display itself is simulated (i.e. the display contents would be
 * created by the CPU, but is not used).
 * In FAST mode there is display only if waiting for a key press.
 * Then the display is generated but without the NMI.
 * If no display is generated the getUlaScreen() returns an empty array.
 *
 * For details of the zx81 ULA display see:
 * https://k1.spdns.de/Vintage/Sinclair/80/Sinclair%20ZX80/Tech%20specs/Wilf%20Rigter%27s%20ZX81%20Video%20Display%20Info.htm
 * or
 * https://8bit-museum.de/heimcomputer-2/sinclair/sinclair-scans/scans-zx81-video-display-system/
 * For details of the ULA HW and signals see:
 * https://oldcomputer.info/8bit/zx81/ULA/ula.htm
 *
 * Note: HSYNC is not required and not generated.
 */
export class Zx81UlaScreen extends UlaScreen implements Serializable {
	// The NMI interval of the ULA.
	protected static NMI_TIME = 0.000064;	// 64us

	// The time counter for the NMI signal.
	protected timeCounter: number;

	// The previous state of the R-register.
	protected prevRregister: number = 0;

	// The state of the NMI generator
	protected stateNmiGeneratorOn: boolean = false;

	// The vsync signal
	protected vsync: boolean = false;

	// No display.
	protected noDisplay: boolean = false;

	// If in FAST mode or SLOW mode.
	// Note: is detected but not used anywhere.
	public fastMode: boolean = false;

	// Used to check if in FAST mode or SLOW mode.
	protected nmiGeneratorAccessed: boolean = false;

	// The original memory read function.
	protected memoryRead8: (addr64k: number) => number;

	// Required for the R-register.
	protected z80Cpu: Z80Cpu;

	//protected logTimeCounter: number = 0;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);
		this.z80Cpu = z80Cpu;
		this.timeCounter = 0;

		// Register ULA ports
		z80Cpu.ports.registerGenericOutPortFunction(this.outPorts.bind(this));
		z80Cpu.ports.registerGenericInPortFunction(this.inPort.bind(this));

		// m1read8 (opcode fetch) is modified to emulate the ZX81 ULA.
		this.memoryRead8 = z80Cpu.memory.read8.bind(z80Cpu.memory);
		z80Cpu.memory.m1Read8 = this.ulaM1Read8.bind(this);
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
			this.timeCounter = 0;
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
			this.timeCounter = 0;
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
			//console.log(this.logTimeCounter, "zx81 ULA: IN VSYNC On ********");
		}
		return undefined;
	}


	/** Intercepts reading from the memory.
	 * For everything where A15 is set and data bit 6 is low, NOPs are returned.
	 * When data bit 6 is set it is expected to be the HALT instruction.
	 * Additionally it can generate an 0x38h (Mode 1 interrupt) when the
	 * R-register's bit 6 is going low.
	 */
	public ulaM1Read8(addr64k: number): number {
		// Read data from memory
		const data = this.memoryRead8(addr64k & 0x7FFF);
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
		this.timeCounter += timeAdd;
		//this.logTimeCounter += timeAdd * 1000;

		// Check for "no display", i.e. no vsync
		if (this.timeCounter >= UlaScreen.VSYNC_TIME) {
			// No VSYNC -> No display
			// if (!this.noDisplay)
			// 	console.log(this.logTimeCounter, "zx81 ULA: No VSYNC -> No display = true");
			this.noDisplay = true;
			this.timeCounter = 0;
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
			if (this.timeCounter >= Zx81UlaScreen.NMI_TIME) {
				// NMI interrupt
				//console.log("zx81 ULA: NMI interrupt");
				this.z80Cpu.interrupt(true, 0);
				// Next
				this.timeCounter %= Zx81UlaScreen.NMI_TIME;
			}
		}
	}


	/** Returns the dfile.
	 * @returns The dfile as a UInt8Array.
	 * If in FAST mode no display might be available.
	 * Then, an array with the length 0 is returned.
	 */
	public getUlaScreen(): Uint8Array {
		// Check for available VSYNC
		if (this.noDisplay)
			return Uint8Array.from([]);
		// Get the content of the D_FILE system variable (2 bytes).
		const dfile_ptr = this.z80Cpu.memory.getMemory16(0x400c);
		// 24 lines of 33 bytes (could be less).
		return this.z80Cpu.memory.readBlock(dfile_ptr, 33 * 24);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write data
		memBuffer.writeNumber(this.timeCounter);
		memBuffer.write8(this.prevRregister);
		memBuffer.writeBoolean(this.stateNmiGeneratorOn);
		memBuffer.writeBoolean(this.vsync);
		memBuffer.writeBoolean(this.noDisplay);
		memBuffer.writeBoolean(this.fastMode);
		memBuffer.writeBoolean(this.nmiGeneratorAccessed);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read data
		this.timeCounter = memBuffer.readNumber();
		this.prevRregister = memBuffer.read8();
		this.stateNmiGeneratorOn = memBuffer.readBoolean();
		this.vsync = memBuffer.readBoolean();
		this.noDisplay = memBuffer.readBoolean();
		this.fastMode = memBuffer.readBoolean();
		this.nmiGeneratorAccessed = memBuffer.readBoolean();
	}
}
