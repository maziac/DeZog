
import * as assert from 'assert';
import { Utility } from '../misc/utility';
import { Z80RegistersClass, Z80Registers } from '../remotes/z80registers';
//import { EmulatorClass } from '../emulator';
import { Remote, RemoteFactory } from '../remotes/remotefactory';
import { Settings } from '../settings';
//import { ZesaruxRegisters } from '../remotes/zesarux/decodezesaruxdata';
import {Labels} from '../labels/labels';
import {DecodeZesaruxRegisters} from '../remotes/zesarux/decodezesaruxdata';


suite('Utility', () => {

	suite('calculateTabSize', () => {

		test('no tabs', () => {
			const res = Utility.calculateTabSizes('1234567890', 1);
			assert.equal( res, null, "should result in null");
		});

		test('1 tab', () => {
			const res = Utility.calculateTabSizes('1234567\t890', 1);
			assert.equal( res.length, 2, "should be 2 strings");
			assert.equal( res[0].length, 7, "length should be 7");
			assert.equal( res[1].length, 3, "length should be 3");
		});

		test('tab all formats, size 1', () => {
			const res = Utility.calculateTabSizes('${hex}\t1${signed}\t${unsigned}2\t1${char}2\t${bits}\t${flags}', 1);
			assert.equal( res.length, 6, "should be 6 strings");
			assert.equal( res[0].length, 2, "${hex} length wrong");
			assert.equal( res[1].length, 1+4, "${signed} length wrong");
			assert.equal( res[2].length, 3+1, "${unsigned} length wrong");
			assert.equal( res[3].length, 1+1+1, "${char} length wrong");
			assert.equal( res[4].length, 8, "${bits} length wrong");
			assert.equal( res[5].length, 6, "${flags} length wrong");
		});

		test('tab all formats, size 2', () => {
			const res = Utility.calculateTabSizes('${hex}\t1${signed}\t${unsigned}2\t1${char}2\t${bits}\t${flags}', 2);
			assert.equal( res.length, 6, "should be 6 strings");
			assert.equal( res[0].length, 4, "${hex} length wrong");
			assert.equal( res[1].length, 1+6, "${signed} length wrong");
			assert.equal( res[2].length, 5+1, "${unsigned} length wrong");
			assert.equal( res[3].length, 1+1+1, "${char} length wrong");
			assert.equal( res[4].length, 16, "${bits} length wrong");
			assert.equal( res[5].length, 6, "${flags} length wrong");
		});

		test('tab name, label format', () => {
			const res = Utility.calculateTabSizes('${name}\t1${labels}', 1);
			assert.equal( res.length, 2, "should be 2 strings");
			assert.notEqual( res[0].length, 0, "${name} length wrong");
			assert.notEqual( res[1].length, 0, "${labels} length wrong");
		});

		test('start with tab', () => {
			const res = Utility.calculateTabSizes('\t${hex}\t${signed}\t${unsigned}', 1);
			assert.equal( res.length, 4, "should be 4 strings");
			assert.equal( res[0].length, 0, "first string len wrong");
			assert.equal( res[1].length, 2, "${hex} length wrong");
		});

		test('end with tab', () => {
			const res = Utility.calculateTabSizes('${hex}\t${signed}\t${unsigned}\t', 1);
			assert.equal( res.length, 4, "should be 4 strings");
			assert.equal( res[3].length, 0, "last string len wrong");
			assert.equal( res[0].length, 2, "${hex} length wrong");
		});

		test('double tab', () => {
			const res = Utility.calculateTabSizes('${hex}\t\t${signed}\t${unsigned}', 1);
			assert.equal( res.length, 4, "should be 4 strings");
			assert.equal( res[0].length, 2, "${hex} length wrong");
			assert.equal( res[1].length, 0, "tab length wrong");
		});

	});


	suite('numberFormattedBy', () => {

		setup(() => {
			const cfg: any = {
				remoteType: 'zrcp'
			};
			Settings.Init(cfg, '');
			Z80RegistersClass.createRegisters();
			RemoteFactory.createRemote(cfg.remoteType);
			Z80Registers.setCache("PC=6005 SP=6094 AF=cf8c BC=0100 HL=02df DE=0fc9 IX=663c IY=5c3a AF'=0044 BC'=050e HL'=2758 DE'=0047 I=3f R=5e  F=S---3P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0");
		});

		suite('formats', () => {

			test('formats, size 1', async () => {
				const format = '${name},${hex},${signed},${unsigned},${bits},${char},${flags}';
				const res = await Utility.numberFormatted('myname', 255, 1, format, undefined);
				assert.equal( res, 'myname,FF,-1,255,11111111,.,SZ1H1PNC', "Unexpected formatting");
			});

			test('formats, size 2', async () => {
				const format='${name},${hex},${signed},${unsigned},${bits},${char},${flags}';
				const res=await Utility.numberFormatted('myname', 9999, 2, format, undefined);
				// Note: value of flags doesn't matter
				var b=res.startsWith('myname,270F,9999,9999,0010011100001111,.,');
				assert.ok(b, "Unexpected formatting");
			});

			test('formats, size 2 negative', async () => {
				const format='${signed},${unsigned}';
				const res=await Utility.numberFormatted('myname', 32768, 2, format, undefined);
				assert.equal(res, '-32768,32768', "Unexpected formatting");
			});
		});

		suite('tabs', () => {

			test('general', async () => {
				const format = '${name}\t${hex}\t${signed}\t${unsigned}\t${bits}\t${char}\t${flags}';
				const res=await Utility.numberFormatted('myname', 65, 1, format, undefined);
				assert.equal( res, 'myname 41   65  65 01000001 A -Z-----C ', "Unexpected tab formatting");
			});

			test('use tab array 1', async () => {
				const format = '${name},\t${hex},\t${signed},\t${unsigned},\t${bits},\t${char},\t${flags}';
				const predefined = '1234567\t12345678\t123456789\t1234567890\t12345678901\t123456789012\t1234567890123'
				const predefArr = predefined.split('\t');
				const res=await Utility.numberFormatted('myname', 65, 1, format, predefArr);
				const arr = res.split(',');
				assert.equal( arr[0].length+1, 'myname,'.length, "Unexpected formatting");
				var i;
				for(i=1; i<arr.length-1; i++) {
					assert.equal( arr[i].length, predefArr[i].length, "Unexpected formatting");
				}
				assert.equal( arr[i].length-2, predefArr[i].length, "Unexpected formatting");
			});

			test('wrong predefined array', async () => {
				const format = '${name},\t${hex},\t${signed}';
				const predefined = '1234567\t12345678';
				const predefArr = predefined.split('\t');
				await Utility.numberFormatted('myname', 65, 1, format, predefArr);
				// Test simply that it returns
			});

			test('special test 1', async () => {
				const format = "${b#:hex}h\t${b#:unsigned}u\t${b#:signed}i\t'${char}'\t${b#:bits}b";
				const res=await Utility.numberFormatted('', 65, 1, format, undefined);
				assert.equal( res, "41h  65u   65i 'A' 01000001b ", "Unexpected tab formatting");
			});

			test('special test 2', async () => {
				const format = "${b#:signed}i\t'${char}'\t${b#:bits}b";
				const res=await Utility.numberFormatted('', 255, 1, format, undefined);
				assert.equal( res, "  -1i '.' 11111111b ", "Unexpected tab formatting");
			});

		});
	});


	suite('parseValue', () => {

        test('decimal', () => {
            const res = Utility.parseValue('65301');
            assert.equal(res, 65301, "Wrong parsing result");
		});

		test('decimal negative', () => {
            const res = Utility.parseValue('-32768');
            assert.equal(res, -32768, "Wrong parsing result");
		});

		test('0x, hex value', () => {
            const res = Utility.parseValue('0x1abf');
            assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('0x0000, hex value', () => {
            const res = Utility.parseValue('0x0000');
            assert.equal(res, 0, "Wrong parsing result");
		});

		test('0x, invalid negative input 1', () => {
            const res = Utility.parseValue('0x-1abf');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

		 test('0x, invalid negative input 2', () => {
            const res = Utility.parseValue('-0x1abf');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

		test('$, hex value', () => {
            const res = Utility.parseValue('$1abf');
         assert.equal(res, 0x1ABF, "Wrong parsing result");
 		});

		test('h, hex value', () => {
            const res = Utility.parseValue('1abfh');
            assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('H uppercase', () => {
            const res = Utility.parseValue('1ABFH');
            assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('b, bit value', () => {
            const res = Utility.parseValue('10010001b');
            assert.equal(res, 0x91, "Wrong parsing result");
		});

		test('_, status flags', () => {
            const res = Utility.parseValue('_SZHPNC');
            assert.equal(res, 0xD7, "Wrong parsing result");
		});

		test('invalid input 1', () => {
            const res = Utility.parseValue('1abf');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

		 test('invalid input 2', () => {
            const res = Utility.parseValue('0x5gbf');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

		 test('invalid input 3', () => {
            const res = Utility.parseValue('dabf');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

		 test('invalid input 4', () => {
            const res = Utility.parseValue('10410010b');
            assert.ok(isNaN(res), "Wrong parsing result");
		 });

	});


	suite('evalExpression', () => {

		test('plus', () => {
            let res = Utility.evalExpression('2+5');
			assert.equal(7, res, "Wrong eval result");

			res = Utility.evalExpression('2 +5');
			assert.equal(7, res, "Wrong eval result");

			res = Utility.evalExpression('2+ 5');
			assert.equal(7, res, "Wrong eval result");

			res = Utility.evalExpression('2 + 5');
			assert.equal(7, res, "Wrong eval result");
		});

        test('shift <<', () => {
            let res = Utility.evalExpression('0<<3');
			assert.equal(0, res, "Wrong eval result");

            res = Utility.evalExpression('2<<3');
            assert.equal(2<<3, res, "Wrong eval result");

            res = Utility.evalExpression('2 <<3');
            assert.equal(2<<3, res, "Wrong eval result");

			res = Utility.evalExpression('2<< 3');
			assert.equal(2<<3, res, "Wrong eval result");

			res = Utility.evalExpression('2 << 3');
            assert.equal(2<<3, res, "Wrong eval result");
		});

		test('shift >>>', () => {
            let res = Utility.evalExpression('0>>>3');
			assert.equal(0, res, "Wrong eval result");

            res = Utility.evalExpression('0x0F>>>3');
            assert.equal(0x0F>>>3, res, "Wrong eval result");

            res = Utility.evalExpression('0x0F >>>3');
            assert.equal(0x0F>>>3, res, "Wrong eval result");

			res = Utility.evalExpression('0x0F>>> 3');
			assert.equal(0x0F>>>3, res, "Wrong eval result");

			res = Utility.evalExpression('0x0F >>> 3');
            assert.equal(0x0F>>>3, res, "Wrong eval result");
		});



		suite('breakpoints', () => {
			setup(() => {
				const cfg: any={
					remoteType: 'zrcp'
				};
				Settings.Init(cfg, '');
				Z80RegistersClass.createRegisters();
				Z80Registers.decoder=new DecodeZesaruxRegisters(0);
				RemoteFactory.createRemote(cfg.remoteType);
			});

			test('simple', () => {
				Z80Registers.setCache("");
				let res = Utility.evalExpression('0x1234 == 0x1234', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('0x1235 == 0x1234', true);
				assert.equal(0, res, "Wrong eval result");
			});

			test('register SP', () => {
				Z80Registers.setCache("PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5");
				let res = Utility.evalExpression('SP == 0x83FB', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('0x83FB == SP', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('SP == 0x83FA', true);
				assert.equal(0, res, "Wrong eval result");

				res = Utility.evalExpression('0x83FB != SP', true);
				assert.equal(0, res, "Wrong eval result");
			});

			test('All registers', () => {
				Z80Registers.setCache("PC=80d3 SP=83fb AF=3f08 BC=1234 HL=5678 DE=9abc IX=fedc IY=5c3a AF'=0143 BC'=2345 HL'=f4f3 DE'=89ab I=ab R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5");

				let res = Utility.evalExpression('PC == 0x80D3', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('AF == 3F08h', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('BC == 0x1234', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('DE == 9ABCh', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('HL == 5678h', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('IX == 0xFEDC', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression('IY == 0x5C3A', true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression("AF' == 0143h", true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression("BC' == 0x2345", true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression("DE' == 89ABh", true);
				assert.equal(1, res, "Wrong eval result");

				res = Utility.evalExpression("HL' == F4F3h", true);
				assert.equal(1, res, "Wrong eval result");
			});


			test('memory (exception)', () => {
				Z80Registers.setCache("PC=80d3 SP=83fb AF=3f08 BC=1234 HL=5678 DE=9abc IX=fedc IY=5c3a AF'=0143 BC'=2345 HL'=f4f3 DE'=89ab I=ab R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5");

				// It is not supported to retrieve memory locations.
				// Therefore a test is done on an exception.
				assert.throws( () => {
					Utility.evalExpression('b@(1000) == 50', true);
				}, "Expected an exception");
			});
		});

	});


	suite('evalLogString', () => {

		setup(() => {
			const cfg: any={
				remoteType: 'zsim'
			};
			Settings.Init(cfg, '');
			Z80RegistersClass.createRegisters();
			RemoteFactory.createRemote(cfg.remoteType);
			(Remote as any).configureMachine("RAM");
		});

		test('Register', async () => {
			const remote=Remote as any;
			const cpu=remote.z80Cpu;
			cpu.a=129;
			cpu.de=0xABCD;
			const regs=cpu.getRegisterData();
			Z80Registers.setCache(regs);

			let log='${A}';
			let evalString=await Utility.evalLogString(log);
			assert.equal('129', evalString);

			log=' start ${A} end ';
			evalString=await Utility.evalLogString(log);
			assert.equal(' start 129 end ', evalString);

			log='${DE:hex}';
			evalString=await Utility.evalLogString(log);
			assert.equal('ABCD', evalString);

			log='${de:hex}';
			evalString=await Utility.evalLogString(log);
			assert.equal('ABCD', evalString);

			log=' start A=${A:signed} DE=${DE:unsigned} end ';
			evalString=await Utility.evalLogString(log);
			assert.equal(' start A=-127 DE=43981 end ', evalString);

		});


		test('Error', async () => {
			let log = '${(A}';	// incomplete -> creates an error
			let evalString = await Utility.evalLogString(log);
			assert.equal("Error: Error evaluating '(A': Unexpected end of input", evalString);
		});


		test('Memory', async () => {
			const remote=Remote as any;
			const cpu=remote.z80Cpu;
			cpu.hl=0x8000;
			Remote.writeMemoryDump(0x8000, new Uint8Array([0xFF, 0x5B]));
			const regs=cpu.getRegisterData();
			Z80Registers.setCache(regs);

			let log='${(8000h)}';
			let evalString=await Utility.evalLogString(log);
			assert.equal('255', evalString);

			log='${(0x8000):signed}';
			evalString=await Utility.evalLogString(log);
			assert.equal('-1', evalString);

			log='${(32768):hex}';
			evalString=await Utility.evalLogString(log);
			assert.equal('FF', evalString);

			log='${b@(32768):hex}';
			evalString=await Utility.evalLogString(log);
			assert.equal('FF', evalString);

			log='${w@(hl):hex}';
			evalString=await Utility.evalLogString(log);
			assert.equal('5BFF', evalString);
		});


		test('Register relative memory', async () => {
			const remote=Remote as any;
			const cpu=remote.z80Cpu;
			let bc=0x8000;
			cpu.bc=bc;
			let regs=cpu.getRegisterData();
			Z80Registers.setCache(regs);
			Remote.writeMemoryDump(0x8000, new Uint8Array([212]));

			let log='${(BC)}';
			let evalString=await Utility.evalLogString(log);
			assert.equal('212', evalString);

			log='${(BC+0)}';
			evalString=await Utility.evalLogString(log);
			assert.equal('212', evalString);

			bc-=1000;
			cpu.bc=bc;
			regs=cpu.getRegisterData();
			Z80Registers.setCache(regs);
			log='${(BC+1000)}';
			evalString=await Utility.evalLogString(log);
			assert.equal('212', evalString);

			bc+=1000+2345;
			cpu.bc=bc;
			regs=cpu.getRegisterData();
			Z80Registers.setCache(regs);
			log='${(BC-2345)}';
			evalString=await Utility.evalLogString(log);
			assert.equal('212', evalString);
		});


		test('Label', async () => {
			const config = {
				z80asm: [{
					path: './src/tests/data/labels/z80asm.list', srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			Labels.init(250);
			Labels.readListFiles(config);

			// Prepare memory
			Remote.writeMemoryDump(0x7015, new Uint8Array([0xFE]));

			let log ='${b@(check_score_for_new_ship):signed}';
			let evalString=await Utility.evalLogString(log);
			assert.equal('-2', evalString);
		});

	});


});