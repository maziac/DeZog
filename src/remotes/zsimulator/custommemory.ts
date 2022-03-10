import { BankType, SimulatedMemory } from './simmemory';
import { Z80Ports } from './z80ports';
import { CustomMemorySettings } from '../../custommemorysettings';
import { Utility } from '../../misc/utility';

export class CustomMemory extends SimulatedMemory {
	constructor(info: CustomMemorySettings, private readonly ports: Z80Ports) {
		super(0x10000 / info.uniformSlotSize, info.uniformBankCount);

		// Add a bank for the non-populated bank,
		if (info.unusedBankIdx >= 0) {
			// read as 0xFF (floating bus) and non-writable
			this.bankTypes[info.unusedBankIdx] = BankType.UNUSED;
			this.fillBank(info.unusedBankIdx, 0xFF);
		}

		info.slots.forEach(slot => {
			const sizeInPages = slot.size / info.uniformSlotSize;
			const bankCount = sizeInPages * slot.bankInfo.count;
			if (slot.rom) {
				const offset = slot.romOffset || 0;
				for (let i = 0; i < bankCount; i++) {
					this.readRomToBank(slot.rom, slot.firstBankIdx + i, info.uniformSlotSize * i + offset);
				}
			}

			const portMaskDecoder = slot.bankInfo && slot.bankInfo.mmuHandler;
			if (portMaskDecoder) {
				this.ports.registerGenericOutPortFunction((port, value) => {
					const portValue = portMaskDecoder(port, value);
					if (portValue >= 0) {
						const firstBankOfGroup = portValue * sizeInPages;
						for (let i = 0; i < sizeInPages; i++) {
							this.setSlot(slot.firstSlotIdx + i, slot.firstBankIdx + firstBankOfGroup + i);
						}
					}
				});
			}
		});
	}

	/**
	 * Read a binary file as ROM data to a specific bank.
	 * Supports raw format (.bin and .rom extensions) and I8HEX format (.hex extension)
	 */
	private readRomToBank(data: Uint8Array, bankId: number, offset: number) {
		this.bankTypes[bankId] = BankType.ROM;
		Utility.assert(data.length >= offset + this.bankSize, `ROM data length error`);
		this.writeBank(bankId, data);
	}
}
