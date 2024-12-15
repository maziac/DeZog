import * as assert from 'assert';
import * as sinon from 'sinon';
import {LogEvalBasicZx81} from '../src/misc/zx81/logevalbasiczx81';
import {ZSimRemote} from '../src/remotes/zsimulator/zsimremote';
import {Z80Registers, Z80RegistersClass} from '../src/remotes/z80registers';
import {Z80RegistersStandardDecoder} from '../src/remotes/z80registersstandarddecoder';
import {Settings} from '../src/settings/settings';

suite('LogEvalBasicZx81', () => {
	let remote: ZSimRemote;
	let mockRemote: sinon.SinonMock;
	let mockZ80Registers: sinon.SinonMock;
	let mockLabels: sinon.SinonMock;

	setup(() => {
		// Initialize Settings
		const cfg: any = {
			remoteType: 'zsim'
		};
		const launch = Settings.Init(cfg);
		Z80RegistersClass.createRegisters(launch);
		Z80Registers.decoder = new Z80RegistersStandardDecoder();
		remote = new ZSimRemote(launch);
		mockRemote = sinon.mock(remote);
	});

	suite('setLogPoints', () => {
		test('BASIC group not yet exists', async () => {
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			const logPointsMap = new Map<string, any[]>();
			log.setLogPoints(logPointsMap);
			assert.equal(logPointsMap.size, 1);
			const array = logPointsMap.get('BASIC')!;
			assert.notEqual(array, undefined);
			assert.equal(array.length, 2);
		});
		test('BASIC group exists', async () => {
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			const logPointsMap = new Map<string, any[]>();
			logPointsMap.set('BASIC', [{longAddress: 0, condition: '', log: log}]);
			log.setLogPoints(logPointsMap);
			assert.equal(logPointsMap.size, 1);
			const array = logPointsMap.get('BASIC')!;
			assert.notEqual(array, undefined);
			assert.equal(array.length, 3);
		});
	});

	suite('evaluate', () => {
		test('pc not hit', async () => {
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			log.setLogPoints(new Map<string, any[]>());
			const spyEvaluateLine = sinon.spy(log, 'evaluateLine');
			const spyEvaluateVars = sinon.spy(log, 'evaluateVars');
			mockRemote.expects('getPCLong').returns(0x10000);	// Long address, pc = 0
			const txt = await log.evaluate();
			sinon.assert.notCalled(spyEvaluateLine);
			sinon.assert.notCalled(spyEvaluateVars);
			assert.equal(txt, undefined);
		});
		test('bp BASIC line hit', async () => {
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			const mockLog = sinon.mock(log);
			mockLog.expects('evaluateLine').once();
			mockLog.expects('evaluateVars').never();
			log.setLogPoints(new Map<string, any[]>());
			mockRemote.expects('getPCLong').returns(0x10000 + (LogEvalBasicZx81 as any).BP_ADDR_BASIC_LINE);	// Long address, pc = 0
			const txt = await log.evaluate();
			mockLog.verify();
			assert.equal(txt, undefined);
		});
		test('bp vars hit', async () => {
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			const mockLog = sinon.mock(log);
			mockLog.expects('evaluateLine').never();
			mockLog.expects('evaluateVars').once().returns(Promise.resolve('x'));
			log.setLogPoints(new Map<string, any[]>());
			mockRemote.expects('getPCLong').returns(0x10000 + (LogEvalBasicZx81 as any).BP_ADDR_BASIC_VARS);	// Long address, pc = 0
			const txt = await log.evaluate();
			mockLog.verify();
			assert.equal(txt, 'x');
		});
	});

	suite('evaluateLine', () => {
		test('wrong HL', async () => {
			const lineContentsAddr = 20000;
			mockRemote.expects('getRegisterValue').withArgs('HL').returns(lineContentsAddr);
			mockRemote.expects('readMemoryDump').withArgs(16400).returns(new Uint8Array([19999 & 0xFF, 19999 >> 8]));	// VARS
			const log = new LogEvalBasicZx81(remote, Z80Registers, undefined as any) as any;
			log.cachedBasicLine = new Uint8Array();
			await log.evaluateLine();
			assert.equal(log.cachedBasicLine, undefined);
		});
		test('260 LET N=5', async () => {
			const buf = new Uint8Array([
				0xF1, 	// LET
				0x33, 	// N
				0x14, 	// =
				0x1C, 	// 0
				0x7E, 	// Number
				0, 0, 0, 0, 0,	// Exp & mantissa, doesn't matter,
				0x76	// Newline
			]);
			const lineContentsAddr = 20000;
			mockRemote.expects('getRegisterValue').withArgs('HL').returns(lineContentsAddr);
			mockRemote.expects('readMemoryDump').withArgs(16400).returns(Promise.resolve(new Uint8Array([25000 & 0xFF, 25000 >> 8])));	// VARS
			mockRemote.expects('readMemoryDump').withArgs(lineContentsAddr - 4).returns(Promise.resolve(new Uint8Array([1, 4])));	// line number 260
			mockRemote.expects('readMemoryDump').withArgs(lineContentsAddr - 2).returns(Promise.resolve(new Uint8Array([buf.length & 0xFF, buf.length >> 8])));	// size
			mockRemote.expects('readMemoryDump').withArgs(lineContentsAddr).returns(Promise.resolve(buf));	// BASIC line buffer
			const log = new LogEvalBasicZx81(remote, mockZ80Registers, mockLabels) as any;
			log.cachedBasicLine = new Uint8Array();
			await log.evaluateLine();
			assert.equal(log.cachedBasicLine, 'BASIC: 260 LET N=0');
			assert.equal(log.cachedVarNames.length, 1);
			assert.equal(log.cachedVarNames[0], 'N');
		});
	});

	suite('extractVarNames', () => {
		test('LET N=5', () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xF1, 	// LET
				0x33, 	// N
				0x14, 	// =
				0x21, 	// 5
				0x7E, 	// Number
				0, 0, 0, 0, 0	// Exp & mantissa, doesn't matter
			]));
			assert.equal(vars.length, 1);
			assert.equal(vars[0], 'N');
		});
		test('LET N=MAB+1', () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xF1, 	// LET
				0x33, 	// N
				0x14, 	// =
				0x32, 0x26, 0x27, 	// MAB
				0x15, 	// +
				0x1D, 	// 1
			]));
			assert.equal(vars.length, 2);
			assert.equal(vars[0], 'N');
			assert.equal(vars[1], 'MAB');
		});
		test('LET N$=MAB$', () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xF1, 	// LET
				0x33, 0x0D,	// N$
				0x14, 	// =
				0x32, 0x26, 0x27, 0x0D,	// MAB$
				0x15, 	// +
				0x1D, 	// 1
			]));
			assert.equal(vars.length, 2);
			assert.equal(vars[0], 'N$');
			assert.equal(vars[1], 'MAB$');
		});
		test('LET N(5)=M', () => {
			// Fields (e.g. N(5)) are not extracted
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xF1, 	// LET
				0x33, 0x10,	// N(
					0x21, 	// 5
					0x7E, 	// Number
					0, 0, 0, 0, 0,	// Exp & mantissa, doesn't matter
				0x11, 	// )
				0x14, 	// =
				0x32,	// M
			]));
			assert.equal(vars.length, 1);
			assert.equal(vars[0], 'M');
		});
		test('REM N=5', () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xEA, 	// REM
				0x33, 	// N
				0x14, 	// =
				0x21, 	// 5
				0x7E, 	// Number
				0, 0, 0, 0, 0	// Exp & mantissa, doesn't matter
			]));
			assert.equal(vars.length, 0);
		});
		test('quoted, PRINT "SRC";B;"C";D;"E"', () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			const vars = log.extractVarNames(new Uint8Array([
				0xF5, 	// PRINT
				0x0B, 0x38, 0x37, 0x28, 0x0B, 0x19,	// "SRC";
				0x27, 	// B
				0x19, 0x0B, 0x28, 0x0B, 0x19,	// ;"C";
				0x29,	// D
				0x19, 0x0B, 0x2A, 0x0B,	// ;"E"
			]));
			assert.equal(vars.length, 2);
			assert.equal(vars[0], 'B');
			assert.equal(vars[1], 'D');
		});
	});

	suite('evaluateVars', () => {
		test('undefined', async () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			log.cachedBasicLine = undefined;
			const txt = await log.evaluateVars();
			assert.equal(txt, undefined);
		});
		test('A,B', async () => {
			const log = new LogEvalBasicZx81(mockRemote, mockZ80Registers, mockLabels) as any;
			log.cachedBasicLine = new Uint8Array();
			log.cachedVarNames = ['A', 'B'];
			const txt = await log.evaluateVars();
			assert.equal(txt, ' [A, B]');
			assert.equal(log.cachedBasicLine, undefined);
		});
	});
});
