
import {MemBuffer} from "../../misc/membuffer";
import {UlaScreen} from "./ulascreen";
import {Z80Cpu} from "./z80cpu";


/** Handles the ZX81 ULA screen.
 * Listen to ports and creates the nmi and the 0x0038 interrupts.
 * The display itself is simulated (i.e. the display contents would be
 * created by the CPU, but is not used).
 * For details of the zx81 ULA display see:
 * https://k1.spdns.de/Vintage/Sinclair/80/Sinclair%20ZX80/Tech%20specs/Wilf%20Rigter%27s%20ZX81%20Video%20Display%20Info.htm
 * or
 * https://8bit-museum.de/heimcomputer-2/sinclair/sinclair-scans/scans-zx81-video-display-system/
 * Note: HSYNC is not generated.
 */
export class Zx81UlaScreen extends UlaScreen {
	// The NMI interval of the ULA.
	protected static NMI_TIME = 0.000064;	// 64us

	// The time counter for the NMI signal.
	protected nmiTimeCounter: number;

	// The previous state of the R-register.
	protected prevRregister: number = 0;

	// The state of the NMI generator
	protected stateNmiGeneratorOn: boolean = false;

	// The state of the HSYNC generator
	//protected stateHsyncGeneratorOn: boolean = false;

	// The original memory read function.
	protected memoryRead8: (addr64k: number) => number;

	// Required for the R-register.
	protected z80Cpu: Z80Cpu;


	/** Constructor.
	 * @param z80Cpu Mainly for the memoryModel and the ports.
	 * @param vertInterruptFunc A function that is called on a vertical interrupt.
	 * Can be used by the caller to sync the display.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);
		this.z80Cpu = z80Cpu;
		this.nmiTimeCounter = 0;

		// Register ULA ports
		z80Cpu.ports.registerGenericOutPortFunction(this.outPorts.bind(this));
		//z80Cpu.ports.registerGenericInPortFunction(this.inPort.bind(this));

		// m1read8 (opcode fetch) is modified to emulate the ZX81 ULA.
		this.memoryRead8 = z80Cpu.memory.read8.bind(z80Cpu.memory);
		z80Cpu.memory.m1Read8 = this.ulaM1Read8.bind(this);
	}


	/** Handles the ULA out ports.
	 * 1. out (0xfd),a - turns NMI generator off
	 * 2. out (0xfe),a - turns NMI generator on
	 * (3. in a,(0xfe) - turns HSYNC generator off (if NMI is off))
	 * 4. out (0xff),a - turns HSYNC generator on
	 * Note: the value of a is not ignored.
	 */
	protected outPorts(port: number, _data: number): void {
		// Partial decoding
		port &= 0xff;
		// Check for address line A0 = LOW
		if ((port & 0x01) === 0) {
			// Start VSYNC signal
			this.emit('VSYNC');
		}
		// NMI generator off?
		if (port === 0xfd) {
			// Yes
			this.stateNmiGeneratorOn = false;
			//console.log("zx81 ULA: NMI generator off");
		}
		// NMI generator on?
		else if (port === 0xfe) {
			// Yes
			this.stateNmiGeneratorOn = true;
			this.nmiTimeCounter = 0;
			//console.log("zx81 ULA: NMI generator on");
		}
		// // HSYNC on?
		// else if (port === 0xff) {
		// 	// Yes
		// 	this.stateHsyncGeneratorOn = true;
		// 	// Would also stop the VSYNC signal
		// }
	}


	/** Handles the ULA in port.
	 * 1. ...
	 * 2. ...
	 * 3. in a,(0xfe) - turns HSYNC generator off (if NMI is off)
	 *    and starts the vertical sync (VSYNC) signal.
	 * 4. ...
	 */
	/* inPort is not required, as HSYNC is not used.
	protected inPort(port: number): number | undefined {
		// HSYNC off?
		if (port === 0xfe) {
			// Yes
			this.stateHsyncGeneratorOn = false;
		}
		return undefined;
	}
	*/


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
		this.nmiTimeCounter += timeAdd;

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
			if (this.nmiTimeCounter >= Zx81UlaScreen.NMI_TIME) {
				// NMI interrupt
				//console.log("zx81 ULA: NMI interrupt");
				this.z80Cpu.interrupt(true, 0);
				// Next
				this.nmiTimeCounter %= Zx81UlaScreen.NMI_TIME;
			}
		}

		// At the end the normal vsync behavior
		super.execute(cpuFreq, currentTstates);
	}


	/** Returns the dfile.
	 * @returns The dfile as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		// Get the content of the D_FILE system variable (2 bytes).
		const dfile_ptr = this.z80Cpu.memory.getMemory16(0x400c);
		// 24 lines of 33 bytes (could be less).
		return this.z80Cpu.memory.readBlock(dfile_ptr, 33 * 24);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		super.serialize(memBuffer);
		// Write data
		memBuffer.writeNumber(this.nmiTimeCounter);
		memBuffer.write8(this.prevRregister);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		super.deserialize(memBuffer);
		// Read data
		this.nmiTimeCounter = memBuffer.readNumber();
		this.prevRregister = memBuffer.read8();
	}
}
