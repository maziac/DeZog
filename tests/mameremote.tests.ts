import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
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
					cpuLoad: 1,
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
		// Order: pc,sp,af,bc,de,hl,ix,iy,af2,bc2,de2,hl2,ir,im';
		const lineRegs = "A709 FFFE ABCD 2598 1156 2242 FAFF CCE7 2211 3322 4433 7720 ABCD 2";
		const lineMmu = "FF FF A B 4 5 0 1";
		const lineRegsMmu = lineRegs + ' ' + lineMmu;
		const arrRegs = lineRegs.split(' ');
		const arrRegsMmu = lineRegsMmu.split(' ');
		let Decoder = new Z80RegistersMameDecoder();

		suite('without mmu', () => {
			test('registers', () => {
				let value = Decoder.parsePC(arrRegs);
				assert.equal(0xA709, value);
				value = Decoder.parseSP(arrRegs);
				assert.equal(0xFFFE, value);
				value = Decoder.parseAF(arrRegs);
				assert.equal(0xABCD, value);
				value = Decoder.parseBC(arrRegs);
				assert.equal(0x2598, value);
				value = Decoder.parseDE(arrRegs);
				assert.equal(0x1156, value);
				value = Decoder.parseHL(arrRegs);
				assert.equal(0x2242, value);
				value = Decoder.parseIX(arrRegs);
				assert.equal(0xFAFF, value);
				value = Decoder.parseIY(arrRegs);
				assert.equal(0xCCE7, value);
				value = Decoder.parseAF2(arrRegs);
				assert.equal(0x2211, value);
				value = Decoder.parseBC2(arrRegs);
				assert.equal(0x3322, value);
				value = Decoder.parseDE2(arrRegs);
				assert.equal(0x4433, value);
				value = Decoder.parseHL2(arrRegs);
				assert.equal(0x7720, value);
				value = Decoder.parseIR(arrRegs);
				assert.equal(0xABCD, value);
				value = Decoder.parseI(arrRegs);
				assert.equal(0xAB, value);
				value = Decoder.parseR(arrRegs);
				assert.equal(0xCD, value);
				value = Decoder.parseIM(arrRegs);
				assert.equal(2, value);
			});

			test('slots', () => {
				const slots = Decoder.parseSlots(arrRegs);
				assert.equal(slots.length, 1);
				assert.equal(slots[0], 0);
			});
		});

		suite('with mmu', () => {
			test('registers', () => {
				let value = Decoder.parsePC(arrRegsMmu);
				assert.equal(0xA709, value);
				value = Decoder.parseSP(arrRegsMmu);
				assert.equal(0xFFFE, value);
				value = Decoder.parseAF(arrRegsMmu);
				assert.equal(0xABCD, value);
				value = Decoder.parseBC(arrRegsMmu);
				assert.equal(0x2598, value);
				value = Decoder.parseDE(arrRegsMmu);
				assert.equal(0x1156, value);
				value = Decoder.parseHL(arrRegsMmu);
				assert.equal(0x2242, value);
				value = Decoder.parseIX(arrRegsMmu);
				assert.equal(0xFAFF, value);
				value = Decoder.parseIY(arrRegsMmu);
				assert.equal(0xCCE7, value);
				value = Decoder.parseAF2(arrRegsMmu);
				assert.equal(0x2211, value);
				value = Decoder.parseBC2(arrRegsMmu);
				assert.equal(0x3322, value);
				value = Decoder.parseDE2(arrRegsMmu);
				assert.equal(0x4433, value);
				value = Decoder.parseHL2(arrRegsMmu);
				assert.equal(0x7720, value);
				value = Decoder.parseIR(arrRegsMmu);
				assert.equal(0xABCD, value);
				value = Decoder.parseI(arrRegsMmu);
				assert.equal(0xAB, value);
				value = Decoder.parseR(arrRegsMmu);
				assert.equal(0xCD, value);
				value = Decoder.parseIM(arrRegsMmu);
				assert.equal(2, value);
			});

			test('slots', () => {
				const slots = Decoder.parseSlots(arrRegsMmu);
				assert.equal(slots.length, 8);
				assert.deepEqual(slots, [0xFF, 0xFF, 0xA, 0xB, 0x4, 0x5, 0x0, 0x1]);
			});
		});
	});

	suite('gdbstub', () => {

		let mame;

		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'mame'
			};
			const launch = Settings.Init(cfg);
			Settings.launch = launch;
			mame = new MameGdbRemote(launch.mame) as any;
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
		const launch = Settings.Init({remoteType: 'mame'} as any);
		Settings.launch = launch;
		const mockMame = new MockMame(launch.mame) as any;

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

	test('disconnect clears queued packets before kill command', async () => {
		class MockMame extends MameGdbRemote {
			public sentPackets: string[] = [];

			protected async sendBuffer(buffer: Buffer): Promise<void> {
				this.sentPackets.push(buffer.toString());
			}
		}

		const launch = Settings.Init({remoteType: 'mame'} as any);
		Settings.launch = launch;
		const mockMame = new MockMame(launch.mame) as any;
		mockMame.socket = {
			removeAllListeners() {
				//
			},
			end(callback: () => void) {
				callback();
			}
		};
		mockMame.messageQueue.push({
			buffer: Buffer.from('old-packet'),
			respTimeoutTime: 5000,
			resolve: () => undefined,
			reject: () => undefined,
		});
		mockMame.cmdRespTimeoutHandle = setTimeout(() => undefined, 1000);
		mockMame.cmdRespTimeoutTime = 5000;

		await mockMame.disconnect();

		assert.equal(mockMame.cmdRespTimeoutHandle, undefined);
		assert.equal(mockMame.messageQueue.length, 0);
		assert.equal(mockMame.sentPackets.length, 1);
		assert.equal(mockMame.sentPackets[0], '$k#6B');
	});

});

