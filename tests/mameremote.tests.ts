import * as assert from 'assert';
import {MameRemote} from '../src/remotes/mame/mameremote';
import {Z80RegistersMameDecoder} from '../src/remotes/mame/z80registersmamedecoder';
import {Settings} from '../src/settings';



suite('MameRemote', () => {
	/*
	let zsim: ZSimRemote;

	suite('Z80RegistersMameDecoder', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg: any = {
				remoteType: 'zsim',
				zsim: {
					zxKeyboard: true,
					visualMemory: true,
					ulaScreen: true,
					cpuLoadInterruptRange: 1,
					Z80N: false,
					vsyncInterrupt: false,
					memoryModel: "ZX48K"
				},
				history: {
					reverseDebugInstructionCount: 0,
					spotCount: 0,
					codeCoverageEnabled: false
				}
			};
			Settings.launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters();
			zsim = new ZSimRemote();
		});

		test('Check ROM', () => {
			// @ts-ignore: protected access
			zsim.configureMachine(Settings.launch.zsim);

			// Check first 2 bytes
			let value = zsim.memory.read8(0x0000);
			assert.equal(0xF3, value);
			value = zsim.memory.read8(0x0001);
			assert.equal(0xAF, value);

			// Check last 2 bytes
			value = zsim.memory.read8(0x3FFE);
			assert.equal(0x42, value);
			value = zsim.memory.read8(0x3FFF);
			assert.equal(0x3C, value);
		});

	});
*/

	suite('Z80RegistersMameDecoder', () => {
		const line = "112233445566778899AABBCCDDEEFF1F2F3F4F5F6F7F8F9F";
		let Decoder = new Z80RegistersMameDecoder();

		test('All registers', () => {
			let value = Decoder.parseAF(line);
			assert.equal(0x1122, value);
			value = Decoder.parseBC(line);
			assert.equal(0x3344, value);
			value = Decoder.parseDE(line);
			assert.equal(0x5566, value);
			value = Decoder.parseHL(line);
			assert.equal(0x7788, value);
			value = Decoder.parseAF2(line);
			assert.equal(0x99AA, value);
			value = Decoder.parseBC2(line);
			assert.equal(0xBBCC, value);
			value = Decoder.parseDE2(line);
			assert.equal(0xDDEE, value);
			value = Decoder.parseHL2(line);
			assert.equal(0xFF1F, value);
			value = Decoder.parseIX(line);
			assert.equal(0x2F3F, value);
			value = Decoder.parseIY(line);
			assert.equal(0x4F5F, value);
			value = Decoder.parseSP(line);
			assert.equal(0x6F7F, value);
			value = Decoder.parsePC(line);
			assert.equal(0x8F9F, value);
		});
	});

	suite('gdbstub', () => {

		let mame;

		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'mame'
			};
			Settings.launch = Settings.Init(cfg);
			mame = new MameRemote() as any;
		});

		test('checksum', () => {
			assert.equal(mame.checksum(''), '00');
			assert.equal(mame.checksum('A'), '41');
			assert.equal(mame.checksum('AB'), '83');
			assert.equal(mame.checksum('ABC'), 'C6');
			// Overflow:
			assert.equal(mame.checksum('ABCD'), '0A');
		});
	});

});

