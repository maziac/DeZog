
import {Serializable, MemBuffer} from "../../misc/membuffer";
import {MemoryModel} from "../MemoryModel/memorymodel";
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from "../MemoryModel/zxnextmemorymodels";
import {Z80Ports} from "./z80ports";


/**
 * Holds the bank used for the ULA screen and does the bank switching.
 */
export class ZxUlaScreen implements Serializable {
	// The vsync time of the ULA.
	protected static VSYNC_TIME = 0.020;	// 20ms

	// The vsync time window of the ULA. If missed, the interrupt
	// function will not be called.
	protected static VSYNC_TIME_WINDOW = 30 / 3500000;	// 20ms

	// The bank used to show. ZX16K/48K bank 1. Others: (i.e. ZX128K) bank 5 or 7.
	public currentUlaBank: number;

	// The "normal" ula bank (e.g. bank 5)
	protected normalUlaBank: number;

	// The "shadow" ula bank (e.g. bank 7)
	protected shadowUlaBank: number;

	// The time since the last vertical interrupt.
	protected time: number;

	// A function that is called when the vertical interrupt is generated.
	protected vertInterruptFunc: () => void;

	// For debug measuring the time between two vertical interrupts.
	//protected lastIntTime: number = 0;


	/** Constructor.
	 * @param memory The Z80 memory.
	 * @param ports The Z80 ports.
	 * @param vertInterruptFunc An optional function that is called on a vertical interrupt.
	 * Can be used by the caller to sync the display.
	 */
	constructor(memoryModel: MemoryModel, ports: Z80Ports, vertInterruptFunc = () => {}) {
		this.time = 0;
		this.vertInterruptFunc = vertInterruptFunc;
		// Set ULA bank(s) depending on available banks
		const bankCount = memoryModel.banks.length;
		if (bankCount > 7) {
			// ZX128K, i.e. bank 5 and 7 are used
			this.normalUlaBank = 5;
			this.shadowUlaBank = 7;
			// Check for ZXNext
			if (memoryModel instanceof MemoryModelZxNextOneROM || memoryModel instanceof MemoryModelZxNextTwoRom) {
				this.normalUlaBank *= 2;
				this.shadowUlaBank *= 2;
			}

			// Use ZX128K ULA Bank switching.
			this.currentUlaBank = this.normalUlaBank;
			ports.registerGenericOutPortFunction(this.zx128UlaScreenSwitch.bind(this));
		}
		else if (bankCount > 1) {
			// ZX16/48: use bank 1
			this.currentUlaBank = 1;
		}
		else {
			// Only one bank
			throw Error("ulaScreen is not available with memory model '" + memoryModel.name + "'.");
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


	/** The ULA screen calls the vertInterruptFunc whenever
	 * 20ms have passed.
	 * @param addTime The passed time in ms since last call.
	 */
	public passedTime(addTime: number) {
		this.time += addTime;
		// Check for vertical interrupt
		if (this.time >= ZxUlaScreen.VSYNC_TIME) {
			this.time %= ZxUlaScreen.VSYNC_TIME;
			// Check if within the time window
			if(this.time <= ZxUlaScreen.VSYNC_TIME_WINDOW)
				this.vertInterruptFunc();
			// Measure time
			// const timeInMs = Date.now();
			// const timeDiff = timeInMs - this.lastIntTime;
			// console.log("VSYNC: " + timeDiff + "ms");
			// this.lastIntTime = timeInMs;
		}
	}


	/**
	 * Serializes the object.
	 * Basically the last beeper value.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write slot/bank mapping
		memBuffer.writeNumber(this.currentUlaBank);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Write last t-states
		this.currentUlaBank = memBuffer.readNumber();
	}
}
