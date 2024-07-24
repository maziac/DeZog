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
		test('should set the transferDirectionPortAtoB properties', function () {
			dma.writeWR0(0b0000_0100);
			assert.ok(dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writeWR0(0b0000_0000);
			assert.ok(!dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);

		});
		test('full sequence', function () {
			dma.writeWR0(0b0111_1000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0xF1);	// Port A start low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0xA7);	// Port A start high
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0x02);	// Block len low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0xFC);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);

			// Check values
			assert.equal(dma.portAstartAddress, 0xA7F1);
			assert.equal(dma.blockLength, 0xFC02);
		});
		test('parts', function () {
			// Predefine values
			dma.portAstartAddress = 0xBCDE;
			dma.blockLength = 0x1234;

			// Exchange 1 by one
			dma.writeWR0(0b0001_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0x7C);	// Port A start high
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7CDE);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writeWR0(0b0000_1000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0x8E);	// Port A start low
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writeWR0(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0x4F);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4F34);

			// Exchange 1 by one
			dma.writeWR0(0b0010_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writeWR0(0xD3);	// Block len low
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4FD3);
		});
	});

	suite('writeWR1', function () {
		test('should set the correct properties', function () {
			dma.writeWR1(0x34);
			//assert.equal(dma.anotherProperty, 0x34, 'anotherProperty should be set to 0x34');
		});
	});

	suite('writeWR2', function () {
		test('should set the correct properties', function () {
			dma.writeWR2(0x56);
			//assert.equal(dma.yetAnotherProperty, 0x56, 'yetAnotherProperty should be set to 0x56');
		});
	});

	suite('writeWR3', function () {
		test('should set the correct properties', function () {
			dma.writeWR3(0x78);
			//assert.equal(dma.differentProperty, 0x78, 'differentProperty should be set to 0x78');
		});
	});

	suite('writeWR4', function () {
		test('should set the correct properties', function () {
			dma.writeWR4(0x9A);
			//assert.equal(dma.someOtherProperty, 0x9A, 'someOtherProperty should be set to 0x9A');
		});
	});

	suite('writeWR5', function () {
		test('should set autoRestart correctly', function () {
			dma.writeWR5(0b0010_0000); // Set autoRestart bit
			assert.ok(dma.autoRestart);

			dma.writeWR5(0b0000_0000); // Clear autoRestart bit
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

			dma.writeWR6(0xC3);
			assert.ok(resetSpy.calledOnce, 'reset should be called once');

			dma.writeWR6(0xC7);
			assert.ok(resetPortAtimingSpy.calledOnce, 'resetPortAtiming should be called once');

			dma.writeWR6(0xCB);
			assert.ok(resetPortBtimingSpy.calledOnce, 'resetPortBtiming should be called once');

			dma.writeWR6(0xBF);
			assert.ok(readStatusByteSpy.calledOnce, 'readStatusByte should be called once');

			dma.writeWR6(0x8B);
			assert.ok(reinitializeStatusByteSpy.calledOnce, 'reinitializeStatusByte should be called once');

			dma.writeWR6(0xA7);
			assert.ok(initializeReadSequenceSpy.calledOnce, 'initializeReadSequence should be called once');

			dma.writeWR6(0xCF);
			assert.ok(loadSpy.calledOnce, 'load should be called once');

			dma.writeWR6(0xD3);
			assert.ok(continueSpy.calledOnce, 'continue should be called once');

			dma.writeWR6(0x87);
			assert.ok(enableDmaSpy.calledOnce, 'enableDma should be called once');
		});
	});
});