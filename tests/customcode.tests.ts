import * as assert from 'assert';
import {suite, test} from 'mocha';
import {CustomCode} from '../src/remotes/zsimulator/customcode';



suite('CustomCode', () => {
	const jsPath = './tests/data/customcode/customcode.jsfile';


	test('out value', () => {
		const custom = new CustomCode(jsPath);
		custom.execute();
		// @ts-ignore: protected access
		const context=custom.context;
		assert.notEqual(undefined, context.outPortA);
		assert.notEqual(undefined, context.outPortB);

		//custom.writePort(0x7000, 0xAA);
		//assert.equal(defaultValue, context.outPortA.value);

		custom.writePort(0x8000, 0x55);
		assert.equal(0x55, context.outPortA.value);

		custom.writePort(0x8001, 0xA5);
		assert.equal(0xA5, context.outPortB.value);
		assert.equal(0x55, context.outPortA.value);
	});


	test('sendToCustomUi', () => {
		const custom = new CustomCode(jsPath);
		custom.execute();
		let sendToCustomUiCalled=false;
		custom.on('sendToCustomUi', msg => {
			sendToCustomUiCalled=true;
		});

		assert.equal(false, sendToCustomUiCalled);
		custom.writePort(0x8000, 0x55);
		assert.equal(true, sendToCustomUiCalled);
	});


	test('in/receiveMessage', () => {
		const custom = new CustomCode(jsPath);
		custom.execute();

		let result=custom.readPort(0x7000);
		assert.equal(undefined, result);

		result=custom.readPort(0x9000);
		assert.equal(90, result);

		result=custom.readPort(0x9001);
		assert.equal(0, result);

		// Receive
		const msg={
			command: 'joy0',
			data: 110
		};
		custom.receivedFromCustomUi(msg);
		result=custom.readPort(0x9000);
		assert.equal(110, result);
	});


	test('tick', () => {
		const custom = new CustomCode(jsPath);
		custom.execute();

		let result=custom.readPort(0x9000);
		assert.equal(90, result);
		result=custom.readPort(0x9001);
		assert.equal(0, result);

		custom.setTstates(12);
		custom.tick();	// Writes the t-states to the port for testing.
		result=custom.readPort(0x9000);
		assert.equal(24, result);	// 2 * t-states
		result=custom.readPort(0x9001);
		assert.equal(12, result);	// t-states

		custom.setTstates(24);
		custom.tick();	// Writes the t-states to the port for testing.
		result=custom.readPort(0x9000);
		assert.equal(48, result);	// 2 * t-states
		result=custom.readPort(0x9001);
		assert.equal(24, result);	// t-states
	});


	test('interrupt', () => {
		const custom = new CustomCode(jsPath);
		custom.execute();

		// Catch interrupt
		let interruptNon_maskable: boolean;
		let interruptData: number;
		let interruptOccurred = false;
		custom.on('interrupt', (non_maskable: boolean, data: number) => {
			interruptOccurred = true;
			interruptNon_maskable = non_maskable;
			interruptData = data;
		});

		custom.setTstates(0);
		custom.tick();		// No interrupt occurs
		assert.equal(false, interruptOccurred);

		custom.setTstates(1000);
		custom.tick();		// Interrupt occurs at 1000
		assert.equal(true, interruptOccurred);
		assert.equal(false, interruptNon_maskable!);
		assert.equal(0xF1, interruptData!);
	});


	/**
	 * Tests timeout in main js code.
	 * But timeout does not work for functions that are called later.
	 */
	test('timeout', () => {
		const custom = new CustomCode('./tests/data/customcode/infiniteloop.jsfile');
		try {
			custom.execute(undefined, 200);
		}
		catch (e) {
			assert.equal(e.code, 'ERR_SCRIPT_EXECUTION_TIMEOUT');
			return;
		}
		assert.fail("We should not get here.");
	});


	test('unitTestLabel', () => {
		const custom = new CustomCode('./tests/data/customcode/unittestlabel.jsfile');

		// Label: undefined
		custom.execute();
		let result = custom.readPort(0x9000);
		assert.equal(0xF0, result);

		// Label: ut1
		custom.execute('ut1');
		result = custom.readPort(0x9000);
		assert.equal(1, result);

		// Label: ut2
		custom.execute('ut2');
		result = custom.readPort(0x9000);
		assert.equal(2, result);

		// Label: ut3
		custom.execute('ut3');
		result = custom.readPort(0x9000);
		assert.equal(3, result);
	});

});

