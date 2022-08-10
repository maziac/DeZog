import * as assert from 'assert';
import {Format} from '../../src/disassembler/format';



suite('Disassembler - Format', () => {

	suite('getLimitedString', () => {

		test('empty', () => {
			assert.equal(Format.getLimitedString('', 5), '     ');
			assert.equal(Format.getLimitedString('', 0), '');
			assert.equal(Format.getLimitedString('', 1), ' ');
		});

		test('smaller, equal', () => {
			assert.equal(Format.getLimitedString('abcde', 8), 'abcde   ');
			assert.equal(Format.getLimitedString('abcde', 5), 'abcde');
			assert.equal(Format.getLimitedString('abcde', 6), 'abcde ');
		});

		test('bigger', () => {
			assert.equal(Format.getLimitedString('abcdef', 5), 'ab...');
			assert.equal(Format.getLimitedString('abcde', 4), 'a...');
			assert.equal(Format.getLimitedString('abcde', 3), '...');
		});

		test('smaller than 3', () => {
			assert.equal(Format.getLimitedString('abcdef', 2), '..');
			assert.equal(Format.getLimitedString('abcde', 1), '.');
			assert.equal(Format.getLimitedString('abcde', 0), '');
		});
	});
});
