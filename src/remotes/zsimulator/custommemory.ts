import { BankType, SimulatedMemory } from './simmemory';
import { MemoryBank, MemoryModel } from '../Paging/memorymodel';
import { HexNumber, CustomMemoryType, ZSimCustomMemorySlot } from '../../settings';
import { Utility } from '../../misc/utility';
import { Z80Ports } from './z80ports';
import * as path from 'path';
import * as fs from 'fs';

const toNumber = (hex: HexNumber): number => {
	return Utility.parseValue(hex.toString());
};

interface SlotInfo extends Omit<ZSimCustomMemorySlot, "range"> {
	begin: number;
	end: number;
	size: number;
	sizeInPages: number;
	populated?: boolean;
	bankCount: number;
	firstBank: number;
}

export interface SlottedMemoryInfo {
	bankSize: number;
	bankCount: number;
	slots: SlotInfo[];
	slotSize: number;
	notPopulatedBank: number;
}

export const toSlottedMemory = (memModel: CustomMemoryType): SlottedMemoryInfo => {
	let slots: SlotInfo[] = memModel.map(slot => {
		const begin = toNumber(slot.range[0]);
		const end = toNumber(slot.range[1]);
		const size = end - begin + 1;
		return {
			rom: slot.rom,
			romOffset: slot.romOffset,
			begin,
			end,
			size,
			populated: true,
			bankCount: slot.banked ? slot.banked.count : 1,
			banked: slot.banked,
			firstBank: -1,
			sizeInPages: -1
		};
	});

	// Check overlapping and fill the gaps
	slots = slots.reduce((list, slot, i) => {
		Utility.assert((slot.size % 1024) === 0, `Slot ${i} size not multiple of 1K`);
		list.push(slot);

		Utility.assert(slot.begin >= 0 && slot.end < 0x10000, "Slot out of 16-bit range");
		if (i > 0) {
			Utility.assert(slot.begin > slots[i - 1].end, `Slots ${i - 1} and ${i} are overlapping or out-of order`);
		}
		if (i < slots.length - 1) {
			Utility.assert(slot.end < slots[i + 1].begin, `Slots ${i} and ${i + 1} are overlapping or out-of order`);
			if (slot.end + 1 < slots[i + 1].begin) {
				// Fill unpopulated slot
				list.push({
					begin: slot.end + 1,
					end: slots[i + 1].begin - 1,
					populated: false,
					size: slots[i + 1].begin - slot.end - 1,
					bankCount: 1,
					sizeInPages: -1,
					firstBank: -1
				});
			}
		} else {
			if (slot.end < 0xffff) {
				// Fill unpopulated slot
				list.push({
					begin: slot.end + 1,
					end: 0xffff,
					populated: false,
					size: 0x10000 - slot.end - 1,
					sizeInPages: -1,
					bankCount: 1,
					firstBank: -1
				});
			}
		}
		return list;
	}, [] as SlotInfo[]);

	const slotSize = Math.min(...slots.map(slot => slot.size));
	slots.forEach(slot => {
		slot.sizeInPages = slot.size / slotSize;
		slot.bankCount *= slot.sizeInPages;
	});

	// Allocated non-populated bank
	let bankCount = 0;
	let notPopulatedBank = -1;
	slots.forEach(slot => {
		if (slot.populated) {
			slot.firstBank = bankCount;
			bankCount += slot.bankCount;
		} else {
			if (notPopulatedBank < 0) {
				notPopulatedBank = bankCount;
				bankCount++;
			}
			slot.firstBank = notPopulatedBank;
		}
	});

	return { slots, slotSize, bankCount, notPopulatedBank, bankSize: 0x10000 / slotSize };
}

export class CustomMemory extends SimulatedMemory {
	constructor(info: SlottedMemoryInfo, private readonly ports: Z80Ports) {
		super(info.bankSize, info.bankCount);

		// Add a bank for the non-populated bank
		if (info.notPopulatedBank >= 0) {
			this.bankTypes[info.notPopulatedBank] = BankType.UNUSED;
		}

		info.slots.forEach(slot => {
			const firstSlot = slot.begin / info.slotSize;
			if (slot.rom) {
				const offset = toNumber(slot.romOffset || 0);
				for (let i = 0; i < slot.bankCount; i++) {
					this.readRomToBank(slot.rom, slot.firstBank + i, info.slotSize * i + offset);
				}
			}

			const bankControl = slot.banked && slot.banked.control;
			if (bankControl) {
				const matcher = this.decodePortMask(bankControl.ioPort);
				this.ports.registerGenericOutPortFunction((port, value) => {
					if (matcher(port)) {
						const bank = this.decodeBankBits(value, bankControl.ioBitMap) * slot.sizeInPages;
						for (let i = 0; i < slot.sizeInPages; i++) {
							this.setSlot(firstSlot + i, slot.firstBank + bank + i);
						}
					}
				});
			}
		});
	}

	private readHexFromFile(filePath: string, bankSize: number, offset: number): Uint8Array {
		const { data }: { data: Buffer } = require("intel-hex").parse(fs.readFileSync(filePath));
		Utility.assert(data.length >= offset + bankSize, `HEX file ${filePath} length error`);
		return data.slice(offset, bankSize + offset);
	}

	private readRomFile(filePath: string, bankSize: number, offset: number): Uint8Array {
		switch (path.extname(filePath).toLowerCase()) {
		case ".hex":
			return this.readHexFromFile(filePath, bankSize, offset);
		case ".bin":
		case ".rom":
			const romBuffer = fs.readFileSync(filePath);
			Utility.assert(romBuffer.length >= offset + bankSize, `ROM file ${filePath} length error`);
			return new Uint8Array(romBuffer.buffer, offset, bankSize);
		default:
			throw new Error(`Unknown ROM extension file: ${filePath}`);
		}
	}

	/**
	 * Read a binary file as ROM data to a specific bank.
	 * Supports raw format (.bin and .rom extensions) and I8HEX format (.hex extension)
	 */
	private readRomToBank(pathOrData: string | Uint8Array, bank: number, offset?: number) {
		offset = offset || 0;
		this.bankTypes[bank] = BankType.ROM;
		let rom: Uint8Array;
		if (typeof pathOrData === "string") {
			rom = this.readRomFile(pathOrData, this.bankSize, offset || 0);
		} else {
			Utility.assert(pathOrData.length >= offset + this.bankSize, `ROM data length error`);
			rom = new Uint8Array(pathOrData, offset, this.bankSize);
		}
		this.writeBank(bank, rom);
	}

	private decodeBankBits(byte: number, bitmap: number[]): number {
		let ret = 0;
		for (let b = 0, val = 1; b < bitmap.length; b++, val <<= 1) {
			const mask = 1 << bitmap[b];
			if (byte & mask) {
				ret += val;
			}
		}
		return ret;
	}

	private decodePortMask(port: HexNumber | { mask: HexNumber, match: HexNumber }): (port: number) => boolean {
		if (typeof port === "number" || typeof port === "string") {
			const match = toNumber(port);
			return port => match === port;
		} else {
			const mask = toNumber(port.mask);
			const match = toNumber(port.match);
			return port => (port & mask) === match;
		}
	}
}

