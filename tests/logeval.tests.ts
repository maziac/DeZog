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

	class MockZ80RegistersClass {
		public getRegValueByName(regName: string): number {
			return 0;
		};
	}

	class MockLabelsClass {
		public getNumberFromString64k(lbl: string): number {
			if (lbl === 'Label_1')
				return 0x1234;
			if (lbl === 'start')
				return 0x8000;
			return NaN;
		}
	}

	test('constructor', async () => {
		const remote = new MockRemote() as any;
		const z80registers = new MockZ80RegistersClass() as any;
		const labels = new MockLabelsClass() as any;
		new LogEval('', remote, z80registers, labels);
		// no crash
	});

	suite('prepareExpression', () => {
		const remote = new MockRemote() as any;
		const z80registers = new MockZ80RegistersClass() as any;
		const labels = new MockLabelsClass() as any;
		const logEval = new LogEval('', remote, z80registers, labels) as any;

		test('empty', async () => {
			assert.deepEqual(logEval.prepareExpression(''), ['string', '']);
		});

		test('b@() w@()', async () => {
			assert.deepEqual(logEval.prepareExpression('b@(8) - w@(15):hex8'), ['hex8', 'await getByte(8) - await getWord(15)']);
		});
		test('without format', async () => {
			assert.deepEqual(logEval.prepareExpression('b@(8) - w@(15)'), ['string', 'await getByte(8) - await getWord(15)']);
		});

		test('format', async () => {
			let res;
			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":string");
			});
			assert.deepEqual(res, ['string', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":hex8");
			});
			assert.deepEqual(res, ['hex8', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":hex16");
			});
			assert.deepEqual(res, ['hex16', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":int8");
			});
			assert.deepEqual(res, ['int8', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":int16");
			});
			assert.deepEqual(res, ['int16', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":uint8");
			});
			assert.deepEqual(res, ['uint8', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":uint16");
			});
			assert.deepEqual(res, ['uint16', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":bits");
			});
			assert.deepEqual(res, ['bits', '']);

			assert.doesNotThrow(() => {
				res = logEval.prepareExpression(":flags");
			});
			assert.deepEqual(res, ['flags', '']);
		});

		test('wrong format', async () => {
			assert.throws(() => {
				logEval.prepareExpression(":xxx");
			});
		});

		suite('replaceLabels', () => {
			test('one label', async () => {
				assert.equal(logEval.replaceLabels('12+b@(HL)+Label_1-3'), '12+b@(HL)+4660-3');
			});
			test('two labels', async () => {
				assert.equal(logEval.replaceLabels('b@(HL)+Label_1-3*w@(start)'), 'b@(HL)+4660-3*w@(32768)');
			});
		});

		suite('replaceRegisters', () => {
			test('no reg', async () => {
				assert.equal(logEval.replaceRegisters('gh'), 'gh');
			});
			test('all registers', async () => {
				assert.equal(logEval.replaceRegisters("AF"), 'getRegValue("AF")');
				assert.equal(logEval.replaceRegisters('AF BC DE HL IX IY SP PC'), 'getRegValue("AF") getRegValue("BC") getRegValue("DE") getRegValue("HL") getRegValue("IX") getRegValue("IY") getRegValue("SP") getRegValue("PC")');
				assert.equal(logEval.replaceRegisters('IR IM IXL IXH IYL IYH'), 'getRegValue("IR") getRegValue("IM") getRegValue("IXL") getRegValue("IXH") getRegValue("IYL") getRegValue("IYH")');
				assert.equal(logEval.replaceRegisters('A B C D E H L R I '), 'getRegValue("A") getRegValue("B") getRegValue("C") getRegValue("D") getRegValue("E") getRegValue("H") getRegValue("L") getRegValue("R") getRegValue("I") ');

				assert.equal(logEval.replaceRegisters("A'"), 'getRegValue("A\'")');
				assert.equal(logEval.replaceRegisters("A' B' C' D' E' H' L'"), 'getRegValue("A\'") getRegValue("B\'") getRegValue("C\'") getRegValue("D\'") getRegValue("E\'") getRegValue("H\'") getRegValue("L\'")');
			});
			test('in between', async () => {
				assert.equal(logEval.replaceRegisters("+AF*"), '+getRegValue("AF")*');
				assert.equal(logEval.replaceRegisters(")AF("), ')getRegValue("AF")(');
			});
		});

		suite('replaceAt', () => {
			test('b@(...)', async () => {
				assert.equal(logEval.replaceAt('b@(20+5)'), 'await getByte(20+5)');
			});
			test('w@(...)', async () => {
				assert.equal(logEval.replaceAt('5*w@(20+5)-3'), '5*await getWord(20+5)-3');
			});
		});

		suite('checkExpressionSyntax', () => {
			suite('correct', () => {
				test('empty', async () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("");
					});
				});
				test('getByte/Word', async () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("await getByte(9)+await getWord(8)");
					});
				});
				test('boolean', async () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("2 == 2");
					});
				});
			});

			suite('wrong', () => {
				test('* * (wrong syntax)', async () => {
					assert.throws(() => {
						logEval.checkExpressionSyntax("await getByte(9)* *await getWord(8):string");
					});
				});
			});
		});
	});

	suite('formatValue', () => {
		const logEval = new LogEval('', undefined as any, undefined as any, undefined as any) as any;
		test('string', async () => {
			assert.equal(logEval.formatValue('string', 1234), '1234');
		});
		test('hex8', async () => {
			assert.equal(logEval.formatValue('hex8', 0xABCD), '0xCD');
		});
		test('hex16', async () => {
			assert.equal(logEval.formatValue('hex16', 0xABCD), '0xABCD');
		});
		test('int8', async () => {
			assert.equal(logEval.formatValue('int8', 0xAB56), '86');
		});
		test('int8', async () => {
			assert.equal(logEval.formatValue('int8', 0xABFE), '-2');
		});
		test('int16', async () => {
			assert.equal(logEval.formatValue('int16', 0x12345), '9029');
		});
		test('int16', async () => {
			assert.equal(logEval.formatValue('int16', 0x1FFFE), '-2');
		});
		test('uint8', async () => {
			assert.equal(logEval.formatValue('uint8', 0x129A), '154');
		});
		test('uint16', async () => {
			assert.equal(logEval.formatValue('uint16', 0x3FE9A), '65178');
		});
		test('bits', async () => {
			assert.equal(logEval.formatValue('bits', 1234), 'TODO');
		});
		test('flags', async () => {
			assert.equal(logEval.formatValue('flags', 1234), 'TODO');
		});
	});

	/*
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
		const z80Registers = new Z80RegistersClass();
		const logEval = new LogEval(remote as any, z80Registers);

		test('simple', async () => {
			let evalString = await logEval.evaluate("string:await getByte(9)+await getWord(4660)");
			assert.equal(evalString, "4669");	// 9 + 4660 = 4669
		});


		suite('format', () => {
			test('string', async () => {
				let evalString = await logEval.evaluate("string:1234");
				assert.equal(evalString, "1234");
			});

			test('boolean', async () => {
				let evalString = await logEval.evaluate("string:1 == 1");
				assert.equal(evalString, "true");
			});

			test('hex8', async () => {
				let evalString = await logEval.evaluate("hex8:10");
				assert.equal(evalString, "0x0A");
			});
			test('hex16', async () => {
				let evalString = await logEval.evaluate("hex16:258");
				assert.equal(evalString, "0x0102");
			});

			test('int8', async () => {
				let evalString = await logEval.evaluate("int8:10");
				assert.equal(evalString, "10");
				evalString = await logEval.evaluate("int8:255");
				assert.equal(evalString, "-1");
				evalString = await logEval.evaluate("int8:-2");
				assert.equal(evalString, "-2");
			});
			test('int16', async () => {
				let evalString = await logEval.evaluate("int16:258");
				assert.equal(evalString, "258");
				evalString = await logEval.evaluate("int16:65535");
				assert.equal(evalString, "-1");
				evalString = await logEval.evaluate("int16:-2");
				assert.equal(evalString, "-2");
			});

			test('uint8', async () => {
				let evalString = await logEval.evaluate("uint8:10");
				assert.equal(evalString, "10");
				evalString = await logEval.evaluate("uint8:255");
				assert.equal(evalString, "255");
				evalString = await logEval.evaluate("uint8:-2");
				assert.equal(evalString, "254");
			});
			test('uint16', async () => {
				let evalString = await logEval.evaluate("uint16:258");
				assert.equal(evalString, "258");
				evalString = await logEval.evaluate("uint16:65535");
				assert.equal(evalString, "65535");
				evalString = await logEval.evaluate("uint16:-2");
				assert.equal(evalString, "65534");
			});

			test('bits', async () => {
				let evalString = await logEval.evaluate("bits:258");
				assert.equal(evalString, "TODO");
			});

			test('flags', async () => {
				let evalString = await logEval.evaluate("flags:258");
				assert.equal(evalString, "TODO");
			});
		});
	});
	*/
});
