
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {ByteBuffer} from '../src/misc/bytebuffer';


suite('Bytes', () => {

	suite('getUintFromMemory', () => {

		suite('little endian', () => {

			test('byte', async () => {
				const values = [1, 2, 3, 4, 255];
				const mem = new Uint8Array(values);

				for (let i = 0; i < values.length; i++) {
					const val = ByteBuffer.getUintFromMemory(mem, i, 1, true);
					assert.equal(val, values[i]);
				}
			});

			test('word', async () => {
				const values = [1, 200, 200, 4, 255];
				const mem = new Uint8Array(values);

				for (let i = 0; i < values.length - 1; i++) {
					const val = ByteBuffer.getUintFromMemory(mem, i, 2, true);
					const compVal = values[i] + values[i + 1] * 256;
					assert.equal(val, compVal);
				}
			});


			test('count = 5', async () => {
				const values = [1, 2, 3, 4, 255];
				const mem = new Uint8Array([1, ...values]);

				const val = ByteBuffer.getUintFromMemory(mem, 1, 5, true);
				const compVal = values[0]
					+ values[1] * 256
					+ values[2] * 256 * 256
					+ values[3] * 256 * 256 * 256
					+ values[4] * 256 * 256 * 256 * 256;
				assert.equal(val, compVal);
			});

		});

		suite('big endian', () => {

			test('byte', async () => {
				const values = [1, 2, 3, 4, 255];
				const mem = new Uint8Array(values);

				for (let i = 0; i < values.length; i++) {
					const val = ByteBuffer.getUintFromMemory(mem, i, 1, false);
					assert.equal(val, values[i]);
				}
			});

			test('word', async () => {
				const values = [1, 200, 200, 4, 255];
				const mem = new Uint8Array(values);

				for (let i = 0; i < values.length - 1; i++) {
					const val = ByteBuffer.getUintFromMemory(mem, i, 2, false);
					const compVal = values[i + 1] + values[i] * 256;
					assert.equal(val, compVal);
				}
			});


			test('count = 5', async () => {
				const values = [1, 2, 3, 4, 255];
				const mem = new Uint8Array([1, ...values]);

				const val = ByteBuffer.getUintFromMemory(mem, 1, 5, false);
				const compVal = values[4]
					+ values[3] * 256
					+ values[2] * 256 * 256
					+ values[1] * 256 * 256 * 256
					+ values[0] * 256 * 256 * 256 * 256;
				assert.equal(val, compVal);
			});

		});
	});


	suite('setUintToMemory', () => {

		suite('little endian', () => {

			test('byte', () => {
				const memory = new Uint8Array([0, 0, 0]);
				ByteBuffer.setUintToMemory(0xA5, memory, 1);
				assert.deepEqual(Array.from(memory), [0, 0xA5, 0]);
			});

			test('word', () => {
				const memory = new Uint8Array([0, 0, 0, 0]);
				ByteBuffer.setUintToMemory(0x1234, memory, 1, 2);
				assert.deepEqual(Array.from(memory), [0, 0x34, 0x12, 0]);
			});

			test('count = 3', () => {
				const memory = new Uint8Array(3);
				ByteBuffer.setUintToMemory(0x123456, memory, 0, 3);
				assert.deepEqual(Array.from(memory), [0x56, 0x34, 0x12]);
			});
		});

		suite('big endian', () => {

			test('word', () => {
				const memory = new Uint8Array([0, 0, 0, 0]);
				ByteBuffer.setUintToMemory(0x1234, memory, 1, 2, false);
				assert.deepEqual(Array.from(memory), [0, 0x12, 0x34, 0]);
			});

			test('count = 3', () => {
				const memory = new Uint8Array(3);
				ByteBuffer.setUintToMemory(0x123456, memory, 0, 3, false);
				assert.deepEqual(Array.from(memory), [0x12, 0x34, 0x56]);
			});
		});

		test('negative values', () => {
			let memory = new Uint8Array(1);
			ByteBuffer.setUintToMemory(-1, memory, 0, 1);
			assert.deepEqual(Array.from(memory), [0xFF]);

			memory = new Uint8Array(2);
			ByteBuffer.setUintToMemory(-2, memory, 0, 2);
			assert.deepEqual(Array.from(memory), [0xFE, 0xFF]);

			memory = new Uint8Array(3);
			ByteBuffer.setUintToMemory(-1, memory, 0, 3, false);
			assert.deepEqual(Array.from(memory), [0xFF, 0xFF, 0xFF]);
		});

		test('negative values, count >= 4', () => {
			let memory = new Uint8Array(4);
			ByteBuffer.setUintToMemory(-1, memory, 0, 4);
			assert.deepEqual(Array.from(memory), [0xFF, 0xFF, 0xFF, 0xFF]);

			memory = new Uint8Array(4);
			ByteBuffer.setUintToMemory(-2, memory, 0, 4, false);
			assert.deepEqual(Array.from(memory), [0xFF, 0xFF, 0xFF, 0xFE]);

			memory = new Uint8Array(6);
			ByteBuffer.setUintToMemory(-0x1234, memory, 0, 6);
			assert.deepEqual(Array.from(memory), [0xCC, 0xED, 0xFF, 0xFF, 0xFF, 0xFF]);
			assert.equal(ByteBuffer.getUintFromMemory(memory, 0, 6), 2 ** 48 - 0x1234);
		});

		test('round trip with getUintFromMemory', () => {
			const memory = new Uint8Array(5);
			for (const littleEndian of [true, false]) {
				ByteBuffer.setUintToMemory(0xCAFE01, memory, 1, 3, littleEndian);
				assert.equal(ByteBuffer.getUintFromMemory(memory, 1, 3, littleEndian), 0xCAFE01);
			}
		});
	});


	suite('getWord / setWord', () => {

		test('setWord little endian', () => {
			const buffer = Buffer.from([0, 0, 0, 0]);
			ByteBuffer.setWord(buffer, 1, 0x1234);
			assert.deepEqual(Array.from(buffer), [0, 0x34, 0x12, 0]);
		});

		test('getWord little endian', () => {
			const buffer = Buffer.from([0x11, 0x34, 0x12]);
			assert.equal(ByteBuffer.getWord(buffer, 1), 0x1234);
			assert.equal(ByteBuffer.getWord(buffer, 0), 0x3411);
		});

		test('round trip', () => {
			const buffer = Buffer.alloc(2);
			ByteBuffer.setWord(buffer, 0, 0xFFFE);
			assert.equal(ByteBuffer.getWord(buffer, 0), 0xFFFE);
		});
	});


	suite('getStringFromBuffer', () => {

		test('stops at 0', () => {
			const buffer = Buffer.from([0x41, 0x42, 0, 0x43]);
			assert.equal(ByteBuffer.getStringFromBuffer(buffer, 0), 'AB');
		});

		test('start index', () => {
			const buffer = Buffer.from([0x41, 0x42, 0x43, 0]);
			assert.equal(ByteBuffer.getStringFromBuffer(buffer, 1), 'BC');
		});

		test('no terminating 0', () => {
			const buffer = Buffer.from([0x41, 0x42, 0x43]);
			assert.equal(ByteBuffer.getStringFromBuffer(buffer, 0), 'ABC');
		});

		test('empty', () => {
			const buffer = Buffer.from([0x41, 0, 0x42]);
			assert.equal(ByteBuffer.getStringFromBuffer(buffer, 1), '');
		});
	});
});
