
import * as assert from 'assert';
import { CustomMemoryModel } from '../src/remotes/Paging/memorymodel';
import {CustomMemory, toSlottedMemory} from '../src/remotes/zsimulator/customMemory';
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
		const mem = new CustomMemory(toSlottedMemory([
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

	test('Memory model', () => {
		const memoryModel = new CustomMemoryModel(toSlottedMemory([
			{
				range: [0, 0x3FFF],
				rom: buildTestRom(16 * 1024)
			},
			{
				range: [0x4000, 0xBFFF]
			}
		]));
		const banks = memoryModel.getMemoryBanks(undefined);
		assert.deepEqual({ name: "ROM", start: 0, end: 0x3FFF }, banks[0]);
		assert.deepEqual({ name: "BANK1", start: 0x4000, end: 0x7FFF }, banks[1]);
		assert.deepEqual({ name: "BANK2", start: 0x8000, end: 0xBFFF }, banks[2]);
		assert.deepEqual({ name: "N/A", start: 0xC000, end: 0xFFFF }, banks[3]);
	});
});
