import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {RevzRemote} from '../src/remotes/trs80/revzremote';
import {Settings} from '../src/settings/settings';
import {Utility} from '../src/misc/utility';
import {Z80RegistersClass} from '../src/remotes/z80registers';


suite('RevzRemote', () => {
	let remote: RevzRemote;
	let remoteAny: any;
	let sentRequests: {method: string, params: any}[];

	setup(() => {
		Utility.setExtensionPath('.');
		const cfg: any = {
			remoteType: 'revz',
			revz: {
				transport: {
					kind: 'python',
					serial: 'tcp:5555',
					bridge: 'tools/trszog_bridge.py'
				}
			},
			history: {
				reverseDebugInstructionCount: 0,
				spotCount: 0,
				codeCoverageEnabled: false
			}
		};
		const launch = Settings.Init(cfg);
		Settings.launch = launch;
		Z80RegistersClass.createRegisters(launch);
		remote = new RevzRemote();
		remoteAny = remote as any;
		// Intercept the JSON-RPC layer: no socket in unit tests.
		sentRequests = [];
		remoteAny.sendTrs80GpJsonRpcRequest = async (method: string, params: any) => {
			sentRequests.push({method, params});
			return true;
		};
	});


	suite('settings', () => {
		test('revz defaults', () => {
			const launch = Settings.launch;
			assert.equal(launch.revz.target, 'fpga');
			assert.equal(launch.revz.dongle, 'fpga');
			assert.equal(launch.revz.screen, true);
			assert.equal(launch.revz.transport.port, 49152);
			assert.equal(launch.revz.transport.autoStart, true);
			assert.equal(launch.revz.transport.baud, 460800);
			// Mirrored into the shared trs80 settings for the inherited
			// connect logic:
			assert.equal(launch.trs80.port, 49152);
			assert.equal(launch.trs80.useMock, false);
		});

		test('tcp serial device is passed through unchanged', () => {
			assert.equal(Settings.launch.revz.transport.serial, 'tcp:5555');
		});
	});


	suite('capabilities (initialize)', () => {
		test('honors advertised capabilities', async () => {
			remoteAny.sendTrs80GpJsonRpcRequest = async () => ({
				programName: 'trs80-rev-z debug bridge',
				version: '0.2',
				capabilities: {setRegister: true, stepOver: true, breakpoints: 7, watchpoints: 4, keys: true}
			});
			const result = await remote.sendDzrpCmdInit();
			assert.equal(result.error, undefined);
			assert.equal(result.programName, 'trs80-rev-z debug bridge');
			assert.equal(remoteAny.supportsWPMEM, true);
			assert.equal(remote.supportsKeys, true);
		});

		test('missing capabilities mean trs80gp baseline', async () => {
			remoteAny.sendTrs80GpJsonRpcRequest = async () => ({
				programName: 'something-older', version: '0.1'
			});
			const result = await remote.sendDzrpCmdInit();
			assert.equal(result.error, undefined);
			assert.equal(remoteAny.supportsWPMEM, false);
			assert.equal(remote.supportsKeys, false);
		});

		test('keys:false backend gets no x-keys traffic', async () => {
			remoteAny.capabilities = {keys: false};
			remote.keyEvent('a', true);
			assert.equal(sentRequests.length, 0);
		});
	});


	suite('watchpoints', () => {
		setup(() => {
			remoteAny.capabilities = {watchpoints: 4};
		});

		test('add sends the full list', async () => {
			await remote.sendDzrpCmdAddWatchpoint(0x8000, 2, 'rw');
			assert.equal(sentRequests.length, 1);
			assert.equal(sentRequests[0].method, 'x-setWatchpoints');
			assert.deepEqual(sentRequests[0].params.watchpoints, [
				{address: '0x8000', access: 'rw'},
				{address: '0x8001', access: 'rw'}
			]);
		});

		test('running out of hardware slots is an honest error', async () => {
			await remote.sendDzrpCmdAddWatchpoint(0x8000, 4, 'w');
			await assert.rejects(remote.sendDzrpCmdAddWatchpoint(0x9000, 1, 'r'),
				/hardware watchpoint slots/);
		});

		test('remove re-sends the remaining list', async () => {
			await remote.sendDzrpCmdAddWatchpoint(0x8000, 2, 'rw');
			await remote.sendDzrpCmdAddWatchpoint(0x9000, 1, 'r');
			sentRequests.length = 0;
			await remoteAny.sendDzrpCmdRemoveWatchpoint(0x8000, 2, 'rw');
			assert.equal(sentRequests.length, 1);
			assert.deepEqual(sentRequests[0].params.watchpoints, [
				{address: '0x9000', access: 'r'}
			]);
		});
	});


	suite('keyboard matrix (x-keys)', () => {
		setup(() => {
			remoteAny.capabilities = {keys: true};
		});

		/** Returns the matrix hex string of the last x-keys request. */
		function lastMatrix(): string {
			const last = sentRequests[sentRequests.length - 1];
			assert.equal(last.method, 'x-keys');
			return last.params.matrix;
		}

		test('single letter: A = row 0 bit 1', () => {
			remote.keyEvent('a', true);
			assert.equal(lastMatrix(), '0200000000000000');
		});

		test('ENTER = row 6 bit 0', () => {
			remote.keyEvent('Enter', true);
			assert.equal(lastMatrix(), '0000000000000100');
		});

		test('digit and letter combine; release rebuilds', () => {
			remote.keyEvent('d', true);		// row 0 bit 4
			remote.keyEvent('1', true);		// row 4 bit 1
			assert.equal(lastMatrix(), '1000000002000000');
			remote.keyEvent('d', false);
			assert.equal(lastMatrix(), '0000000002000000');
		});

		test('shifted glyph forces shift on: ! = shift+1', () => {
			remote.keyEvent('Shift', true);
			remote.keyEvent('!', true);
			assert.equal(lastMatrix(), '0000000002000001');
		});

		test('host-shifted glyph forces shift off: @ from Shift+2', () => {
			remote.keyEvent('Shift', true);
			remote.keyEvent('@', true);
			// '@' is row 0 bit 0, typed unshifted on the Model 1
			assert.equal(lastMatrix(), '0100000000000000');
		});

		test('uppercase letters are tracked as their key, shift from Shift', () => {
			remote.keyEvent('Shift', true);
			remote.keyEvent('A', true);
			assert.equal(lastMatrix(), '0200000000000001');
			remote.keyEvent('A', false);	// keyup may report either case
			remote.keyEvent('Shift', false);
			assert.equal(lastMatrix(), '0000000000000000');
		});

		test('releaseAllKeys clears everything with one report', () => {
			remote.keyEvent('a', true);
			remote.keyEvent('Shift', true);
			sentRequests.length = 0;
			remote.releaseAllKeys();
			assert.equal(sentRequests.length, 1);
			assert.equal(lastMatrix(), '0000000000000000');
		});

		test('unchanged matrix is not re-sent', () => {
			remote.keyEvent('a', true);
			sentRequests.length = 0;
			remote.keyEvent('CapsLock', true);	// unmapped key
			assert.equal(sentRequests.length, 0);
		});
	});
});
