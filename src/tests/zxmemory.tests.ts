
import * as assert from 'assert';
import {ZxMemory} from '../remotes/zxsimulator/zxmemory';

suite('ZxMemory', () => {
	test('readState/writeState', () => {
		let state;
		{
			const mem=new ZxMemory();

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

			state=mem.readState();

			// Check length
			let length=ZxMemory.NUMBER_OF_BANKS*ZxMemory.MEMORY_BANK_SIZE;
			length+=1+8+4;
			assert.equal(length, state.length);
		}

		// Create a new object
		const rMem=new ZxMemory();
		rMem.writeState(state);

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

		// Tet the memory
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

});

