
import * as assert from 'assert';
import {MemoryDump} from '../src/misc/memorydump';

suite('MemoryDump', () => {

	suite('1 block', () => {

		test('block creation', () => {
			new MemoryDump();	// NOSONAR
		});

		test('1 block A', () => {
			const md = new MemoryDump();
			md.addBlock(0, 16);
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 32, "size wrong");
		});

		test('1 block B', () => {
			const md = new MemoryDump();
			md.addBlock(16, 1);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block C', () => {
			const md = new MemoryDump();
			md.addBlock(17, 2);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block D', () => {
			const md = new MemoryDump();
			md.addBlock(16, 16);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 48, "size wrong");
		});

		test('1 block E', () => {
			const md = new MemoryDump();
			md.addBlock(16, 17);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

		test('1 block F', () => {
			const md = new MemoryDump();
			md.addBlock(32, 17);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 16, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

		test('1 block G', () => {
			const md = new MemoryDump();
			md.addBlock(17, 16);
			const mb = md.metaBlocks[0];
			assert.equal(mb.address, 0, "address wrong");
			assert.equal(mb.size, 64, "size wrong");
		});

	});


	suite('2 blocks', () => {

		test('far away', () => {
			const md = new MemoryDump();
			md.addBlock(0, 16);
			md.addBlock(4096, 16);
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			const mb0 = md.metaBlocks[0];
			assert.equal(mb0.address, 0, "address wrong");
			assert.equal(mb0.size, 32, "size wrong");
			const mb1 = md.metaBlocks[1];
			assert.equal(mb1.address, 4096 - 16, "address wrong");
			assert.equal(mb1.size, 48, "size wrong");
		});

		test('overlapping', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 48);
			md.addBlock(1032, 50);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1032 + 50) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('overlapping reverse order', () => {
			const md = new MemoryDump();
			md.addBlock(1032, 50);
			md.addBlock(1024, 48);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1032 + 50 - 1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('included', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 48);
			md.addBlock(1032, 5);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1024 + 48 - 1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('blocks right after the other at boundary', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 48);
			md.addBlock(1072, 32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1072 + 32 - 1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('blocks right after the other not at boundary', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 49);
			md.addBlock(1073, 32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1073 + 32 - 1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

		test('connected blocks with space', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 49);
			md.addBlock(1088, 32);
			md.mergeBlocks();
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1088 + 32 - 1) & 0xFFF0) + 32 - resAddr;
			assert.equal(mb.size, resSize, "size wrong");
		});

	});


	suite('3 blocks', () => {

		test('merge first 2 if inserting as 3rd block', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 48);	// ends 1072
			md.addBlock(1300, 100);	// ends 1300
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			md.addBlock(1068, 150);
			md.mergeBlocks();	// The metablock collapses with the 1rst block
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");

			const mb0 = md.metaBlocks[0];
			const resAddr0 = 1024 - 16;
			assert.equal(mb0.address, resAddr0, "address wrong");
			const resSize0 = ((1068 + 150 - 1) & 0xFFF0) + 32 - resAddr0;
			assert.equal(mb0.size, resSize0, "size wrong");

			const mb1 = md.metaBlocks[1];
			const resAddr1 = (1300 & 0xFFF0) - 16;
			assert.equal(mb1.address, resAddr1, "address wrong");
			const resSize1 = ((1300 + 100 - 1) & 0xFFF0) + 32 - (resAddr1);
			assert.equal(mb1.size, resSize1, "size wrong");

		});

		test('merge all 3 after inserting 3rd block', () => {
			const md = new MemoryDump();
			md.addBlock(1024, 48);	// ends 1072
			md.addBlock(1200, 100);	// ends 1300
			assert.equal(md.metaBlocks.length, 2, "number of meta blocks wrong");
			md.addBlock(1068, 150);
			md.mergeBlocks();	// The metablock collapses to one because of the 3rd block
			assert.equal(md.metaBlocks.length, 1, "number of meta blocks wrong");
			const mb = md.metaBlocks[0];
			const resAddr = 1024 - 16;
			assert.equal(mb.address, resAddr, "address wrong");
			const resSize = ((1200 + 100 - 1) & 0xFFF0) + 32 - (1024 - 16);
			assert.equal(mb.size, resSize, "size wrong");
		});
	});


	suite('isInRange', () => {

		test('range 1 block', () => {
			const md = new MemoryDump();
			md.addBlock(18, 10);
			const mb = md.metaBlocks[0];
			assert.ok(mb.isInRange(18), "address should be in range");
			assert.ok(mb.isInRange(27), "address should be in range");
			assert.ok(!mb.isInRange(17), "address should be out of range");
			assert.ok(!mb.isInRange(28), "address should be out of range");
		});

		test('range 2 blocks', () => {
			const md = new MemoryDump();
			md.addBlock(18, 10);
			md.addBlock(30, 10);
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


	suite('searching', () => {

		// Fills the memory with zeroes.
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

		suite('parseSearchInput', () => {
			suite('wrong input, exceptions', () => {
				test('too big', () => {
					const md = new MemoryDump() as any;
					assert.throws(() => {
						md.parseSearchInput('256');
					});
					assert.throws(() => {
						md.parseSearchInput('$100');
					});
					assert.throws(() => {
						md.parseSearchInput('0x100');
					});
					assert.throws(() => {
						md.parseSearchInput('100h');
					});
				});

				test('string problems', () => {
					const md = new MemoryDump() as any;
					assert.throws(() => {
						// Just one "
						md.parseSearchInput('"');
					});
					assert.throws(() => {
						// Unicode
						md.parseSearchInput('"↑"');
					});
				});

				test('multiple items', () => {
					const md = new MemoryDump() as any;
					// Wrong/missing separator
					assert.throws(() => {
						md.parseSearchInput('AFh; $7e');
					});
					assert.throws(() => {
						md.parseSearchInput('AFh , $7e');
					});

					// Second string not finished
					assert.throws(() => {
						md.parseSearchInput('"abc" "efg');
					});
				});
			});

			suite('1 item', () => {
				suite('string', () => {
					test('Empty', () => {
						const md = new MemoryDump() as any;
						const result = md.parseSearchInput('""');
						assert.equal(result.length, 0);
					});

					test('1 char', () => {
						const md = new MemoryDump() as any;
						const result = md.parseSearchInput('"A"');
						assert.equal(result.length, 1);
						assert.equal(result[0], 0x41);
					});

					test('multiple char', () => {
						const md = new MemoryDump() as any;
						const result = md.parseSearchInput('"Abc"');
						assert.equal(result.length, 3);
						assert.equal(result[0], 0x41);
						assert.equal(result[1], 0x62);
						assert.equal(result[2], 0x63);
					});

					test('escaped "', () => {
						const md = new MemoryDump() as any;
						const result = md.parseSearchInput('"Ab\\"c"');
						assert.equal(result.length, 4);
						assert.equal(result[0], 0x41);
						assert.equal(result[1], 0x62);
						assert.equal(result[2], 0x22);	// "
						assert.equal(result[3], 0x63);
					});
				});

				test('decimal', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('129');
					assert.equal(result.length, 1);
					assert.equal(result[0], 129);
				});

				test('hex h', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('8Ah');
					assert.equal(result.length, 1);
					assert.equal(result[0], 0x8A);
				});

				test('hex $', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('$8a');
					assert.equal(result.length, 1);
					assert.equal(result[0], 0x8A);
				});

				test('hex 0x', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('0xf');
					assert.equal(result.length, 1);
					assert.equal(result[0], 0x0F);
				});
			});

			suite('multiple items', () => {
				test('numbers', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput(' 0xf 100 AFh  $7e ');
					assert.equal(result.length, 4);
					assert.equal(result[0], 0x0F);
					assert.equal(result[1], 100);
					assert.equal(result[2], 0xAF);
					assert.equal(result[3], 0x7E);
				});

				test('strings', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('"a" "" "bc""de"');
					assert.equal(result.length, 5);
					assert.equal(result[0], 0x61);
					assert.equal(result[1], 0x62);
					assert.equal(result[2], 0x63);
					assert.equal(result[3], 0x64);
					assert.equal(result[4], 0x65);
				});

				test('strange but allowed', () => {
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('AFh$7e');
					assert.equal(result.length, 2);
					assert.equal(result[0], 0xAF);
					assert.equal(result[1], 0x7E);
				});

				test('mixed', () => {
					// There should be space for separating, but it is not required
					const md = new MemoryDump() as any;
					const result = md.parseSearchInput('"a"100"bc"$7f"de"');
					assert.equal(result.length, 7);
					assert.equal(result[0], 0x61);
					assert.equal(result[1], 100);
					assert.equal(result[2], 0x62);
					assert.equal(result[3], 0x63);
					assert.equal(result[4], 0x7F);
					assert.equal(result[5], 0x64);
					assert.equal(result[6], 0x65);
				});
			});
		});


		suite('search', () => {

			test('wrong input, found addresses undefined', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				// Unfinished string
				let found = md.search('"z', true, false, false);
				assert.equal(found.addresses, undefined);

				// 2nd string open
				found = md.search('"zl" "', true, false, false);
				assert.equal(found.addresses, undefined);

				// Wrong formatted number
				found = md.search('0Gh', true, false, false);
				assert.equal(found.addresses, undefined);

				// Separators other than space used
				found = md.search('0, 2', true, false, false);
				assert.equal(found.addresses, undefined);

				// diff, too less input
				found = md.search('8', false, false, true);
				assert.equal(found.addresses, undefined);
			});

			test('no findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				let found = md.search('"z"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 0);

				found = md.search('"ac"', true, false, false);
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

				let found = md.search('"a"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);

				found = md.search('"k"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 110);

				found = md.search('"f"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 105);

				found = md.search('"cd"', true, false, false);
				assert.equal(found.length, 2);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 102);
			});

			test('overlapping findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "aaaaa");

				let found = md.search('"aaa"', true, false, false);
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

				let found = md.search('"a"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 2);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 104);

				found = md.search('"bc"', true, false, false);
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

				let found = md.search('"cdef"', true, false, false);
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
				let found = md.search('"abcdefg"', true, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);

				// Case sensitive
				found = md.search('"ABCDEFG"', true, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 200);

				// Case insensitive
				found = md.search('"abcdefg"', false, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 3);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 200);
				assert.equal(found.addresses[2], 300);

				// Case insensitive
				found = md.search('"ABCDEFG"', false, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 3);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 200);
				assert.equal(found.addresses[2], 300);

				// Case insensitive
				found = md.search('"ABCDefg"', false, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 3);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 200);
				assert.equal(found.addresses[2], 300);
			});

			test('zero-terminated', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefg");

				let found = md.search('"abcd"', true, true /*zero-termination*/, false);
				assert.equal(found.length, 4);
				assert.equal(found.addresses.length, 0);

				found = md.search('"defg"', true, true /*zero-termination*/, false);
				assert.equal(found.length, 4);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 103);
			});

			test('test all byte values', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);

				for (let val = 1; val < 256; val++) {
					md.setValueFor(100, val);
					let found = md.search(val.toString(), false, false, false);
					assert.equal(found.length, 1);
					assert.equal(found.addresses.length, 1);
					assert.equal(found.addresses[0], 100);
				}

				// Now test 0
				const block = md.metaBlocks[0]!;
				block.data!.fill(1, 0, block.size);
				md.setValueFor(100, 0);
				let found = md.search("0", false, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);
			});

			test('diff, no finding', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				let found = md.search('"ax"', true, false, true /*diff*/);
				assert.equal(found.length, 2);
				assert.equal(found.addresses.length, 0);
			});

			test('diff, 2 numbers, not invalid', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				let found = md.search('"ax"', true, false, true /*diff*/);
				assert.equal(found.length, 2);
				assert.notEqual(found.addresses, undefined);
			});

			test('diff, 1 finding', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				const found = md.search('"cdd"', true, false, true /*diff*/);
				assert.equal(found.length, 3);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);
			});

			test('diff, 2 findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdeff");

				const found = md.search('"cdd"', true, false, true /*diff*/);
				assert.equal(found.length, 3);
				assert.equal(found.addresses.length, 2);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 104);
			});
		});

		suite('searchDiff', () => {

			test('1 diff value', () => {
				const md = new MemoryDump() as any;
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "acdefghijk");

				let addrSet: Set<number> = md.searchDiff([2]);
				assert.equal(addrSet.size, 1);
				assert.ok(addrSet.has(100));

				addrSet = md.searchDiff([1]);
				assert.equal(addrSet.size, 8);
				assert.ok(addrSet.has(101));
				assert.ok(addrSet.has(102));
				assert.ok(addrSet.has(103));
				assert.ok(addrSet.has(104));
				assert.ok(addrSet.has(105));
				assert.ok(addrSet.has(106));
				assert.ok(addrSet.has(107));
				assert.ok(addrSet.has(108));

				addrSet = md.searchDiff([10]);
				assert.equal(addrSet.size, 0);
			});

			test('2 diff values', () => {
				const md = new MemoryDump() as any;
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "acdefgijk");

				let addrSet: Set<number> = md.searchDiff([2, 1]);
				assert.equal(addrSet.size, 2);
				assert.ok(addrSet.has(100));
				assert.ok(addrSet.has(105));
			});

			test('3 diff values', () => {
				const md = new MemoryDump() as any;
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abdaexx");

				let addrSet: Set<number> = md.searchDiff([2, 253, 4]);
				assert.equal(addrSet.size, 1);
				assert.ok(addrSet.has(101));
			});

			test('overlapping', () => {
				const md = new MemoryDump() as any;
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefg");

				let addrSet: Set<number> = md.searchDiff([1, 1, 1]);
				assert.equal(addrSet.size, 4);
				assert.ok(addrSet.has(100));
				assert.ok(addrSet.has(101));
				assert.ok(addrSet.has(102));
				assert.ok(addrSet.has(103));
			});

			test('max diff value', () => {
				const md = new MemoryDump() as any;
				md.addBlock(50, 1000);
				initBlocks(md);
				md.metaBlocks[0].data!.fill(20);

				md.setValueFor(100, 0);
				md.setValueFor(101, 255);
				md.setValueFor(200, 255);
				md.setValueFor(201, 254);

				md.setValueFor(400, 128);
				md.setValueFor(401, 0);
				md.setValueFor(500, 132);
				md.setValueFor(501, 4);

				let addrSet: Set<number> = md.searchDiff([255]);
				assert.equal(addrSet.size, 2);
				assert.ok(addrSet.has(100));
				assert.ok(addrSet.has(200));

				addrSet = md.searchDiff([128]);
				assert.equal(addrSet.size, 2);
				assert.ok(addrSet.has(400));
				assert.ok(addrSet.has(500));
			});
		});
	});
});
