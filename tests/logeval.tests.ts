import * as assert from 'assert';
import {suite, test} from 'mocha';
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
			if (regName === 'HL')
				return 0x1000;
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

		test('empty', () => {
			assert.deepEqual(logEval.prepareExpression(''), ['string', '']);
		});

		test('b@() w@()', () => {
			assert.deepEqual(logEval.prepareExpression('b@(8) - w@(15):hex8'), ['hex8', 'await getByte(8) - await getWord(15)']);
		});
		test('without format', () => {
			assert.deepEqual(logEval.prepareExpression('b@(8) - w@(15)'), ['string', 'await getByte(8) - await getWord(15)']);
		});

		test('format', () => {
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

		test('wrong format', () => {
			assert.throws(() => {
				logEval.prepareExpression(":xxx");
			});
		});

		suite('replaceLabels', () => {
			test('one label', () => {
				assert.equal(logEval.replaceLabels('12+b@(HL)+Label_1-3'), '12+b@(HL)+4660-3');
			});
			test('two labels', () => {
				assert.equal(logEval.replaceLabels('b@(HL)+Label_1-3*w@(start)'), 'b@(HL)+4660-3*w@(32768)');
			});
		});

		suite('replaceHexNumbers', () => {
			test('$F12A', () => {
				assert.equal(logEval.replaceHexNumbers('$F12A'), '0xF12A');
			});
			test('F12Ah', () => {
				assert.equal(logEval.replaceHexNumbers('F12Ah'), '0xF12A');
			});
			test('212Ah', () => {
				assert.equal(logEval.replaceHexNumbers('212Ah'), '0x212A');
			});
		});

		suite('replaceRegisters', () => {
			test('no reg', () => {
				assert.equal(logEval.replaceRegisters('gh'), 'gh');
			});
			test('all registers', () => {
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
			test('b@(...)', () => {
				assert.equal(logEval.replaceAt('b@(20+5)'), 'await getByte(20+5)');
			});
			test('w@(...)', () => {
				assert.equal(logEval.replaceAt('5*w@(20+5)-3'), '5*await getWord(20+5)-3');
			});
		});

		suite('checkExpressionSyntax', () => {
			suite('correct', () => {
				test('empty', () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("");
					});
				});
				test('getByte/Word', () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("await getByte(9)+await getWord(8)");
					});
				});
				test('boolean', () => {
					assert.doesNotThrow(() => {
						logEval.checkExpressionSyntax("2 == 2");
					});
				});
			});

			suite('wrong', () => {
				test('* * (wrong syntax)', () => {
					assert.throws(() => {
						logEval.checkExpressionSyntax("await getByte(9)* *await getWord(8):string");
					});
				});
			});
		});
	});

	suite('formatValue', () => {
		const logEval = new LogEval('', undefined as any, undefined as any, undefined as any) as any;
		test('string', () => {
			assert.equal(logEval.formatValue('string', 1234), '1234');
		});
		test('hex8', () => {
			assert.equal(logEval.formatValue('hex8', 0xABCD), '0xCD');
		});
		test('hex16', () => {
			assert.equal(logEval.formatValue('hex16', 0xABCD), '0xABCD');
		});
		test('int8 positive', () => {
			assert.equal(logEval.formatValue('int8', 0xAB56), '86');
		});
		test('int8 negative', () => {
			assert.equal(logEval.formatValue('int8', 0xABFE), '-2');
		});
		test('int16 positive', () => {
			assert.equal(logEval.formatValue('int16', 0x12345), '9029');
		});
		test('int16 negative', () => {
			assert.equal(logEval.formatValue('int16', 0x1FFFE), '-2');
		});
		test('uint8', () => {
			assert.equal(logEval.formatValue('uint8', 0x129A), '154');
		});
		test('uint16', () => {
			assert.equal(logEval.formatValue('uint16', 0x3FE9A), '65178');
		});
		test('bits', () => {
			assert.equal(logEval.formatValue('bits', 0b1100101), '01100101');
			assert.equal(logEval.formatValue('bits', 0x2EE), '1011101110');
		});
	});

	suite('evaluate', () => {
		const remote = new MockRemote() as any;
		const z80registers = new MockZ80RegistersClass() as any;
		const labels = new MockLabelsClass() as any;
		const logEval = new LogEval('', remote, z80registers, labels) as any;

		test('without expression', async () => {
			logEval.preparedExpression = "";
			let evalString = await logEval.evaluate();
			assert.equal(evalString, "");
			logEval.preparedExpression = "just text";
			evalString = await logEval.evaluate();
			assert.equal(evalString, "just text");
		});

		test('getByte/getWord', async () => {
			logEval.preparedExpression = "${string:await getByte(9)+await getWord(4660)+10}";
			const evalString = await logEval.evaluate();
			assert.equal(evalString, "4679");	// 9 + 4660 + 10 = 4679
		});

		suite('registers', () => {
			test('simple', async () => {
				logEval.preparedExpression = '${string:getRegValue("HL")}';
				const evalString = await logEval.evaluate();
				assert.equal(evalString, "4096");
			});
			test('more complex', async () => {
				logEval.preparedExpression = '${string:await getByte(getRegValue("HL")+0x234)}';
				const evalString = await logEval.evaluate();
				assert.equal(evalString, "52");	// 0x34
			});
		});

		suite('format', () => {
			test('string', async () => {
				logEval.preparedExpression = "${string: 1234}";
				const evalString = await logEval.evaluate();
				assert.equal(evalString, "1234");
			});

			test('hex8', async () => {
				logEval.preparedExpression = "${hex8:10}";
				const evalString = await logEval.evaluate();
				assert.equal(evalString, "0x0A");
			});

			test('boolean', async () => {
				logEval.preparedExpression = "${string:1 == 1}";
				const evalString = await logEval.evaluate();
				assert.equal(evalString, "true");
			});
		});
	});
});
