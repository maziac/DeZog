import * as assert from 'assert';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {Z80Cpu} from '../src/remotes/zsimulator/z80cpu';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {Settings} from '../src/settings/settings';
import {MemBuffer} from '../src/misc/membuffer';
import {Zx81UlaScreenHiRes} from '../src/remotes/zsimulator/zx81ulascreenhires';

suite('Zx81UlaScreenHiRes', () => {
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
		const screenArea = { firstX: 0, lastX: 383, firstY: 100, lastY: 200} ;
		zx81UlaScreen = new Zx81UlaScreenHiRes(z80Cpu, screenArea);
	});

	test('constructor', () => {
		assert.equal(zx81UlaScreen.screenArea.firstX, 0);
		assert.equal(zx81UlaScreen.screenArea.lastX, 383);
		assert.equal(zx81UlaScreen.screenArea.firstY, 100);
		assert.equal(zx81UlaScreen.screenArea.lastY, 200);
		assert.equal(zx81UlaScreen.screenDataIndex, 0);
		assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
		assert.equal(zx81UlaScreen.colorDataIndex, 0);
		assert.notEqual(zx81UlaScreen.screenData, undefined);
		assert.notEqual(zx81UlaScreen.colorData, undefined);
	});

	test('resetVideoBuffer', () => {
		zx81UlaScreen.screenLineLengthIndex = 10;
		zx81UlaScreen.screenDataIndex = 10;
		zx81UlaScreen.resetVideoBuffer();
		assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
		assert.equal(zx81UlaScreen.screenDataIndex, 0);
	});

	test('isLineVisible', () => {
		zx81UlaScreen.lineCounter = 99;
		assert.equal(zx81UlaScreen.isLineVisible(), false);

		zx81UlaScreen.lineCounter = 100;
		assert.equal(zx81UlaScreen.isLineVisible(), true);

		zx81UlaScreen.lineCounter = 200;
		assert.equal(zx81UlaScreen.isLineVisible(), true);

		zx81UlaScreen.lineCounter = 201;
		assert.equal(zx81UlaScreen.isLineVisible(), false);
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

		test('line invisible', () => {
			zx81UlaScreen.memoryRead8 = (addr64k: number) => 0x0F;
			zx81UlaScreen.screenDataIndex = 10;
			zx81UlaScreen.lineCounter = 99;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenDataIndex, 10);	// Not changed

			zx81UlaScreen.lineCounter = 201;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenDataIndex, 10);	// Not changed
		});

		test('line visible', () => {
			zx81UlaScreen.memoryRead8 = (addr64k: number) => 0x0F;
			zx81UlaScreen.screenDataIndex = 10;
			zx81UlaScreen.lineCounter = 100;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenDataIndex, 12);	// 2 bytes per entry
			zx81UlaScreen.lineCounter = 200;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenDataIndex, 14);	// 2 bytes per entry
		});

		test('standard graphics', () => {
			zx81UlaScreen.lineCounter = 100;
			zx81UlaScreen.ulaLineCounter = 0;
			zx81UlaScreen.screenLineLengthIndex = 0;
			zx81UlaScreen.screenDataIndex = 1;
			zx81UlaScreen.memoryRead8 = (addr64k: number) => {
				switch (addr64k) {
					case 0x0000: return 0x0F;
					case 0x0001: return 0x8F;
					case 0x1E00 + 0x0F * 8 + 0: return 0b1010_0101;	// ULA line counter = 0
					case 0x1E00 + 0x0F * 8 + 1: return 0b1010_0110;	// ULA line counter = 1
					default: return 0xAA;
				}
			};
			const cpu = zx81UlaScreen.z80Cpu;
			cpu.i = 0x1E;
			zx81UlaScreen.hsyncEndTstates = 10;
			zx81UlaScreen.tstates = 23;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 1);
			assert.equal(zx81UlaScreen.screenDataIndex, 3);
			assert.equal(zx81UlaScreen.screenData[1], 13);	// 23 - 10
			assert.equal(zx81UlaScreen.screenData[2], 0b1010_0101);

			// Inverted
			zx81UlaScreen.tstates = 34;
			zx81UlaScreen.ulaM1Read8(0x8001);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 2);
			assert.equal(zx81UlaScreen.screenDataIndex, 5);
			assert.equal(zx81UlaScreen.screenData[3], 24);
			assert.equal(zx81UlaScreen.screenData[4], 0b0101_1010);	// Inverted

			// ULA line counter <> 0
			zx81UlaScreen.ulaLineCounter = 1;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 3);
			assert.equal(zx81UlaScreen.screenDataIndex, 7);
			assert.equal(zx81UlaScreen.screenData[5], 24);
			assert.equal(zx81UlaScreen.screenData[6], 0b1010_0110);
		});

		test('arx', () => {
			zx81UlaScreen.lineCounter = 100;
			zx81UlaScreen.ulaLineCounter = 0;
			zx81UlaScreen.screenLineLengthIndex = 0;
			zx81UlaScreen.screenDataIndex = 1;
			zx81UlaScreen.memoryRead8 = (addr64k: number) => {
				switch (addr64k) {
					case 0x0000: return 0x0F;
					case 0x0001: return 0x8F;
					case 0x2000 + 0x0F * 8 + 0: return 0b1010_0101;	// ULA line counter = 0
					case 0x2000 + 0x0F * 8 + 1: return 0b1010_0110;	// ULA line counter = 1
					default: return 0xAA;
				}
			};
			const cpu = zx81UlaScreen.z80Cpu;
			cpu.i = 0x20;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 1);
			assert.equal(zx81UlaScreen.screenDataIndex, 3);
			assert.equal(zx81UlaScreen.screenData[2], 0b1010_0101);

			// Inverted
			zx81UlaScreen.ulaM1Read8(0x8001);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 2);
			assert.equal(zx81UlaScreen.screenDataIndex, 5);
			assert.equal(zx81UlaScreen.screenData[4], 0b0101_1010);	// Inverted

			// ULA line counter <> 0
			zx81UlaScreen.ulaLineCounter = 1;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 3);
			assert.equal(zx81UlaScreen.screenDataIndex, 7);
			assert.equal(zx81UlaScreen.screenData[6], 0b1010_0110);
		});

		test('wrx', () => {
			zx81UlaScreen.lineCounter = 100;
			zx81UlaScreen.ulaLineCounter = 0;
			zx81UlaScreen.screenLineLengthIndex = 0;
			zx81UlaScreen.screenDataIndex = 1;
			zx81UlaScreen.memoryRead8 = (addr64k: number) => {
				switch (addr64k) {
					case 0x0000: return 0x00;	// Not inverted
					case 0x0001: return 0x80;	// Inverted
					case 0x5000 + 0: return 0b1010_0101;
					case 0x5000 + 1: return 0b1010_0110;
					default: return 0xAA;
				}
			};
			const cpu = zx81UlaScreen.z80Cpu;
			cpu.i = 0x50;
			cpu.r = 1;
			zx81UlaScreen.ulaM1Read8(0x8000);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 1);
			assert.equal(zx81UlaScreen.screenDataIndex, 3);
			assert.equal(zx81UlaScreen.screenData[2], 0b1010_0101);

			// Inverted
			cpu.r = 2;
			zx81UlaScreen.ulaM1Read8(0x8001);
			assert.equal(zx81UlaScreen.screenLineLengthIndex, 0);
			assert.equal(zx81UlaScreen.screenData[0], 2);
			assert.equal(zx81UlaScreen.screenDataIndex, 5);

			assert.equal(zx81UlaScreen.screenData[4], 0b0101_1001);	// Inverted
		});
	});

	suite('getUlaScreen', () => {
		test('getUlaScreen no display', () => {
			zx81UlaScreen.noDisplay = true;
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81-hires');
			assert.equal(result.data, undefined);
			assert.equal(result.colorData, undefined);
		});

		test('getUlaScreen return data', () => {
			zx81UlaScreen.noDisplay = false;
			zx81UlaScreen.screenDataIndex = 10;
			const result = zx81UlaScreen.getUlaScreen();
			assert.equal(result.name, 'zx81-hires');
			assert.notEqual(result.data, undefined);
			assert.equal(result.data.length, 10);
			assert.equal(result.colorData, undefined);
		});
	});

	suite('chroma81', () => {
		suite('getUlaScreen', () => {
			test('returns no colorData', () => {
				zx81UlaScreen.noDisplay = false;
				let result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.colorData, undefined);

				zx81UlaScreen.setChroma81({available: false, borderColor: 7, mode: 0, enabled: true}, false);
				result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.colorData, undefined);

				zx81UlaScreen.setChroma81({available: true, borderColor: 7, mode: 0, enabled: false}, false);
				result = zx81UlaScreen.getUlaScreen();
				assert.equal(result.colorData, undefined);
			});

			test('returns colorData', () => {
				zx81UlaScreen.noDisplay = false;
				zx81UlaScreen.screenDataIndex = 10;
				zx81UlaScreen.setChroma81({available: true, borderColor: 7, mode: 0, enabled: true}, false);
				let result = zx81UlaScreen.getUlaScreen();
				assert.notEqual(result.colorData, undefined);
				assert.equal(result.colorData.length, 10);
			});
		});
	});

	test('serialize/deserialize', () => {
		let memBuffer;
		let writeSize;
		const screenData = new Uint8Array(100);
		screenData.fill(0x55);
		const colorData = new Uint8Array(10);
		screenData.fill(0x66);

		{
			// Set values
			zx81UlaScreen.screenData = screenData;
			zx81UlaScreen.screenDataIndex = 10;
			zx81UlaScreen.screenLineLengthIndex = 20;
			zx81UlaScreen.colorDataIndex = 11;
			zx81UlaScreen.colorData = colorData;

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
			const screenArea = {firstX: 0, lastX: 0, firstY: 0, lastY: 0};
			const rZx81UlaScreen = new Zx81UlaScreenHiRes(rCpu, screenArea) as any;

			// Restore values
			rZx81UlaScreen.deserialize(memBuffer);

			// Check size
			const readSize = memBuffer.readOffset;
			assert.equal(readSize, writeSize);

			// Test new values
			assert.deepEqual(rZx81UlaScreen.screenData, screenData);
			assert.equal(rZx81UlaScreen.screenDataIndex, 10);
			assert.equal(rZx81UlaScreen.screenLineLengthIndex, 20);
			assert.equal(rZx81UlaScreen.colorDataIndex, 11);
			assert.deepEqual(rZx81UlaScreen.colorData, colorData);
		}
	});
});