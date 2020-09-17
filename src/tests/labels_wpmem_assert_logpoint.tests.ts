
import * as assert from 'assert';
import {Labels} from '../labels/labels';


suite('Labels (WPMEM, ASSERT, LOGPOINT)', () => {

	setup(() => {
		(Labels as any).init(250);
	});

	test('WPMEM', () => {
		// Read the list file
		const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const wpmemLines=Labels.getWatchPointLines();
		assert.equal(wpmemLines.length, 4);
		assert.equal(wpmemLines[0].address, 0xA000);
		assert.equal(wpmemLines[0].line, "WPMEM");
		assert.equal(wpmemLines[1].address, 0xA010);
		assert.equal(wpmemLines[1].line, "WPMEM, 5, w");
		assert.equal(wpmemLines[2].address, undefined);
		assert.equal(wpmemLines[2].line, "WPMEM 0x7000, 10,  r");
		assert.equal(wpmemLines[3].address, undefined);
		assert.equal(wpmemLines[3].line, "WPMEM 0x6000, 5,  w, A == 0");
	});

	test('ASSERT', () => {
		// Read the list file
		const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const assertLines=Labels.getAssertLines();
		assert.equal(assertLines.length, 2);
		assert.equal(assertLines[0].address, 0xA020);
		assert.equal(assertLines[0].line, "ASSERT");
		assert.equal(assertLines[1].address, 0xA021);
		assert.equal(assertLines[1].line, "ASSERT B==1");
	});

	test('LOGPOINT', () => {
		// Read the list file
		const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/wpmem_assert_logpoint/wpmem_assert_logpoint.list', srcDirs: [""]}]};
		Labels.readListFiles(config);

		const logpointLines=Labels.getLogPointLines();
		assert.equal(logpointLines.length, 4);
		assert.equal(logpointLines[0].address, 0xA023);
		assert.equal(logpointLines[1].address, 0xA024);
		assert.equal(logpointLines[2].address, 0xA025);
		assert.equal(logpointLines[3].address, 0xA026);
	});


});

