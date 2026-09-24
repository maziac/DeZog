
import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {RemoteBase} from '../src/remotes/remotebase';
import {InstrumentationParser} from '../src/remotes/instrumentationparser';
import {Settings} from '../src/settings/settings';
import {Z80RegistersClass, Z80Registers} from '../src/remotes/z80registers';
import {GenericBreakpoint, GenericWatchpoint} from '../src/genericwatchpoint';
import {Z80RegistersStandardDecoder} from '../src/remotes/z80registersstandarddecoder';


suite('InstrumentationParser', () => {

	setup(() => {
		// Initialize Settings
		const cfg: any = {
			remoteType: 'zsim'
		};

		Settings.launch = Settings.Init(cfg);
		Z80RegistersClass.createRegisters(Settings.launch);
		Z80Registers.decoder = new Z80RegistersStandardDecoder();
	});


	suite('WPMEM, ASSERTION, LOGPOINT', () => {

		test('WPMEM', async () => {
			const wpLines = [
				{address: undefined, line: "WPMEM"},	// E.g. macro or line without bytes
				{address: 0x1A000, line: "WPMEM"},
				{address: 0xA010, line: "WPMEM, 5, w"},
				{address: 0xA020, line: "WPMEM 0x7000, 10, r "},
				{address: 0xA020, line: "WPMEM 0x6000, 5, w, A==0"}
			];

			const wps: Array<GenericWatchpoint> = InstrumentationParser.createWatchPoints(wpLines as any);
			assert.equal(wps.length, 4);

			assert.equal(wps[0].longOr64kAddress, 0x1A000);
			assert.equal(wps[0].size, 1);
			assert.equal(wps[0].access, "rw");
			assert.equal(wps[0].condition, "");

			assert.equal(wps[1].longOr64kAddress, 0xA010);
			assert.equal(wps[1].size, 5);
			assert.equal(wps[1].access, "w");
			assert.equal(wps[1].condition, "");

			assert.equal(wps[2].longOr64kAddress, 0x7000);
			assert.equal(wps[2].size, 10);
			assert.equal(wps[2].access, "r");
			assert.equal(wps[2].condition, "");

			assert.equal(wps[3].longOr64kAddress, 0x6000);
			assert.equal(wps[3].size, 5);
			assert.equal(wps[3].access, "w");
			assert.equal(wps[3].condition, "A==0");
		});


		test('ASSERTION', async () => {
			const wpLines = [
				{address: 0xA020, line: "ASSERTION"},
				{address: 0xA021, line: "ASSERTION B==1"},
			];

			const assertions: Array<GenericBreakpoint> = InstrumentationParser.createAssertions(wpLines);
			assert.equal(assertions.length, 2);

			assert.equal(assertions[0].longAddress, 0xA020);
			assert.equal(assertions[0].condition, "!(false)");
			assert.equal(assertions[0].log, undefined);

			assert.equal(assertions[1].longAddress, 0xA021);
			assert.equal(assertions[1].condition, "!(B==1)");
			assert.equal(assertions[1].log, undefined);
		});


		test('LOGPOINT', async () => {
			const remote = new RemoteBase();
			let warning = false;
			remote.on('warning', () => {
				warning = true;
			});

			const lpLines = [
				{address: 0xA023, line: "LOGPOINT [GROUP1] ${A}"},
				{address: 0xA024, line: "LOGPOINT [GROUP1] BC=${BC:hex16}"},
				{address: 0xA025, line: "LOGPOINT [GROUP1]"},
				{address: 0xA026, line: "LOGPOINT MY LOG"},
				{address: 0xA027, line: "LOGPOINTx [GROUP2] ${A}"}
			];

			const lps: Map<string, Array<GenericBreakpoint>> = InstrumentationParser.createLogPoints(lpLines, remote, msg => remote.emit('warning', msg));
			assert.equal(lps.size, 2);

			let bps: Array<GenericBreakpoint> = lps.get("GROUP1")!;
			assert.equal(warning, false);
			assert.equal(bps.length, 3);
			assert.equal(bps[0].longAddress, 0xA023);
			assert.equal(bps[0].condition, "");
			assert.equal((bps[0].log as any).preparedExpression, '[GROUP1] ${string:getRegValue("A")}');
			assert.equal(bps[1].longAddress, 0xA024);
			assert.equal(bps[1].condition, "");
			assert.equal((bps[1].log as any).preparedExpression, '[GROUP1] BC=${hex16:getRegValue("BC")}');
			assert.equal(bps[2].longAddress, 0xA025);
			assert.equal(bps[2].condition, "");
			assert.equal((bps[2].log as any).preparedExpression, "[GROUP1] ");

			bps = lps.get("DEFAULT")!;
			assert.equal(bps.length, 1);
			assert.equal(bps[0].longAddress, 0xA026);
			assert.equal(bps[0].condition, "");
			assert.equal((bps[0].log as any).preparedExpression, "[DEFAULT] MY LOG");
		});
	});
});
