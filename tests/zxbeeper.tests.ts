import * as assert from 'assert';
import {ZxBeeper} from '../src/remotes/zsimulator/zxbeeper';



suite('ZxBeeper', () => {
	let zxBeeper: ZxBeeper;

	setup(() => {
		zxBeeper = new ZxBeeper(3500000, 22050, 50); // TODO REMOVE
	});

	test('constructor', () => {
		zxBeeper = new ZxBeeper(3500000, 22050, 50);
		let zxBeeperAny = zxBeeper as any;
		assert.equal(zxBeeperAny.sampleRate, 22050);
		assert.equal(zxBeeperAny.cpuFrequency, 3500000);
		assert.equal(zxBeeperAny.lastBeeperTstates, 0);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.notEqual(zxBeeperAny.lastBeeperValue, undefined);
		assert.notEqual(zxBeeperAny.beeperLenBuffer, undefined);
		assert.equal(zxBeeperAny.beeperLenBuffer.length, 882);

		zxBeeper = new ZxBeeper(100000, 44100, 60, 3000);
		zxBeeperAny = zxBeeper as any;
		assert.equal(zxBeeperAny.sampleRate, 44100);
		assert.equal(zxBeeperAny.cpuFrequency, 100000);
		assert.equal(zxBeeperAny.lastBeeperTstates, 3000);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.notEqual(zxBeeperAny.lastBeeperValue, undefined);
		assert.notEqual(zxBeeperAny.beeperLenBuffer, undefined);
		assert.equal(zxBeeperAny.beeperLenBuffer.length, 1470);
	});


	test('setLastBeeperValue', () => {
		const cpuFreq = 3500000;
		const sampleRate = 22000;
		zxBeeper = new ZxBeeper(cpuFreq, sampleRate, 50);
		let zxBeeperAny = zxBeeper as any;

		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Advance by 0
		zxBeeperAny.setLastBeeperValue(0);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Advance by 0.01s = 10ms
		zxBeeperAny.setLastBeeperValue(0.01 * cpuFreq);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate);

		// Advance by 1 time index
		zxBeeperAny.setLastBeeperValue((0.01 + 1 / sampleRate) * cpuFreq);
		assert.equal(zxBeeperAny.lastBeeperIndex, 2);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate + 1);

		// Advance by 0 time index, the existing last time index is adjusted to before
		zxBeeperAny.setLastBeeperValue((0.01 + 1.2 / sampleRate) * cpuFreq);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate);

		// Advance by 0 time index, changed value
		zxBeeperAny.setLastBeeperValue((0.01 + 1.2 / sampleRate) * cpuFreq);
		assert.equal(zxBeeperAny.lastBeeperIndex, 2);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate + 1);
	});


	test('setLastBeeperValue max', () => {
		const cpuFreq = 3500000;
		const sampleRate = 22000;
		zxBeeper = new ZxBeeper(cpuFreq, sampleRate, 50);
		let zxBeeperAny = zxBeeper as any;

		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0)

		// Increase to max available buffer.
		const bufMax = zxBeeperAny.beeperLenBuffer.length;
		zxBeeperAny.setLastBeeperValue(((bufMax - 1) / sampleRate) * cpuFreq + 0.1);	// +0.1: otherwise number will berounded wrong for test case
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, bufMax - 1)

		// Increase bigger than available buffer.
		zxBeeperAny.setLastBeeperValue((bufMax / sampleRate) * cpuFreq);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, bufMax - 1)
	});


	test('writeBeeper', () => {
		const cpuFreq = 3500000;
		const sampleRate = 22000;
		zxBeeper = new ZxBeeper(cpuFreq, sampleRate, 50);
		let zxBeeperAny = zxBeeper as any;

		// Initial conditions
		assert.equal(zxBeeperAny.lastBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0)

		// Advance by 0.01s = 10ms
		zxBeeperAny.writeBeeper(0.01 * cpuFreq, false);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate);

		// Advance to 0.02s = 20ms
		zxBeeperAny.writeBeeper(0.02 * cpuFreq, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 2);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.02 * sampleRate);

		// Advance to 0.03s = 30ms, same value
		zxBeeperAny.writeBeeper(0.03 * cpuFreq, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 2);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.02 * sampleRate);

		// Advance to 0.034s = 44ms, different value
		zxBeeperAny.writeBeeper(0.034 * cpuFreq, false);
		assert.equal(zxBeeperAny.lastBeeperIndex, 3);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.034 * sampleRate);
	});


	test('writeBeeper different values, same sample', () => {
		const cpuFreq = 3500000;
		const sampleRate = 22000;
		zxBeeper = new ZxBeeper(cpuFreq, sampleRate, 50);
		let zxBeeperAny = zxBeeper as any;

		// Initial conditions
		assert.equal(zxBeeperAny.lastBeeperValue, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0)

		// Advance by 0.01s = 10ms
		zxBeeperAny.writeBeeper(0.01 * cpuFreq, false);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate);

		// Different value
		zxBeeperAny.writeBeeper(0.01 * cpuFreq, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Again
		zxBeeperAny.writeBeeper(0.01 * cpuFreq, false);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.01 * sampleRate);

		// Again
		zxBeeperAny.writeBeeper(0.01 * cpuFreq, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Advance to 0.02s = 20ms, different value
		zxBeeperAny.writeBeeper(0.02 * cpuFreq, false);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 1);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0.02 * sampleRate);
	});


	test('writeBeeper different values, same sample, at start', () => {
		const cpuFreq = 3500000;
		const sampleRate = 22000;
		zxBeeper = new ZxBeeper(cpuFreq, sampleRate, 50);
		let zxBeeperAny = zxBeeper as any;

		// Initial conditions
		assert.equal(zxBeeperAny.lastBeeperValue, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0)

		// Same value
		zxBeeperAny.writeBeeper(0, true);
		assert.equal(zxBeeperAny.lastBeeperValue, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Different value
		zxBeeperAny.writeBeeper(0, false);
		assert.equal(zxBeeperAny.lastBeeperValue, false);
		assert.equal(zxBeeperAny.startBeeperValue, false);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

		// Different value
		zxBeeperAny.writeBeeper(0, true);
		assert.equal(zxBeeperAny.lastBeeperValue, true);
		assert.equal(zxBeeperAny.startBeeperValue, true);
		assert.equal(zxBeeperAny.lastBeeperIndex, 0);
		assert.equal(zxBeeperAny.lastBeeperTimeIndex, 0);

	});

	// Auch für start wert
	// Auch same value

});


