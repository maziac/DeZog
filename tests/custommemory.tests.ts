
import * as assert from 'assert';
import { CustomMemoryModel } from '../src/remotes/Paging/memorymodel';
import { CustomMemory } from '../src/remotes/zsimulator/customMemory';
import { toCustomMemorySettings } from '../src/custommemorysettings';
import { Z80Ports } from '../src/remotes/zsimulator/z80ports';

// ROM that contains 0, 1, ... 0xff repeated to fill the target size
const buildTestRom = (size: number) => {
	const buffer = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		buffer[i] = i % 0x100;
	}
	return buffer;
};

suite('CustomMemory', () => {
	test('ROM load', () => {
		// test.rom is a 8K ROM
		const mem = new CustomMemory(toCustomMemorySettings([
			{
				range: [0, 0x3FFF],
				rom: buildTestRom(16 * 1024)
			},
			{
				range: [0x4000, 0xBFFF]
			}
		]), new Z80Ports(0xff));

		assert.equal(0x00, mem.read8(0x0000));
		assert.equal(0x01, mem.read8(0x0001));
		assert.equal(0x02, mem.read8(0x0002));
		assert.equal(0xFF, mem.read8(0x3FFF));

		assert.equal(0x00, mem.read8(0x4000));
		assert.equal(0x00, mem.read8(0x4001));

		assert.equal(0x00, mem.read8(0x7FFF));
		assert.equal(0x00, mem.read8(0x8000));
		assert.equal(0x00, mem.read8(0x8001));
		assert.equal(0x00, mem.read8(0xBFFF));

		assert.equal(0xff, mem.read8(0xC000));
		assert.equal(0xff, mem.read8(0xFFFF));
	});

	test('Memory model, not banked', () => {
		const memoryModel = new CustomMemoryModel(toCustomMemorySettings([
			{
				range: [0, 0x3FFF],
				rom: buildTestRom(16 * 1024)
			},
			{
				range: [0x4000, 0xBFFF]
			}
		]));
		const banks = memoryModel.getMemoryBanks(undefined);
		assert.deepEqual([
			{ name: "ROM", start: 0, end: 0x3FFF },
			{ name: "RAM", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);
	});

	test('Memory model, simple banked', () => {
		const customSettings = toCustomMemorySettings([
			{
				range: [0, 0x3FFF],
				rom: buildTestRom(16 * 1024)
			},
			{
				range: [0x4000, 0xBFFF],
				banked: {
					count: 2
				}
			}
		]);
		assert.equal(customSettings.uniformSlotSize, 0x4000);
		assert.equal(customSettings.uniformBankCount, 6); // 1 ROM, 4 RAM (2 banks of 2 slots), 1 N/A
		assert.equal(customSettings.slots[0].firstBankIdx, 0);
		assert.equal(customSettings.slots[1].firstBankIdx, 1);
		assert.equal(customSettings.slots[2].firstBankIdx, 5);
		assert.equal(customSettings.unusedBankIdx, 5);

		const memoryModel = new CustomMemoryModel(customSettings);

		let banks = memoryModel.getMemoryBanks(undefined);
		assert.deepEqual([
			{ name: "ROM", start: 0, end: 0x3FFF },
			{ name: "RAM", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);

		banks = memoryModel.getMemoryBanks([0, 1, 2, 5]);
		assert.deepEqual([
			{ name: "ROM", start: 0, end: 0x3FFF },
			{ name: "RAM0", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);

		banks = memoryModel.getMemoryBanks([0, 3, 4, 5]);
		assert.deepEqual([
			{ name: "ROM", start: 0, end: 0x3FFF },
			{ name: "RAM1", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);
	});

	test('Memory model, banked w/names', () => {
		const memoryModel = new CustomMemoryModel(toCustomMemorySettings([
			{
				range: [0, 0x3FFF],
				rom: buildTestRom(16 * 1024),
				name: "X"
			},
			{
				range: [0x4000, 0xBFFF],
				banked: {
					count: 2,
					names: ["R1", "R2"]
				}
			}
		]));

		let banks = memoryModel.getMemoryBanks(undefined);
		assert.deepEqual([
			{ name: "X", start: 0, end: 0x3FFF },
			{ name: "RAM", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);

		banks = memoryModel.getMemoryBanks([0, 1, 2, 5]);
		assert.deepEqual([
			{ name: "X", start: 0, end: 0x3FFF },
			{ name: "R1", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);

		banks = memoryModel.getMemoryBanks([0, 3, 4, 5]);
		assert.deepEqual([
			{ name: "X", start: 0, end: 0x3FFF },
			{ name: "R2", start: 0x4000, end: 0xBFFF },
			{ name: "N/A", start: 0xC000, end: 0xFFFF }], banks);
	});
});
