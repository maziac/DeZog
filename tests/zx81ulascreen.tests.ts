import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
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

	setup(() => {
		// Initialize Settings
		const cfg: any = {
			remoteType: 'zsim'
		};
		Settings.launch = Settings.Init(cfg);
		const ports = new Z80Ports(true);
		const memory = new SimulatedMemory(new MemoryModelAllRam, ports);
		const zsim: any = {
			cpuFrequency: 3500000
		};
		z80Cpu = new Z80Cpu(memory, ports, zsim);
		zx81UlaScreen = new Zx81UlaScreen(z80Cpu);
	});

	test('constructor', () => {
		assert.equal(zx81UlaScreen.z80Cpu, z80Cpu);
		assert.equal(zx81UlaScreen.prevRregister, 0);
		assert.equal(zx81UlaScreen.ulaLineCounter, 0);
		assert.equal(zx81UlaScreen.lineCounter, 0);
		assert.equal(zx81UlaScreen.vsyncStartTstates, 0);
		assert.equal(zx81UlaScreen.vsyncEndTstates, 0);
		assert.equal(zx81UlaScreen.hsyncEndTstates, 0);
		assert.equal(zx81UlaScreen.int38InNextCycle, false);
		assert.equal(zx81UlaScreen.VSYNC, false);
		assert.equal(zx81UlaScreen.HSYNC, false);
		assert.equal(zx81UlaScreen.noDisplay, false);
		assert.equal(zx81UlaScreen.chroma81Mode, 0);
		assert.equal(zx81UlaScreen.chroma81Enabled, false);
	});

	test('outPort handles NMI generator off', () => {
		zx81UlaScreen.A0 = false;
		zx81UlaScreen.A1 = false;
		zx81UlaScreen.outPort(0xAAFD, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.A0, true);
		assert.equal(zx81UlaScreen.A1, false);

		zx81UlaScreen.A0 = false;
		zx81UlaScreen.A1 = false;
		zx81UlaScreen.outPort(0xBB01, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.A0, true);
		assert.equal(zx81UlaScreen.A1, false);
	});

	test('outPort handles NMI generator on', () => {
		zx81UlaScreen.A0 = false;
		zx81UlaScreen.A1 = false;
		zx81UlaScreen.outPort(0xAAFE, 0);	// Partly decoded
		assert.equal(zx81UlaScreen.A0, false);
		assert.equal(zx81UlaScreen.A1, true);

		zx81UlaScreen.A0 = false;
		zx81UlaScreen.A1 = false;
		zx81UlaScreen.outPort(0xBB02, 0);		// Partly decoded
		assert.equal(zx81UlaScreen.A0, false);
		assert.equal(zx81UlaScreen.A1, true);
	});

	test('inPort partial decoding', () => {
		zx81UlaScreen.A0 = true;
		zx81UlaScreen.inPort(0xaafe);  // Partly decoded
		assert.equal(zx81UlaScreen.A0, false);

		zx81UlaScreen.vsync = false;
		zx81UlaScreen.inPort(0xbbff);
		assert.equal(zx81UlaScreen.A0, true);  // Partly decoded (but unmatched)
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
		suite('NMION', () => {
			test('IOWR', () => {
				zx81UlaScreen.IOWR = true;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = true;
				zx81UlaScreen.A1 = true;
				zx81UlaScreen.NMION = undefined;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.NMION, undefined);
				assert.equal(zx81UlaScreen.VSYNC, false);

				zx81UlaScreen.IOWR = true;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.NMION, true);

				zx81UlaScreen.IOWR = true;
				zx81UlaScreen.A0 = true;
				zx81UlaScreen.A1 = false;
				zx81UlaScreen.NMION = undefined;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.NMION, false);

				zx81UlaScreen.IOWR = false;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.A1 = false;
				zx81UlaScreen.NMION = undefined;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.NMION, undefined);
				assert.equal(zx81UlaScreen.VSYNC, undefined);
			});

			test('IORD', () => {
				zx81UlaScreen.IORD = true;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.NMION = false;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.VSYNC, true);

				zx81UlaScreen.IORD = true;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = true;
				zx81UlaScreen.NMION = false;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.VSYNC, undefined);

				zx81UlaScreen.IORD = true;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.NMION = true;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.VSYNC, undefined);

				zx81UlaScreen.IORD = false;
				zx81UlaScreen.VSYNC = undefined;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.NMION = false;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.VSYNC, undefined);
			});
		});

		suite('HSYNC', () => {
			test('prevVSYNC', () => {
				zx81UlaScreen.VSYNC = false;
				zx81UlaScreen.hsyncEndTstates = undefined;
				zx81UlaScreen.HSYNC = undefined;
				zx81UlaScreen.execute({passedTstates: 1, executeTstates: 0});
				assert.equal(zx81UlaScreen.hsyncEndTstates, undefined);
				assert.equal(zx81UlaScreen.HSYNC, undefined);

				zx81UlaScreen.VSYNC = true;
				zx81UlaScreen.hsyncEndTstates = undefined;
				zx81UlaScreen.HSYNC = undefined;
				zx81UlaScreen.execute({passedTstates: 2, executeTstates: 0});
				assert.equal(zx81UlaScreen.hsyncEndTstates, 2);
				assert.equal(zx81UlaScreen.HSYNC, false);
			});

			test('HSYNC change', () => {
				zx81UlaScreen.HSYNC = false;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 192 - 1, executeTstates: 0});
				assert.equal(zx81UlaScreen.HSYNC, false);

				zx81UlaScreen.HSYNC = false;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 192, executeTstates: 0});
				assert.equal(zx81UlaScreen.HSYNC, true);

				zx81UlaScreen.HSYNC = true;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 207 - 1, executeTstates: 0});
				assert.equal(zx81UlaScreen.HSYNC, true);

				zx81UlaScreen.HSYNC = true;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 207, executeTstates: 0});
				assert.equal(zx81UlaScreen.HSYNC, false);
			});

			test('act on HSYNC change', () => {
				const nextLineSpy = sinon.spy(zx81UlaScreen, 'nextLine');

				// HSYNC: OFF -> ON
				zx81UlaScreen.HSYNC = false;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 192, executeTstates: 0});
				assert.equal(nextLineSpy.called, true);

				// HSYNC: ON -> OFF
				nextLineSpy.resetHistory();
				zx81UlaScreen.HSYNC = true;
				zx81UlaScreen.hsyncEndTstates = 1;
				zx81UlaScreen.execute({passedTstates: 215, executeTstates: 0});
				assert.equal(nextLineSpy.called, false);
				assert.equal(zx81UlaScreen.hsyncEndTstates, 208);	// 215 - ((215-1) % 207)
			});
		});

		suite('NMI', () => {
			test('interrupt called', () => {
				const interruptSpy = sinon.spy(zx81UlaScreen.z80Cpu, 'interrupt');

				zx81UlaScreen.HSYNC = false;
				zx81UlaScreen.NMION = false;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 0, executeTstates: 0});
				assert.equal(interruptSpy.called, false);

				// HSYNC: OFF -> ON
				zx81UlaScreen.HSYNC = false;
				zx81UlaScreen.NMION = true;
				zx81UlaScreen.hsyncEndTstates = 0;
				zx81UlaScreen.execute({passedTstates: 192, executeTstates: 0});
				assert.equal(interruptSpy.called, true);
			});

			test('"wait circuit"', () => {
				const z80CpuMock = {isHalted: true, interrupt: () => {}};
				zx81UlaScreen.z80Cpu = z80CpuMock;

				{
					// HSYNC: OFF -> ON
					zx81UlaScreen.HSYNC = false;
					zx81UlaScreen.NMION = true;
					zx81UlaScreen.hsyncEndTstates = 1;
					const zsim = {passedTstates: 195, executeTstates: 0};
					zx81UlaScreen.execute(zsim);
					assert.equal(zsim.executeTstates, 9);
				}

				{
					// HSYNC: ON -> OFF, cpu not halted
					z80CpuMock.isHalted = false;
					zx81UlaScreen.HSYNC = false;
					zx81UlaScreen.NMION = true;
					zx81UlaScreen.hsyncEndTstates = 1;
					const zsim = {passedTstates: 195, executeTstates: 0};
					zx81UlaScreen.execute(zsim);
					assert.equal(zsim.executeTstates, 0);
				}
			});
		});

		suite('VSYNC', () => {
			test('reset ulLineCounter', () => {
				zx81UlaScreen.VSYNC = false;
				zx81UlaScreen.ulaLineCounter = undefined;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.ulaLineCounter, undefined);

				zx81UlaScreen.VSYNC = true;
				zx81UlaScreen.ulaLineCounter = undefined;
				zx81UlaScreen.execute({});
				assert.equal(zx81UlaScreen.ulaLineCounter, 0);
			});

			test('act on VSYNC change', () => {
				const emitSpy = sinon.spy(zx81UlaScreen, 'emit');
				const resetVideoBufferSpy = sinon.spy(zx81UlaScreen, 'resetVideoBuffer');
				// VSYNC: OFF -> ON
				zx81UlaScreen.VSYNC = false;
				zx81UlaScreen.IORD = true;
				zx81UlaScreen.A0 = false;
				zx81UlaScreen.NMION = false;
				zx81UlaScreen.noDisplay = undefined;
				zx81UlaScreen.lineCounter = undefined;
				zx81UlaScreen.vsyncEndTstates = undefined;
				zx81UlaScreen.vsyncStartTstates = undefined;
				zx81UlaScreen.execute({passedTstates: 100, executeTstates: 0});
				assert.equal(zx81UlaScreen.vsyncStartTstates, 100);
				assert.equal(zx81UlaScreen.noDisplay, undefined);
				assert.equal(zx81UlaScreen.lineCounter, undefined);
				assert.equal(zx81UlaScreen.vsyncEndTstates, undefined);
				assert.equal(emitSpy.called, false);
				assert.equal(resetVideoBufferSpy.called, false);

				// VSYNC: ON -> OFF, length too short
				zx81UlaScreen.VSYNC = true;
				zx81UlaScreen.IOWR = true;
				zx81UlaScreen.noDisplay = undefined;
				zx81UlaScreen.lineCounter = undefined;
				zx81UlaScreen.vsyncEndTstates = undefined;
				zx81UlaScreen.vsyncStartTstates = 0;
				zx81UlaScreen.execute({passedTstates: 499, executeTstates: 0});
				assert.equal(zx81UlaScreen.vsyncStartTstates, 0);
				assert.equal(zx81UlaScreen.noDisplay, undefined);
				assert.equal(zx81UlaScreen.lineCounter, undefined);
				assert.equal(zx81UlaScreen.vsyncEndTstates, undefined);
				assert.equal(emitSpy.called, false);
				assert.equal(resetVideoBufferSpy.called, false);

				// VSYNC: ON -> OFF, length big enough
				zx81UlaScreen.VSYNC = true;
				zx81UlaScreen.IOWR = true;
				zx81UlaScreen.noDisplay = undefined;
				zx81UlaScreen.lineCounter = undefined;
				zx81UlaScreen.vsyncEndTstates = undefined;
				zx81UlaScreen.vsyncStartTstates = 0;
				zx81UlaScreen.execute({passedTstates: 500, executeTstates: 0});
				assert.equal(zx81UlaScreen.vsyncStartTstates, 0);
				assert.equal(zx81UlaScreen.noDisplay, false);
				assert.equal(zx81UlaScreen.lineCounter, 0);
				assert.equal(zx81UlaScreen.vsyncEndTstates, 500);
				assert.equal(emitSpy.called, true);
				assert.equal(resetVideoBufferSpy.called, true);
			});
		});

		suite('noDisplay', () => {
			test('not set', () => {
				const emitSpy = sinon.spy(zx81UlaScreen, 'emit');
				zx81UlaScreen.vsyncStartTstates = 1000;
				zx81UlaScreen.noDisplay = undefined;
				zx81UlaScreen.execute({passedTstates: 0, executeTstates: 0});
				assert.equal(emitSpy.called, false);
				assert.equal(zx81UlaScreen.noDisplay, undefined);
			});

			test('set', () => {
				const emitSpy = sinon.spy(zx81UlaScreen, 'emit');
				zx81UlaScreen.vsyncStartTstates = 1000;
				zx81UlaScreen.noDisplay = undefined;
				zx81UlaScreen.execute({passedTstates: 1000 + 2 * 65000 + 1, executeTstates: 0});
				assert.equal(emitSpy.called, true);
				assert.equal(zx81UlaScreen.noDisplay, true);
			});
		});
	});

	suite('getUlaScreen', () => {
		test('getUlaScreen returns no dfile if no display', () => {
			zx81UlaScreen.noDisplay = true;
			const charset = new Uint8Array(512);
			z80Cpu.memory.readBlock = (addr64k: number, size: number) => (addr64k === 0x1E00) ? charset : undefined as any;
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81');
			assert.equal(result.borderColor, 15);
			assert.equal(result.charset, undefined);
			assert.equal(result.dfile, undefined);
		});

		test('getUlaScreen returns dfile content if display is available', () => {
			zx81UlaScreen.noDisplay = false;
			z80Cpu.memory.getMemory16 = (addr64k: number) => (addr64k === 0x400c) ? 0x6000 : 0x0000;
			let charset = new Uint8Array(512);
			charset = charset.map(() => Math.floor(Math.random() * 256));
			let dfile = new Uint8Array(33 * 24);
			dfile = dfile.map(() => Math.floor(Math.random() * 256));
			z80Cpu.memory.readBlock = (addr64k: number, size: number) => {
				if (addr64k === 0x6001)
					return dfile;
				if (addr64k === 0x1E00)
					return charset;
				return undefined as any;
			};
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81');
			assert.equal(result.borderColor, 15);
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
			zx81UlaScreen.borderColor = 6;
			zx81UlaScreen.VSYNC = true;
			zx81UlaScreen.HSYNC = true;
			zx81UlaScreen.vsyncStartTstates = 88;
			zx81UlaScreen.vsyncEndTstates = 92;
			zx81UlaScreen.hsyncEndTstates = 99;
			zx81UlaScreen.prevRregister = 62;
			zx81UlaScreen.ulaLineCounter = 4;
			zx81UlaScreen.lineCounter = 251;
			zx81UlaScreen.tstates = 12345;
			zx81UlaScreen.int38InNextCycle = true;
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
			const zsim: any = {
				cpuFrequency: 3500000
			};
			const rCpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports, zsim) as any;
			const rZx81UlaScreen = new Zx81UlaScreen(rCpu) as any;

			// Restore values
			rZx81UlaScreen.deserialize(memBuffer);

			// Check size
			const readSize = memBuffer.readOffset;
			assert.equal(readSize, writeSize);

			// And test
			assert.equal(rZx81UlaScreen.borderColor, 6);
			assert.equal(rZx81UlaScreen.VSYNC, true);
			assert.equal(rZx81UlaScreen.HSYNC, true);
			assert.equal(rZx81UlaScreen.vsyncStartTstates, 88);
			assert.equal(rZx81UlaScreen.vsyncEndTstates, 92);
			assert.equal(rZx81UlaScreen.hsyncEndTstates, 99);
			assert.equal(rZx81UlaScreen.prevRregister, 62);
			assert.equal(rZx81UlaScreen.ulaLineCounter, 4);
			assert.equal(rZx81UlaScreen.lineCounter, 251);
			assert.equal(rZx81UlaScreen.int38InNextCycle, true);
			assert.equal(rZx81UlaScreen.chroma81Mode, true);
			assert.equal(rZx81UlaScreen.chroma81Enabled, true);
		}
	});
});