
import * as assert from 'assert';
import {MemBuffer} from '../misc/membuffer';
import {PagedMemory} from '../remotes/zsimulator/pagedmemory';

suite('PagedMemory', () => {
	test('serialize/deserialize', () => {
		let memBuffer;
		let writeSize;
		{
			const mem=new PagedMemory(8, 256);

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
			writeSize=mem.getSerializedSize();

			// Serialize
			memBuffer=new MemBuffer(writeSize);
			mem.serialize(memBuffer);
		}

		// Create a new object
		const rMem=new PagedMemory(8, 256);
		rMem.deserialize(memBuffer);

		// Check size
		const readSize=(memBuffer as any).readOffset;
		assert.equal(writeSize, readSize);

		// Test the slots/banks
		const slots=rMem.getSlots();
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
		const mem=new PagedMemory(8, 256);

		mem.writeBlock(0x0000, new Uint8Array([0xAB]));
		let result=mem.readBlock(0x0000, 2);
		assert.equal(0xAB, result[0]);
		assert.equal(0, result[1]);

		mem.writeBlock(0x1000, new Uint8Array([0xAB, 0x12, 0x13, 0x14, 0x15]));
		result=mem.readBlock(0x1000, 5);
		assert.equal(0xAB, result[0]);
		assert.equal(0x12, result[1]);
		assert.equal(0x13, result[2]);
		assert.equal(0x14, result[3]);
		assert.equal(0x15, result[4]);

		mem.writeBlock(0xFFFF, new Uint8Array([0xC0]));
		result=mem.readBlock(0xFFFF, 1);
		assert.equal(0xC0, result[0]);
		result=mem.readBlock(0x0000, 1);
		assert.equal(0xAB, result[0]);

		mem.writeBlock(0xFFFF, new Uint8Array([0xD1, 0xD2]));
		result=mem.readBlock(0xFFFF, 2);
		assert.equal(0xD1, result[0]);
		assert.equal(0xD2, result[1]);

		mem.writeBlock(0xFFFF, Buffer.from([0xE1, 0xE2]));
		result=mem.readBlock(0xFFFF, 2);
		assert.equal(0xE1, result[0]);
		assert.equal(0xE2, result[1]);

		mem.writeBlock(0x3FFE, Buffer.from([0xF1, 0xF2, 0xF3, 0xF4]));
		result=mem.readBlock(0x3FFE, 4);
		assert.equal(0xF1, result[0]);
		assert.equal(0xF2, result[1]);
		assert.equal(0xF3, result[2]);
		assert.equal(0xF4, result[3]);
	});


	test('setMemory/getMemory', () => {
		const mem=new PagedMemory(8, 256);

		mem.setMemory16(0x0000, 0x1234);
		let result=mem.getMemory16(0x0000);
		assert.equal(0x1234, result);
		result=mem.getMemory16(0xFFFE);
		assert.equal(0x0000, result);
		result=mem.getMemory16(0x0002);
		assert.equal(0x0000, result);

		result=mem.getMemory8(0x0000);
		assert.equal(0x34, result);
		result=mem.getMemory8(0x0001);
		assert.equal(0x12, result);

		mem.setMemory16(0x0002, 0x5678);
		result=mem.getMemory32(0x0000);
		assert.equal(0x56781234, result);

		result=mem.getMemory16(0x0001);
		assert.equal(0x7812, result);

		mem.setMemory16(0xFFFF, 0xABCD);
		mem.setMemory16(0x0001, 0xEF01);
		result=mem.getMemory16(0xFFFF);
		assert.equal(0xABCD, result);
		result=mem.getMemory32(0xFFFF);
		assert.equal(0xEF01ABCD, result);
	});

});

