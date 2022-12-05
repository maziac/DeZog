import * as assert from 'assert';
import {BaseMemory} from '../../src/disassembler/core/basememory';


suite('Disassembler - BaseMemory', () => {

	suite('getData', () => {
		test('normal and edge data', () => {
			let mem = new BaseMemory(0x1000, 0x0020);
			for (let i = 0; i < 0x20; i++)
				mem.setValueAtIndex(i, i + 1);

			assert.deepEqual(mem.getData(0x1000, 0), new Uint8Array([]));
			assert.deepEqual(mem.getData(0x1000, 1), new Uint8Array([1]));
			assert.deepEqual(mem.getData(0x1000, 2), new Uint8Array([1, 2]));
			assert.deepEqual(mem.getData(0x1000, 3), new Uint8Array([1, 2, 3]));

			assert.deepEqual(mem.getData(0x1020, 3), new Uint8Array([]));
			assert.deepEqual(mem.getData(0x101F, 3), new Uint8Array([32]));
			assert.deepEqual(mem.getData(0x101E, 3), new Uint8Array([31, 32]));
			assert.deepEqual(mem.getData(0x101D, 3), new Uint8Array([30, 31, 32]));
			assert.deepEqual(mem.getData(0x101C, 3), new Uint8Array([29, 30, 31]));

			assert.deepEqual(mem.getData(0x2000, 10), new Uint8Array([]));
		});
	});
});
