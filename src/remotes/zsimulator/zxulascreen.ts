
import {Serializable, MemBuffer} from "../../misc/membuffer";
import {MemoryModel} from "../MemoryModel/memorymodel";
import {MemoryModelZxNext} from "../MemoryModel/predefinedmemorymodels";
import {Z80Ports} from "./z80ports";


/**
 * Holds the bank used for the ULA screen and does the bank switching.
 */
export class ZxUlaScreen implements Serializable {
	// The bank used to show. ZX16K/48K bank 1. Others: (i.e. ZX128K) bank 5 or 7.
	public currentUlaBank: number;

	// The "normal" ula bank (e.g. bank 5)
	protected normalUlaBank: number;

	// The "shadow" ula bank (e.g. bank 7)
	protected shadowUlaBank: number;


	/**
	 * Constructor.
	 */
	constructor(memoryModel: MemoryModel, ports: Z80Ports) {
		// Set ULA bank(s) depending on available banks
		const bankCount = memoryModel.banks.length;
		if (bankCount > 7) {
			// ZX128K, i.e. bank 5 and 7 are used
			this.normalUlaBank = 5;
			this.shadowUlaBank = 7;
			// Check for ZXNext
			if (memoryModel instanceof MemoryModelZxNext) {
				this.normalUlaBank *= 2;
				this.shadowUlaBank *= 2;
			}

			// Use ZX128K ULA Bank switching.
			this.currentUlaBank = this.normalUlaBank;
			ports.registerSpecificOutPortFunction(0x7FFD, this.zx128UlaScreenSwitch.bind(this));	// TODO: use generic function. In fact this is not a specific address but a bit mask for the port.
		}
		else if (bankCount > 1) {
			// ZX16/48: use bank 1
			this.currentUlaBank = 1;
		}
		else {
			// Only one bank
			throw Error("ulaScreen is not available with memory model '" + memoryModel + "'.");
		}
	}


	/**
	 * Switches the ula screen.
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
		// bit 3: Select normal(0) or shadow(1) screen to be displayed.
		const useShadowBank = ((value & 0b01000) != 0);
		this.currentUlaBank = (useShadowBank) ? this.shadowUlaBank : this.normalUlaBank;
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer = new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size = memBuffer.getSize();
		return size;
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
