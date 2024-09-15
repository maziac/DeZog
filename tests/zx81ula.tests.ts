import * as assert from 'assert';
import * as sinon from 'sinon';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {Z80Cpu} from '../src/remotes/zsimulator/z80cpu';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {Zx81UlaScreen} from '../src/remotes/zsimulator/zx81ulascreen';
import {Settings} from '../src/settings/settings';
import {MemBuffer} from '../src/misc/membuffer';

suite('Zx81UlaScreen', () => {
	let z80Cpu: Z80Cpu;
	let zx81UlaScreen: any;

	beforeEach(() => {
		// Initialize Settings
		const cfg: any = {
			remoteType: 'zsim'
		};
		Settings.launch = Settings.Init(cfg);
		const ports = new Z80Ports(true);
		const memory = new SimulatedMemory(new MemoryModelAllRam, ports);
		z80Cpu = new Z80Cpu(memory, ports);
		zx81UlaScreen = new Zx81UlaScreen(z80Cpu, false, false);
	});

	test('constructor', () => {
		assert.equal(zx81UlaScreen.z80Cpu, z80Cpu);
		assert.equal(zx81UlaScreen.timeCounter, 0);
		assert.equal(zx81UlaScreen.vsync, false);
		assert.equal(zx81UlaScreen.noDisplay, false);
		assert.equal(zx81UlaScreen.fastMode, false);
		assert.equal(zx81UlaScreen.nmiGeneratorAccessed, false);
	});

	test('outPorts handles NMI generator off', () => {
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.outPorts(0xfd, 0);
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, false);
		assert.equal(zx81UlaScreen.nmiGeneratorAccessed, true);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.outPorts(0x01, 0);	// Just A1 is checked
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, false);
		assert.equal(zx81UlaScreen.nmiGeneratorAccessed, true);
	});

	test('outPorts handles NMI generator on', () => {
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.outPorts(0xfe, 0);
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, true);
		assert.equal(zx81UlaScreen.nmiGeneratorAccessed, true);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.outPorts(0x02, 0);	// Just A1 is checked
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, true);
		assert.equal(zx81UlaScreen.nmiGeneratorAccessed, true);
	});

	test('inPort handles VSYNC on', () => {
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		zx81UlaScreen.inPort(0xfe);
		assert.equal(zx81UlaScreen.vsync, true);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		zx81UlaScreen.inPort(0xff);
		assert.equal(zx81UlaScreen.vsync, false);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = true;
		zx81UlaScreen.inPort(0xfe);
		assert.equal(zx81UlaScreen.vsync, false);
	});

	test('ulaM1Read8 returns NOP for addresses above 32k with bit 6 low', () => {
		// Bit 6 is low
		zx81UlaScreen.memoryRead8 = (addr64k: number) => 0x0F;
		let result = zx81UlaScreen.ulaM1Read8(0x8000);
		assert.equal(result, 0x00);
		// Bit 6 is high
		zx81UlaScreen.memoryRead8 = (addr64k: number) => 0b0100_1111;
		result = zx81UlaScreen.ulaM1Read8(0x8000);
		assert.equal(result, 0b0100_1111);
	});

	test('ulaM1Read8 returns original value for other addresses', () => {
		zx81UlaScreen.memoryRead8 = (addr64k: number) => 0xFF;
		const result = zx81UlaScreen.ulaM1Read8(0x7FFF);
		assert.equal(result, 0xFF);
	});

	suite('execute', () => {
		test('execute updates timeCounter and handles no display', () => {
			zx81UlaScreen.execute(2000, 6);
			assert.equal(zx81UlaScreen.timeCounter, 0.003);
			assert.equal(zx81UlaScreen.noDisplay, false);

			zx81UlaScreen.timeCounter = (Zx81UlaScreen as any).VSYNC_TIME;
			zx81UlaScreen.execute(2000, 6);
			assert.equal(zx81UlaScreen.noDisplay, true);
			assert.equal(zx81UlaScreen.timeCounter, 0);
		});

		test('execute handles R-register interrupt', () => {
			// High to low
			z80Cpu.r = 0b0000_0000;
			zx81UlaScreen.prevRregister = 0b0100_0000;
			const interruptStub = sinon.stub(z80Cpu, 'interrupt');
			zx81UlaScreen.execute(1, 1);
			assert.ok(interruptStub.calledWith(false, 0));
			assert.ok(interruptStub.calledOnce);
			assert.equal(zx81UlaScreen.prevRregister, z80Cpu.r);
			// No interrupt for low to high
			z80Cpu.r = 0b0100_0000;
			zx81UlaScreen.prevRregister = 0b0000_0000;
			zx81UlaScreen.execute(1, 1);
			assert.ok(interruptStub.calledOnce);	// Not called again
			assert.equal(zx81UlaScreen.prevRregister, z80Cpu.r);
		});

		test('execute handles NMI interrupt generation', () => {
			// NMI called
			zx81UlaScreen.stateNmiGeneratorOn = true;
			zx81UlaScreen.timeCounter = (Zx81UlaScreen as any).NMI_TIME;
			const interruptStub = sinon.stub(z80Cpu, 'interrupt');
			zx81UlaScreen.execute(1, 0);
			assert.ok(interruptStub.calledWith(true, 0));
			assert.ok(interruptStub.calledOnce);
			// NMI not called
			zx81UlaScreen.stateNmiGeneratorOn = false;
			zx81UlaScreen.timeCounter = (Zx81UlaScreen as any).NMI_TIME;
			zx81UlaScreen.execute(1, 0);
			assert.ok(interruptStub.calledOnce);	// Not called again
		});
	});

	test('getUlaScreen returns empty array if no display', () => {
		zx81UlaScreen.noDisplay = true;
		const result = zx81UlaScreen.getUlaScreen();
		assert.deepEqual(result, new Uint8Array(0));
	});

	test('getUlaScreen returns dfile content if display is available', () => {
		zx81UlaScreen.noDisplay = false;
		z80Cpu.memory.getMemory16 = (addr64k: number) => (addr64k === 0x400c) ? 0x4000: 0x0000;
		const dfile = new Uint8Array(33 * 24);
		z80Cpu.memory.readBlock = (addr64k: number, size: number) => (addr64k === 0x4000) ? dfile : undefined as any;
		const result = zx81UlaScreen.getUlaScreen();
		assert.equal(result, dfile);
	});

	test('serialize/deserialize', () => {
		let memBuffer;
		let writeSize;

		// Set values
		zx81UlaScreen.timeCounter = 1023.5;
		zx81UlaScreen.prevRregister = 62;
		zx81UlaScreen.stateNmiGeneratorOn = true;
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.noDisplay = true;
		zx81UlaScreen.fastMode = false;
		zx81UlaScreen.nmiGeneratorAccessed = true;

		// Get size
		writeSize = MemBuffer.getSize(zx81UlaScreen);

		// Serialize
		memBuffer = new MemBuffer(writeSize);
		zx81UlaScreen.serialize(memBuffer);

		// Create a new object and deserialize
		{
			const memModel = new MemoryModelAllRam();
			const ports = new Z80Ports(true);
			const rCpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;
			const rZx81UlaScreen = new Zx81UlaScreen(rCpu, false, false) as any;

			// Set different values (to see that they are overwrittem)
			zx81UlaScreen.timeCounter = 7;
			zx81UlaScreen.prevRregister = 123;
			zx81UlaScreen.stateNmiGeneratorOn = false;
			zx81UlaScreen.vsync = true;
			zx81UlaScreen.noDisplay = false;
			zx81UlaScreen.fastMode = true;
			zx81UlaScreen.nmiGeneratorAccessed = false;

			// Restore values
			rZx81UlaScreen.deserialize(memBuffer);

			// Check size
			const readSize = memBuffer.readOffset;
			assert.equal(readSize, writeSize);

			// And test
			assert.equal(rZx81UlaScreen.timeCounter, 1023.5);
			assert.equal(rZx81UlaScreen.prevRregister, 62);
			assert.equal(rZx81UlaScreen.stateNmiGeneratorOn, true);
			assert.equal(rZx81UlaScreen.vsync, false);
			assert.equal(rZx81UlaScreen.noDisplay, true);
			assert.equal(rZx81UlaScreen.fastMode, false);
			assert.equal(rZx81UlaScreen.nmiGeneratorAccessed, true);
		}
	});
});