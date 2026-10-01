import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {suite, test, setup} from 'mocha';
import {MameGdbRemote} from '../src/remotes/mame/mamegdbremote';
import {Z80RegistersMameDecoder} from '../src/remotes/mame/z80registersmamedecoder';
import {BREAK_REASON_NUMBER} from '../src/remotes/remotebase';
import {Z80_REG} from '../src/remotes/z80registers';
import {Settings} from '../src/settings/settings';



suite('MameRemote', () => {
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
				assert.equal(value, 0xA709);
				value = Decoder.parseSP(arrRegs);
				assert.equal(value, 0xFFFE);
				value = Decoder.parseAF(arrRegs);
				assert.equal(value, 0xABCD);
				value = Decoder.parseBC(arrRegs);
				assert.equal(value, 0x2598);
				value = Decoder.parseDE(arrRegs);
				assert.equal(value, 0x1156);
				value = Decoder.parseHL(arrRegs);
				assert.equal(value, 0x2242);
				value = Decoder.parseIX(arrRegs);
				assert.equal(value, 0xFAFF);
				value = Decoder.parseIY(arrRegs);
				assert.equal(value, 0xCCE7);
				value = Decoder.parseAF2(arrRegs);
				assert.equal(value, 0x2211);
				value = Decoder.parseBC2(arrRegs);
				assert.equal(value, 0x3322);
				value = Decoder.parseDE2(arrRegs);
				assert.equal(value, 0x4433);
				value = Decoder.parseHL2(arrRegs);
				assert.equal(value, 0x7720);
				value = Decoder.parseIR(arrRegs);
				assert.equal(value, 0xABCD);
				value = Decoder.parseI(arrRegs);
				assert.equal(value, 0xAB);
				value = Decoder.parseR(arrRegs);
				assert.equal(value, 0xCD);
				value = Decoder.parseIM(arrRegs);
				assert.equal(value, 2);
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
				assert.equal(value, 0xA709);
				value = Decoder.parseSP(arrRegsMmu);
				assert.equal(value, 0xFFFE);
				value = Decoder.parseAF(arrRegsMmu);
				assert.equal(value, 0xABCD);
				value = Decoder.parseBC(arrRegsMmu);
				assert.equal(value, 0x2598);
				value = Decoder.parseDE(arrRegsMmu);
				assert.equal(value, 0x1156);
				value = Decoder.parseHL(arrRegsMmu);
				assert.equal(value, 0x2242);
				value = Decoder.parseIX(arrRegsMmu);
				assert.equal(value, 0xFAFF);
				value = Decoder.parseIY(arrRegsMmu);
				assert.equal(value, 0xCCE7);
				value = Decoder.parseAF2(arrRegsMmu);
				assert.equal(value, 0x2211);
				value = Decoder.parseBC2(arrRegsMmu);
				assert.equal(value, 0x3322);
				value = Decoder.parseDE2(arrRegsMmu);
				assert.equal(value, 0x4433);
				value = Decoder.parseHL2(arrRegsMmu);
				assert.equal(value, 0x7720);
				value = Decoder.parseIR(arrRegsMmu);
				assert.equal(value, 0xABCD);
				value = Decoder.parseI(arrRegsMmu);
				assert.equal(value, 0xAB);
				value = Decoder.parseR(arrRegsMmu);
				assert.equal(value, 0xCD);
				value = Decoder.parseIM(arrRegsMmu);
				assert.equal(value, 2);
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

	test('loadBinZ80 uses the shared flat loader and applies MAME state afterward', async () => {
		class MockMame extends MameGdbRemote {
			public writes: Array<{address: number, firstByte: number}> = [];
			public registers: Array<[number, number]> = [];
			public ports: Array<[number, number]> = [];
			public interrupts: boolean[] = [];

			public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
				this.writes.push({address, firstByte: data[0]});
			}

			public async sendDzrpCmdSetRegister(register: number, value: number): Promise<void> {
				this.registers.push([register, value]);
			}

			protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
				this.ports.push([port, value]);
			}

			protected async sendDzrpCmdInterruptOnOff(enabled: boolean): Promise<void> {
				this.interrupts.push(enabled);
			}
		}

		const launch = Settings.Init({remoteType: 'mame'} as any);
		Settings.launch = launch;
		const mockMame = new MockMame(launch.mame);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dezog-mame-z80-'));
		const filePath = path.join(directory, 'test.z80');
		const z80 = Buffer.alloc(30 + 3 * 0x4000);
		z80.writeUInt16LE(0x1234, 6);	// Version 1 has a non-zero PC
		z80.writeUInt16LE(0xF000, 8);
		z80[10] = 0x12;	// I
		z80[11] = 0x34;	// R
		z80[12] = 0x0A;	// Border color 5, uncompressed
		z80[27] = 1;	// IFF1
		z80[28] = 1;	// IFF2
		z80.fill(0x11, 30, 30 + 0x4000);
		z80.fill(0x22, 30 + 0x4000, 30 + 2 * 0x4000);
		z80.fill(0x33, 30 + 2 * 0x4000);
		fs.writeFileSync(filePath, z80);

		try {
			const sp = await (mockMame as any).loadBinZ80(filePath);
			assert.equal(sp, 0xF000);
			assert.deepEqual(mockMame.writes, [
				{address: 0x4000, firstByte: 0x11},
				{address: 0x8000, firstByte: 0x22},
				{address: 0xC000, firstByte: 0x33}
			]);
			assert.deepEqual(mockMame.registers.slice(0, 2), [
				[Z80_REG.PC, 0x1234],
				[Z80_REG.SP, 0xF000]
			]);
			assert.ok(mockMame.registers.some(([register, value]) => register === Z80_REG.R && value === 0x34));
			assert.ok(mockMame.registers.some(([register, value]) => register === Z80_REG.I && value === 0x12));
			assert.ok(mockMame.registers.some(([register]) => register === Z80_REG.IM));
			assert.deepEqual(mockMame.ports, [[0xFE, 5]]);
			assert.deepEqual(mockMame.interrupts, [true]);
		}
		finally {
			fs.rmSync(directory, {recursive: true, force: true});
		}
	});

	test('loadBinSna uses the shared flat loader and applies MAME state afterward', async () => {
		class MockMame extends MameGdbRemote {
			public writes: Array<{address: number, firstByte: number}> = [];
			public registers: Array<[number, number]> = [];
			public ports: Array<[number, number]> = [];
			public interrupts: boolean[] = [];

			public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
				this.writes.push({address, firstByte: data[0]});
			}

			public async sendDzrpCmdSetRegister(register: number, value: number): Promise<void> {
				this.registers.push([register, value]);
			}

			protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
				this.ports.push([port, value]);
			}

			protected async sendDzrpCmdInterruptOnOff(enabled: boolean): Promise<void> {
				this.interrupts.push(enabled);
			}
		}

		const launch = Settings.Init({remoteType: 'mame'} as any);
		Settings.launch = launch;
		const mockMame = new MockMame(launch.mame);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dezog-mame-sna-'));
		const filePath = path.join(directory, 'test.sna');
		const sna = Buffer.alloc(27 + 3 * 0x4000);
		sna.writeUInt16LE(0x0004, 19);	// IFF2 bit 2 enables interrupts
		sna.writeUInt16LE(0xF000, 23);
		sna[20] = 0x34;	// R
		sna[25] = 1;	// IM
		sna[26] = 3;	// Border
		sna.fill(0x11, 27, 27 + 0x4000);
		sna.fill(0x22, 27 + 0x4000, 27 + 2 * 0x4000);
		sna.fill(0x33, 27 + 2 * 0x4000);
		sna.writeUInt16LE(0x1234, 27 + 0xF000 - 0x4000);
		fs.writeFileSync(filePath, sna);

		try {
			const sp = await (mockMame as any).loadBinSna(filePath);
			assert.equal(sp, 0xF002);
			assert.deepEqual(mockMame.writes, [
				{address: 0x4000, firstByte: 0x11},
				{address: 0x8000, firstByte: 0x22},
				{address: 0xC000, firstByte: 0x33}
			]);
			assert.deepEqual(mockMame.registers.slice(0, 2), [
				[Z80_REG.PC, 0x1234],
				[Z80_REG.SP, 0xF002]
			]);
			assert.ok(mockMame.registers.some(([register, value]) => register === Z80_REG.R && value === 0x34));
			assert.ok(mockMame.registers.some(([register, value]) => register === Z80_REG.I && value === 0));
			assert.ok(mockMame.registers.some(([register, value]) => register === Z80_REG.IM && value === 1));
			assert.deepEqual(mockMame.ports, [[0xFE, 3]]);
			assert.deepEqual(mockMame.interrupts, [true]);
		}
		finally {
			fs.rmSync(directory, {recursive: true, force: true});
		}
	});


	suite('sendDzrpCmdReadMemBlocks', () => {

		/** Simulates MAME's 'm' and qRcmd 'print' output.
		 * The memory contains (addr & 0xFF) ^ 0x5A at each address.
		 */
		class MockMame extends MameGdbRemote {
			public qRcmds: string[] = [];
			public mReads: Array<{addr64k: number, size: number}> = [];

			public static memValue(addr: number): number {
				return (addr & 0xFF) ^ 0x5A;
			}

			protected async sendQrcmd(command: string): Promise<string> {
				this.qRcmds.push(command);
				const lines = command.split(';').map(printCmd => {
					assert.ok(printCmd.startsWith('print '));
					const params = printCmd.substring(6).split(',');
					assert.ok(params.length <= 128);
					return params.map(param => {
						const addr = parseInt(param.substring(3), 16);
						if (param.startsWith('w@$')) {
							const value = MockMame.memValue(addr) + 256 * MockMame.memValue((addr + 1) & 0xFFFF);	// Little endian
							return value.toString(16).toUpperCase();
						}
						assert.ok(param.startsWith('b@$'));
						return MockMame.memValue(addr).toString(16).toUpperCase();
					}).join(' ');
				});
				return lines.join('\n') + '\n';
			}

			protected async readMemWithM(addr64k: number, size: number): Promise<Uint8Array> {
				this.mReads.push({addr64k, size});
				const data = new Uint8Array(size);
				for (let i = 0; i < size; i++)
					data[i] = MockMame.memValue(addr64k + i);
				return data;
			}
		}

		let mockMame: any;

		setup(() => {
			const launch = Settings.Init({remoteType: 'mame'} as any);
			Settings.launch = launch;
			mockMame = new MockMame(launch.mame);
		});

		/** Checks that the data is the expected memory content. */
		function checkBlocks(blocks: Array<{addr64k: number, size: number}>, result: Uint8Array[]) {
			assert.equal(result.length, blocks.length);
			for (let i = 0; i < blocks.length; i++) {
				const {addr64k, size} = blocks[i];
				assert.equal(result[i].length, size);
				for (let k = 0; k < size; k++)
					assert.equal(result[i][k], MockMame.memValue((addr64k + k) & 0xFFFF));
			}
		}

		test('one block: m', async () => {
			const blocks = [{addr64k: 0x2000, size: 100}];
			const result = await mockMame.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(mockMame.qRcmds.length, 0);
			assert.deepEqual(mockMame.mReads, [{addr64k: 0x2000, size: 100}]);
			checkBlocks(blocks, result);
		});

		test('several blocks: one print', async () => {
			const blocks = [
				{addr64k: 0x00BC, size: 3},
				{addr64k: 0xFFFE, size: 3}	// Wrap around
			];
			const result = await mockMame.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(mockMame.qRcmds.length, 1);
			assert.equal(mockMame.qRcmds[0], 'print w@$bc,b@$be,w@$fffe,b@$0');
			assert.equal(mockMame.mReads.length, 0);
			checkBlocks(blocks, result);
		});

		test('5 bytes: 2x w@ and 1x b@', async () => {
			const blocks = [
				{addr64k: 0x1000, size: 5},
				{addr64k: 0x2000, size: 2}
			];
			const result = await mockMame.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(mockMame.qRcmds.length, 1);
			assert.equal(mockMame.qRcmds[0], 'print w@$1000,w@$1002,b@$1004,w@$2000');
			checkBlocks(blocks, result);
		});

		test('real MAME response (little endian, wrap around)', async () => {
			// From a MAME log: memory at 0x8004 is CD 47 60, at 0xFFFF is 00, at 0x0000 is F3
			mockMame.sendQrcmd = async () => '47CD 60 0 0 F300 AF\n\n';
			const result = await mockMame.sendDzrpCmdReadMemBlocks([
				{addr64k: 0x8004, size: 3},
				{addr64k: 0x5C38, size: 3},
				{addr64k: 0xFFFF, size: 3}
			]);
			assert.deepEqual(Array.from(result[0]), [0xCD, 0x47, 0x60]);
			assert.deepEqual(Array.from(result[1]), [0, 0, 0]);
			assert.deepEqual(Array.from(result[2]), [0x00, 0xF3, 0xAF]);
		});

		test('response with whitespace and newlines', async () => {
			mockMame.sendQrcmd = async () => ' 5 A\n  12\r\n';	// w@ = 0x0005, b@ = 0x0A, b@ = 0x12 (no leading zeros)
			const result = await mockMame.sendDzrpCmdReadMemBlocks([{addr64k: 0x1000, size: 3}, {addr64k: 0x2000, size: 1}]);
			assert.deepEqual(Array.from(result[0]), [5, 0, 10]);
			assert.deepEqual(Array.from(result[1]), [0x12]);
		});

		test('more than 128 values: several prints in one qRcmd', async () => {
			const blocks: Array<{addr64k: number, size: number}> = [];
			for (let i = 0; i < 200; i++)
				blocks.push({addr64k: 0x8000 + 7 * i, size: 3});
			const result = await mockMame.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(mockMame.qRcmds.length, 1);
			assert.equal(mockMame.qRcmds[0].split(';').length, 4);	// 400 values: 128+128+128+16
			checkBlocks(blocks, result);
		});

		test('many values: several qRcmds within the packet size', async () => {
			const blocks: Array<{addr64k: number, size: number}> = [];
			for (let i = 0; i < 700; i++)
				blocks.push({addr64k: (0x4000 + 17 * i) & 0xFFFF, size: 3});
			const result = await mockMame.sendDzrpCmdReadMemBlocks(blocks);
			assert.ok(mockMame.qRcmds.length > 1);
			for (const cmd of mockMame.qRcmds)
				assert.ok(('qRcmd,'.length + 2 * cmd.length + 4) < 16384);
			assert.equal(mockMame.mReads.length, 0);
			checkBlocks(blocks, result);
		});

		test('wrong number of values', async () => {
			mockMame.sendQrcmd = async () => '1 2\n';
			await assert.rejects(mockMame.sendDzrpCmdReadMemBlocks([{addr64k: 0x1000, size: 3}, {addr64k: 0x2000, size: 1}]));
		});
	});
});
