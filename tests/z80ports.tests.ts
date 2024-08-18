import * as assert from 'assert';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';

suite('Z80Ports', () => {
	let z80Ports: Z80Ports;

	setup(() => {
		z80Ports = new Z80Ports(true);
	});

	suite('registerGenericOutPortFunction', () => {
		test('write to any port', () => {
			let ret_port = 0;
			let ret_value = 0;
			const mockFunc = (port: number, value: number) => {
				ret_port = port;
				ret_value = value;
			};
			z80Ports.registerGenericOutPortFunction(mockFunc);
			z80Ports.write(0x1234, 0x56);
			assert.equal(ret_port, 0x1234);
			assert.equal(ret_value, 0x56);
		});
	});

	suite('registerGenericInPortFunction', () => {
		test('read default', () => {
			assert.equal(z80Ports.read(0x1234), 0xFF);
		});
		test('read from any port', () => {
			const mockFunc = (port: number) => 0xA5;
			z80Ports.registerGenericInPortFunction(mockFunc);
			assert.equal(z80Ports.read(0x1234), 0xA5);
		});
		test('AND several ports (default 0x00, open collector)', () => {
			const mockFunc1 = (port: number) => 0xA5;
			z80Ports.registerGenericInPortFunction(mockFunc1);
			const mockFunc2 = (port: number) => 0xF0;
			z80Ports.registerGenericInPortFunction(mockFunc2);
			assert.equal(z80Ports.read(0x1234), 0xF0 & 0xA5);
		});
		test('OR several ports (default 0x00, no open collector)', () => {
			z80Ports = new Z80Ports(false);
			assert.equal(z80Ports.read(0x1234), 0x00);
			const mockFunc1 = (port: number) => 0xA5;
			z80Ports.registerGenericInPortFunction(mockFunc1);
			const mockFunc2 = (port: number) => 0xF0;
			z80Ports.registerGenericInPortFunction(mockFunc2);
			assert.equal(z80Ports.read(0x1234), 0xF0 | 0xA5);
		});
	});

	suite('registerSpecificOutPortFunction', () => {
		test('write specific port', () => {
			let ret_port = 0;
			let ret_value = 0;
			const specificFunc = (port: number, value: number) => {
				ret_port = port;
				ret_value = value;
			};
			z80Ports.registerSpecificOutPortFunction(0x2345, specificFunc);
			z80Ports.write(0x2345, 0x78);
			assert.equal(ret_port, 0x2345);
			assert.equal(ret_value, 0x78);
		});

		test('hidden by generic port', () => {
			let ret_port = 0;
			let ret_value = 0;
			const specificFunc = (port: number, value: number) => {
				ret_port = port;
				ret_value = value;
			};
			z80Ports.registerSpecificOutPortFunction(0x2345, specificFunc);
			z80Ports.write(0x2345, 0x78);
			assert.equal(ret_port, 0x2345);
			assert.equal(ret_value, 0x78);

			// Hide
			const genericFunc = (port: number, value: number) => {
				ret_port = 0x1122;
				ret_value = 0xDDEE;
			};
			z80Ports.registerGenericOutPortFunction(genericFunc);
			// Check generic function is called
			z80Ports.write(0x4567, 0x89);
			assert.equal(ret_port, 0x1122);
			assert.equal(ret_value, 0xDDEE);

			// Return undefined
			(z80Ports as any).genericOutPortFuncs = [];
			const undefinedFunc = (port: number, value: number) => undefined as unknown as number;
			ret_port = 0;
			ret_value = 0;
			z80Ports.registerGenericOutPortFunction(undefinedFunc);
			z80Ports.write(0x2345, 0x78);
			assert.equal(ret_port, 0x2345);
			assert.equal(ret_value, 0x78);
		});
	});

	suite('registerSpecificInPortFunction', () => {
		test('read specific port', () => {
			const mockFunc = (port: number) => 0x7B;
			z80Ports.registerSpecificInPortFunction(0xFE12, mockFunc);
			assert.equal(z80Ports.read(0xFE12), 0x7B);
		});
		test('specific plus generic port', () => {
			const specificFunc = (port: number) => 0x7B;
			z80Ports.registerSpecificInPortFunction(0xFE12, specificFunc);
			assert.equal(z80Ports.read(0x0000), 0xFF);
			assert.equal(z80Ports.read(0xFE12), 0x7B);
			// Add generic
			const genericFunc = (port: number) => 0xA5;
			z80Ports.registerGenericInPortFunction(genericFunc);
			assert.equal(z80Ports.read(0x0000), 0xFF & 0xA5);
			assert.equal(z80Ports.read(0xFE12), 0x7B & 0xA5);

			// Return undefined
			(z80Ports as any).genericInPortFuncs = [];
			const undefinedFunc = (port: number) => undefined as unknown as number;
			z80Ports.registerGenericInPortFunction(undefinedFunc);
			assert.equal(z80Ports.read(0x0000), 0xFF);
			assert.equal(z80Ports.read(0xFE12), 0x7B);
		});
	});
});