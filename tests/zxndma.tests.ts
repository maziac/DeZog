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
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0000_0001);
			assert.ok(!dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
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
			assert.equal(dma.writePortFunc, dma.writePort);

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
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7CDE);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePortFunc(0b0000_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x8E);	// Port A start low
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePortFunc(0b0100_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0x4F);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4F34);

			// Exchange 1 by one
			dma.writePortFunc(0b0010_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0xD3);	// Block len low
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4FD3);
		});
	});

	suite('writeWR1', function () {
		test('decode', function () {
			// Default
			assert.equal(dma.portAcycleLength, 2);
			// Port A is IO or Memory
			dma.writePortFunc(0b0000_1100);
			assert.ok(dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0000_0100);
			assert.ok(!dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Port A address increment/decrement
			dma.writePortFunc(0b0000_0100);
			assert.equal(dma.portAadd, -1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0001_0100);
			assert.equal(dma.portAadd, 1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0010_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0011_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

		});
		test('full sequence', function () {
			// Cycle len 4
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b00);	// Cycle length
			assert.equal(dma.portAcycleLength, 4);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Cycle len 3
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b01);	// Cycle length
			assert.equal(dma.portAcycleLength, 3);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Cycle len 2
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b10);	// Cycle length
			assert.equal(dma.portAcycleLength, 2);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Do not use
			dma.writePortFunc(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b11);	// Cycle length
			assert.equal(dma.portAcycleLength, 2);	// Last value
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
	});

	suite('writeWR2', function () {
		test('decode', function () {
			// Default
			assert.equal(dma.portBcycleLength, 2);
			// Port A is IO or Memory
			dma.writePortFunc(0b0000_1000);
			assert.ok(dma.portBisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0000_0000);
			assert.ok(!dma.portBisIo);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Port A address increment/decrement
			dma.writePortFunc(0b0000_0000);
			assert.equal(dma.portBadd, -1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0001_0000);
			assert.equal(dma.portBadd, 1);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0010_0000);
			assert.equal(dma.portBadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0b0011_0000);
			assert.equal(dma.portBadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

		});
		test('full sequence', function () {
			// Cycle len 4
			dma.writePortFunc(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b00);	// Cycle length
			assert.equal(dma.portBcycleLength, 4);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Cycle len 3
			dma.writePortFunc(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b01);	// Cycle length
			assert.equal(dma.portBcycleLength, 3);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Cycle len 2
			dma.writePortFunc(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b10);	// Cycle length
			assert.equal(dma.portBcycleLength, 2);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Do not use
			dma.writePortFunc(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0b11);	// Cycle length
			assert.equal(dma.portBcycleLength, 2);	// Last value
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
	});

	suite('writeWR3', function () {
		test('DMA Enable', function () {
			const enableDmaSpy = sinon.spy(dma, 'enableDma');
			// Default
			assert.ok(!dma.enabled);

			// Enable dma
			dma.writePortFunc(0b1100_0000);
			assert.ok(dma.enabled);
			assert.ok(enableDmaSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Disable dma
			dma.writePortFunc(0b1100_0000);
			assert.ok(dma.enabled);
			assert.ok(enableDmaSpy.calledTwice);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
	});

	suite('writeWR4', function () {
		test('mode', function () {
			// Default
			assert.ok(dma.burstMode);

			// Do not use 11
			dma.burstMode = undefined;
			dma.writePortFunc(0b1110_0001);
			assert.equal(dma.burstMode, undefined);	// Not touched
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Burst mode
			dma.burstMode = undefined;
			dma.writePortFunc(0b1100_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Burst mode
			dma.burstMode = undefined;
			dma.writePortFunc(0b1010_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(!dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Do not use 00 (behaves like Continuous mode)
			dma.burstMode = undefined;
			dma.writePortFunc(0b1000_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(!dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
		test('full sequence', function () {
			dma.writePortFunc(0b1000_1101);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writeWR4);
			dma.writePortFunc(0xF1);	// Port B start low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePortFunc(0xA7);	// Port B start high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Check value
			assert.equal(dma.portBstartAddress, 0xA7F1);
		});
		test('parts', function () {
			// Predefine values
			dma.portBstartAddress = 0xBCDE;

			// Exchange 1 by one
			dma.writePortFunc(0b1000_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writeWR4);
			dma.writePortFunc(0x7C);	// Port B start high
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portBstartAddress, 0x7CDE);

			// Exchange 1 by one
			dma.writePortFunc(0b1000_0101);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writeWR4);
			dma.writePortFunc(0x8E);	// Port B start low
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			// Check values
			assert.equal(dma.portBstartAddress, 0x7C8E);
		});
	});

	suite('writeWR5', function () {
		test('Auto Restart', function () {
			// Default
			assert.ok(!dma.autoRestart);

			// Enable dma
			dma.writePortFunc(0b1010_0010);
			assert.ok(dma.autoRestart);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			// Disable dma
			dma.writePortFunc(0b1000_0010);
			assert.ok(!dma.autoRestart);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
	});

	suite('writeWR6', function () {
		test('call right methods', function () {
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
			assert.ok(resetSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xC7);
			assert.ok(resetPortAtimingSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xCB);
			assert.ok(resetPortBtimingSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xBF);
			assert.ok(readStatusByteSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0x8B);
			assert.ok(reinitializeStatusByteSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xA7);
			assert.ok(initializeReadSequenceSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xCF);
			assert.ok(loadSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0xD3);
			assert.ok(continueSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);

			dma.writePortFunc(0x87);
			assert.ok(enableDmaSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
		});
		test('set read mask', function () {
			// Check default
			assert.equal(dma.readMask, 0x7F);

			// Set mask
			dma.writePortFunc(0xBB);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writeWR6);
			dma.writePortFunc(0b1000_0000 | 0b0101_1010);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.writePortFunc, dma.writePort);
			assert.equal(dma.readMask, 0b0101_1010);
		});

	});
});