
import assert = require('assert');
import { Utility } from '../utility';
import { Labels } from '../labels';

suite('Utility', () => {

/*
	setup( () => {
		return dc.start();
	});

	teardown( () => dc.stop() );
*/

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

		suite('formats', () => {

			test('formats, size 1', (done) => {
				const format = '${name},${hex},${signed},${unsigned},${bits},${char},${flags}';
				Utility.numberFormattedBy('myname', 255, 1, format, undefined, (res) => {
					assert.equal( res, 'myname,FF,-1,255,11111111,,SZHPNC', "Unexpected formatting");
					done();
				});
			});

			test('formats, size 2', (done) => {
				const format = '${name},${hex},${signed},${unsigned},${bits},${char},${flags}';
				Utility.numberFormattedBy('myname', 9999, 2, format, undefined, (res) => {
					// Note: value of flags doesn't matter
					var b = res.startsWith('myname,270F,9999,9999,0010011100001111,,');
					assert.ok( b, "Unexpected formatting");
					done();
				});
			});

			test('formats, size 2 negative', (done) => {
				const format = '${signed},${unsigned}';
				Utility.numberFormattedBy('myname', 32768, 2, format, undefined, (res) => {
					assert.equal( res, '-32768,32768', "Unexpected formatting");
					done();
				});
			});
		});

		suite('tabs', () => {

			test('general', (done) => {
				const format = '${name}\t${hex}\t${signed}\t${unsigned}\t${bits}\t${char}\t${flags}';
				Utility.numberFormattedBy('myname', 65, 1, format, undefined, (res) => {
					assert.equal( res, 'myname 41   65  65 01000001 A     ZC ', "Unexpected tab formatting");
					done();
				});
			});

			test('use tab array 1', (done) => {
				const format = '${name},\t${hex},\t${signed},\t${unsigned},\t${bits},\t${char},\t${flags}';
				const predefined = '1234567\t12345678\t123456789\t1234567890\t12345678901\t123456789012\t1234567890123'
				const predefArr = predefined.split('\t');
				Utility.numberFormattedBy('myname', 65, 1, format, predefArr, (res) => {
					const arr = res.split(',');
					assert.equal( arr[0].length+1, 'myname,'.length, "Unexpected formatting");
					var i;
					for(i=1; i<arr.length-1; i++) {
						assert.equal( arr[i].length, predefArr[i].length, "Unexpected formatting");
					}
					assert.equal( arr[i].length-2, predefArr[i].length, "Unexpected formatting");
					done();
				});
			});

			test('wrong predefined array', (done) => {
				const format = '${name},\t${hex},\t${signed}';
				const predefined = '1234567\t12345678';
				const predefArr = predefined.split('\t');
				Utility.numberFormattedBy('myname', 65, 1, format, predefArr, (res) => {
					// Test simply that it returns
					done();
				});
			});

			test('special test 1', (done) => {
				const format = "${b#:hex}h\t${b#:unsigned}u\t${b#:signed}i\t'${char}'\t${b#:bits}b";
				Utility.numberFormattedBy('', 65, 1, format, undefined, (res) => {
					assert.equal( res, "41h  65u   65i 'A' 01000001b ", "Unexpected tab formatting");
					done();
				});
			});

			test('special test 2', (done) => {
				const format = "${b#:signed}i\t'${char}'\t${b#:bits}b";
				Utility.numberFormattedBy('', 255, 1, format, undefined, (res) => {
					assert.equal( res, "  -1i  '' 11111111b ", "Unexpected tab formatting");
					done();
				});
			});

		});

		suite('labels', () => {

			test('single', (done) => {
				const format = "${labels}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 1024, 2, format, undefined, (res) => {
					assert.equal(res, "LABEL_1024", "Wrong label");
					done();
				});
			});

			test('two same labels', (done) => {
				const format = "${labels}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 2048, 2, format, undefined, (res) => {
					assert.equal(res, "LABEL_2048_ALABEL_2048_B", "Wrong label");
					done();
				});
			});

			test('two same labels with pre and inner', (done) => {
				const format = "${#:labels|§}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 2048, 2, format, undefined, (res) => {
					assert.equal(res, "#LABEL_2048_A§LABEL_2048_B", "Wrong label");
					done();
				});
			});

			test('two same labels with pre, inner and post', (done) => {
				const format = "${#:labels|§|%}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 2048, 2, format, undefined, (res) => {
					assert.equal(res, "#LABEL_2048_A§LABEL_2048_B%", "Wrong label");
					done();
				});
			});

			test('two same labels with newlines', (done) => {
				const format = "${labels|:\n|:\n}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 2048, 2, format, undefined, (res) => {
					assert.equal(res, "LABEL_2048_A:\nLABEL_2048_B:\n", "Wrong label");
					done();
				});
			});

			test('two same labelsplus with pre, inner and post', (done) => {
				const format = "${#:labelsplus|§|%}";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 2048, 2, format, undefined, (res) => {
					assert.equal(res, "#LABEL_2048_A§LABEL_2048_B%", "Wrong label");
					done();
				});
			});

			test('special 1', (done) => {
				const format = "${hex}h${, :labelsplus|, }";
				Labels.loadAsmLabelsFile('./src/tests/data/test1.labels')
				Utility.numberFormattedBy('', 512, 2, format, undefined, (res) => {
					assert.equal(res, "0200h, LABEL_512", "Wrong label");
					done();
				});
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

});