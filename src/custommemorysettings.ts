import { CustomMemoryBankInfo, CustomMemoryMmuInfo, CustomMemorySlot as settings_CustomMemorySlot, CustomMemoryType, HexNumber } from './settings';
import { Utility } from './misc/utility';
import * as path from 'path';
import * as fs from 'fs';
import { BankType } from './remotes/zsimulator/simmemory';

const toNumber = (hex: HexNumber): number => {
	return typeof hex === "string" ? Utility.parseValue(hex) : hex;
};

const readHexFromFile = (filePath: string): Uint8Array => {
	const { data }: { data: Buffer } = require("intel-hex").parse(fs.readFileSync(filePath));
	return new Uint8Array(data);
}

const readRomFile = (filePath: string): Uint8Array => {
	switch (path.extname(filePath).toLowerCase()) {
	case ".hex":
		return readHexFromFile(filePath);
	case ".bin":
	case ".rom":
		const romBuffer = fs.readFileSync(filePath);
		return new Uint8Array(romBuffer.buffer);
	default:
		throw new Error(`Unknown ROM extension file: ${filePath}`);
	}
}

export interface CustomMemorySlotBankInfo extends Omit<CustomMemoryBankInfo, "ioMmu"> {
	/**
	 * Decodes the current I/O write operation. If port matches the mask (full 16-bit address bus),
	 * use the data bus value to calculate the raw bank number.
	 * If port mask doesn't match, return negative value.
	 */
	mmuHandler?: ((ioPort: number, dataValue: number) => number)
};

export interface CustomMemorySlot {
	// First address
	begin: number;
	// Slot size
	size: number;
	// RAM, ROM or not populated
	type: BankType;
	// decoded ROM image
	rom?: Uint8Array;
	// decoded ROM offset
	romOffset?: number;
	// Id of the first bank ID in the uniform slot system
	firstBankIdx: number;
	// Id of the first slot ID in the uniform slot system
	firstSlotIdx: number;
	// Slot name
	name?: string;
	// Bank information
	bankInfo: CustomMemorySlotBankInfo;
}

export interface CustomMemorySettings {
	uniformSlotSize: number;
	uniformBankCount: number;
	unusedBankIdx: number;

	slots: CustomMemorySlot[];
}

/**
 * Return the MMU handler
 */
const getMmuHandler = (mmu: CustomMemoryMmuInfo): ((ioPort: number, dataValue: number) => number) => {
	const decodeBankBits = (byte: number, dataBits: number[]): number => {
		let ret = 0;
		for (let b = 0, val = 1; b < dataBits.length; b++, val <<= 1) {
			const mask = 1 << dataBits[b];
			if (byte & mask) {
				ret += val;
			}
		}
		return ret;
	};

	let match: number;
	let mask: number = 0xffff;
	if (typeof mmu.port === "number" || typeof mmu.port === "string") {
		match = toNumber(mmu.port);
	} else {
		match = toNumber(mmu.port.match);
		mask = toNumber(mmu.port.mask);
	}
	return (port, value) => {
		if ((port & mask) === match) {
			// Address decoded. Now decode the data bus bits
			return decodeBankBits(value, mmu.dataBits);
		} else {
			return -1;
		}
	};
}

export const toCustomMemorySettings = (memType: CustomMemoryType): CustomMemorySettings => {
	interface SlotInfo extends Omit<settings_CustomMemorySlot, "range"> {
		// First address
		begin: number;
		// Last address
		end: number;
		// Size in bytes
		size: number;
		// RAM, ROM or not populated
		type: BankType;
		// decoded ROM image
		rom?: Uint8Array;
		// Id of the first bank ID in the uniform page
		firstBankIdx?: number;
		// Id of the first slot ID in the uniform slot system
		firstSlotIdx?: number;
		// Bank information
		bankInfo: CustomMemoryBankInfo
	}

	// Expand properties of the slot info, decoding the input
	let slots: SlotInfo[] = memType.map((slot, i) => {
		const begin = toNumber(slot.range[0]);
		const end = toNumber(slot.range[1]);
		const size = end - begin + 1;

		Utility.assert((size % 1024) === 0, `Slot ${i} size not multiple of 1K`);
		Utility.assert(begin >= 0 && end < 0x10000, "Slot out of 16-bit addressing space");

		let rom = slot.rom;
		if (typeof slot.rom === "string") {
			rom = readRomFile(slot.rom);
		}
		const bankInfo: CustomMemorySlotBankInfo = slot.banked || { count: 1 };
		if (slot.banked && slot.banked.ioMmu) {
			// MMU controlled by single I/O port
			bankInfo.mmuHandler = getMmuHandler(slot.banked.ioMmu);
		}
		return {
			...slot,
			begin,
			end,
			size,
			name: slot.name,
			type: rom ? BankType.ROM : BankType.RAM,
			bankInfo,
			rom: rom as Uint8Array,
			romOffset: toNumber(slot.romOffset || 0),
		};
	});

	// Check overlapping and fill the not populated spaces
	slots = slots.reduce((list, slot, i) => {
		list.push(slot);
		if (i > 0) {
			Utility.assert(slot.begin > slots[i - 1].end, `Slots ${i - 1} and ${i} are overlapping or out-of order`);
		}
		if (i < slots.length - 1) {
			Utility.assert(slot.end < slots[i + 1].begin, `Slots ${i} and ${i + 1} are overlapping or out-of order`);
			if (slot.end + 1 < slots[i + 1].begin) {
				// Fill unpopulated slot with a gap
				list.push({
					begin: slot.end + 1,
					end: slots[i + 1].begin - 1,
					type: BankType.UNUSED,
					size: slots[i + 1].begin - slot.end - 1,
					bankInfo: { count: 1 }
				});
			}
		} else {
			if (slot.end < 0xffff) {
				// Fill unpopulated slot
				list.push({
					begin: slot.end + 1,
					end: 0xffff,
					type: BankType.UNUSED,
					size: 0x10000 - slot.end - 1,
					bankInfo: { count: 1 }
				});
			}
		}
		return list;
	}, [] as SlotInfo[]);

	// Calc minimum uniform slot count
	const uniformSlotSize = Math.min(...slots.map(slot => slot.size));

	// Calc total bank count (in uniform slot size)
	let bankCounter = 0;
	let slotCounter = 0;
	let unusedBankIdx = -1;
	slots.forEach(slot => {
		const uniformSlotCount = slot.size / uniformSlotSize;
		slot.firstSlotIdx = slotCounter;
		slotCounter += uniformSlotCount;

		if (slot.type !== BankType.UNUSED) {
			slot.firstBankIdx = bankCounter;
			bankCounter += uniformSlotCount * slot.bankInfo.count;
		} else {
			if (unusedBankIdx < 0) {
				unusedBankIdx = bankCounter;
				bankCounter++;
			}
			slot.firstBankIdx = unusedBankIdx;
		}
	});

	return {
		slots: slots as CustomMemorySlot[],
		uniformSlotSize,
		uniformBankCount: bankCounter,
		unusedBankIdx,
	};
}
