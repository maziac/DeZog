
import * as assert from 'assert';
import { RotationFile } from '../rotationfile';

suite('RotationFile', () => {

/*
	setup( () => {
		return dc.start();
	});

	teardown( () => dc.disconnect() );
*/

	test('constructor', () => {
		const rf = new RotationFile('xxxx.log') as any;
		assert.ok(!rf.file, "File pointer should be undefined.");
	});

	test('init', () => {
		const rf = new RotationFile('./src/tests/data/rot1/rot.log') as any;
		rf.init();
		assert.ok(rf.file, "File should have been opened.");
		assert.equal(rf.fileRotation, 0, "File rotation should have been initialized.");
	});


	suite('readReverseData', () => {

		test('readReverseData 1 file', () => {
			const rf = new RotationFile('./src/tests/data/rot1/rot.log') as any;

			// Read all
			let data = rf.readReverseData(100000, 4);
			let dataStr = String.fromCharCode.apply(null, data);
			let lines = dataStr.split('\n');
			assert.equal(lines.length, 12, "Number of lines wrong.");

			// Read last lines, check that not 4 more bytes are read
			rf.init();
			data = rf.readReverseData(100, 4);
			let count = data.length;
			dataStr = String.fromCharCode.apply(null, data);
			lines = dataStr.split('\n');
			assert.equal(count, 100, "Number of read bytes wrong.");

			// Read previous lines, check that 4 more bytes are read
			const prevLine = lines[0];
			data = rf.readReverseData(100, 4);
			count = data.length;
			dataStr = String.fromCharCode.apply(null, data);
			lines = dataStr.split('\n');
			const lastLine = lines[lines.length-1];
			assert.equal(count, 104, "Number of read bytes wrong.");
			assert.ok(lastLine.substr(lastLine.length-4) == prevLine.substr(0,4), "Read overlap is wrong.");

			// Read rest of the lines
			data = rf.readReverseData(10000, 4);
			dataStr = String.fromCharCode.apply(null, data);
			lines = dataStr.split('\n');
			assert.ok(lines[0].startsWith('8000'), "Read overlap is wrong.");
		});


		test('readReverseData 2 files - big chunks', () => {
			const rf = new RotationFile('./src/tests/data/rot2/rot.log') as any;

			// Read all
			let data = rf.readReverseData(100000, 4);
			let dataStr = String.fromCharCode.apply(null, data);
			let lines = dataStr.split('\n');
			assert.equal(lines.length, 4, "Number of lines wrong.");
			assert.ok(lines[0].startsWith('8010'), "Wrong data read.");
		});


		test('readReverseData 2 files - small chunk', () => {
			const rf = new RotationFile('./src/tests/data/rot2/rot.log') as any;

			// Read almost all
			rf.init();
			const size = rf.fileSize;
			let data = rf.readReverseData(size-2, 4);
			let dataStr = String.fromCharCode.apply(null, data);
			let lines = dataStr.split('\n');
			assert.equal(lines.length, 4, "Number of lines wrong.");
			assert.ok(lines[0].startsWith('10'), "Wrong data read.");

			// Read area between file and first rotation
			data = rf.readReverseData(50, 4);
			assert.equal(data.length, 2+4, "Number of read data wrong.");
			dataStr = String.fromCharCode.apply(null, data);
			assert.equal(dataStr, "8010 I", "Wrong data read.");

			// Read area between file and first rotation - part of the 2nd file
			data = rf.readReverseData(10, 4);
			assert.equal(data.length, 10, "Number of read data wrong.");
			dataStr = String.fromCharCode.apply(null, data);
			assert.equal(dataStr, "-- VPS: 0\n", "Wrong data read.");
		});

		test('readReverseData 3 files - big chunks', () => {
			const rf = new RotationFile('./src/tests/data/rot3/rot.log') as any;

			// Read all
			rf.init();
			const data = rf.readReverseData(100000, 4);
			const dataStr = String.fromCharCode.apply(null, data);
			const lines = dataStr.split('\n');
			assert.equal(lines.length, 2+1, "Number of lines wrong.");

			// Read first rotated file
			const data1 = rf.readReverseData(100000, 4);
			const dataStr1 = String.fromCharCode.apply(null, data1);
			const lines1 = dataStr1.split('\n');
			assert.equal(lines1.length, 3+1, "Number of lines wrong.");

			// Read 2nd rotated file
			const data2 = rf.readReverseData(100000, 4);
			const dataStr2 = String.fromCharCode.apply(null, data2);
			const lines2 = dataStr2.split('\n');
			assert.equal(lines2.length, 4+1, "Number of lines wrong.");

			// Check all files altogether
			lines2.push(...lines1);
			lines2.push(...lines);
			assert.ok(lines2[0].startsWith('8005'), "Wrong data read.");
			assert.ok(lines2[1].startsWith('8006'), "Wrong data read.");
			assert.ok(lines2[2].startsWith('8007'), "Wrong data read.");
			assert.ok(lines2[3].startsWith('800A'), "Wrong data read.");
			assert.ok(lines2[4] == '', "Wrong data read.");

			assert.ok(lines2[5].startsWith('800C'), "Wrong data read.");
			assert.ok(lines2[6].startsWith('800E'), "Wrong data read.");
			assert.ok(lines2[7].startsWith('8010'), "Wrong data read.");
			assert.ok(lines2[8] == '', "Wrong data read.");

			assert.ok(lines2[9].startsWith('8012'), "Wrong data read.");
			assert.ok(lines2[10].startsWith('8015'), "Wrong data read.");
			assert.ok(lines2[11] == '', "Wrong data read.");

			// Read next non existing file
			const data3 = rf.readReverseData(100000, 4);
			assert.equal(data3.length, 0, "Shouldn't contain data.");

			// Read next non existing file once more
			const data3b = rf.readReverseData(100000, 4);
			assert.equal(data3b.length, 0, "Shouldn't contain data.");
		});

	});

});