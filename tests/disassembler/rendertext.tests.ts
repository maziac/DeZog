import * as assert from 'assert';
import {Utility} from '../../src/misc/utility';
import {Format} from '../../src/disassembler/format';
import {RenderText} from '../../src/disassembler/rendertext';



suite('Disassembler - RenderText', () => {

	let r: any;
	setup(() => {
		r = new RenderText(
			addr64k => 'R' + Utility.getHexString(addr64k, 4),
			addr64k => 'LONG' + Utility.getHexString(addr64k, 4)
		);
		r.clmnsAddress = 5;
		r.clmnsBytes = 7;
		Format.hexFormat = '$';
	});

	suite('misc', () => {
		test('formatAddressLabel', () => {
			r.clmnsAddress = 12;
			let s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, 'LONG1234    LABEL1:');

			r.clmnsAddress = 3;
			s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, 'LONG1234 LABEL1:');
		});

		test('formatAddressInstruction', () => {
			r.clmnsAddress = 12;
			r.clmnsBytes = 8;
			let s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, 'LONG1234            LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, 'LONG1234         LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF], 'LD A,5');
			assert.equal(s, 'LONG1234 AF      LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02   LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF ...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 9;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 0...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 10;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02 45  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 11;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02 45   LD A,5');
		});
	});
});
