
import * as assert from 'assert';
import {Labels} from '../labels/labels';


suite('Labels (WPMEM, ASSERT, LOGPOINT)', () => {

	setup(() => {
		(Labels as any).init(250);
	});

	test('WPMEM', () => {
		// Read the list file
		const config={sjasmplus: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const wpmemLines=Labels.getWatchPointLines();
		assert.equal(wpmemLines.length, 8);
		assert.equal(wpmemLines[0].address, undefined);
		assert.equal(wpmemLines[0].line, "WPMEM");
		assert.equal(wpmemLines[1].address, 0xA000);
		assert.equal(wpmemLines[1].line, "WPMEM");
		assert.equal(wpmemLines[2].address, 0xA010);
		assert.equal(wpmemLines[2].line, "WPMEM, 5, w");
		assert.equal(wpmemLines[3].address, undefined);
		assert.equal(wpmemLines[3].line, "WPMEM 0x7000, 10,  r");
		assert.equal(wpmemLines[4].address, undefined);
		assert.equal(wpmemLines[4].line, "WPMEM 0x6000, 5,  w, A == 0");
		assert.equal(wpmemLines[5].address, undefined);
		assert.equal(wpmemLines[5].line, "WPMEM");
		assert.equal(wpmemLines[6].address, 0xA040);
		assert.equal(wpmemLines[6].line, "WPMEM");
		assert.equal(wpmemLines[7].address, 0xA041);
		assert.equal(wpmemLines[7].line, "WPMEM");
	});

	test('ASSERT', () => {
		// Read the list file
		const config={sjasmplus: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const assertLines=Labels.getAssertLines();
		assert.equal(assertLines.length, 2);
		assert.equal(assertLines[0].address, 0xA100);
		assert.equal(assertLines[0].line, "ASSERT");
		assert.equal(assertLines[1].address, 0xA101);
		assert.equal(assertLines[1].line, "ASSERT B==1");
	});

	test('LOGPOINT', () => {
		// Read the list file
		const config={sjasmplus: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const logpointLines=Labels.getLogPointLines();
		assert.equal(logpointLines.length, 4);
		assert.equal(logpointLines[0].address, 0xA200);
		assert.equal(logpointLines[1].address, 0xA201);
		assert.equal(logpointLines[2].address, 0xA202);
		assert.equal(logpointLines[3].address, 0xA203);
	});


});

