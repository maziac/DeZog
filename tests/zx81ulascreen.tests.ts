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
		zx81UlaScreen = new Zx81UlaScreen(z80Cpu);
	});

	test('constructor', () => {
		assert.equal(zx81UlaScreen.z80Cpu, z80Cpu);
		assert.equal(zx81UlaScreen.prevRregister, 0);
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, false);
		assert.equal(zx81UlaScreen.ulaLineCounter, 0);
		assert.equal(zx81UlaScreen.lineCounter, 0);
		assert.equal(zx81UlaScreen.vsyncStartTstates, 0);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 0);
		assert.equal(zx81UlaScreen.int38InNextCycle, false);
		assert.equal(zx81UlaScreen.hsync, false);
		assert.equal(zx81UlaScreen.noDisplay, false);
		assert.equal(zx81UlaScreen.chroma81Mode, 0);
		assert.equal(zx81UlaScreen.chroma81Enabled, false);
	});

	test('outPort handles NMI generator off', () => {
		zx81UlaScreen.vsync = true;
		zx81UlaScreen.outPort(0xAAFD, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, false);
		assert.equal(zx81UlaScreen.vsync, false);

		zx81UlaScreen.vsync = true;
		zx81UlaScreen.outPort(0xBB01, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, false);
		assert.equal(zx81UlaScreen.vsync, false);
	});

	test('outPort handles NMI generator on', () => {
		zx81UlaScreen.vsync = true;
		zx81UlaScreen.outPort(0xAAFE, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, true);
		assert.equal(zx81UlaScreen.vsync, false);

		zx81UlaScreen.vsync = true;
		zx81UlaScreen.outPort(0xBB02, 0);		// Partly decoded
		assert.equal(zx81UlaScreen.stateNmiGeneratorOn, true);
		assert.equal(zx81UlaScreen.vsync, false);
	});

	test('inPort partial decoding', () => {
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		zx81UlaScreen.inPort(0xaafe);  // Partly decoded
		assert.equal(zx81UlaScreen.vsync, true);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		zx81UlaScreen.inPort(0xbbff);
		assert.equal(zx81UlaScreen.vsync, false);  // Partly decoded (but unmatched)
	});

	test('VSYNC', () => {
		const emitSpy = sinon.spy(zx81UlaScreen, 'emit');
		const resetVideoBufferSpy = sinon.spy(zx81UlaScreen, 'resetVideoBuffer');
		// inport 0xfe: -> vsync on
		// outport: -> vsync off

		// OFF -> ON
		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = true;
		zx81UlaScreen.inPort(0xfe);	// VSYNC on
		assert.equal(zx81UlaScreen.vsync, false);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		zx81UlaScreen.tstates = 507;
		zx81UlaScreen.inPort(0xfe);	// VSYNC on
		assert.equal(zx81UlaScreen.vsync, true);
		assert.equal(zx81UlaScreen.vsyncStartTstates, 507);	// Remembered
		assert.equal(emitSpy.called, false);
		assert.equal(resetVideoBufferSpy.called, false);

		// ON -> OFF
		const vsync_min_tstates = (Zx81UlaScreen as any).VSYNC_MINIMAL_TSTATES;
		zx81UlaScreen.vsync = true;
		zx81UlaScreen.vsyncStartTstates = 100;
		zx81UlaScreen.tstates = zx81UlaScreen.vsyncStartTstates + vsync_min_tstates - 1;
		zx81UlaScreen.ulaLineCounter = 6;
		zx81UlaScreen.hsyncTstatesCounter = 77;
		zx81UlaScreen.noDisplay = true;
		zx81UlaScreen.lineCounter = 101;
		zx81UlaScreen.outPort(0);	// VSYNC off
		assert.equal(zx81UlaScreen.vsync, false);
		assert.equal(zx81UlaScreen.ulaLineCounter, 0);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 0);
		assert.equal(zx81UlaScreen.noDisplay, true);
		assert.equal(zx81UlaScreen.lineCounter, 101);
		assert.equal(emitSpy.called, false);
		assert.equal(resetVideoBufferSpy.called, false);

		zx81UlaScreen.vsync = true;
		zx81UlaScreen.vsyncStartTstates = 100;
		zx81UlaScreen.tstates = zx81UlaScreen.vsyncStartTstates + vsync_min_tstates;
		zx81UlaScreen.ulaLineCounter = 6;
		zx81UlaScreen.hsyncTstatesCounter = 77;
		zx81UlaScreen.noDisplay = true;
		zx81UlaScreen.lineCounter = 101;
		zx81UlaScreen.outPort(0);	// VSYNC off
		assert.equal(zx81UlaScreen.vsync, false);
		assert.equal(zx81UlaScreen.ulaLineCounter, 0);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 0);
		assert.equal(zx81UlaScreen.noDisplay, false);
		assert.equal(zx81UlaScreen.lineCounter, 0);
		assert.equal(emitSpy.called, true);
		assert.equal(emitSpy.calledWith('updateScreen'), true);
		assert.equal(resetVideoBufferSpy.called, true);
	});

	test('HSYNC', () => {
		// ON -> ON
		const interruptSpy = sinon.spy(zx81UlaScreen.z80Cpu, 'interrupt');
		zx81UlaScreen.hsync = true;
		zx81UlaScreen.hsyncTstatesCounter = 1;
		zx81UlaScreen.ulaLineCounter = 5;
		zx81UlaScreen.lineCounter = 66;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		assert.equal(zx81UlaScreen.checkHsync(4), false);
		assert.equal(zx81UlaScreen.hsync, true);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 5);
		assert.equal(zx81UlaScreen.ulaLineCounter, 5);
		assert.equal(zx81UlaScreen.lineCounter, 66);
		assert.equal(interruptSpy.called, false);

		// ON -> OFF
		interruptSpy.resetHistory();
		zx81UlaScreen.hsync = true;
		zx81UlaScreen.hsyncTstatesCounter = 1;
		zx81UlaScreen.ulaLineCounter = 5;
		zx81UlaScreen.lineCounter = 66;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		assert.equal(zx81UlaScreen.checkHsync((Zx81UlaScreen as any).TSTATES_PER_SCANLINE + 2), false);
		assert.equal(zx81UlaScreen.hsync, false);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 3);
		assert.equal(zx81UlaScreen.ulaLineCounter, 6);
		assert.equal(zx81UlaScreen.lineCounter, 67);
		assert.equal(interruptSpy.called, false);

		// OFF -> OFF
		interruptSpy.resetHistory();
		zx81UlaScreen.hsync = false;
		zx81UlaScreen.hsyncTstatesCounter = 1;
		zx81UlaScreen.ulaLineCounter = 5;
		zx81UlaScreen.lineCounter = 66;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		assert.equal(zx81UlaScreen.checkHsync(4), false);
		assert.equal(zx81UlaScreen.hsync, false);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, 5);
		assert.equal(zx81UlaScreen.ulaLineCounter, 5);
		assert.equal(zx81UlaScreen.lineCounter, 66);
		assert.equal(interruptSpy.called, false);

		// OFF -> ON
		interruptSpy.resetHistory();
		zx81UlaScreen.hsync = false;
		const hsync_min = (Zx81UlaScreen as any).TSTATES_PER_SCANLINE - (Zx81UlaScreen as any).TSTATES_OF_HSYNC_LOW;
		zx81UlaScreen.hsyncTstatesCounter = hsync_min - 4;
		zx81UlaScreen.ulaLineCounter = 5;
		zx81UlaScreen.lineCounter = 66;
		zx81UlaScreen.stateNmiGeneratorOn = false;
		assert.equal(zx81UlaScreen.checkHsync(4), true);
		assert.equal(zx81UlaScreen.hsync, true);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, hsync_min);
		assert.equal(zx81UlaScreen.ulaLineCounter, 5);
		assert.equal(zx81UlaScreen.lineCounter, 66);
		assert.equal(interruptSpy.called, false);

		// OFF -> ON (with NMI)
		interruptSpy.resetHistory();
		zx81UlaScreen.hsync = false;
		zx81UlaScreen.hsyncTstatesCounter = hsync_min - 4;
		zx81UlaScreen.ulaLineCounter = 5;
		zx81UlaScreen.lineCounter = 66;
		zx81UlaScreen.stateNmiGeneratorOn = true;
		assert.equal(zx81UlaScreen.checkHsync(4), true);
		assert.equal(zx81UlaScreen.hsync, true);
		assert.equal(zx81UlaScreen.hsyncTstatesCounter, hsync_min);
		assert.equal(zx81UlaScreen.ulaLineCounter, 5);
		assert.equal(zx81UlaScreen.lineCounter, 66);
		assert.equal(interruptSpy.called, true);
	});

	suite('ulaM1Read8', () => {
		test('returns NOP for addresses above 32k with bit 6 low', () => {
			// Bit 6 is low
			zx81UlaScreen.memoryRead8 = (addr64k: number) => 0x0F;
			let result = zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(result, 0x00);
			// Bit 6 is high
			zx81UlaScreen.memoryRead8 = (addr64k: number) => 0b0100_1111;
			result = zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(result, 0b0100_1111);
		});

		test('returns original value for other addresses', () => {
			zx81UlaScreen.memoryRead8 = (addr64k: number) => 0xFF;
			const result = zx81UlaScreen.ulaM1Read8(0x7FFF);
			assert.equal(result, 0xFF);
		});
	});

	suite('execute', () => {
		test('execute calls', () => {
			const interruptSpy = sinon.spy(zx81UlaScreen.z80Cpu, 'interrupt');
			const checkHsyncSpy = sinon.spy(zx81UlaScreen, 'checkHsync');
			const emitSpy = sinon.spy(zx81UlaScreen, 'emit');

			const zsim = { executeTstates: 0 };
			zx81UlaScreen.int38InNextCycle = false;
			zx81UlaScreen.noDisplay = false;
			zx81UlaScreen.tstates = 0;
			zx81UlaScreen.vsyncStartTstates = 0;
			zsim.executeTstates = 5;
			zx81UlaScreen.execute(zsim);
			assert.equal(zx81UlaScreen.tstates, 5);
			assert.equal(zx81UlaScreen.noDisplay, false);
			assert.equal(interruptSpy.called, false);
			assert.equal(checkHsyncSpy.called, true);
			assert.equal(emitSpy.called, false);

			// Call NMI, call updateScreen
			interruptSpy.resetHistory();
			checkHsyncSpy.resetHistory();
			emitSpy.resetHistory();
			zx81UlaScreen.int38InNextCycle = true;
			zx81UlaScreen.noDisplay = false;
			zx81UlaScreen.vsyncStartTstates = 0;
			const tstates_min = 2 * (Zx81UlaScreen as any).TSTATES_PER_SCREEN;
			zx81UlaScreen.tstates = tstates_min;
			zsim.executeTstates = 5;
			zx81UlaScreen.execute(zsim);
			assert.equal(zx81UlaScreen.noDisplay, true);
			assert.equal(interruptSpy.called, true);
			assert.equal(checkHsyncSpy.called, true);
			assert.equal(emitSpy.called, true);
			assert.equal(emitSpy.calledWith('updateScreen'), true);

			// Don't call updateScreen
			checkHsyncSpy.resetHistory();
			emitSpy.resetHistory();
			zx81UlaScreen.int38InNextCycle = false;
			zx81UlaScreen.noDisplay = true;
			zx81UlaScreen.vsyncStartTstates = 0;
			zx81UlaScreen.tstates = tstates_min;
			zsim.executeTstates = 5;
			zx81UlaScreen.execute(zsim);
			assert.equal(zx81UlaScreen.noDisplay, true);
			assert.equal(checkHsyncSpy.called, true);
			assert.equal(emitSpy.called, false);
		});

		test('execute, int38 generation', () => {
			const z80 = zx81UlaScreen.z80Cpu;

			// No interrupt
			z80.r = 1;
			zx81UlaScreen.prevRregister = 0;
			zx81UlaScreen.int38InNextCycle = false;
			zx81UlaScreen.execute(0);
			assert.equal(zx81UlaScreen.prevRregister, 1);
			assert.equal(zx81UlaScreen.int38InNextCycle, false);

			// Interrupt
			z80.r = 5;
			zx81UlaScreen.prevRregister = 0b0100_0000;
			zx81UlaScreen.int38InNextCycle = false;
			zx81UlaScreen.execute(0);
			assert.equal(zx81UlaScreen.prevRregister, 5);
			assert.equal(zx81UlaScreen.int38InNextCycle, true);
		});
	});

	suite('getUlaScreen', () => {
		test('getUlaScreen returns no dfile if no display', () => {
			zx81UlaScreen.noDisplay = true;
			const charset = new Uint8Array(512);
			z80Cpu.memory.readBlock = (addr64k: number, size: number) => (addr64k === 0x1E00) ? charset : undefined as any;
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81');
			assert.equal(result.charset, charset);
			assert.equal(result.dfile, undefined);
		});

		test('getUlaScreen returns dfile content if display is available', () => {
			zx81UlaScreen.noDisplay = false;
			z80Cpu.memory.getMemory16 = (addr64k: number) => (addr64k === 0x400c) ? 0x4000 : 0x0000;
			const charset = new Uint8Array(512);
			const dfile = new Uint8Array(33 * 24);
			z80Cpu.memory.readBlock = (addr64k: number, size: number) => {
				if (addr64k === 0x4000)
					return dfile;
				if (addr64k === 0x1E00)
					return charset;
				return undefined as any;
			};
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81');
			assert.notEqual(result.charset, undefined);
			assert.equal(result.charset.length, 512);
			assert.equal(result.dfile, dfile);
		});
	});

	suite('chroma81', () => {
		suite('getUlaScreen', () => {
			test('returns no chroma81', () => {
				zx81UlaScreen.noDisplay = false;
				let result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.chroma, undefined);

				zx81UlaScreen.setChroma81({available: false, borderColor: 7, mode: 0, enabled: true}, false);
				result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.chroma, undefined);

				zx81UlaScreen.setChroma81({available: true, borderColor: 7, mode: 0, enabled: false}, false);
				result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.chroma, undefined);
			});

			test('returns chroma81', () => {
				zx81UlaScreen.noDisplay = false;
				zx81UlaScreen.setChroma81({available: true, borderColor: 7, mode: 0, enabled: true}, false);
				let result = zx81UlaScreen.getUlaScreen();
				assert.notEqual(result.chroma, undefined);
				assert.equal(result.chroma.mode, 0);
				assert.equal(result.chroma.data.length, 0x0400);

				zx81UlaScreen.setChroma81({available: true, borderColor: 7, mode: 1, enabled: true}, false);
				result = zx81UlaScreen.getUlaScreen();
				assert.notEqual(result.chroma, undefined);
				assert.equal(result.chroma.mode, 1);
				assert.notEqual(result.chroma.data, undefined);
			});
		});
	});

	test('serialize/deserialize', () => {
		let memBuffer;
		let writeSize;

		{
			// Set values
			zx81UlaScreen.prevRregister = 62;
			zx81UlaScreen.stateNmiGeneratorOn = true;
			zx81UlaScreen.ulaLineCounter = 4;
			zx81UlaScreen.tstates = 77;
			zx81UlaScreen.vsyncStartTstates = 88;
			zx81UlaScreen.hsyncTstatesCounter = 99;
			zx81UlaScreen.int38InNextCycle = true;
			zx81UlaScreen.hsync = true;
			zx81UlaScreen.vsync = true;
			zx81UlaScreen.noDisplay = true;
			zx81UlaScreen.borderColor = 3;
			zx81UlaScreen.chroma81Mode = true;
			zx81UlaScreen.chroma81Enabled = true;

			// Get size
			writeSize = MemBuffer.getSize(zx81UlaScreen);

			// Serialize
			memBuffer = new MemBuffer(writeSize);
			zx81UlaScreen.serialize(memBuffer);
		}

		// Create a new object and deserialize
		{
			const memModel = new MemoryModelAllRam();
			const ports = new Z80Ports(true);
			const rCpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;
			const rZx81UlaScreen = new Zx81UlaScreen(rCpu) as any;

			// Restore values
			rZx81UlaScreen.deserialize(memBuffer);

			// Check size
			const readSize = memBuffer.readOffset;
			assert.equal(readSize, writeSize);

			// And test
			assert.equal(rZx81UlaScreen.prevRregister, 62);
			assert.equal(rZx81UlaScreen.stateNmiGeneratorOn, true);
			assert.equal(rZx81UlaScreen.ulaLineCounter, 4);
			assert.equal(rZx81UlaScreen.tstates, 77);
			assert.equal(rZx81UlaScreen.vsyncStartTstates, 88);
			assert.equal(rZx81UlaScreen.hsyncTstatesCounter, 99);
			assert.equal(rZx81UlaScreen.int38InNextCycle, true);
			assert.equal(rZx81UlaScreen.hsync, true);
			assert.equal(rZx81UlaScreen.vsync, true);
			assert.equal(rZx81UlaScreen.noDisplay, true);
			assert.equal(rZx81UlaScreen.noDisplay, true);
			assert.equal(rZx81UlaScreen.borderColor, 3);
			assert.equal(rZx81UlaScreen.chroma81Mode, true);
			assert.equal(rZx81UlaScreen.chroma81Enabled, true);
		}
	});
});