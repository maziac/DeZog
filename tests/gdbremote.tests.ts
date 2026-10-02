import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {suite, test, setup} from 'mocha';
import {GdbRemote} from '../src/remotes/gdb/gdbremote';
import {MameGdbRemote} from '../src/remotes/mame/mamegdbremote';
import {Z80RegistersGdbDecoder} from '../src/remotes/gdb/z80registersgdbdecoder';
import {RemoteFactory} from '../src/remotes/remotefactory';
import {Remote} from '../src/remotes/remotebase';
import {Settings} from '../src/settings/settings';
import {Z80_REG} from '../src/remotes/z80registers';



suite('GdbRemote', () => {

	/** Creates the launch settings for a remote type. */
	function initSettings(remoteType: string) {
		const cfg: any = {remoteType};
		const launch = Settings.Init(cfg);
		Settings.launch = launch;
		return launch;
	}


	suite('Z80RegistersGdbDecoder', () => {
		// The 'g' packet reply: words as little endian hex.
		// af   bc   de   hl   af2  bc2  de2  hl2  ix   iy   sp   pc
		const regs = 'CDAB' + '9825' + '5611' + '4222' + '1122' + '2233' + '3344' + '2077'
			+ 'FFFA' + 'E7CC' + 'FEFF' + '09A7';
		const Decoder = new Z80RegistersGdbDecoder();

		test('registers', () => {
			assert.equal(Decoder.parseAF(regs), 0xABCD);
			assert.equal(Decoder.parseBC(regs), 0x2598);
			assert.equal(Decoder.parseDE(regs), 0x1156);
			assert.equal(Decoder.parseHL(regs), 0x2242);
			assert.equal(Decoder.parseAF2(regs), 0x2211);
			assert.equal(Decoder.parseBC2(regs), 0x3322);
			assert.equal(Decoder.parseDE2(regs), 0x4433);
			assert.equal(Decoder.parseHL2(regs), 0x7720);
			assert.equal(Decoder.parseIX(regs), 0xFAFF);
			assert.equal(Decoder.parseIY(regs), 0xCCE7);
			assert.equal(Decoder.parseSP(regs), 0xFFFE);
			assert.equal(Decoder.parsePC(regs), 0xA709);
		});

		test('I, R and IM are not available', () => {
			assert.ok(isNaN(Decoder.parseI(regs)));
			assert.ok(isNaN(Decoder.parseR(regs)));
			assert.ok(isNaN(Decoder.parseIM(regs)));
		});

		test('no banking', () => {
			assert.deepEqual(Decoder.parseSlots(regs), [0]);
		});
	});


	suite('remoteType', () => {
		test("'gdb' creates a GdbRemote", () => {
			const launch = initSettings('gdb');
			RemoteFactory.createRemote(launch);
			assert.ok(Remote instanceof GdbRemote);
			// Not one of the derived remotes
			assert.ok(!(Remote instanceof MameGdbRemote));
		});

		test("'mame' creates a MameGdbRemote", () => {
			const launch = initSettings('mame');
			RemoteFactory.createRemote(launch);
			assert.ok(Remote instanceof MameGdbRemote);
			// MameGdbRemote is a GdbRemote
			assert.ok(Remote instanceof GdbRemote);
		});
	});


	suite('settings', () => {
		test('gdb defaults', () => {
			const launch = initSettings('gdb');
			assert.equal(launch.gdb.hostname, 'localhost');
			assert.equal(launch.gdb.port, 12000);
			assert.equal(launch.gdb.timeout, 5);
		});
	});


	suite('packets', () => {

		let gdb;
		// The packets that were sent.
		let sent: string[];

		setup(() => {
			const launch = initSettings('gdb');
			gdb = new GdbRemote(launch.gdb) as any;
			sent = [];
			gdb.sendPacketData = async (packetData: string) => {
				sent.push(packetData);
				return 'OK';
			};
		});

		test('checksum', () => {
			assert.equal(gdb.checksum(''), '00');
			assert.equal(gdb.checksum('A'), '41');
			assert.equal(gdb.checksum('AB'), '83');
			assert.equal(gdb.checksum('ABC'), 'C6');
			// Overflow:
			assert.equal(gdb.checksum('ABCD'), '0A');
		});

		test('parseXml', () => {
			gdb.parseXml('<architecture>z80</architecture>');	// Should not throw

			assert.throws(() => {
				gdb.parseXml('<architecture>x86</architecture>');
			}, Error("Architecture 'x86' is not supported by DeZog. A 'z80' architecture is required."));

			assert.throws(() => {
				gdb.parseXml('<target version="1.0"></target>');
			}, Error("No architecture found in reply of the remote."));
		});

		test('breakpoints use Z0/z0', async () => {
			const bp: any = {longAddress: 0x18000};	// Bank 1, address 0x8000
			await gdb.sendDzrpCmdAddBreakpoint(bp);
			await gdb.sendDzrpCmdRemoveBreakpoint(bp);
			// The bank is not part of the packet
			assert.deepEqual(sent, ['Z0,8000,0', 'z0,8000,0']);
		});

		test('watchpoints use the access type', async () => {
			await gdb.sendDzrpCmdAddWatchpoint(0x8000, 2, 'r');
			await gdb.sendDzrpCmdAddWatchpoint(0x8000, 2, 'w');
			await gdb.sendDzrpCmdAddWatchpoint(0x8000, 2, 'rw');
			await gdb.sendDzrpCmdRemoveWatchpoint(0x8000, 2, 'rw');
			assert.deepEqual(sent, ['Z3,8000,2', 'Z2,8000,2', 'Z4,8000,2', 'z4,8000,2']);
		});

		test('memory is written with M', async () => {
			await gdb.sendDzrpCmdWriteMem(0x8000, new Uint8Array([0x01, 0xAB, 0xFF]));
			assert.deepEqual(sent, ['M8000,3:01ABFF']);
		});

		test('memory blocks are read with m packets', async () => {
			await gdb.sendDzrpCmdReadMemBlocks([
				{addr64k: 0x8000, size: 1},
				{addr64k: 0x9000, size: 2}
			]);
			assert.deepEqual(sent, ['m8000,1', 'm9000,2']);
		});

		test('short memory replies are continued from the next address', async () => {
			const replies = ['0102', '0304'];
			gdb.sendPacketData = async (packetData: string) => {
				sent.push(packetData);
				return replies.shift()!;
			};
			const data = await gdb.readMemWithM(0x8000, 4);
			assert.deepEqual(Array.from(data), [1, 2, 3, 4]);
			assert.deepEqual(sent, ['m8000,4', 'm8002,2']);
		});

		test('loads a 48K SNA with flat M writes and standard registers', async () => {
			const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dezog-gdb-sna-'));
			const filePath = path.join(directory, 'test.sna');
			const sna = Buffer.alloc(27 + 3 * 0x4000);
			sna.writeUInt16LE(0xF000, 23);
			sna.fill(0x11, 27, 27 + 0x4000);
			sna.fill(0x22, 27 + 0x4000, 27 + 2 * 0x4000);
			sna.fill(0x33, 27 + 2 * 0x4000);
			sna.writeUInt16LE(0x1234, 27 + 0xF000 - 0x4000);
			fs.writeFileSync(filePath, sna);

			const writes: Array<{address: number, firstByte: number}> = [];
			const registers: Array<[number, number]> = [];
			gdb.sendDzrpCmdWriteMem = async (address: number, data: Uint8Array) => {
				writes.push({address, firstByte: data[0]});
			};
			gdb.sendDzrpCmdSetRegister = async (register: number, value: number) => {
				registers.push([register, value]);
			};

			try {
				const sp = await gdb.loadBinSna(filePath);
				assert.equal(sp, 0xF002);
				assert.deepEqual(writes, [
					{address: 0x4000, firstByte: 0x11},
					{address: 0x8000, firstByte: 0x22},
					{address: 0xC000, firstByte: 0x33}
				]);
				assert.deepEqual(registers.slice(0, 2), [
					[Z80_REG.PC, 0x1234],
					[Z80_REG.SP, 0xF002]
				]);
				assert.ok(registers.some(([register]) => register === Z80_REG.HL2));
			}
			finally {
				fs.rmSync(directory, {recursive: true, force: true});
			}
		});

		test('loads a 48K Z80 snapshot with flat M writes and standard registers', async () => {
			const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dezog-gdb-z80-'));
			const filePath = path.join(directory, 'test.z80');
			const z80 = Buffer.alloc(30 + 3 * 0x4000);
			z80.writeUInt16LE(0x1234, 6);	// Version 1 has a non-zero PC
			z80.writeUInt16LE(0xF000, 8);
			z80.fill(0x11, 30, 30 + 0x4000);
			z80.fill(0x22, 30 + 0x4000, 30 + 2 * 0x4000);
			z80.fill(0x33, 30 + 2 * 0x4000);
			fs.writeFileSync(filePath, z80);

			const writes: Array<{address: number, firstByte: number}> = [];
			const registers: Array<[number, number]> = [];
			gdb.sendDzrpCmdWriteMem = async (address: number, data: Uint8Array) => {
				writes.push({address, firstByte: data[0]});
			};
			gdb.sendDzrpCmdSetRegister = async (register: number, value: number) => {
				registers.push([register, value]);
			};

			try {
				const sp = await gdb.loadBinZ80(filePath);
				assert.equal(sp, 0xF000);
				assert.deepEqual(writes, [
					{address: 0x4000, firstByte: 0x11},
					{address: 0x8000, firstByte: 0x22},
					{address: 0xC000, firstByte: 0x33}
				]);
				assert.deepEqual(registers.slice(0, 2), [
					[Z80_REG.PC, 0x1234],
					[Z80_REG.SP, 0xF000]
				]);
				assert.ok(registers.some(([register]) => register === Z80_REG.HL2));
			}
			finally {
				fs.rmSync(directory, {recursive: true, force: true});
			}
		});

		test('pause sends a break', async () => {
			let withCtrlC = false;
			gdb.sendPacketData = async (packetData: string, ctrlC?: boolean) => {
				sent.push(packetData);
				withCtrlC = !!ctrlC;
				return 'OK';
			};
			await gdb.sendDzrpCmdPause();
			assert.deepEqual(sent, ['p0b']);
			assert.ok(withCtrlC);
		});

		test('disconnect detaches before closing the socket', async () => {
			let socketClosed = false;
			let timeoutMs = 0;
			gdb.socket = {};
			gdb.socketClose = async (timeout: number) => {
				socketClosed = true;
				timeoutMs = timeout;
			};
			await gdb.disconnect();
			assert.ok(socketClosed);
			assert.equal(timeoutMs, 1000);
			assert.deepEqual(sent, ['D']);
		});

		test('NEX loading is rejected without bank support', async () => {
			await assert.rejects(gdb.loadBinNex('unused.nex'), /not supported by the generic gdb remote/);
		});
	});
});
