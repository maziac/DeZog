import * as assert from 'assert';
import {ZxnDma} from '../src/remotes/zsimulator/zxndma';

suite('zxndma', function () {
	let dma: ZxnDma;

	beforeEach(function () {
		dma = new ZxnDma();
	});

	test('writeWR0 should set the correct properties', function () {
		dma.writeWR0(0x12);
		assert.equal(dma.someProperty, 0x12, 'someProperty should be set to 0x12');
	});

	test('writeWR1 should set the correct properties', function () {
		dma.writeWR1(0x34);
		assert.equal(dma.anotherProperty, 0x34, 'anotherProperty should be set to 0x34');
	});

	test('writeWR2 should set the correct properties', function () {
		dma.writeWR2(0x56);
		assert.equal(dma.yetAnotherProperty, 0x56, 'yetAnotherProperty should be set to 0x56');
	});

	test('writeWR3 should set the correct properties', function () {
		dma.writeWR3(0x78);
		assert.equal(dma.differentProperty, 0x78, 'differentProperty should be set to 0x78');
	});

	test('writeWR4 should set the correct properties', function () {
		dma.writeWR4(0x9A);
		assert.equal(dma.someOtherProperty, 0x9A, 'someOtherProperty should be set to 0x9A');
	});

	test('writeWR5 should set autoRestart correctly', function () {
		dma.writeWR5(0b0010_0000); // Set autoRestart bit
		assert.isTrue(dma.autoRestart, 'autoRestart should be true');

		dma.writeWR5(0b0000_0000); // Clear autoRestart bit
		assert.isFalse(dma.autoRestart, 'autoRestart should be false');
	});

	test('writeWR6 should call the correct methods based on value', function () {
		const resetSpy = sinon.spy(dma, 'reset');
		const resetPortAtimingSpy = sinon.spy(dma, 'resetPortAtiming');
		const resetPortBtimingSpy = sinon.spy(dma, 'resetPortBtiming');
		const readStatusByteSpy = sinon.spy(dma, 'readStatusByte');
		const reinitializeStatusByteSpy = sinon.spy(dma, 'reinitializeStatusByte');
		const initializeReadSequenceSpy = sinon.spy(dma, 'initializeReadSequence');
		const loadSpy = sinon.spy(dma, 'load');
		const continueSpy = sinon.spy(dma, 'continue');
		const enableDmaSpy = sinon.spy(dma, 'enableDma');

		dma.writeWR6(0xC3);
		assert.isTrue(resetSpy.calledOnce, 'reset should be called once');

		dma.writeWR6(0xC7);
		assert.isTrue(resetPortAtimingSpy.calledOnce, 'resetPortAtiming should be called once');

		dma.writeWR6(0xCB);
		assert.isTrue(resetPortBtimingSpy.calledOnce, 'resetPortBtiming should be called once');

		dma.writeWR6(0xBF);
		assert.isTrue(readStatusByteSpy.calledOnce, 'readStatusByte should be called once');

		dma.writeWR6(0x8B);
		assert.isTrue(reinitializeStatusByteSpy.calledOnce, 'reinitializeStatusByte should be called once');

		dma.writeWR6(0xA7);
		assert.isTrue(initializeReadSequenceSpy.calledOnce, 'initializeReadSequence should be called once');

		dma.writeWR6(0xCF);
		assert.isTrue(loadSpy.calledOnce, 'load should be called once');

		dma.writeWR6(0xD3);
		assert.isTrue(continueSpy.calledOnce, 'continue should be called once');

		dma.writeWR6(0x87);
		assert.isTrue(enableDmaSpy.calledOnce, 'enableDma should be called once');
	});
});