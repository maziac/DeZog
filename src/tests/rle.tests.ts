
import * as assert from 'assert';
import {ZxPorts} from '../remotes/zxsimulator/zxports';

suite('RLE', () => {
	test('encode/decode', () => {
		// Test normal data
		const data=new Uint8Array([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10
		]);

		// Encode


		// Create a new object
		const rPorts=new ZxPorts();

		// Test the slots/banks

		// Tet the memory
		assert.equal(100, rPorts.read(0x0000));
		assert.equal(101, rPorts.read(0x0095));
		assert.equal(102, rPorts.read(0x8000));
		assert.equal(103, rPorts.read(0xFFFF));
	});

});

