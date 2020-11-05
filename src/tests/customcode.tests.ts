import * as assert from 'assert';
import {CustomCode} from '../remotes/zsimulator/customcode';



suite('CustomCode', () => {
	const defaultValue=0xFF;

	setup(() => {
	});

	test('out', () => {
		const custom=new CustomCode(`


		`);
		// @ts-ignore: protected access
		const context=custom.context;
		assert.notEqual(undefined, context.outPortA);
		assert.notEqual(undefined, context.outPortB);

		custom.writePort(0x7000, 0xAA);
		assert.equal(defaultValue, context.PortA.value);

		custom.writePort(0x8000, 0x55);
		assert.equal(0x55, context.PortA.value);

		custom.writePort(0x8001, 0xA5);
		assert.equal(0xA5, context.PortB.value);
		assert.equal(0x55, context.PortA.value);
	});

});

