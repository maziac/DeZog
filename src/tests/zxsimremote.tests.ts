import * as assert from 'assert';
import {ZxPorts} from '../remotes/zxsimulator/zxports';
import {MemBuffer} from '../misc/membuffer';
import {ZxSimulatorRemote} from '../remotes/zxsimulator/zxsimremote';
import {Settings} from '../settings';
import {Utility} from '../misc/utility';



suite('ZxSimulatorRemote', () => {
	let zsim: any;

	suite('machine 48k', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg: any={
				remoteType: 'zsim',
				zsim: {
					machine: '48k',
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
			zsim.configureMachine('48k');
			zsim.zxMemory.copyBanksToZ80Mem();

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
				remoteType: 'zsim',
				zsim: {
					machine: '128k',
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
			// The 128er ROM
			zsim.configureMachine('128k');
			zsim.zxMemory.copyBanksToZ80Mem();

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
			// The 48k ROM
			zsim.configureMachine('128k');
			zsim.zxMemory.copyBanksToZ80Mem();

			// Do memory switch
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
			let memBuffer;
			let writeSize;
			{
				const ports=new ZxPorts();

				// Set ports
				ports.setPortValue(0x0000, 100);
				ports.setPortValue(0x0095, 101);
				ports.setPortValue(0x8000, 102);
				ports.setPortValue(0xFFFF, 103);

				// Get size
				writeSize=ports.getSerializedSize();

				// Serialize
				memBuffer=new MemBuffer(writeSize);
				ports.serialize(memBuffer);
			}

		});

	});

});

