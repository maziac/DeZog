
import * as assert from 'assert';
import { MemoryArray } from '../misc/memoryarray';

suite('MemoryArray', () => {

	suite('addRange', () => {

		test('creation', () => {
			const ma=new MemoryArray();
			assert.equal(0, ma.ranges.length);
		});

		test('2 blocks', () => {
			const ma=new MemoryArray();
			ma.addRange(0x1000, 10);
			ma.addRange(0x2000, 20);
			assert.equal(2, ma.ranges.length);
			assert.equal(0x1000, ma.ranges[0].address);
			assert.equal(10, ma.ranges[0].size);
			assert.equal(0x2000, ma.ranges[1].address);
			assert.equal(20, ma.ranges[1].size);
		});


		test('2 blocks different order', () => {
			const ma=new MemoryArray();
			ma.addRange(0x2000, 20);
			ma.addRange(0x1000, 10);
			assert.equal(2, ma.ranges.length);
			assert.equal(0x1000, ma.ranges[0].address);
			assert.equal(10, ma.ranges[0].size);
			assert.equal(0x2000, ma.ranges[1].address);
			assert.equal(20, ma.ranges[1].size);
		});


		test('2 overlapping blocks - A', () => {
			const ma=new MemoryArray();
			ma.addRange(1000, 10);
			ma.addRange(1005, 20);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(25, ma.ranges[0].size);
		});

		test('2 overlapping blocks - B', () => {
			const ma=new MemoryArray();
			ma.addRange(1005, 20);
			ma.addRange(1000, 10);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(25, ma.ranges[0].size);
		});

		test('2 overlapping blocks - C', () => {
			const ma=new MemoryArray();
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
			const ma=new MemoryArray();
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
			const ma=new MemoryArray();
			ma.addRange(1000, 1000);
			ma.addRange(2000, 500);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(1500, ma.ranges[0].size);
		});

		test('2 touching blocks - B', () => {
			const ma=new MemoryArray();
			ma.addRange(2000, 500);
			ma.addRange(1000, 1000);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(1500, ma.ranges[0].size);
		});


		test('3 overlapping blocks - A', () => {
			const ma=new MemoryArray();
			ma.addRange(2000, 10);
			ma.addRange(1000, 10);
			ma.addRange(500, 2000);
			assert.equal(1, ma.ranges.length);
			assert.equal(500, ma.ranges[0].address);
			assert.equal(2000, ma.ranges[0].size);
		});

		test('3 overlapping blocks - B', () => {
			const ma=new MemoryArray();
			ma.addRange(2000, 600);
			ma.addRange(1000, 10);
			ma.addRange(500, 2000);
			assert.equal(1, ma.ranges.length);
			assert.equal(500, ma.ranges[0].address);
			assert.equal(2100, ma.ranges[0].size);
		});

		test('3 overlapping blocks - C', () => {
			const ma=new MemoryArray();
			ma.addRange(2000, 10);
			ma.addRange(1000, 300);
			ma.addRange(1200, 2000);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(2200, ma.ranges[0].size);
		});

		test('3 touching blocks - C', () => {
			const ma=new MemoryArray();
			ma.addRange(1000, 1000);
			ma.addRange(3000, 1000);
			ma.addRange(2000, 1000);
			assert.equal(1, ma.ranges.length);
			assert.equal(1000, ma.ranges[0].address);
			assert.equal(3000, ma.ranges[0].size);
		});


		test('overflow', () => {
			const ma=new MemoryArray();
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
			const ma=new MemoryArray();
			ma.addRange(1000, 100);
			const data=new Uint8Array(100);
			ma.ranges[0].data=data;
			data[0]=1;
			data[99]=2;
			assert.equal(1, ma.getValueAtAddress(1000));
			assert.equal(2, ma.getValueAtAddress(1099));
			assert.equal(undefined, ma.getValueAtAddress(999));
			assert.equal(undefined, ma.getValueAtAddress(1100));
		});

		test('2 ranges', () => {
			const ma=new MemoryArray();
			ma.addRange(1000, 100);
			ma.addRange(2000, 100);
			const data0=new Uint8Array(100);
			const data1=new Uint8Array(100);
			ma.ranges[0].data=data0;
			ma.ranges[1].data=data1;
			data0[0]=1;
			data0[99]=2;
			data1[0]=3;
			data1[99]=4;
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

});

