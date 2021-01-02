
import * as assert from 'assert';
import {Labels} from '../labels/labels';


suite('Labels (WPMEM, ASSERTION, LOGPOINT)', () => {

	setup(() => {
		(Labels as any).init(250);
	});

	test('WPMEM', () => {
		// Read the list file
		const config = {
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/wpmem_assertion_logpoint/wpmem_assertion_logpoint.sld',
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		Labels.readListFiles(config);

		const wpmemLines = Labels.getWatchPointLines();
		assert.equal(wpmemLines.length, 7);
		assert.equal(wpmemLines[0].address, 0x10000 + 0xA000);
		assert.equal(wpmemLines[0].line, "WPMEM");
		assert.equal(wpmemLines[1].address, 0x10000 + 0xA010);
		assert.equal(wpmemLines[1].line, "WPMEM, 5, w");
		assert.equal(wpmemLines[2].address, 0x10000 + 0xA020);
		assert.equal(wpmemLines[2].line, "WPMEM 0x7000, 10,  r");
		assert.equal(wpmemLines[3].address, 0x10000 + 0xA020);
		assert.equal(wpmemLines[3].line, "WPMEM 0x6000, 5,  w, A == 0");
		assert.equal(wpmemLines[4].address, 0x10000 + 0xA020);
		assert.equal(wpmemLines[4].line, "WPMEM");
		assert.equal(wpmemLines[5].address, 0x10000 + 0xA040);
		assert.equal(wpmemLines[5].line, "WPMEM");
		assert.equal(wpmemLines[6].address, 0x10000 + 0xA041);
		assert.equal(wpmemLines[6].line, "WPMEM");
	});

	test('WPMEM 64k', () => {
		// Read the list file
		const config = {
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/wpmem_assertion_logpoint/wpmem_assertion_logpoint.sld',
				srcDirs: [""],	// Sources mode
				excludeFiles: [],
				disableBanking: true
			}]
		};
		Labels.readListFiles(config);

		const wpmemLines = Labels.getWatchPointLines();
		assert.equal(wpmemLines.length, 7);
		assert.equal(wpmemLines[0].address, 0xA000);
		assert.equal(wpmemLines[0].line, "WPMEM");
	});

	test('ASSERTION', () => {
		// Read the list file
		const config={
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/wpmem_assertion_logpoint/wpmem_assertion_logpoint.sld',
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		Labels.readListFiles(config);

		const assertionLines=Labels.getAssertionLines();
		assert.equal(assertionLines.length, 2);
		assert.equal(assertionLines[0].address, 0x10000 + 0xA100);
		assert.equal(assertionLines[0].line, "ASSERTION");
		assert.equal(assertionLines[1].address, 0x10000 + 0xA101);
		assert.equal(assertionLines[1].line, "ASSERTION B==1");
	});

	test('LOGPOINT', () => {
		// Read the list file
		const config={
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/wpmem_assertion_logpoint/wpmem_assertion_logpoint.sld',
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		Labels.readListFiles(config);

		const logpointLines=Labels.getLogPointLines();
		assert.equal(logpointLines.length, 4);
		assert.equal(logpointLines[0].address, 0x10000 + 0xA200);
		assert.equal(logpointLines[1].address, 0x10000 + 0xA201);
		assert.equal(logpointLines[2].address, 0x10000 + 0xA202);
		assert.equal(logpointLines[3].address, 0x10000 + 0xA203);
	});


});

