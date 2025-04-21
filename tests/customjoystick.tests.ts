import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {CustomJoyType} from '../src/settings/settings';
import {CustomJoystick} from '../src/remotes/zsimulator/customjoystick';

suite('CustomJoystick', () => {
	let ports: Z80Ports;
	let customJoy: CustomJoyType;
	let customJoystick: any;

	setup(() => {
		ports = new Z80Ports(true);
		customJoy = {
			fire: {port: 0x01, portMask: 0xFF, bit: 0x01, lowActive: true},
			fire2: {port: 0x02, portMask: 0xFF, bit: 0x02, lowActive: false},
			// fire3, fire 4 not defined
			up: {port: 0x04, portMask: 0xFF, bit: 0x08, lowActive: false},
			left: {port: 0x05, portMask: 0xFF, bit: 0x10, lowActive: false},
			right: {port: 0x06, portMask: 0xFF, bit: 0x20, lowActive: false},
			down: {port: 0x07, portMask: 0xFF, bit: 0x40, lowActive: false}
		} as any;
		customJoystick = new CustomJoystick(ports, customJoy);
	});

	test('constructor', () => {
		assert.deepEqual(customJoystick.config[0], {...customJoy.fire, pressed: false});
		assert.deepEqual(customJoystick.config[1], {...customJoy.fire2, pressed: false});
		assert.equal(customJoystick.config[2], undefined);
		assert.equal(customJoystick.config[3], undefined);
		assert.deepEqual(customJoystick.config[4], {...customJoy.up, pressed: false});
		assert.deepEqual(customJoystick.config[5], {...customJoy.left, pressed: false});
		assert.deepEqual(customJoystick.config[6], {...customJoy.right, pressed: false});
		assert.deepEqual(customJoystick.config[7], {...customJoy.down, pressed: false});
	});

	test('readPort returns default value if no button is pressed', () => {
		const portValue = customJoystick.readPort(0xEE01);
		assert.equal(portValue, ports.defaultPortIn);
	});

	test('readPort returns correct value when button is pressed', () => {
		// Low active
		customJoystick.setButton('customJoy.joy1.fire', true);
		let portValue = customJoystick.readPort(0x01);
		assert.equal(portValue & 0x01, 0);
		// High active
		customJoystick.setButton('customJoy.joy1.fire2', true);
		 portValue = customJoystick.readPort(0x02);
		assert.equal(portValue & 0x02, 0x02);
	});

	test('setButton updates button pressed state', () => {
		customJoystick.setButton('customJoy.joy1.fire', true);
		assert.equal(customJoystick.config[0].pressed, true);
		customJoystick.setButton('customJoy.joy1.fire', false);
		assert.equal(customJoystick.config[0].pressed, false);
	});
});