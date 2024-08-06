
import {MemBuffer} from "../../misc/membuffer";
import {SimulatedMemory} from "./simulatedmemory";
import {Z80Ports} from "./z80ports";
import {Zx81UlaScreen} from "./zx81ulascreen";


/** Holds the bank used for the ZX Spectrum ULA screen and does the bank switching.
 */
export class SpectrumUlaScreen extends Zx81UlaScreen {
	// The vsync time window of the ULA. If missed, the interrupt
	// function will not be called.
	protected static VSYNC_TIME_WINDOW = 30 / 3500000;	// 20ms

	// The bank used to show. ZX16K/48K bank 1. Others: (i.e. ZX128K) bank 5 or 7.
	public currentUlaBank: number;

	// The "normal" ula bank (e.g. bank 5)
	protected normalUlaBank: number;

	// The "shadow" ula bank (e.g. bank 7)
	protected shadowUlaBank: number;

	// For debug measuring the time between two vertical interrupts.
	//protected lastIntTime: number = 0;


	/** Constructor.
	 * @param memoryModel The used memory model.
	 * @param ports The Z80 ports.
	 * @param vertInterruptFunc A function that is called on a vertical interrupt.
	 * Can be used by the caller to sync the display.
	 */
	constructor(memory: SimulatedMemory, ports: Z80Ports, vertInterruptFunc = () => {}) {
		super(memory, ports, vertInterruptFunc);
		// Set ULA bank(s) depending on available banks
		const bankCount = memory.getNumberOfBanks();
		if (bankCount > 7) {
			// ZX128K, i.e. bank 5 and 7 are used
			this.normalUlaBank = 5;
			this.shadowUlaBank = 7;
			// Check for ZXNext
			if (bankCount > 8) {
				this.normalUlaBank *= 2;
				this.shadowUlaBank *= 2;
			}

			// Use ZX128K ULA Bank switching.
			this.currentUlaBank = this.normalUlaBank;
			ports.registerGenericOutPortFunction(this.zx128UlaScreenSwitch.bind(this));
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
	public zx128UlaScreenSwitch(port: number, value: number) {
		// Check bit 1 and bit 15 being 0 (partially decoding)
		if ((port & 0b1000_0000_0000_0010) == 0) {
			// bit 3: Select normal(0) or shadow(1) screen to be displayed.
			const useShadowBank = ((value & 0b01000) != 0);
			this.currentUlaBank = (useShadowBank) ? this.shadowUlaBank : this.normalUlaBank;
		}
	}


	/** Executes the ULA. The ZX Spectrum ULA simulation does
	 * not do much. It is only generating the vertical interrupt
	 * when needed.
	 * @param cpuFreq The CPU frequency in Hz.
	 * @param currentTstates The t-states that were just used by
	 * DMA or CPU.
	 * @returns 0 (Occupies 0 t-states)
	 */
	public execute(cpuFreq: number, currentTstates: number): number {
		// Check for vertical interrupt
		this.time += currentTstates / cpuFreq;
		if (this.time >= Zx81UlaScreen.VSYNC_TIME) {
			this.vertInterruptFunc();
			this.time %= Zx81UlaScreen.VSYNC_TIME;
			// Measure time
			// const timeInMs = Date.now();
			// const timeDiff = timeInMs - this.lastIntTime;
			// console.log("VSYNC: " + timeDiff + "ms");
			// this.lastIntTime = timeInMs;
		}
		return 0;
	}



	/** Returns the ULA screen with color attributes.
	 * @returns The screen as a UInt8Array.
	 */
	public getUlaScreen(): Uint8Array {
		const bank = this.memory.getBankMemory(this.currentUlaBank);
		return bank.slice(0, 0x1B00);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		super.serialize(memBuffer);
		// Write slot/bank mapping
		memBuffer.writeNumber(this.currentUlaBank);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		super.deserialize(memBuffer);
		// Write last t-states
		this.currentUlaBank = memBuffer.readNumber();
	}
}