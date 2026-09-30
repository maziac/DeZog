import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {GdbRemote} from '../src/remotes/gdb/gdbremote';
import {MameGdbRemote} from '../src/remotes/mame/mamegdbremote';
import {Z80RegistersGdbDecoder} from '../src/remotes/gdb/z80registersgdbdecoder';
import {RemoteFactory} from '../src/remotes/remotefactory';
import {Remote} from '../src/remotes/remotebase';
import {Settings} from '../src/settings/settings';



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
	});
});
