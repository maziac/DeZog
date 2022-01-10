
import * as assert from 'assert';
import {MemBuffer} from '../src/misc/membuffer';
import {PagedMemory} from '../src/remotes/zsimulator/pagedmemory';

// Simply publicly expose protected members
class MemBufferInt extends MemBuffer {
	public getReadOffset() {
		return this.readOffset;
	}
}

suite('PagedMemory', () => {
	test('serialize/deserialize', () => {
		let memBuffer: MemBufferInt;
		let writeSize: number;
		{
			const mem = new PagedMemory(8, 256);

			// Set slots
			mem.setSlot(0, 253);
			mem.setSlot(1, 200);
			mem.setSlot(2, 150);
			mem.setSlot(3, 100);
			mem.setSlot(4, 80);
			mem.setSlot(5, 60);
			mem.setSlot(6, 30);
			mem.setSlot(7, 5);

			// Set some memory
			mem.write8(0x0000, 10);
			mem.write8(0x0010, 11);
			mem.write8(0x1FFF, 12);
			mem.write8(0x2000, 13);
			mem.write8(0x4000, 14);
			mem.write8(0x6000, 15);
			mem.write8(0x8000, 16);
			mem.write8(0xA000, 17);
			mem.write8(0xC000, 18);
			mem.write8(0xE000, 19);
			mem.write8(0xFFFF, 20);

			// Get size
			writeSize = mem.getSerializedSize();

			// Serialize
			memBuffer = new MemBufferInt(writeSize);
			mem.serialize(memBuffer);
		}

		// Create a new object
		const rMem = new PagedMemory(8, 256);
		rMem.deserialize(memBuffer);

		// Check size
		const readSize = memBuffer.getReadOffset();
		assert.equal(writeSize, readSize);

		// Test the slots/banks
		const slots = rMem.getSlots();
		assert.equal(253, slots[0]);
		assert.equal(200, slots[1]);
		assert.equal(150, slots[2]);
		assert.equal(100, slots[3]);
		assert.equal(80, slots[4]);
		assert.equal(60, slots[5]);
		assert.equal(30, slots[6]);
		assert.equal(5, slots[7]);

		// Test the memory
		assert.equal(10, rMem.read8(0x0000));
		assert.equal(11, rMem.read8(0x0010));
		assert.equal(12, rMem.read8(0x1FFF));
		assert.equal(13, rMem.read8(0x2000));
		assert.equal(14, rMem.read8(0x4000));
		assert.equal(15, rMem.read8(0x6000));
		assert.equal(16, rMem.read8(0x8000));
		assert.equal(17, rMem.read8(0xA000));
		assert.equal(18, rMem.read8(0xC000));
		assert.equal(19, rMem.read8(0xE000));
		assert.equal(20, rMem.read8(0xFFFF));
	});


	test('writeBlock/readBlock', () => {
		const mem = new PagedMemory(8, 256);

		mem.writeBlock(0x0000, new Uint8Array([0xAB]));
		let result = mem.readBlock(0x0000, 2);
		assert.equal(0xAB, result[0]);
		assert.equal(0, result[1]);

		mem.writeBlock(0x1000, new Uint8Array([0xAB, 0x12, 0x13, 0x14, 0x15]));
		result = mem.readBlock(0x1000, 5);
		assert.equal(0xAB, result[0]);
		assert.equal(0x12, result[1]);
		assert.equal(0x13, result[2]);
		assert.equal(0x14, result[3]);
		assert.equal(0x15, result[4]);

		mem.writeBlock(0xFFFF, new Uint8Array([0xC0]));
		result = mem.readBlock(0xFFFF, 1);
		assert.equal(0xC0, result[0]);
		result = mem.readBlock(0x0000, 1);
		assert.equal(0xAB, result[0]);

		mem.writeBlock(0xFFFF, new Uint8Array([0xD1, 0xD2]));
		result = mem.readBlock(0xFFFF, 2);
		assert.equal(0xD1, result[0]);
		assert.equal(0xD2, result[1]);

		mem.writeBlock(0xFFFF, Buffer.from([0xE1, 0xE2]));
		result = mem.readBlock(0xFFFF, 2);
		assert.equal(0xE1, result[0]);
		assert.equal(0xE2, result[1]);

		mem.writeBlock(0x3FFE, Buffer.from([0xF1, 0xF2, 0xF3, 0xF4]));
		result = mem.readBlock(0x3FFE, 4);
		assert.equal(0xF1, result[0]);
		assert.equal(0xF2, result[1]);
		assert.equal(0xF3, result[2]);
		assert.equal(0xF4, result[3]);
	});


	test('getMemory', () => {
		const mem = new PagedMemory(8, 256) as any;

		mem.memoryData[0] = 0x34;
		mem.memoryData[1] = 0x12;
		let result = mem.getMemory16(0x0000);
		assert.equal(0x1234, result);

		mem.memoryData[0] = 0x34;
		mem.memoryData[1] = 0x12;
		mem.memoryData[2] = 0x78;
		mem.memoryData[3] = 0x56;
		result = mem.getMemory32(0x0000);
		assert.equal(0x56781234, result);

		mem.memoryData[0xFFFF] = 0x9A;
		mem.memoryData[0xFFFE] = 0xBC;
		mem.memoryData[0xFFFD] = 0xDE;

		result = mem.getMemory16(0xFFFF);
		assert.equal(0x349A, result);

		result = mem.getMemory32(0xFFFF);
		assert.equal(0x7812349A, result);

		result = mem.getMemory32(0xFFFE);
		assert.equal(0x12349ABC, result);

		result = mem.getMemory32(0xFFFD);
		assert.equal(0x349ABCDE, result);

		const offs = mem.bankSize;
		assert.equal(0x10000 / 8, offs);
		mem.memoryData[offs - 1] = 0xC1;
		mem.memoryData[offs] = 0xD2;
		result = mem.getMemory16(offs - 1);
		assert.equal(0xD2C1, result);

		mem.memoryData[offs - 2] = 0xB0;
		mem.memoryData[offs + 1] = 0xE3;
		result = mem.getMemory32(offs - 2);
		assert.equal(0xE3D2C1B0, result);
	});


	/* TODO: To be removed:
	Many functions used here have been removed.
	Also the test is not so useful anymore as there is no special behavior
	for unpopulated banks. The banks are just filled with 0xFF.
	test('non populated slots', () => {
		const mem = new PagedMemory(4, 8) as any;
		mem.fillBank(2, 0xFF);
		mem.setMemory8(0x7FFC, 1);
		mem.setMemory8(0x7FFD, 2);
		mem.setMemory8(0x7FFE, 3);
		mem.setMemory8(0x7FFF, 4);

		mem.setMemory8(0xC000, 5);
		mem.setMemory8(0xC001, 6);
		mem.setMemory8(0xC002, 7);
		mem.setMemory8(0xC003, 8);

		// Not populated
		assert.equal(0xFF, mem.getMemory8(0x8000));
		assert.equal(0xFF, mem.getMemory8(0xBFFF));

		// CPU write not working
		mem.write8(0x8000, 42);
		assert.equal(0xFF, mem.getMemory8(0x8000));
		// non-CPU write working instead
		mem.setMemory8(0x8000, 42);
		assert.equal(42, mem.getMemory8(0x8000));
		mem.setMemory8(0x8000, 0xFF);

		// Test boundaries: byte read access
		assert.equal(0x4, mem.getMemory8(0x7FFF));
		assert.equal(0x5, mem.getMemory8(0xC000));

		// Test boundaries: word read access
		assert.equal(0x403, mem.getMemory16(0x7FFE));
		assert.equal(0xFF04, mem.getMemory16(0x7FFF));
		assert.equal(0xFFFF, mem.getMemory16(0x8000));
		assert.equal(0xFFFF, mem.getMemory16(0xBFFE));
		assert.equal(0x05FF, mem.getMemory16(0xBFFF));
		assert.equal(0x0605, mem.getMemory16(0xC000));

		// Test boundaries: dword read access
		assert.equal(0x04030201, mem.getMemory32(0x7FFC));
		assert.equal(0xFF040302, mem.getMemory32(0x7FFD));
		assert.equal(0xFFFF0403, mem.getMemory32(0x7FFE));
		assert.equal(0xFFFFFF04, mem.getMemory32(0x7FFF));
		assert.equal(0xFFFFFFFF, mem.getMemory32(0x8000));
		assert.equal(0xFFFFFFFF, mem.getMemory32(0xBFFC));
		assert.equal(0x05FFFFFF, mem.getMemory32(0xBFFD));
		assert.equal(0x0605FFFF, mem.getMemory32(0xBFFE));
		assert.equal(0x070605FF, mem.getMemory32(0xBFFF));
		assert.equal(0x08070605, mem.getMemory32(0xC000));

		// Test boundaries: word write access
		mem.setMemory16(0x7FFF, 0x0908);
		assert.equal(0x0908, mem.getMemory16(0x7FFF));
		mem.setMemory16(0xBFFF, 0x0a0b);
		assert.equal(0x0A0b, mem.getMemory16(0xBFFF));

		// Test readBlock
		let buffer = mem.readBlock(0x7FFE, 4);
		assert.deepEqual([0x3, 0x8, 0x09, 0xff], Array.from(buffer));
		buffer = mem.readBlock(0xBFFE, 4);
		assert.deepEqual([0xff, 0xB, 0xA, 0x6], Array.from(buffer));

		// Test writeBlock
		mem.writeBlock(0x7FFE, Uint8Array.from([0x10, 0x11, 0x12, 0x13]));
		mem.writeBlock(0xBFFE, Uint8Array.from([0x20, 0x21, 0x22, 0x23]));

		assert.equal(0x10, mem.read8(0x7FFE));
		assert.equal(0x11, mem.read8(0x7FFF));
		assert.equal(0x12, mem.read8(0x8000));
		assert.equal(0x13, mem.read8(0x8001));
		assert.equal(0x20, mem.read8(0xBFFE));
		assert.equal(0x21, mem.read8(0xBFFF));
		assert.equal(0x22, mem.read8(0xC000));
		assert.equal(0x23, mem.read8(0xC001));
	});
	*/
});

