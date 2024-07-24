import * as assert from 'assert';
import {ZxnDma} from '../src/remotes/zsimulator/zxndma';
import * as sinon from 'sinon';



suite('ZxnDma', function () {
	let dma;

	setup(() => {
		dma = new ZxnDma() as any;
	});

	suite('general', function () {
		test('constructor', function () {
			assert.equal(dma.nextDecodeBitMask, 0);
		});
	});

	suite('writeWR0', function () {
		test('transferDirectionPortAtoB', function () {
			dma.writePortFunc(0b0000_0101);
			assert.ok(dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			dma.writePortFunc(0b0000_0001);
			assert.ok(!dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
		});
		test('full sequence', function () {
			dma.writePortFunc(0b0111_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writeWR0);
			dma.writePortFunc(0xF1);	// Port A start low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0xA7);	// Port A start high
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x02);	// Block len low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0xFC);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			// Check values
			assert.equal(dma.portAstartAddress, 0xA7F1);
			assert.equal(dma.blockLength, 0xFC02);
		});
		test('parts', function () {
			// Predefine values
			dma.portAstartAddress = 0xBCDE;
			dma.blockLength = 0x1234;

			// Exchange 1 by one
			dma.writePortFunc(0b0001_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x7C);	// Port A start high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7CDE);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePortFunc(0b0000_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x8E);	// Port A start low
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePortFunc(0b0100_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x4F);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4F34);

			// Exchange 1 by one
			dma.writePortFunc(0b0010_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0xD3);	// Block len low
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4FD3);
		});
	});

	suite('writeWR1', function () {
		test('decode', function () {
			// Default
			assert.notEqual(dma.cycleLength, 2);
			// Port A is IO or Memory
			dma.writePortFunc(0b0000_1100);
			assert.ok(dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			dma.writePortFunc(0b0000_0100);
			assert.ok(!dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			// Port A address increment/decrement
			dma.writePortFunc(0b0000_0100);
			assert.equal(dma.portAadd, -1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			dma.writePortFunc(0b0001_0100);
			assert.equal(dma.portAadd, 1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			dma.writePortFunc(0b0010_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			dma.writePortFunc(0b0011_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

		});
		test('full sequence', function () {
			// Cycle len 4
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b00);	// Cycle length
			assert.equal(dma.cycleLength, 4);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			// Cycle len 3
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b01);	// Cycle length
			assert.equal(dma.cycleLength, 3);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			// Cycle len 2
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b10);	// Cycle length
			assert.equal(dma.cycleLength, 2);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);

			// Do not use
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b11);	// Cycle length
			assert.equal(dma.cycleLength, 2);	// Last value
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePortFunc);
		});
	});

	suite('writeWR2', function () {
		test('should set the correct properties', function () {
			dma.writePortFunc(0x56);
			//assert.equal(dma.yetAnotherProperty, 0x56, 'yetAnotherProperty should be set to 0x56');
		});
	});

	suite('writeWR3', function () {
		test('should set the correct properties', function () {
			dma.writePortFunc(0x78);
			//assert.equal(dma.differentProperty, 0x78, 'differentProperty should be set to 0x78');
		});
	});

	suite('writeWR4', function () {
		test('should set the correct properties', function () {
			dma.writePortFunc(0x9A);
			//assert.equal(dma.someOtherProperty, 0x9A, 'someOtherProperty should be set to 0x9A');
		});
	});

	suite('writeWR5', function () {
		test('should set autoRestart correctly', function () {
			dma.writePortFunc(0b0010_0000); // Set autoRestart bit
			assert.ok(dma.autoRestart);

			dma.writePortFunc(0b0000_0000); // Clear autoRestart bit
			assert.ok(!dma.autoRestart);
		});
	});

	suite('writeWR6', function () {
		test('should call the correct methods based on value', function () {
			const resetSpy = sinon.spy(dma, 'reset');
			const resetPortAtimingSpy = sinon.spy(dma, 'resetPortAtiming');
			const resetPortBtimingSpy = sinon.spy(dma, 'resetPortBtiming');
			const readStatusByteSpy = sinon.spy(dma, 'readStatusByte');
			const reinitializeStatusByteSpy = sinon.spy(dma, 'reinitializeStatusByte');
			const initializeReadSequenceSpy = sinon.spy(dma, 'initializeReadSequence');
			const loadSpy = sinon.spy(dma, 'load');
			const continueSpy = sinon.spy(dma, 'continue');
			const enableDmaSpy = sinon.spy(dma, 'enableDma');

			dma.writePortFunc(0xC3);
			assert.ok(resetSpy.calledOnce, 'reset should be called once');

			dma.writePortFunc(0xC7);
			assert.ok(resetPortAtimingSpy.calledOnce, 'resetPortAtiming should be called once');

			dma.writePortFunc(0xCB);
			assert.ok(resetPortBtimingSpy.calledOnce, 'resetPortBtiming should be called once');

			dma.writePortFunc(0xBF);
			assert.ok(readStatusByteSpy.calledOnce, 'readStatusByte should be called once');

			dma.writePortFunc(0x8B);
			assert.ok(reinitializeStatusByteSpy.calledOnce, 'reinitializeStatusByte should be called once');

			dma.writePortFunc(0xA7);
			assert.ok(initializeReadSequenceSpy.calledOnce, 'initializeReadSequence should be called once');

			dma.writePortFunc(0xCF);
			assert.ok(loadSpy.calledOnce, 'load should be called once');

			dma.writePortFunc(0xD3);
			assert.ok(continueSpy.calledOnce, 'continue should be called once');

			dma.writePortFunc(0x87);
			assert.ok(enableDmaSpy.calledOnce, 'enableDma should be called once');
		});
	});
});