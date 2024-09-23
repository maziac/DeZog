import * as assert from 'assert';
import {ZxnDma} from '../src/remotes/zsimulator/zxndma';
import * as sinon from 'sinon';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {MemBuffer} from '../src/misc/membuffer';



suite('ZxnDma', function () {
	let dma;

	setup(() => {
		const ports = new Z80Ports(true);
		const memory = new SimulatedMemory(new MemoryModelAllRam(), ports);
		dma = new ZxnDma(memory, ports) as any;
	});

	suite('general', function () {
		test('constructor', function () {
			assert.equal(dma.nextDecodeBitMask, 0);
		});
	});

	suite('writeWR0', function () {
		test('transferDirectionPortAtoB', function () {
			dma.writePort(0b0000_0101);
			assert.ok(dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0000_0001);
			assert.ok(!dma.transferDirectionPortAtoB);
			assert.equal(dma.nextDecodeBitMask, 0);
		});
		test('full sequence', function () {
			dma.writePort(0b0111_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.wrFunc, 0);
			dma.writePort(0xF1);	// Port A start low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0xA7);	// Port A start high
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0x02);	// Block len low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0xFC);	// Block len high
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
			dma.writePort(0b0001_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0x7C);	// Port A start high
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7CDE);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePort(0b0000_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0x8E);	// Port A start low
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x1234);

			// Exchange 1 by one
			dma.writePort(0b0100_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0x4F);	// Block len high
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4F34);

			// Exchange 1 by one
			dma.writePort(0b0010_0001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0xD3);	// Block len low
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portAstartAddress, 0x7C8E);
			assert.equal(dma.blockLength, 0x4FD3);
		});
	});

	suite('writeWR1', function () {
		test('decode', function () {
			// Default
			assert.equal(dma.portAcycleLength, 0);
			// Port A is IO or Memory
			dma.writePort(0b0000_1100);
			assert.ok(dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0000_0100);
			assert.ok(!dma.portAisIo);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Port A address increment/decrement
			dma.writePort(0b0000_0100);
			assert.equal(dma.portAadd, -1);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0001_0100);
			assert.equal(dma.portAadd, 1);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0010_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0011_0100);
			assert.equal(dma.portAadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);

		});
		test('full sequence', function () {
			// Cycle len 4
			dma.writePort(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b00);	// Cycle length
			assert.equal(dma.portAcycleLength, 4);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Cycle len 3
			dma.writePort(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b01);	// Cycle length
			assert.equal(dma.portAcycleLength, 3);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Cycle len 2
			dma.writePort(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b10);	// Cycle length
			assert.equal(dma.portAcycleLength, 2);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Do not use
			dma.writePort(0b0100_0100);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b11);	// Cycle length
			assert.equal(dma.portAcycleLength, 2);	// Last value
			assert.equal(dma.nextDecodeBitMask, 0);
		});
	});

	suite('writeWR2', function () {
		test('decode', function () {
			// Default
			assert.equal(dma.portBcycleLength, 0);
			// Port A is IO or Memory
			dma.writePort(0b0000_1000);
			assert.ok(dma.portBisIo);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0000_0000);
			assert.ok(!dma.portBisIo);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Port A address increment/decrement
			dma.writePort(0b0000_0000);
			assert.equal(dma.portBadd, -1);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0001_0000);
			assert.equal(dma.portBadd, 1);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0010_0000);
			assert.equal(dma.portBadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0b0011_0000);
			assert.equal(dma.portBadd, 0);
			assert.equal(dma.nextDecodeBitMask, 0);

		});
		test('full sequence', function () {
			// Cycle len 4
			dma.writePort(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b00);	// Cycle length
			assert.equal(dma.portBcycleLength, 4);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Cycle len 3
			dma.writePort(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b01);	// Cycle length
			assert.equal(dma.portBcycleLength, 3);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Cycle len 2
			dma.writePort(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b10);	// Cycle length
			assert.equal(dma.portBcycleLength, 2);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Do not use
			dma.writePort(0b0100_0000);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0b11);	// Cycle length
			assert.equal(dma.portBcycleLength, 2);	// Last value
			assert.equal(dma.nextDecodeBitMask, 0);
		});
	});

	suite('writeWR3', function () {
		test('DMA Enable', function () {
			const enableDmaSpy = sinon.spy(dma, 'enableDma');
			// Default
			assert.ok(!dma.enabled);

			// Enable dma
			dma.writePort(0b1100_0000);
			assert.ok(dma.dmaActive);
			assert.ok(enableDmaSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Disable dma
			dma.writePort(0b1100_0000);
			assert.ok(dma.dmaActive);
			assert.ok(enableDmaSpy.calledTwice);
			assert.equal(dma.nextDecodeBitMask, 0);
		});
	});

	suite('writeWR4', function () {
		test('mode', function () {
			// Default
			assert.ok(dma.burstMode);

			// Do not use 11
			dma.burstMode = undefined;
			dma.writePort(0b1110_0001);
			assert.equal(dma.burstMode, undefined);	// Not touched
			assert.equal(dma.nextDecodeBitMask, 0);

			// Burst mode
			dma.burstMode = undefined;
			dma.writePort(0b1100_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Burst mode
			dma.burstMode = undefined;
			dma.writePort(0b1010_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(!dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Do not use 00 (behaves like Continuous mode)
			dma.burstMode = undefined;
			dma.writePort(0b1000_0001);
			assert.notEqual(dma.burstMode, undefined);
			assert.ok(!dma.burstMode);
			assert.equal(dma.nextDecodeBitMask, 0);
		});
		test('full sequence', function () {
			dma.writePort(0b1000_1101);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.wrFunc, 4);
			dma.writePort(0xF1);	// Port B start low
			assert.notEqual(dma.nextDecodeBitMask, 0);
			dma.writePort(0xA7);	// Port B start high
			assert.equal(dma.nextDecodeBitMask, 0);

			// Check value
			assert.equal(dma.portBstartAddress, 0xA7F1);
		});
		test('parts', function () {
			// Predefine values
			dma.portBstartAddress = 0xBCDE;

			// Exchange 1 by one
			dma.writePort(0b1000_1001);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.wrFunc, 4);
			dma.writePort(0x7C);	// Port B start high
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portBstartAddress, 0x7CDE);

			// Exchange 1 by one
			dma.writePort(0b1000_0101);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.wrFunc, 4);
			dma.writePort(0x8E);	// Port B start low
			assert.equal(dma.nextDecodeBitMask, 0);
			// Check values
			assert.equal(dma.portBstartAddress, 0x7C8E);
		});
	});

	suite('writeWR5', function () {
		test('Auto Restart', function () {
			// Default
			assert.ok(!dma.autoRestart);

			// Enable dma
			dma.writePort(0b1010_0010);
			assert.ok(dma.autoRestart);
			assert.equal(dma.nextDecodeBitMask, 0);

			// Disable dma
			dma.writePort(0b1000_0010);
			assert.ok(!dma.autoRestart);
			assert.equal(dma.nextDecodeBitMask, 0);
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

			dma.writePort(0xC3);
			assert.ok(resetSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xC7);
			assert.ok(resetPortAtimingSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xCB);
			assert.ok(resetPortBtimingSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xBF);
			assert.ok(readStatusByteSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0x8B);
			assert.ok(reinitializeStatusByteSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xA7);
			assert.ok(initializeReadSequenceSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xCF);
			assert.ok(loadSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0xD3);
			assert.ok(continueSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);

			dma.writePort(0x87);
			assert.ok(enableDmaSpy.calledOnce);
			assert.equal(dma.nextDecodeBitMask, 0);
		});
		test('set read mask', function () {
			// Check default
			assert.equal(dma.readMask, 0x7F);

			// Set mask
			dma.writePort(0xBB);
			assert.notEqual(dma.nextDecodeBitMask, 0);
			assert.equal(dma.wrFunc, 6);
			dma.writePort(0b1000_0000 | 0b0101_1010);
			assert.equal(dma.nextDecodeBitMask, 0);
			assert.equal(dma.readMask, 0b0101_1010);
		});
	});

	suite('readPort', function () {
		test('all', function () {
			// Prepare data to read
			dma.statusByteRR0 = 0x12;
			dma.blockCounterRR12 = 0x3456;
			dma.portAaddressCounterRR34 = 0x789A;
			dma.portBaddressCounterRR56 = 0xBCDE;
			// Set mask (all)
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b01111_1111);
			// Read
			assert.equal(dma.readPort(), 0x12);
			assert.equal(dma.readPort(), 0x56);
			assert.equal(dma.readPort(), 0x34);
			assert.equal(dma.readPort(), 0x9A);
			assert.equal(dma.readPort(), 0x78);
			assert.equal(dma.readPort(), 0xDE);
			assert.equal(dma.readPort(), 0xBC);
			// Once again
			assert.equal(dma.readPort(), 0x12);
			assert.equal(dma.readPort(), 0x56);
			assert.equal(dma.readPort(), 0x34);
			assert.equal(dma.readPort(), 0x9A);
			assert.equal(dma.readPort(), 0x78);
			assert.equal(dma.readPort(), 0xDE);
			assert.equal(dma.readPort(), 0xBC);
		});
		test('single reads', function () {
			// Prepare data to read
			dma.statusByteRR0 = 0x12;
			dma.blockCounterRR12 = 0x3456;
			dma.portAaddressCounterRR34 = 0x789A;
			dma.portBaddressCounterRR56 = 0xBCDE;
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0000_0001);
			assert.equal(dma.readPort(), 0x12);
			assert.equal(dma.readPort(), 0x12);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0000_0010);
			assert.equal(dma.readPort(), 0x56);
			assert.equal(dma.readPort(), 0x56);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0000_0100);
			assert.equal(dma.readPort(), 0x34);
			assert.equal(dma.readPort(), 0x34);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0000_1000);
			assert.equal(dma.readPort(), 0x9A);
			assert.equal(dma.readPort(), 0x9A);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0001_0000);
			assert.equal(dma.readPort(), 0x78);
			assert.equal(dma.readPort(), 0x78);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0010_0000);
			assert.equal(dma.readPort(), 0xDE);
			assert.equal(dma.readPort(), 0xDE);	// Read twice (rotate)
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0100_0000);
			assert.equal(dma.readPort(), 0xBC);
			assert.equal(dma.readPort(), 0xBC);	// Read twice (rotate)
		});
		test('reinitialize status byte', function () {
			// Prepare data to read
			dma.statusByteRR0 = 0x12;
			dma.blockCounterRR12 = 0x3456;
			dma.portAaddressCounterRR34 = 0x789A;
			dma.portBaddressCounterRR56 = 0xBCDE;
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0b1000_0000 | 0b0111_1111);
			assert.equal(dma.readPort(), 0x12);
			assert.equal(dma.readPort(), 0x56);
			assert.equal(dma.readPort(), 0x34);

			// Reinitialize sequence bit
			dma.writePort(0xA7);

			// Restart at first bit
			assert.equal(dma.readPort(), 0x12);
			assert.equal(dma.readPort(), 0x56);
		});
		test('unallowed bit (mask = 0x80)', function () {
			// Prepare data to read
			dma.statusByteRR0 = 0x12;
			dma.blockCounterRR12 = 0x3456;
			dma.portAaddressCounterRR34 = 0x789A;
			dma.portBaddressCounterRR56 = 0xBCDE;
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0x80);
			dma.statusByteRR0 = 0xA5;
			assert.equal(dma.readPort(), 0xA5);	// The status byte should be returned
			dma.readPort();	// The output itself is undefined, but it should not hang.
		});
		test('mask = 0', function () {
			// Prepare data to read
			dma.statusByteRR0 = 0x12;
			dma.blockCounterRR12 = 0x3456;
			dma.portAaddressCounterRR34 = 0x789A;
			dma.portBaddressCounterRR56 = 0xBCDE;
			// Set mask
			dma.writePort(0xBB);
			dma.writePort(0);
			dma.readPort();	// The output itself is undefined, but it should not hang.
		});
	});

	suite('serialization', function () {
		test('serialize - deserialize', function () {
			// Prepare data
			this.dmaActive = true;
			this.nextDecodeBitMask = 10;
			this.transferDirectionPortAtoB = true;
			this.portAstartAddress = 0x1234;
			this.portBstartAddress = 0x5678;
			this.blockLength = 0x9ABC;
			this.portAisIo = true;
			this.portBisIo = false;
			this.portAadd = 1;
			this.portBadd = -1;
			this.portAcycleLength = 4;
			this.portBcycleLength = 3;
			this.zxnPrescalar = 11;
			this.burstMode = true;
			this.nextTstates = 234000;
			this.autoRestart = true;
			this.readMask = 12;
			this.lastReadSequenceBit = 13;
			this.statusByteRR0 = 14;
			this.blockCounterRR12 = 0xDEF0;
			this.portAaddressCounterRR34 = 0x2345;
			this.portBaddressCounterRR56 = 0x6789;
			this.lastOperation = 'last op1';
			// Get required size
			const memSize = MemBuffer.getSize(dma);
			assert.ok(memSize > 0);
			// Store
			let mem = new MemBuffer(memSize);
			dma.serialize(mem);

			// Deserialize into another object
			const dma2 = new ZxnDma(undefined as any, undefined as any);
			dma2.deserialize(mem);
			// Test
			assert.ok(this.dmaActive);
			assert.equal(this.nextDecodeBitMask, 10);
			assert.ok(this.transferDirectionPortAtoB);
			assert.equal(this.portAstartAddress, 0x1234);
			assert.equal(this.portBstartAddress, 0x5678);
			assert.equal(this.blockLength, 0x9ABC);
			assert.ok(this.portAisIo);
			assert.ok(!this.portBisIo);
			assert.equal(this.portAadd, 1);
			assert.equal(this.portBadd, -1);
			assert.equal(this.portAcycleLength, 4);
			assert.equal(this.portBcycleLength, 3);
			assert.equal(this.zxnPrescalar, 11);
			assert.ok(this.burstMode);
			assert.equal(this.nextTstates, 234000);
			assert.ok(this.autoRestart);
			assert.equal(this.readMask, 12);
			assert.equal(this.lastReadSequenceBit, 13);
			assert.equal(this.statusByteRR0, 14);
			assert.equal(this.blockCounterRR12, 0xDEF0);
			assert.equal(this.portAaddressCounterRR34, 0x2345);
			assert.equal(this.portBaddressCounterRR56, 0x6789);
			assert.equal(this.lastOperation, 'last op1');

			// Change all values and test again
			this.dmaActive = false;
			this.nextDecodeBitMask = 110;
			this.transferDirectionPortAtoB = false;
			this.portAstartAddress = 0x9234;
			this.portBstartAddress = 0x9678;
			this.blockLength = 0x0ABC;
			this.portAisIo = false;
			this.portBisIo = true;
			this.portAadd = -1;
			this.portBadd = 1;
			this.portAcycleLength = 2;
			this.portBcycleLength = 4;
			this.zxnPrescalar = 111;
			this.burstMode = false;
			this.nextTstates = 1234000;
			this.autoRestart = false;
			this.readMask = 112;
			this.lastReadSequenceBit = 113;
			this.statusByteRR0 = 114;
			this.blockCounterRR12 = 0x9EF0;
			this.portAaddressCounterRR34 = 0x9345;
			this.portBaddressCounterRR56 = 0x9789;
			this.lastOperation = 'last op2';
			// Store
			mem = new MemBuffer(memSize);
			dma.serialize(mem);

			// Deserialize
			dma2.deserialize(mem);
			// Test
			assert.ok(!this.dmaActive);
			assert.equal(this.nextDecodeBitMask, 110);
			assert.ok(!this.transferDirectionPortAtoB);
			assert.equal(this.portAstartAddress, 0x9234);
			assert.equal(this.portBstartAddress, 0x9678);
			assert.equal(this.blockLength, 0x0ABC);
			assert.ok(!this.portAisIo);
			assert.ok(this.portBisIo);
			assert.equal(this.portAadd, -1);
			assert.equal(this.portBadd, 1);
			assert.equal(this.portAcycleLength, 2);
			assert.equal(this.portBcycleLength, 4);
			assert.equal(this.zxnPrescalar, 111);
			assert.ok(!this.burstMode);
			assert.equal(this.nextTstates, 1234000);
			assert.ok(!this.autoRestart);
			assert.equal(this.readMask, 112);
			assert.equal(this.lastReadSequenceBit, 113);
			assert.equal(this.statusByteRR0, 114);
			assert.equal(this.blockCounterRR12, 0x9EF0);
			assert.equal(this.portAaddressCounterRR34, 0x9345);
			assert.equal(this.portBaddressCounterRR56, 0x9789);
			assert.equal(this.lastOperation, 'last op2');
		});

		test('store and continue', function () {
			// Store a memcpy program
			const portA = 0x2010;
			const portB = 0x3040;
			const blockLength = 0x10;
			dma.writePort(0x83);	// Disable DMA
			dma.writePort(0b0111_1101);	// WR0: Source
			dma.writePort(portA & 0xFF); // Port A
			dma.writePort(portA >> 8);	 // Port A high
			dma.writePort(blockLength & 0xFF);	// Block length
			dma.writePort(blockLength >> 8);
			dma.writePort(0b0010_0100);	// WR1: A, IO, increment
			dma.writePort(0b0001_0000);	// WR2: B, IO, increment
			dma.writePort(0b1100_1101);	// WR4: Burst mode, Destination
			dma.writePort(portB & 0xFF); // Port B low
			// Save here the current state
			const memSize = MemBuffer.getSize(dma);;
			const mem = new MemBuffer(memSize);
			dma.serialize(mem);

			// Continue with different dma instance
			const ports2 = new Z80Ports(true);
			const memory2 = new SimulatedMemory(new MemoryModelAllRam(), ports2);
			const dma2 = new ZxnDma(memory2, ports2) as any;
			dma2.deserialize(mem);
			// Contnue programming
			memory2.write8(portA, 0xA4);
			dma2.writePort(portB >> 8);	// Port B high
			dma2.writePort(0xCF); // LOAD
			dma2.writePort(0x87); // Enable DMA

			// Execute the program
			const zsim = {
				executeTstates: 0,
				passedTstates: 0,
				z80Cpu: {
					cpuFreq: 1000000
				}
			};
			dma2.execute(zsim);

			// Check the result
			assert.ok(zsim.executeTstates > 0);
			assert.equal(memory2.read8(portB), 0xA4);
			assert.equal(memory2.read8(portB + blockLength - 1), 0xA4);
		});
	});
});
