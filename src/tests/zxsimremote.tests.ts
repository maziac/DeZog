import * as assert from 'assert';
import {ZxSimulatorRemote} from '../remotes/zxsimulator/zxsimremote';
import {Settings} from '../settings';
import {Utility} from '../misc/utility';



suite('ZxSimulatorRemote', () => {
	let zsim: ZxSimulatorRemote;

	suite('machine 48k', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg: any={
				remoteType: 'zsim',
				zsim: {
					loadZxRom: true,
					zxKeyboard: true,
					visualMemory: true,
					ulaScreen: true,
					memoryPagingControl: false,
					cpuLoadInterruptRange: 1,
				},
				history: {
					reverseDebugInstructionCount: 0,
					spotCount: 0,
					codeCoverageEnabled: false
				}
			};
			Settings.Init(cfg, '');
			zsim=new ZxSimulatorRemote();
		});

		test('Check ROM', () => {
			// @ts-ignore
			zsim.configureMachine();

			// Check first 2 bytes
			let value=zsim.zxMemory.read8(0x0000);
			assert.equal(0xF3, value);
			value=zsim.zxMemory.read8(0x0001);
			assert.equal(0xAF, value);

			// Check last 2 bytes
			value=zsim.zxMemory.read8(0x3FFE);
			assert.equal(0x42, value);
			value=zsim.zxMemory.read8(0x3FFF);
			assert.equal(0x3C, value);
		});

	});


	suite('machine 128k', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg: any={
				zsim: {
					loadZxRom: true,
					zxKeyboard: true,
					visualMemory: true,
					ulaScreen: true,
					memoryPagingControl: true,
					cpuLoadInterruptRange: 1,
				},
				history: {
					reverseDebugInstructionCount: 0,
					spotCount: 0,
					codeCoverageEnabled: false
				}
			};
			Settings.Init(cfg, '');
			zsim=new ZxSimulatorRemote();
		});

		test('Check ROM 0', () => {
			// @ts-ignore, The 128er ROM
			zsim.configureMachine();

			// Check first 2 bytes
			let value=zsim.zxMemory.read8(0x0000);
			assert.equal(0xF3, value);
			value=zsim.zxMemory.read8(0x0001);
			assert.equal(0x01, value);

			// Check last 2 bytes
			value=zsim.zxMemory.read8(0x3FFE);
			assert.equal(0x00, value);
			value=zsim.zxMemory.read8(0x3FFF);
			assert.equal(0x01, value);

			// Switch and switch back
			zsim.zxPorts.write(0x7FFD, 0b010000);
			zsim.zxPorts.write(0x7FFD, 0);

			// Check first 2 bytes
			value=zsim.zxMemory.read8(0x0000);
			assert.equal(0xF3, value);
			value=zsim.zxMemory.read8(0x0001);
			assert.equal(0x01, value);

			// Check last 2 bytes
			value=zsim.zxMemory.read8(0x3FFE);
			assert.equal(0x00, value);
			value=zsim.zxMemory.read8(0x3FFF);
			assert.equal(0x01, value);
		});


		test('Check ROM 1', () => {
			// @ts-ignore, The 128k ROM
			zsim.configureMachine('128k');

			// Do memory switch to 48k ROM
			zsim.zxPorts.write(0x7FFD, 0b010000);

			// Check first 2 bytes
			let value=zsim.zxMemory.read8(0x0000);
			assert.equal(0xF3, value);
			value=zsim.zxMemory.read8(0x0001);
			assert.equal(0xAF, value);

			// Check last 2 bytes
			value=zsim.zxMemory.read8(0x3FFE);
			assert.equal(0x42, value);
			value=zsim.zxMemory.read8(0x3FFF);
			assert.equal(0x3C, value);
		});


		test('bank switching', () => {
			// @ts-ignore
			zsim.configureMachine('128k');

			// Address used for writing/reading
			const address=0xC000;

			// Put unique number in each bank
			for (let bank=0; bank<8; bank++) {
				// Do memory switch to bank x
				zsim.zxPorts.write(0x7FFD, bank);
				// Write unique number
				zsim.zxMemory.write8(address, 10+bank);
			}

			// Now read the addresses and check
			for (let bank=0; bank<8; bank++) {
				// Do memory switch to bank x
				zsim.zxPorts.write(0x7FFD, bank);
				// Read unique number
				const value=zsim.zxMemory.read8(address);
				assert.equal(10+bank, value);
			}

			// Check additionally the screen
			const value=zsim.zxMemory.read8(address+0x4000-0xC000);
			assert.equal(10+5, value);
		});


		test('ula switching', () => {
			// @ts-ignore
			zsim.configureMachine('128k');

			// @ts-ignore, Default, Bank 5
			let bank=zsim.zxMemory.ulaScreenBank;
			assert.equal(2*5, bank);

			// Shadow ULA, Bank 7
			zsim.zxPorts.write(0x7FFD, 0b01000);
			// @ts-ignore
			bank=zsim.zxMemory.ulaScreenBank;
			assert.equal(2*7, bank);

			// Normal ULA, Bank 5
			zsim.zxPorts.write(0x7FFD, 0);
			// @ts-ignore
			bank=zsim.zxMemory.ulaScreenBank;
			assert.equal(2*5, bank);
		});


		test('paging disable', () => {
			// @ts-ignore, 128k
			zsim.configureMachine('128k');

			// Disable memory paging
			zsim.zxPorts.write(0x7FFD, 0b0100000);

			// Try a switch to 48k ROM
			zsim.zxPorts.write(0x7FFD, 0b010000);

			// Check that this did not happen
			let value=zsim.zxMemory.read8(0x0001);
			assert.equal(0x01, value);
			value=zsim.zxMemory.read8(0x3FFF);
			assert.equal(0x01, value);
		});

	});

});

