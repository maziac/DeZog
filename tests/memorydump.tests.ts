
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {FoundAddresses, MemoryDump} from '../src/misc/memorydump';
import {MetaBlock} from '../src/misc/metablock';

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

			function search(md: MemoryDump, searchInput: string, caseSensitive: boolean, zero: boolean, diff: boolean): FoundAddresses {
				const searchInputData = md.parseSearchInput(searchInput);
				const found = md.searchData(searchInputData, caseSensitive, zero, diff);
				return found;
			}

			test('wrong input, found addresses undefined', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				// Unfinished string
				assert.throws(() => {
					search(md, '"z', true, false, false);
				});

				// 2nd string open
				assert.throws(() => {
					search(md, '"zl" "', true, false, false);
				});

				// Wrong formatted number
				assert.throws(() => {
					search(md, '0Gh', true, false, false);
				});

				// Separators other than space used
				assert.throws(() => {
					search(md, '0, 2', true, false, false);

				});

				// diff, too less input
				const found = search(md, '8', false, false, true);
				assert.equal(found.addresses, undefined);
			});

			test('no findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				let found = search(md, '"z"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 0);

				found = search(md, '"ac"', true, false, false);
				assert.equal(found.length, 2);
				assert.equal(found.addresses.length, 0);
			});

			test('no input', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				const found = search(md, '', true, false, false);
				assert.equal(found.length, 0);
				assert.equal(found.addresses.length, 0);
			});

			test('1 finding', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abcdefghijk");

				let found = search(md, '"a"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);

				found = search(md, '"k"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 110);

				found = search(md, '"f"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 105);

				found = search(md, '"cd"', true, false, false);
				assert.equal(found.length, 2);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 102);
			});

			test('overlapping findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "aaaaa");

				let found = search(md, '"aaa"', true, false, false);
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

				let found = search(md, '"a"', true, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 2);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 104);

				found = search(md, '"bc"', true, false, false);
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

				let found = search(md, '"cdef"', true, false, false);
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
				let found = search(md, '"abcdefg"', true, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);

				// Case sensitive
				found = search(md, '"ABCDEFG"', true, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 200);

				// Case insensitive
				found = search(md, '"abcdefg"', false, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 3);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 200);
				assert.equal(found.addresses[2], 300);

				// Case insensitive
				found = search(md, '"ABCDEFG"', false, false, false);
				assert.equal(found.length, 7);
				assert.equal(found.addresses.length, 3);
				assert.equal(found.addresses[0], 100);
				assert.equal(found.addresses[1], 200);
				assert.equal(found.addresses[2], 300);

				// Case insensitive
				found = search(md, '"ABCDefg"', false, false, false);
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

				let found = search(md, '"abcd"', true, true /*zero-termination*/, false);
				assert.equal(found.length, 4);
				assert.equal(found.addresses.length, 0);

				found = search(md, '"defg"', true, true /*zero-termination*/, false);
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
					let found = search(md, val.toString(), false, false, false);
					assert.equal(found.length, 1);
					assert.equal(found.addresses.length, 1);
					assert.equal(found.addresses[0], 100);
				}

				// Now test 0
				const block = md.metaBlocks[0]!;
				block.data!.fill(1, 0, block.size);
				md.setValueFor(100, 0);
				let found = search(md, "0", false, false, false);
				assert.equal(found.length, 1);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);
			});

			test('diff, no finding', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				let found = search(md, '"ax"', true, false, true /*diff*/);
				assert.equal(found.length, 2);
				assert.equal(found.addresses.length, 0);
			});

			test('diff, 2 numbers, not invalid', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				let found = search(md, '"ax"', true, false, true /*diff*/);
				assert.equal(found.length, 2);
				assert.notEqual(found.addresses, undefined);
			});

			test('diff, 1 finding', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdefg");

				const found = search(md, '"cdd"', true, false, true /*diff*/);
				assert.equal(found.length, 3);
				assert.equal(found.addresses.length, 1);
				assert.equal(found.addresses[0], 100);
			});

			test('diff, 2 findings', () => {
				const md = new MemoryDump();
				md.addBlock(50, 1000);
				initBlocks(md);
				copyToAddress(md, 100, "abbdeff");

				const found = search(md, '"cdd"', true, false, true /*diff*/);
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

		suite('getChangedValues', () => {

			test('no change', () => {
				const md = new MemoryDump() as any;
				md.addBlockWithoutBoundary(100, 20);
				const data = new Uint8Array(20);
				const prevData = new Uint8Array(20);
				md.metaBlocks[0].data = data;
				md.metaBlocks[0].prevData = prevData;
				data[0] = 12;
				data[17] = 0xFE;
				prevData[0] = 12;
				prevData[17] = 0xFE;
				const vals = md.metaBlocks[0].getChangedValues();
				assert.equal(vals.length, 0);
			});

			test('1 change', () => {
				const md = new MemoryDump() as any;
				md.addBlockWithoutBoundary(100, 20);
				const data = new Uint8Array(20);
				const prevData = new Uint8Array(20);
				md.metaBlocks[0].data = data;
				md.metaBlocks[0].prevData = prevData;
				data[0] = 12;
				data[17] = 0xFE;
				prevData[0] = 12;
				prevData[17] = 0xAB;
				const vals = md.metaBlocks[0].getChangedValues();
				assert.equal(vals.length, 1);
				assert.equal(vals[0][0], 100 + 17);
				assert.equal(vals[0][1], 0xFE);
			});

			test('2 changes', () => {
				const md = new MemoryDump() as any;
				md.addBlockWithoutBoundary(100, 20);
				const data = new Uint8Array(20);
				const prevData = new Uint8Array(20);
				md.metaBlocks[0].data = data;
				md.metaBlocks[0].prevData = prevData;
				data[0] = 12;
				data[17] = 0xFE;
				prevData[0] = 123;
				prevData[17] = 0xAB;
				const vals = md.metaBlocks[0].getChangedValues();
				assert.equal(vals.length, 2);
				assert.equal(vals[0][0], 100 + 0);
				assert.equal(vals[0][1], 12);
				assert.equal(vals[1][0], 100 + 17);
				assert.equal(vals[1][1], 0xFE);
			});

			test('3 changes', () => {
				const md = new MemoryDump() as any;
				md.addBlockWithoutBoundary(100, 20);
				const data = new Uint8Array(20);
				const prevData = new Uint8Array(20);
				md.metaBlocks[0].data = data;
				md.metaBlocks[0].prevData = prevData;
				data[0] = 12;
				data[17] = 0xFE;
				data[19] = 1;
				prevData[0] = 123;
				prevData[17] = 0xAB;
				const vals = md.metaBlocks[0].getChangedValues();
				assert.equal(vals.length, 3);
				assert.equal(vals[0][0], 100 + 0);
				assert.equal(vals[0][1], 12);
				assert.equal(vals[1][0], 100 + 17);
				assert.equal(vals[1][1], 0xFE);
				assert.equal(vals[2][0], 100 + 19);
				assert.equal(vals[2][1], 1);
			});
		})
	});


	suite('clone', () => {

		// Tests that a and b have same elements but references are different.
		function uint8ArrayEqual(a: Uint8Array | undefined, b: Uint8Array | undefined) {
			if (a == undefined || b == undefined) {
				assert.equal(a, b);	// Both need to be undefined
				return;
			}
			const len = a!.length;
			assert.equal(len, b!.length);
			for (let i = 0; i < len; i++) {
				assert.equal(a![i], b![i]);
			}
			// Everything equal
		}

		function checkMetaBlockCloneEqual(base: MetaBlock) {
			// Clone
			const clone = base.clone();
			// And test
			assert.equal(clone.address, base.address);
			assert.equal(clone.size, base.size);
			const mbLen = clone.memBlocks.length;
			assert.equal(mbLen, base.memBlocks.length);
			for (let i = 0; i < mbLen; i++) {
				//assert.equal(JSON.stringify(clone.memBlocks[i]), JSON.stringify(base.memBlocks[i]));
				assert.deepStrictEqual(clone.memBlocks[i], base.memBlocks[i]);
				// But "pointers" are not equal
				assert.notEqual(clone.memBlocks[i], base.memBlocks[i]);
			}
			// But "pointers" are not equal
			assert.notEqual(clone.memBlocks, base.memBlocks);

			// data and prevData
			uint8ArrayEqual(clone.data, base.data);
			uint8ArrayEqual(clone.prevData, base.prevData);

			assert.equal(clone.title, base.title);
		}


		test('metaBlock empty', () => {
			const mb = new MetaBlock(1, 2, [], 'title1');
			checkMetaBlockCloneEqual(mb);
		});

		test('1 metaBlock', () => {
			const mb = new MetaBlock(100, 200, [
				{
					address: 100,
					size: 200
				}
			]);
			checkMetaBlockCloneEqual(mb);
		});

		test('2 metaBlocks', () => {
			const mb = new MetaBlock(100, 1000, [
				{
					address: 100,
					size: 200
				},
				{
					address: 500,
					size: 100
				}
			]);
			checkMetaBlockCloneEqual(mb);
		});

		test('metaBlock and data', () => {
			const mb = new MetaBlock(100, 5, [
				{
					address: 100,
					size: 5
				}
			]);
			mb.data = new Uint8Array([1, 3, 5, 7, 9]);
			mb.prevData = new Uint8Array([0, 2, 4, 6, 8]);
			checkMetaBlockCloneEqual(mb);
		});
	});


	suite('getDiffMemDump', () => {

		test('empty', () => {
			const md1 = new MemoryDump();
			const md2 = md1.clone();
			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 0);
		});

		test('no difference', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[5] = 17;
			const md2 = md1.clone();
			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 0);
		});

		test('1 difference', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[5] = 17;
			const md2 = md1.clone();
			md2.metaBlocks[0].data![5] = 22;
			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 105);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 22);
			assert.equal(diff.metaBlocks[0].prevData![0], 17);
		});

		test('difference at start', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[0] = 17;
			const md2 = md1.clone();
			md2.metaBlocks[0].data![0] = 22;
			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 100);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 22);
			assert.equal(diff.metaBlocks[0].prevData![0], 17);
		});


		test('difference at end', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[199] = 17;
			const md2 = md1.clone();
			md2.metaBlocks[0].data![199] = 22;
			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 299);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 22);
			assert.equal(diff.metaBlocks[0].prevData![0], 17);
		});

		test('more differences', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[5] = 17;
			md1.metaBlocks[0].data[6] = 18;
			md1.metaBlocks[0].data[10] = 19;
			md1.metaBlocks[0].data[11] = 20;
			md1.metaBlocks[0].data[12] = 21;
			md1.metaBlocks[0].data[13] = 22;
			md1.metaBlocks[0].data[20] = 30;
			md1.metaBlocks[0].data[30] = 31;
			const md2 = md1.clone();

			md2.metaBlocks[0].data![5] = 117;
			md2.metaBlocks[0].data![6] = 118;

			md2.metaBlocks[0].data![10] = 119;
			md2.metaBlocks[0].data![11] = 120;
			md2.metaBlocks[0].data![12] = 121;

			md2.metaBlocks[0].data![13] = 22;	// Equal

			md2.metaBlocks[0].data![20] = 130;

			md2.metaBlocks[0].data![30] = 131;

			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 4);

			assert.equal(diff.metaBlocks[0].address, 105);
			assert.deepEqual(Array.from(diff.metaBlocks[0].data!), [117, 118]);
			assert.deepEqual(Array.from(diff.metaBlocks[0].prevData!), [17, 18]);

			assert.equal(diff.metaBlocks[1].address, 110);
			assert.deepEqual(Array.from(diff.metaBlocks[1].data!), [119, 120, 121]);
			assert.deepEqual(Array.from(diff.metaBlocks[1].prevData!), [19, 20, 21]);

			assert.equal(diff.metaBlocks[2].address, 120);
			assert.deepEqual(Array.from(diff.metaBlocks[2].data!), [130]);
			assert.deepEqual(Array.from(diff.metaBlocks[2].prevData!), [30]);

			assert.equal(diff.metaBlocks[3].address, 130);
			assert.deepEqual(Array.from(diff.metaBlocks[3].data!), [131]);
			assert.deepEqual(Array.from(diff.metaBlocks[3].prevData!), [31]);
		});

		test('3 meta blocks', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 200);
			md1.addBlockWithoutBoundary(300, 100);
			md1.addBlockWithoutBoundary(1000, 50);
			md1.metaBlocks[0].data = new Uint8Array(200);
			md1.metaBlocks[0].data[6] = 18;
			md1.metaBlocks[0].data[199] = 31;
			md1.metaBlocks[1].data = new Uint8Array(100);
			md1.metaBlocks[1].data[0] = 32;
			md1.metaBlocks[1].data[1] = 33;
			md1.metaBlocks[2].data = new Uint8Array(50);
			md1.metaBlocks[2].data[25] = 40;
			md1.metaBlocks[2].data[26] = 41;

			const md2 = md1.clone();

			md2.metaBlocks[0].data![6] = 19;
			md2.metaBlocks[0].data![199] = 32;
			md2.metaBlocks[1].data![0] = 33;
			md2.metaBlocks[1].data![1] = 34;
			md2.metaBlocks[2].data![25] = 41;
			md2.metaBlocks[2].data![26] = 42;

			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 3);

			assert.equal(diff.metaBlocks[0].address, 106);
			assert.deepEqual(Array.from(diff.metaBlocks[0].data!), [19]);
			assert.deepEqual(Array.from(diff.metaBlocks[0].prevData!), [18]);

			assert.equal(diff.metaBlocks[1].address, 299);
			assert.deepEqual(Array.from(diff.metaBlocks[1].data!), [32, 33, 34]);
			assert.deepEqual(Array.from(diff.metaBlocks[1].prevData!), [31, 32, 33]);

			assert.equal(diff.metaBlocks[2].address, 1025);
			assert.deepEqual(Array.from(diff.metaBlocks[2].data!), [41, 42]);
			assert.deepEqual(Array.from(diff.metaBlocks[2].prevData!), [40, 41]);
		});

		test('meta blocks borders', () => {
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 100);
			md1.addBlockWithoutBoundary(200, 100);
			md1.addBlockWithoutBoundary(300, 100);
			md1.addBlockWithoutBoundary(400, 100);
			md1.addBlockWithoutBoundary(500, 100);
			md1.metaBlocks[0].data = new Uint8Array(100);
			md1.metaBlocks[0].data[99] = 31;
			md1.metaBlocks[1].data = new Uint8Array(100);
			md1.metaBlocks[1].data[0] = 32;
			md1.metaBlocks[1].data[99] = 33;
			md1.metaBlocks[2].data = new Uint8Array(100);
			md1.metaBlocks[2].data[98] = 34;
			md1.metaBlocks[2].data[99] = 35;
			md1.metaBlocks[3].data = new Uint8Array(100);
			md1.metaBlocks[3].data[0] = 36;
			md1.metaBlocks[4].data = new Uint8Array(100);
			md1.metaBlocks[4].data[0] = 37;

			const md2 = md1.clone();

			md2.metaBlocks[0].data![99] = 131;
			md2.metaBlocks[1].data![0] = 132;

			md2.metaBlocks[1].data![99] = 133;

			md2.metaBlocks[2].data![98] = 134;
			md2.metaBlocks[2].data![99] = 135;
			md2.metaBlocks[3].data![0] = 136;

			md2.metaBlocks[4].data![0] = 137;

			const diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 4);

			assert.equal(diff.metaBlocks[0].address, 199);
			assert.deepEqual(Array.from(diff.metaBlocks[0].data!), [131, 132]);
			assert.deepEqual(Array.from(diff.metaBlocks[0].prevData!), [31, 32]);

			assert.equal(diff.metaBlocks[1].address, 299);
			assert.deepEqual(Array.from(diff.metaBlocks[1].data!), [133]);
			assert.deepEqual(Array.from(diff.metaBlocks[1].prevData!), [33]);

			assert.equal(diff.metaBlocks[2].address, 398);
			assert.deepEqual(Array.from(diff.metaBlocks[2].data!), [134, 135, 136]);
			assert.deepEqual(Array.from(diff.metaBlocks[2].prevData!), [34, 35, 36]);

			assert.equal(diff.metaBlocks[3].address, 500);
			assert.deepEqual(Array.from(diff.metaBlocks[3].data!), [137]);
			assert.deepEqual(Array.from(diff.metaBlocks[3].prevData!), [37]);
		});

		test("criteria 'no check'", () => {
			// Not yet implemented
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 5);
			md1.metaBlocks[0].data = new Uint8Array([10, 11, 12, 13, 14]);
			const md2 = md1.clone();
			md2.metaBlocks[0].data![0] = 10;	// same
			md2.metaBlocks[0].data![1] = 12;	// +1
			md2.metaBlocks[0].data![2] = 14;	// +2
			md2.metaBlocks[0].data![3] = 12;	// -1
			md2.metaBlocks[0].data![4] = 12;	// -2

			// Not check
			const diff = md2.getDiffMemDump(md1, 'no check');
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 100);
			assert.equal(diff.metaBlocks[0].size, 5);
			assert.equal(diff.metaBlocks[0].data![0], 10);
			assert.equal(diff.metaBlocks[0].prevData![0], 10);
			assert.equal(diff.metaBlocks[0].data![1], 12);
			assert.equal(diff.metaBlocks[0].prevData![1], 11);
			assert.equal(diff.metaBlocks[0].data![2], 14);
			assert.equal(diff.metaBlocks[0].prevData![2], 12);
			assert.equal(diff.metaBlocks[0].data![3], 12);
			assert.equal(diff.metaBlocks[0].prevData![3], 13);
			assert.equal(diff.metaBlocks[0].data![4], 12);
			assert.equal(diff.metaBlocks[0].prevData![4], 14);
		});

		test('criteria number', () => {
			// Not yet implemented
			const md1 = new MemoryDump();
			md1.addBlockWithoutBoundary(100, 5);
			md1.metaBlocks[0].data = new Uint8Array([10, 11, 12, 13, 14]);
			const md2 = md1.clone();
			md2.metaBlocks[0].data![0] = 10;	// same
			md2.metaBlocks[0].data![1] = 12;	// +1
			md2.metaBlocks[0].data![2] = 14;	// +2
			md2.metaBlocks[0].data![3] = 12;	// -1
			md2.metaBlocks[0].data![4] = 12;	// -2

			// Equal
			let diff = md2.getDiffMemDump(md1, 0);
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 100);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 10);
			assert.equal(diff.metaBlocks[0].prevData![0], 10);

			// +1
			diff = md2.getDiffMemDump(md1, 1);
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 101);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 12);
			assert.equal(diff.metaBlocks[0].prevData![0], 11);

			// +2
			diff = md2.getDiffMemDump(md1, 2);
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 102);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 14);
			assert.equal(diff.metaBlocks[0].prevData![0], 12);

			// -1
			diff = md2.getDiffMemDump(md1, -1);
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 103);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 12);
			assert.equal(diff.metaBlocks[0].prevData![0], 13);

			// -2
			diff = md2.getDiffMemDump(md1, -2);
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 104);
			assert.equal(diff.metaBlocks[0].size, 1);
			assert.equal(diff.metaBlocks[0].data![0], 12);
			assert.equal(diff.metaBlocks[0].prevData![0], 14);

			// Not equal
			diff = md2.getDiffMemDump(md1, 'not equal');
			assert.equal(diff.metaBlocks.length, 1);
			assert.equal(diff.metaBlocks[0].address, 101);
			assert.equal(diff.metaBlocks[0].size, 4);
			assert.equal(diff.metaBlocks[0].data![0], 12);
			assert.equal(diff.metaBlocks[0].prevData![0], 11);
			assert.equal(diff.metaBlocks[0].data![1], 14);
			assert.equal(diff.metaBlocks[0].prevData![1], 12);
			assert.equal(diff.metaBlocks[0].data![2], 12);
			assert.equal(diff.metaBlocks[0].prevData![2], 13);
			assert.equal(diff.metaBlocks[0].data![3], 12);
			assert.equal(diff.metaBlocks[0].prevData![3], 14);
		});

	});
});
