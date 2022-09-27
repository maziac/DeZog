
import * as assert from 'assert';
import { MemoryDump } from '../src/misc/memorydump';

suite('MemoryDump', () => {

	suite('1 block', () => {

		test('block creation', () => {
			new MemoryDump();	// NOSONAR
		});

		test('1 block A', () => {
			const md = new MemoryDump();
			md.addBlock(0,16);
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 32, "size wrong");
		});

		test('1 block B', () => {
			const md = new MemoryDump();
			md.addBlock(16,1);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block C', () => {
			const md = new MemoryDump();
			md.addBlock(17,2);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block D', () => {
			const md = new MemoryDump();
			md.addBlock(16,16);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block E', () => {
			const md = new MemoryDump();
			md.addBlock(16,17);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

		test('1 block F', () => {
			const md = new MemoryDump();
			md.addBlock(32,17);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 16, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

		test('1 block G', () => {
			const md = new MemoryDump();
			md.addBlock(17,16);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

	});


	suite('2 blocks', () => {

		test('far away', () => {
			const md = new MemoryDump();
			md.addBlock(0,16);
			md.addBlock(4096,16);
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			const mb0 = md.metaBlocks[0];
			assert.equal(mb0.address, 0, "address wrong");
			assert.equal(mb0.size, 32, "size wrong");
			const mb1 = md.metaBlocks[1];
			assert.equal(mb1.address, 4096-16, "address wrong");
			assert.equal(mb1.size, 48, "size wrong");
		});

		test('overlapping', () => {
			const md = new MemoryDump();
			md.addBlock(1024,48);
			md.addBlock(1032,50);
            md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1032+50) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('overlapping reverse order', () => {
			const md = new MemoryDump();
			md.addBlock(1032,50);
			md.addBlock(1024,48);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1032+50-1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('included', () => {
			const md = new MemoryDump();
			md.addBlock(1024,48);
			md.addBlock(1032,5);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1024+48-1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('blocks right after the other at boundary', () => {
			const md = new MemoryDump();
			md.addBlock(1024,48);
			md.addBlock(1072,32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1072+32-1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('blocks right after the other not at boundary', () => {
			const md = new MemoryDump();
			md.addBlock(1024,49);
			md.addBlock(1073,32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1073+32-1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('connected blocks with space', () => {
			const md = new MemoryDump();
			md.addBlock(1024,49);
			md.addBlock(1088,32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1088+32-1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

	});


	suite('3 blocks', () => {

		test('merge first 2 if inserting as 3rd block', () => {
			const md = new MemoryDump();
			md.addBlock(1024,48);	// ends 1072
			md.addBlock(1300,100);	// ends 1300
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			md.addBlock(1068,150);
			md.mergeBlocks();	// The metablock collapses with the 1rst block
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");

			const mb0 = md.metaBlocks[0];
			const resAddr0 = 1024-16;
			assert.equal(mb0.address, resAddr0, "address wrong");
			const resSize0 = ((1068+150-1) & 0xFFF0) + 32 - resAddr0;
			assert.equal(mb0.size, resSize0, "size wrong");

			const mb1 = md.metaBlocks[1];
			const resAddr1 = (1300 & 0xFFF0) - 16;
			assert.equal(mb1.address, resAddr1, "address wrong");
			const resSize1 = ((1300+100-1) & 0xFFF0) + 32 - (resAddr1);
			assert.equal(mb1.size, resSize1, "size wrong");

		});

		test('merge all 3 after inserting 3rd block', () => {
			const md = new MemoryDump();
			md.addBlock(1024,48);	// ends 1072
			md.addBlock(1200,100);	// ends 1300
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			md.addBlock(1068,150);
			md.mergeBlocks();	// The metablock collapses to one because of the 3rd block
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024-16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1200+100-1) & 0xFFF0) + 32 - (1024-16);
			assert.equal(mb.size, resSize, "size wrong");
		});
	});


	suite('isInRange', () => {

		test('range 1 block', () => {
			const md = new MemoryDump();
			md.addBlock(18,10);
			const mb = md.metaBlocks[0];
			assert.ok(mb.isInRange(18), "address should be in range");
			assert.ok(mb.isInRange(27), "address should be in range");
			assert.ok(!mb.isInRange(17), "address should be out of range");
			assert.ok(!mb.isInRange(28), "address should be out of range");
		});

		test('range 2 blocks', () => {
			const md = new MemoryDump();
			md.addBlock(18,10);
			md.addBlock(30,10);
			md.mergeBlocks();
			const mb = md.metaBlocks[0];

			assert.ok(mb.isInRange(18), "address should be in range");
			assert.ok(mb.isInRange(27), "address should be in range");
			assert.ok(!mb.isInRange(17), "address should be out of range");
			assert.ok(!mb.isInRange(28), "address should be out of range");

			assert.ok(mb.isInRange(30), "address should be in range");
			assert.ok(mb.isInRange(39), "address should be in range");
			assert.ok(!mb.isInRange(29), "address should be out of range");
			assert.ok(!mb.isInRange(40), "address should be out of range");
		});
	});


	suite('search', () => {

		// Fills teh memory with zeroes.
		function initBlocks(md: MemoryDump) {
			for (const metaBlock of md.metaBlocks) {
				metaBlock.data = new Uint8Array(metaBlock.size);	// Is zero-initialized
			}
		}

		// Copies an (ASCII) string to the memory.
		function copyToAddress(md: MemoryDump, addr64k: number, text: string) {
			const len = text.length;
			for (let i = 0; i < len; i++) {
				const c = text.charCodeAt(i);
				md.setValueFor(addr64k + i, c);
			}
		}

		test('no findings', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "abcdefghijk");

			let found = md.search('z', true, false, false);
			assert.equal(found.length, 1);
			assert.equal(found.addresses.length, 0);

			found = md.search('ac', true, false, false);
			assert.equal(found.length, 2);
			assert.equal(found.addresses.length, 0);
		});

		test('no input', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "abcdefghijk");

			const found = md.search('', true, false, false);
			assert.equal(found.length, 0);
			assert.equal(found.addresses.length, 0);
		});

		test('1 finding', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "abcdefghijk");

			let found = md.search('a', true, false, false);
			assert.equal(found.length, 1);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 100);

			found = md.search('k', true, false, false);
			assert.equal(found.length, 1);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 110);

			found = md.search('f', true, false, false);
			assert.equal(found.length, 1);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 105);

			found = md.search('cd', true, false, false);
			assert.equal(found.length, 2);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 102);
		});

		test('overlapping findings', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "aaaaa");

			let found = md.search('aaa', true, false, false);
			assert.equal(found.length, 3);
			assert.equal(found.addresses.length, 3);
			assert.equal(found.addresses[0], 100);
			assert.equal(found.addresses[1], 101);
			assert.equal(found.addresses[2], 102);
		});

		test('2 findings', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "abcdabcd");

			let found = md.search('a', true, false, false);
			assert.equal(found.length, 1);
			assert.equal(found.addresses.length, 2);
			assert.equal(found.addresses[0], 100);
			assert.equal(found.addresses[1], 104);

			found = md.search('bc', true, false, false);
			assert.equal(found.length, 2);
			assert.equal(found.addresses.length, 2);
			assert.equal(found.addresses[0], 101);
			assert.equal(found.addresses[1], 105);
		});

		test('2 blocks, 2 findings', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			md.addBlock(3000, 500);
			initBlocks(md);
			copyToAddress(md, 100, "abcdcdefg");
			copyToAddress(md, 3010, "xxcdefgll");

			let found = md.search('cdef', true, false, false);
			assert.equal(found.length, 4);
			assert.equal(found.addresses.length, 2);
			assert.equal(found.addresses[0], 104);
			assert.equal(found.addresses[1], 3012);
		});

		test('case sensitive/insensitive', () => {
			const md = new MemoryDump();
			md.addBlock(50, 1000);
			initBlocks(md);
			copyToAddress(md, 100, "abcdefg");
			copyToAddress(md, 200, "ABCDEFG");
			copyToAddress(md, 300, "AbCdEfG");

			// Case sensitive
			let found = md.search('abcdefg', true, false, false);
			assert.equal(found.length, 7);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 100);

			// Case sensitive
			found = md.search('ABCDEFG', true, false, false);
			assert.equal(found.length, 7);
			assert.equal(found.addresses.length, 1);
			assert.equal(found.addresses[0], 200);

			// Case insensitive
			found = md.search('abcdefg', false, false, false);
			assert.equal(found.length, 7);
			assert.equal(found.addresses.length, 3);
			assert.equal(found.addresses[0], 100);
			assert.equal(found.addresses[1], 200);
			assert.equal(found.addresses[2], 300);

			// Case insensitive
			found = md.search('ABCDEFG', false, false, false);
			assert.equal(found.length, 7);
			assert.equal(found.addresses.length, 3);
			assert.equal(found.addresses[0], 100);
			assert.equal(found.addresses[1], 200);
			assert.equal(found.addresses[2], 300);

			// Case insensitive
			found = md.search('ABCDefg', false, false, false);
			assert.equal(found.length, 7);
			assert.equal(found.addresses.length, 3);
			assert.equal(found.addresses[0], 100);
			assert.equal(found.addresses[1], 200);
			assert.equal(found.addresses[2], 300);
		});

	});
});
