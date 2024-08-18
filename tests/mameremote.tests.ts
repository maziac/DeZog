import * as assert from 'assert';
import {MameGdbRemote} from '../src/remotes/mame/mamegdbremote';
import {Z80RegistersMameDecoder} from '../src/remotes/mame/z80registersmamedecoder';
import {BREAK_REASON_NUMBER} from '../src/remotes/remotebase';
import {Settings} from '../src/settings/settings';



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
					ulaScreen: "spectrum",
					cpuLoadInterruptRange: 1,
					Z80N: false,
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
		const line = "2211443366558877aa99ccbbEEDD1FFF3F2F5F4F7F6F9F8F";
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
			mame = new MameGdbRemote() as any;
		});

		test('checksum', () => {
			assert.equal(mame.checksum(''), '00');
			assert.equal(mame.checksum('A'), '41');
			assert.equal(mame.checksum('AB'), '83');
			assert.equal(mame.checksum('ABC'), 'C6');
			// Overflow:
			assert.equal(mame.checksum('ABCD'), '0A');
		});

		test('parseXml', () => {
			mame.parseXml('<architecture>z80</architecture>');	// Should not throw an error

			assert.throws(() => {
				mame.parseXml('<architecture>x86</architecture>');
			}, Error("Architecture 'x86' is not supported by DeZog. Please select a driver/ROM in MAME with a 'z80' architecture."));

			assert.throws(() => {
				mame.parseXml(`l<?xml version="1.0"?>
<!DOCTYPE target SYSTEM "gdb-target.dtd">
<target version="1.0">
  <feature name="mame.z80">
    <reg name="af" bitsize="16" type="int"/>
    <reg name="bc" bitsize="16" type="int"/>
    <reg name="de" bitsize="16" type="int"/>
    <reg name="hl" bitsize="16" type="int"/>
    <reg name="af'" bitsize="16" type="int"/>
    <reg name="bc'" bitsize="16" type="int"/>
    <reg name="de'" bitsize="16" type="int"/>
    <reg name="hl'" bitsize="16" type="int"/>
    <reg name="ix" bitsize="16" type="int"/>
    <reg name="iy" bitsize="16" type="int"/>
    <reg name="sp" bitsize="16" type="data_ptr"/>
    <reg name="pc" bitsize="16" type="code_ptr"/>
  </feature>
</target>`);
			}, Error("No architecture found in reply of MAME."));

			assert.throws(() => {
				mame.parseXml(`l<?xml version="1.0"?>
<!DOCTYPE target SYSTEM "gdb-target.dtd">
<target version="1.0">
<architecture>6510</architecture>
  <feature name="mame.z80">
    <reg name="af" bitsize="16" type="int"/>
    <reg name="bc" bitsize="16" type="int"/>
    <reg name="de" bitsize="16" type="int"/>
    <reg name="hl" bitsize="16" type="int"/>
    <reg name="af'" bitsize="16" type="int"/>
    <reg name="bc'" bitsize="16" type="int"/>
    <reg name="de'" bitsize="16" type="int"/>
    <reg name="hl'" bitsize="16" type="int"/>
    <reg name="ix" bitsize="16" type="int"/>
    <reg name="iy" bitsize="16" type="int"/>
    <reg name="sp" bitsize="16" type="data_ptr"/>
    <reg name="pc" bitsize="16" type="code_ptr"/>
  </feature>
</target>`);
			}, Error("Architecture '6510' is not supported by DeZog. Please select a driver/ROM in MAME with a 'z80' architecture."));

			// Does not throw
			mame.parseXml(`l<?xml version="1.0"?>
<!DOCTYPE target SYSTEM "gdb-target.dtd">
<target version="1.0">
<architecture>z80</architecture>
  <feature name="mame.z80">
    <reg name="af" bitsize="16" type="int"/>
    <reg name="bc" bitsize="16" type="int"/>
    <reg name="de" bitsize="16" type="int"/>
    <reg name="hl" bitsize="16" type="int"/>
    <reg name="af'" bitsize="16" type="int"/>
    <reg name="bc'" bitsize="16" type="int"/>
    <reg name="de'" bitsize="16" type="int"/>
    <reg name="hl'" bitsize="16" type="int"/>
    <reg name="ix" bitsize="16" type="int"/>
    <reg name="iy" bitsize="16" type="int"/>
    <reg name="sp" bitsize="16" type="data_ptr"/>
    <reg name="pc" bitsize="16" type="code_ptr"/>
  </feature>
</target>`);

		});

		test('parseStopReplyPacket', () => {
			let result = mame.parseStopReplyPacket('T050a:0000;0b:0100;');
			assert.equal(result.breakReason, BREAK_REASON_NUMBER.BREAKPOINT_HIT);
			assert.equal(result.addr64k, 0x001);

			result = mame.parseStopReplyPacket('T0500b:1234;');
			assert.equal(result.breakReason, BREAK_REASON_NUMBER.BREAKPOINT_HIT);
			assert.equal(result.addr64k, 0x3412);

			assert.throws(() => {
				result = mame.parseStopReplyPacket('T050a:0000;');
			}, Error("No break address (PC) found."));

			result = mame.parseStopReplyPacket('T05watch:12FE;a:0000;0b:0100;');
			assert.equal(result.breakReason, BREAK_REASON_NUMBER.WATCHPOINT_WRITE);
			assert.equal(result.addr64k, 0x12FE);

			result = mame.parseStopReplyPacket('T05awatch:12FE;0a:0000;0b:0100;');
			assert.equal(result.breakReason, BREAK_REASON_NUMBER.WATCHPOINT_WRITE);
			assert.equal(result.addr64k, 0x12FE);

			result = mame.parseStopReplyPacket('T05rwatch:12FE;0a:0000;0b:0100;');
			assert.equal(result.breakReason, BREAK_REASON_NUMBER.WATCHPOINT_READ);
			assert.equal(result.addr64k, 0x12FE);
		});
	});


	test('checkTmpBreakpoints', async () => {
		class MockMame extends MameGdbRemote {
			protected async sendPacketDataOk(packetData: string): Promise<void> {
				//
			}
		}
		// Init
		Settings.launch = Settings.Init({remoteType: 'mame'} as any);
		const mockMame = new MockMame() as any;

		// Set PC to 0xEC12
		const pc = 0xEC12;

		// Check checkTmpBreakpoints
		assert.ok(!await mockMame.checkTmpBreakpoints(pc));
		assert.ok(!await mockMame.checkTmpBreakpoints(pc, 0x1000));
		assert.ok(!await mockMame.checkTmpBreakpoints(pc, 0x1000, 0x2000));
		assert.ok(!await mockMame.checkTmpBreakpoints(pc, undefined, 0x2000));

		assert.ok(await mockMame.checkTmpBreakpoints(pc, 0xEC12));
		assert.ok(await mockMame.checkTmpBreakpoints(pc, 0xFFFF, 0xEC12));
	});

});

