
import * as assert from 'assert';
import { ZesaruxTransactionLog } from '../zesaruxtransactionlog';


suite('ZesaruxTransactionLog', () => {

/*
	setup( () => {
		return dc.start();
	});

	teardown( () => dc.disconnect() );
*/

	test('constructor', () => {
		const rf = new ZesaruxTransactionLog('xxxx.log') as any;
		assert.ok(!rf.file, "File pointer should be undefined.");
	});

	test('init', () => {
		const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
		rf.init();
		assert.ok(!rf.file, "File should not be opened.");
		assert.equal(rf.fileRotation, -1, "File rotation should have been initialized.");
		assert.equal(rf.cacheBuffer, undefined, "Cache should be cleared.");
		assert.equal(rf.cacheSizes.length, 0, "Array not initialized.");
		assert.equal(rf.fileOffset, 0, "File offset not initialized.");
		assert.equal(rf.cacheOffset, 0, "cacheOffset not initialized.");
		assert.equal(rf.cacheClip, 0, "cacheClip not initialized.");
	});


	suite('prevLine', () => {

		function prevOneFile(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log', cacheSize) as any;
			rf.init();

			assert.ok(rf.isAtStart(), "Should be at start of file(s).");
			assert.ok(!rf.isAtEnd(), "Should not be at end of file(s).");
			assert.ok(!rf.isInStepBackMode(), "Should not be in Step Back Mode.");

			let line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			assert.ok(!rf.isAtStart(), "Should not be at start of file(s).");
			assert.ok(!rf.isAtEnd(), "Should not be at end of file(s).");
			assert.ok(rf.isInStepBackMode(), "Should be in Step Back Mode.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8012'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8002'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8000'), "Line wrong.");

			assert.ok(!rf.isAtStart(), "Should not be at start of file(s).");
			assert.ok(!rf.isAtEnd(), "Should not be at end of file(s).");
			assert.ok(rf.isInStepBackMode(), "Should be in Step Back Mode.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			assert.ok(!rf.isAtStart(), "Should not be at start of file(s).");
			assert.ok(rf.isAtEnd(), "Should be at end of file(s).");
			assert.ok(rf.isInStepBackMode(), "Should be in Step Back Mode.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			assert.ok(!rf.isAtStart(), "Should not be at start of file(s).");
			assert.ok(rf.isAtEnd(), "Should be at end of file(s).");
			assert.ok(rf.isInStepBackMode(), "Should be in Step Back Mode.");
		}


		function prevTwoFiles(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot2/rot.log', cacheSize) as any;
			rf.init();

			rf.prevLine();
			let line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8010'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800E'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8002'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");
		}


		function prevThreeFiles(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot3/rot.log', cacheSize) as any;
			rf.init();

			// 1rst file
			rf.prevLine();
			let line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8012'), "Line wrong.");

			// 2nd file
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8010'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800C'), "Line wrong.");

			// 3rd file
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800A'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8005'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");
		}


		suite('Big cache', () => {
			test('1 file', () => {
				prevOneFile(10000);
			});

			test('2 files', () => {
				prevTwoFiles(10000);
			});

			test('3 files', () => {
				prevThreeFiles(10000);
			});
		});

		suite('Medium cache', () => {
			test('1 file', () => {
				prevOneFile(200);
			});

			test('2 files', () => {
				prevTwoFiles(200);
			});

			test('3 files', () => {
				prevThreeFiles(200);
			});
		});

		suite('Small cache', () => {
			test('1 file', () => {
				prevOneFile(100);
			});

			test('2 files', () => {
				prevTwoFiles(100);
			});

			test('3 files', () => {
				prevThreeFiles(100);
			});
		});

		suite('Pathological small cache (3)', () => {
			test('1 file', () => {
				prevOneFile(3);
			});

			test('2 files', () => {
				prevTwoFiles(3);
			});

			test('3 files', () => {
				prevThreeFiles(3);
			});
		});

	});


	suite('nextLine', () => {

		function nextOneFile(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log', cacheSize) as any;
			rf.init();

			assert.equal(rf.fileRotation, -1, "Internal counter wrong.");
			let line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.nextLine();
			assert.equal(rf.fileRotation, -1, "Internal counter wrong.");
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			rf.nextLine();
			assert.equal(rf.fileRotation, -1, "Internal counter wrong.");
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8012'), "Line wrong.");

			rf.nextLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8012'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8000'), "Line wrong.");

			rf.nextLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8002'), "Line wrong.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8000'), "Line wrong.");


			rf.prevLine();
			assert.equal(rf.fileRotation, 1, "Internal counter wrong.");
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 1, "Internal counter wrong.");
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");


			rf.nextLine();
			assert.equal(rf.fileRotation, 0, "Internal counter wrong.");
			line = rf.getLine();
			assert.ok(line.startsWith('8000'), "Line wrong.");

			rf.prevLine();
			assert.equal(rf.fileRotation, 1, "Internal counter wrong.");
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");
		}


		function nextTwoFiles(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot2/rot.log', cacheSize) as any;
			rf.init();

			rf.prevLine();
			let line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8010'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800E'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8002'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");
		}


		function nextThreeFiles(cacheSize: number) {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot3/rot.log', cacheSize) as any;
			rf.init();

			// 1rst file
			rf.prevLine();
			let line = rf.getLine();
			assert.ok(line.startsWith('8015'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8012'), "Line wrong.");

			// 2nd file
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8010'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800C'), "Line wrong.");

			// 3rd file
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('800A'), "Line wrong.");

			rf.prevLine();
			rf.prevLine();
			rf.prevLine();
			line = rf.getLine();
			assert.ok(line.startsWith('8005'), "Line wrong.");

			rf.prevLine();
			line = rf.getLine();
			assert.equal(line, '', "Line should be empty.");
		}


		suite('Big cache', () => {
			test('1 file', () => {
				nextOneFile(10000);
			});

			test('2 files', () => {
				nextTwoFiles(10000);
			});

			test('3 files', () => {
				nextThreeFiles(10000);
			});
		});

		suite('Medium cache', () => {
			test('1 file', () => {
				nextOneFile(200);
			});

			test('2 files', () => {
				nextTwoFiles(200);
			});

			test('3 files', () => {
				nextThreeFiles(200);
			});
		});

		suite('Small cache', () => {
			test('1 file', () => {
				nextOneFile(100);
			});

			test('2 files', () => {
				nextTwoFiles(100);
			});

			test('3 files', () => {
				nextThreeFiles(100);
			});
		});

		suite('Pathological small cache (3)', () => {
			test('1 file', () => {
				nextOneFile(3);
			});

			test('2 files', () => {
				nextTwoFiles(3);
			});

			test('3 files', () => {
				nextThreeFiles(3);
			});
		});

	});


	suite('getters', () => {

		test('getLine', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			rf.prevLine();
			let line = rf.getLine();
			assert.equal(line, "8015 LD A,FF PC=8015 SP=ff27 BC=253b AF=0044 HL=8080 DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=0d  F=-Z---P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0", "Line wrong.");
		});

		test('getRegisters', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			rf.prevLine();
			let line = rf.getRegisters();
			assert.equal(line, "PC=8015 SP=ff27 BC=253b AF=0044 HL=8080 DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=0d  F=-Z---P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0", "Registers wrong.");
		});

		test('getInstruction', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			rf.prevLine();
			let line = rf.getInstruction();
			assert.equal(line, "LD A,FF", "Instruction wrong.");
		});

		test('getAddress', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			rf.prevLine();
			let addr = rf.getAddress();
			assert.equal(addr, 0x8015, "Address wrong.");
		});

	});


	suite('isInStepBackMode', () => {

		function isInStepBackMode(rf: any) {
			rf.init();

			assert.ok(!rf.isInStepBackMode(), "Should not be in step-back-mode.");

			// Previous line
			let counter;
			let end = -1;
			for(counter = 0; counter < 1000; counter++) {
				rf.prevLine();
				assert.ok(rf.isInStepBackMode(), "Should be in step-back-mode.");
				if(end < 0 && rf.isAtEnd())
					end = counter;
			}

			// Next line
			for(counter = 0; counter < 1000; counter++) {
				rf.nextLine();
				if(!rf.isInStepBackMode())
					break;
			}
			assert.ok(!rf.isInStepBackMode(), "Should not be in step-back-mode.");
			assert.equal(counter, end, "Different number of prevLines and nextLines.");
		}


		test('1 file', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			isInStepBackMode(rf);
		});

		test('2 files', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot2/rot.log') as any;
			isInStepBackMode(rf);
		});

		test('3 files', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot 3/rot.log') as any;
			isInStepBackMode(rf);
		});
	});


	suite('getPrevAddresses', () => {

		test('1 file', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			let addrsArray = rf.getPrevAddresses([]);
			assert.equal(addrsArray.length, 0, "Wrong length.");

			addrsArray = rf.getPrevAddresses([0]);
			assert.equal(addrsArray.length, 1, "Wrong length.");
			assert.equal(addrsArray[0].size, 0, "Wrong number of addresses.");

			addrsArray = rf.getPrevAddresses([1]);
			assert.equal(addrsArray.length, 1, "Wrong length.");
			assert.equal(addrsArray[0].size, 1, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");

			addrsArray = rf.getPrevAddresses([2]);
			assert.equal(addrsArray.length, 1, "Wrong length.");
			assert.equal(addrsArray[0].size, 2, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[0].has(0x8012), "Address not included.");

			addrsArray = rf.getPrevAddresses([1000]);
			assert.equal(addrsArray.length, 1, "Wrong length.");
			assert.equal(addrsArray[0].size, 11, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[0].has(0x8012), "Address not included.");
			assert.ok(addrsArray[0].has(0x8010), "Address not included.");
			assert.ok(addrsArray[0].has(0x800E), "Address not included.");
			assert.ok(addrsArray[0].has(0x800C), "Address not included.");
			assert.ok(addrsArray[0].has(0x800A), "Address not included.");
			assert.ok(addrsArray[0].has(0x8007), "Address not included.");
			assert.ok(addrsArray[0].has(0x8006), "Address not included.");
			assert.ok(addrsArray[0].has(0x8005), "Address not included.");
			assert.ok(addrsArray[0].has(0x8002), "Address not included.");
			assert.ok(addrsArray[0].has(0x8000), "Address not included.");
		});

		test('1 file - 2 sets', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot1/rot.log') as any;
			rf.init();

			let addrsArray = rf.getPrevAddresses([0, 1]);
			assert.equal(addrsArray.length, 2, "Wrong length.");
			assert.equal(addrsArray[0].size, 0, "Wrong number of addresses.");
			assert.equal(addrsArray[1].size, 1, "Wrong number of addresses.");
			assert.ok(addrsArray[1].has(0x8015), "Address not included.");

			addrsArray = rf.getPrevAddresses([2, 3]);
			assert.equal(addrsArray.length, 2, "Wrong length.");
			assert.equal(addrsArray[0].size, 2, "Wrong number of addresses.");
			assert.equal(addrsArray[1].size, 3, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[0].has(0x8012), "Address not included.");
			assert.ok(addrsArray[1].has(0x8010), "Address not included.");
			assert.ok(addrsArray[1].has(0x800E), "Address not included.");

			addrsArray = rf.getPrevAddresses([2, 1000]);
			assert.equal(addrsArray.length, 2, "Wrong length.");
			assert.equal(addrsArray[0].size, 2, "Wrong number of addresses.");
			assert.equal(addrsArray[1].size, 9, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[0].has(0x8012), "Address not included.");
			assert.ok(addrsArray[1].has(0x8010), "Address not included.");
			assert.ok(addrsArray[1].has(0x8000), "Address not included.");

			addrsArray = rf.getPrevAddresses([1000]);
			assert.equal(addrsArray.length, 1, "Wrong length.");
			assert.equal(addrsArray[0].size, 11, "Wrong number of addresses.");
		});


		test('2 files - 2 sets', () => {
			const rf = new ZesaruxTransactionLog('./src/tests/data/rot2/rot.log') as any;
			rf.init();

			let addrsArray = rf.getPrevAddresses([1, 4]);
			assert.equal(addrsArray.length, 2, "Wrong length.");
			assert.equal(addrsArray[0].size, 1, "Wrong number of addresses.");
			assert.equal(addrsArray[1].size, 4, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[1].has(0x8012), "Address not included.");
			assert.ok(addrsArray[1].has(0x8010), "Address not included.");
			assert.ok(addrsArray[1].has(0x800E), "Address not included.");
			assert.ok(addrsArray[1].has(0x800C), "Address not included.");

			addrsArray = rf.getPrevAddresses([4, 10]);
			assert.equal(addrsArray.length, 2, "Wrong length.");
			assert.equal(addrsArray[0].size, 4, "Wrong number of addresses.");
			assert.equal(addrsArray[1].size, 6, "Wrong number of addresses.");
			assert.ok(addrsArray[0].has(0x8015), "Address not included.");
			assert.ok(addrsArray[0].has(0x800E), "Address not included.");
			assert.ok(addrsArray[1].has(0x800C), "Address not included.");
			assert.ok(addrsArray[1].has(0x8002), "Address not included.");
		});

	});

});