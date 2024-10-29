import {MemBuffer, Serializable} from "../../misc/membuffer";
import {UlaScreen} from "./ulascreen";
import {Z80Cpu} from "./z80cpu";
import {ZSimRemote} from "./zsimremote";


/** Holds the bank used for the ZX Spectrum ULA screen and does the bank switching.
 */
export class SpectrumUlaScreen extends UlaScreen implements Serializable {
	// The vsync time of the ULA.
	protected static VSYNC_TIME = 0.020;	// 20ms

	// The time counter for the vertical sync.
	protected vsyncTimeCounter: number;

	// Time used for flashing.
	protected flashTimeCounter: number;

	// The bank used to show. ZX16K/48K bank 1. Others: (i.e. ZX128K) bank 5 or 7.
	public currentUlaBank: number;

	// The "normal" ula bank (e.g. bank 5)
	protected normalUlaBank: number;

	// The "shadow" ula bank (e.g. bank 7)
	protected shadowUlaBank: number;


	/** Constructor.
	 * @param memoryModel The used memory model.
	 * @param ports The Z80 ports.
	 * @param vertInterruptFunc A function that is called on a vertical interrupt.
	 * Can be used by the caller to sync the display.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super(z80Cpu);
		this.vsyncTimeCounter = 0;
		this.flashTimeCounter = 0;
		// Set ULA bank(s) depending on available banks
		const bankCount = z80Cpu.memory.getNumberOfBanks();
		if (bankCount > 7) {
			// ZX128K, i.e. bank 5 and 7 are used
			this.normalUlaBank = 5;
			this.shadowUlaBank = 7;
			// Check for ZXNext
			if (z80Cpu.memory.getSlots().length === 8) {
				this.normalUlaBank *= 2;
				this.shadowUlaBank *= 2;
			}
			// Use ZX128K ULA Bank switching.
			this.currentUlaBank = this.normalUlaBank;
			z80Cpu.ports.registerGenericOutPortFunction((port, value) => {
				this.outPortBorderColor(port, value);
				this.outPortZx128UlaScreenSwitch(port, value);
			});
		}
		else if (bankCount > 1) {
			// Otherwise assume ZX16/48K with bank 1
			this.currentUlaBank = 1;
		}
		else {
			// Only one bank
			throw Error("ulaScreen is not available with the memory model.");
		}
	}


	/** Switches the ula screen.
	 * Note: Switching the bank is done already by the SimulatedMemory.
	 * See https://www.worldofspectrum.org/faq/reference/128kreference.htm
	 * @param port The written port.
	 * @param value:
	 *   bit 0-2:  RAM page (0-7) to map into memory at 0xC000.
	 *   bit 3: Select normal(0) or shadow(1) screen to be displayed. The normal screen is in bank 5, whilst the shadow screen is in bank 7. Note that this does not affect the memory between 0x4000 and 0x7fff, which is always bank 5.
	 *   bit 4: ROM select. ROM 0 is the 128k editor and menu system; ROM 1 contains 48K BASIC.
	 *   bit 5: If set, memory paging will be disabled and further output to this port will be ignored until the computer is reset.
	 */
	public outPortZx128UlaScreenSwitch(port: number, value: number) {
		// Check bit 1 and bit 15 being 0 (partially decoding)
		if ((port & 0b1000_0000_0000_0010) === 0) {
			// bit 3: Select normal(0) or shadow(1) screen to be displayed.
			const useShadowBank = ((value & 0b01000) != 0);
			this.currentUlaBank = (useShadowBank) ? this.shadowUlaBank : this.normalUlaBank;
		}
	}


	/** Port function to set the border color.
	 */
	public outPortBorderColor(port: number, value: number) {
		// Check bit 1 and bit 15 being 0 (partially decoding)
		if ((port & 0x01) === 0) {
			this.borderColor = value & 0x07;
		}
	}


	/** Executes the ULA. The ZX81 ULA may grab tstates from
	 * the CPU to simulate the NMI interrupt.
	 * @Uses zsim.executeTstates The number of t-states.
	 */
	public execute(zsim: ZSimRemote) {
		// Check for vertical interrupt
		const timeAdd = zsim.executeTstates / zsim.z80Cpu.cpuFreq;
		this.flashTimeCounter += timeAdd;
		this.vsyncTimeCounter += timeAdd;
		if (this.vsyncTimeCounter >= SpectrumUlaScreen.VSYNC_TIME) {
			this.vsyncTimeCounter %= SpectrumUlaScreen.VSYNC_TIME;
			// Generate interrupt
			this.z80Cpu.interrupt(false, 0);
			this.emit('updateScreen');
		}
	}


	/** Returns the ULA screen with color attributes.
	 * @returns The screen as a UInt8Array plus the time for the flashing.
	 */
	public getUlaScreen(): any {
		const bank = this.z80Cpu.memory.getBankMemory(this.currentUlaBank);
		const screenData = {
			name: 'spectrum',
			time: this.flashTimeCounter,
			data: bank.slice(0, 0x1B00),
			borderColor: this.borderColor
		};
		return screenData;
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write slot/bank mapping
		memBuffer.writeNumber(this.vsyncTimeCounter);
		memBuffer.writeNumber(this.currentUlaBank);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Write last t-states
		this.vsyncTimeCounter = memBuffer.readNumber();
		this.currentUlaBank = memBuffer.readNumber();
	}
}
