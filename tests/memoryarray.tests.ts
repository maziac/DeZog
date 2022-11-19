import * as assert from 'assert';
import {MemAttribute, Memory} from '../src/disassembler/memory';
import {MemoryArray} from '../src/disassembler/memoryarray';

suite('Disassembly - MemoryArray', () => {

	suite('MemoryArray', () => {

		suite('addRange', () => {

			test('creation', () => {
				const ma = new MemoryArray();
				assert.equal(0, ma.ranges.length);
			});

			test('2 blocks', () => {
				const ma = new MemoryArray();
				ma.addRange(0x1000, 10);
				ma.addRange(0x2000, 20);
				assert.equal(2, ma.ranges.length);
				assert.equal(0x1000, ma.ranges[0].address);
				assert.equal(10, ma.ranges[0].size);
				assert.equal(0x2000, ma.ranges[1].address);
				assert.equal(20, ma.ranges[1].size);
			});


			test('2 blocks different order', () => {
				const ma = new MemoryArray();
				ma.addRange(0x2000, 20);
				ma.addRange(0x1000, 10);
				assert.equal(2, ma.ranges.length);
				assert.equal(0x1000, ma.ranges[0].address);
				assert.equal(10, ma.ranges[0].size);
				assert.equal(0x2000, ma.ranges[1].address);
				assert.equal(20, ma.ranges[1].size);
			});


			test('2 overlapping blocks - A', () => {
				const ma = new MemoryArray();
				ma.addRange(1000, 10);
				ma.addRange(1005, 20);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(25, ma.ranges[0].size);
			});

			test('2 overlapping blocks - B', () => {
				const ma = new MemoryArray();
				ma.addRange(1005, 20);
				ma.addRange(1000, 10);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(25, ma.ranges[0].size);
			});

			test('2 overlapping blocks - C', () => {
				const ma = new MemoryArray();
				ma.addRange(100, 5);
				ma.addRange(1005, 20);
				ma.addRange(1000, 10);
				assert.equal(2, ma.ranges.length);
				assert.equal(100, ma.ranges[0].address);
				assert.equal(5, ma.ranges[0].size);
				assert.equal(1000, ma.ranges[1].address);
				assert.equal(25, ma.ranges[1].size);
			});

			test('2 overlapping blocks - D', () => {
				const ma = new MemoryArray();
				ma.addRange(2000, 5);
				ma.addRange(1005, 20);
				ma.addRange(1000, 10);
				assert.equal(2, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(25, ma.ranges[0].size);
				assert.equal(2000, ma.ranges[1].address);
				assert.equal(5, ma.ranges[1].size);
			});

			test('2 touching blocks - A', () => {
				const ma = new MemoryArray();
				ma.addRange(1000, 1000);
				ma.addRange(2000, 500);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(1500, ma.ranges[0].size);
			});

			test('2 touching blocks - B', () => {
				const ma = new MemoryArray();
				ma.addRange(2000, 500);
				ma.addRange(1000, 1000);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(1500, ma.ranges[0].size);
			});


			test('3 overlapping blocks - A', () => {
				const ma = new MemoryArray();
				ma.addRange(2000, 10);
				ma.addRange(1000, 10);
				ma.addRange(500, 2000);
				assert.equal(1, ma.ranges.length);
				assert.equal(500, ma.ranges[0].address);
				assert.equal(2000, ma.ranges[0].size);
			});

			test('3 overlapping blocks - B', () => {
				const ma = new MemoryArray();
				ma.addRange(2000, 600);
				ma.addRange(1000, 10);
				ma.addRange(500, 2000);
				assert.equal(1, ma.ranges.length);
				assert.equal(500, ma.ranges[0].address);
				assert.equal(2100, ma.ranges[0].size);
			});

			test('3 overlapping blocks - C', () => {
				const ma = new MemoryArray();
				ma.addRange(2000, 10);
				ma.addRange(1000, 300);
				ma.addRange(1200, 2000);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(2200, ma.ranges[0].size);
			});

			test('3 touching blocks - C', () => {
				const ma = new MemoryArray();
				ma.addRange(1000, 1000);
				ma.addRange(3000, 1000);
				ma.addRange(2000, 1000);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(3000, ma.ranges[0].size);
			});


			test('overflow', () => {
				const ma = new MemoryArray();
				ma.addRange(0xFF00, 0x1000);
				assert.equal(2, ma.ranges.length);
				assert.equal(0x0000, ma.ranges[0].address);
				assert.equal(0x0F00, ma.ranges[0].size);
				assert.equal(0xFF00, ma.ranges[1].address);
				assert.equal(0x0100, ma.ranges[1].size);
			});

		});



		suite('getValueAtAddress', () => {

			test('1 range', () => {
				const ma = new MemoryArray();
				ma.addRange(1000, 100);
				const data = new Uint8Array(100);
				ma.ranges[0].data = data;
				data[0] = 1;
				data[99] = 2;
				assert.equal(1, ma.getValueAtAddress(1000));
				assert.equal(2, ma.getValueAtAddress(1099));
				assert.equal(undefined, ma.getValueAtAddress(999));
				assert.equal(undefined, ma.getValueAtAddress(1100));
			});

			test('2 ranges', () => {
				const ma = new MemoryArray();
				ma.addRange(1000, 100);
				ma.addRange(2000, 100);
				const data0 = new Uint8Array(100);
				const data1 = new Uint8Array(100);
				ma.ranges[0].data = data0;
				ma.ranges[1].data = data1;
				data0[0] = 1;
				data0[99] = 2;
				data1[0] = 3;
				data1[99] = 4;
				assert.equal(1, ma.getValueAtAddress(1000));
				assert.equal(2, ma.getValueAtAddress(1099));
				assert.equal(undefined, ma.getValueAtAddress(999));
				assert.equal(undefined, ma.getValueAtAddress(1100));
				assert.equal(3, ma.getValueAtAddress(2000));
				assert.equal(4, ma.getValueAtAddress(2099));
				assert.equal(undefined, ma.getValueAtAddress(1999));
				assert.equal(undefined, ma.getValueAtAddress(2100));
			});
		});


		suite('addRangesWithSize', () => {

			test('1 range', () => {
				const ma = new MemoryArray();
				ma.addRangesWithSize([1000], 100);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(100, ma.ranges[0].size);
			});

			test('2 ranges', () => {
				const ma = new MemoryArray();
				ma.addRangesWithSize([1000, 2000], 100);
				assert.equal(2, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(100, ma.ranges[0].size);
				assert.equal(2000, ma.ranges[1].address);
				assert.equal(100, ma.ranges[1].size);
			});

			test('Overlapping ranges', () => {
				const ma = new MemoryArray();
				ma.addRangesWithSize([1000, 2000, 1500], 600);
				assert.equal(1, ma.ranges.length);
				assert.equal(1000, ma.ranges[0].address);
				assert.equal(1600, ma.ranges[0].size);
			});
		});


		suite('memory compare', () => {
			function addRangewithData(ma: MemoryArray, address: number, dataBuffer: number[]) {
				ma.ranges.push({address, size: dataBuffer.length, data: new Uint8Array(dataBuffer)});
			}

			suite('isMemoryEqual', () => {

				test('empty', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					assert.ok(!ma.isMemoryEqual(mem, 100, 1));
				});

				test('same', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [0xAB]);
					mem.setMemory(100, new Uint8Array([0xAB]));
					assert.ok(ma.isMemoryEqual(mem, 100, 1));
				});

				test('UNUSED', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [0xAB]);
					mem.setMemory(100, new Uint8Array([0xAB]));
					mem.setAttributesAt(100, 1, MemAttribute.UNUSED);
					assert.ok(!ma.isMemoryEqual(mem, 100, 1));
				});

				test('Different areas', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20]);
					mem.setMemory(90, new Uint8Array([10, 20]));
					assert.ok(!ma.isMemoryEqual(mem, 100, 1));
					assert.ok(!ma.isMemoryEqual(mem, 90, 1));
				});

				test('Different values', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10]);
					mem.setMemory(90, new Uint8Array([0xAB]));
					assert.ok(!ma.isMemoryEqual(mem, 100, 1));
				});

				test('2 equal ranges', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20, 30]);
					mem.setMemory(100, new Uint8Array([10, 20, 30]));
					assert.ok(ma.isMemoryEqual(mem, 100, 3));
				});

				test('Overlapping ranges', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20, 30]);
					mem.setMemory(99, new Uint8Array([1, 10, 20, 30]));
					assert.ok(!ma.isMemoryEqual(mem, 99, 3));
					assert.ok(ma.isMemoryEqual(mem, 100, 3));
				});
			});

			suite('isMemoryEqualForBlocks', () => {

				test('2 equal ranges', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20, 30]);
					mem.setMemory(100, new Uint8Array([10, 20, 30]));
					assert.ok(ma.isMemoryEqualForBlocks(mem, [100], 3));
				});

				test('2x2 equal ranges', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20, 30]);
					mem.setMemory(100, new Uint8Array([10, 20, 30]));
					addRangewithData(ma, 2000, [1, 2, 3, 4]);
					mem.setMemory(2000, new Uint8Array([1, 2, 3, 7]));
					assert.ok(ma.isMemoryEqualForBlocks(mem, [100, 2000], 3));
				});

				test('1 wrong range', () => {
					const ma = new MemoryArray();
					const mem = new Memory();
					addRangewithData(ma, 100, [10, 20, 30]);
					mem.setMemory(100, new Uint8Array([10, 20, 30]));
					addRangewithData(ma, 2000, [1, 2, 3, 4]);
					mem.setMemory(2000, new Uint8Array([1, 2, 8, 7]));
					assert.ok(!ma.isMemoryEqualForBlocks(mem, [100, 2000], 3));
				});
			});
		});
	});
});

