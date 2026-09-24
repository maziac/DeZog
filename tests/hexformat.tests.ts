
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {HexFormat} from '../src/misc/hexformat';


suite('HexFormat', () => {

	test('parseHexWordLE', () => {
		assert.equal(HexFormat.parseHexWordLE('12FA'), 0xFA12);
		assert.equal(HexFormat.parseHexWordLE('12F'), 0x0F12);
		assert.equal(HexFormat.parseHexWordLE('12'), NaN);
		assert.equal(HexFormat.parseHexWordLE('1'), NaN);
		assert.equal(HexFormat.parseHexWordLE(''), NaN);
	});


	test('getHexWordStringLE', () => {
		assert.equal(HexFormat.getHexWordStringLE(0x1234), '3412');
		assert.equal(HexFormat.getHexWordStringLE(0x1234), '3412');
	});


	suite('parseValue', () => {

		test('decimal', () => {
			const res = HexFormat.parseValue('65301');
			assert.equal(res, 65301, "Wrong parsing result");
		});

		test('decimal negative', () => {
			const res = HexFormat.parseValue('-32768');
			assert.equal(res, -32768, "Wrong parsing result");
		});

		test('0x, hex value', () => {
			const res = HexFormat.parseValue('0x1abf');
			assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('0x0000, hex value', () => {
			const res = HexFormat.parseValue('0x0000');
			assert.equal(res, 0, "Wrong parsing result");
		});

		test('0x, invalid negative input 1', () => {
			const res = HexFormat.parseValue('0x-1abf');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

		test('0x, invalid negative input 2', () => {
			const res = HexFormat.parseValue('-0x1abf');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

		test('$, hex value', () => {
			const res = HexFormat.parseValue('$1abf');
			assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('h, hex value', () => {
			const res = HexFormat.parseValue('1abfh');
			assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('H uppercase', () => {
			const res = HexFormat.parseValue('1ABFH');
			assert.equal(res, 0x1ABF, "Wrong parsing result");
		});

		test('b, bit value', () => {
			const res = HexFormat.parseValue('10010001b');
			assert.equal(res, 0x91, "Wrong parsing result");
		});

		test('_, status flags', () => {
			const res = HexFormat.parseValue('_SZHPNC');
			assert.equal(res, 0xD7, "Wrong parsing result");
		});

		test('invalid input 1', () => {
			const res = HexFormat.parseValue('1abf');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

		test('invalid input 2', () => {
			const res = HexFormat.parseValue('0x5gbf');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

		test('invalid input 3', () => {
			const res = HexFormat.parseValue('dabf');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

		test('invalid input 4', () => {
			const res = HexFormat.parseValue('10410010b');
			assert.ok(isNaN(res), "Wrong parsing result");
		});

	});


	suite('convertHexNumber', () => {
		test('number', () => {
			assert.equal(HexFormat.convertHexNumber(6), 6);
			assert.equal(HexFormat.convertHexNumber(0), 0);
			assert.equal(HexFormat.convertHexNumber(-5), -5);
			assert.equal(HexFormat.convertHexNumber(65536), 65536);
		});

		test('string', () => {
			assert.equal(HexFormat.convertHexNumber("67"), 67);
			assert.equal(HexFormat.convertHexNumber("5Fh"), 0x5F);
			assert.equal(HexFormat.convertHexNumber("$1234"), 4660);
			assert.equal(HexFormat.convertHexNumber("0x10000"), 65536);
		});
	});


	suite('getHexString', () => {
		test('padding', () => {
			assert.equal(HexFormat.getHexString(0xA, 2), '0A');
			assert.equal(HexFormat.getHexString(0x1234, 4), '1234');
			assert.equal(HexFormat.getHexString(0, 4), '0000');
		});

		test('upper case', () => {
			assert.equal(HexFormat.getHexString(0xabc, 3), 'ABC');
		});

		test('longer than size', () => {
			assert.equal(HexFormat.getHexString(0x12345, 4), '12345');
		});

		test('undefined', () => {
			assert.equal(HexFormat.getHexString(undefined, 2), '??');
			assert.equal(HexFormat.getHexString(undefined, 4), '????');
		});
	});


	suite('getBitsString', () => {
		test('padding', () => {
			assert.equal(HexFormat.getBitsString(5, 8), '00000101');
			assert.equal(HexFormat.getBitsString(0, 4), '0000');
		});

		test('all bits set', () => {
			assert.equal(HexFormat.getBitsString(0xFF, 8), '11111111');
		});
	});
});
