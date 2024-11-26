import * as assert from 'assert';
import {Z80RegistersClass, Z80Registers} from '../src/remotes/z80registers';
import {RemoteFactory} from '../src/remotes/remotefactory';
import {Remote} from '../src/remotes/remotebase';
import {Settings, SettingsParameters} from '../src/settings/settings';
import {Labels} from '../src/labels/labels';
import {DecodeZesaruxRegisters, DecodeZesaruxRegistersZx128k} from '../src/remotes/zesarux/decodezesaruxdata';
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../src/remotes/MemoryModel/zxnextmemorymodels';
import {LogEval} from '../src/misc/logeval';


suite('LogEval', () => {
	suite('prepareExpression', () => {
		test('empty', async () => {
			assert.equal(LogEval.prepareExpression(''), 'string:');
		});
		test('b@() w@()', async () => {
			assert.equal(LogEval.prepareExpression('b@(8) - w@(15):hex'), 'hex:await getByte(8) - await getWord(15)');
		});
	});

	suite('checkExpressionSyntax', () => {
		suite('correct', () => {
			test('empty', async () => {
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("string:");
				});
			});
			test('getByte/Word', async () => {
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("string:await getByte(9)+await getWord(8)");
				});
			});
			test('boolean', async () => {
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("string:2 == 2");
				});
			});
			test('format', async () => {
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("string:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("hex8:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("hex16:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("int8:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("int16:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("uint8:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("uint16:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("bits:");
				});
				assert.doesNotThrow(() => {
					LogEval.checkExpressionSyntax("flags:");
				});
			});
		});

		suite('wrong', () => {
			test('format', async () => {
				assert.throws(() => {
					LogEval.checkExpressionSyntax("xxx:");
				});
			});
			test('* * (wrong syntax)', async () => {
				assert.throws(() => {
					LogEval.checkExpressionSyntax("string:await getByte(9)* *await getWord(8)");
				});
			});
		});
	});

	suite('evalFullExpression', () => {

		class MockRemote {
			public async readMemoryDump(addr64k: number, size: number): Promise<Uint8Array> {
				const data = new Uint8Array(size);
				for (let i = 0; i < size; i++) {
					data[i] = addr64k & 0xFF;
					addr64k >>= 8;
				}
				return data;
			}
		}
		const remote = new MockRemote();
		const logEval = new LogEval(remote as any);

		test('simple', async () => {
			// TODO: Return memory
			let evalString = await logEval.evalFullExpression("string:await getByte(9)+await getWord(4660)");
			assert.equal(evalString, "4669");	// 9 + 4660 = 4669
		});


		suite('format', () => {
			test('string', async () => {
				let evalString = await logEval.evalFullExpression("string:1234");
				assert.equal(evalString, "1234");
			});

			test('boolean', async () => {
				let evalString = await logEval.evalFullExpression("string:1 == 1");
				assert.equal(evalString, "true");
			});

			test('hex8', async () => {
				let evalString = await logEval.evalFullExpression("hex8:10");
				assert.equal(evalString, "0x0A");
			});
			test('hex16', async () => {
				let evalString = await logEval.evalFullExpression("hex16:258");
				assert.equal(evalString, "0x0102");
			});

			test('int8', async () => {
				let evalString = await logEval.evalFullExpression("int8:10");
				assert.equal(evalString, "10");
				evalString = await logEval.evalFullExpression("int8:255");
				assert.equal(evalString, "-1");
				evalString = await logEval.evalFullExpression("int8:-2");
				assert.equal(evalString, "-2");
			});
			test('int16', async () => {
				let evalString = await logEval.evalFullExpression("int16:258");
				assert.equal(evalString, "258");
				evalString = await logEval.evalFullExpression("int16:65535");
				assert.equal(evalString, "-1");
				evalString = await logEval.evalFullExpression("int16:-2");
				assert.equal(evalString, "-2");
			});

			test('uint8', async () => {
				let evalString = await logEval.evalFullExpression("uint8:10");
				assert.equal(evalString, "10");
				evalString = await logEval.evalFullExpression("uint8:255");
				assert.equal(evalString, "255");
				evalString = await logEval.evalFullExpression("uint8:-2");
				assert.equal(evalString, "254");
			});
			test('uint16', async () => {
				let evalString = await logEval.evalFullExpression("uint16:258");
				assert.equal(evalString, "258");
				evalString = await logEval.evalFullExpression("uint16:65535");
				assert.equal(evalString, "65535");
				evalString = await logEval.evalFullExpression("uint16:-2");
				assert.equal(evalString, "65534");
			});

			test('bits', async () => {
				let evalString = await logEval.evalFullExpression("bits:258");
				assert.equal(evalString, "TODO");
			});

			test('flags', async () => {
				let evalString = await logEval.evalFullExpression("flags:258");
				assert.equal(evalString, "TODO");
			});
		});
	});
});