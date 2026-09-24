
import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {ZxNextRegisters} from '../src/remotes/zsimulator/zxnextregisters';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';


suite('ZxNextRegisters', () => {

	// Port to select the register
	const SELECT = 0x243B;
	// Port to access the selected register
	const ACCESS = 0x253B;
	// The value returned for not handled in-ports
	const DEFAULT_PORT_IN = 0xFF;

	let ports: Z80Ports;
	let regs: ZxNextRegisters;

	/** Writes the value to the register (via the ports). */
	function writeReg(register: number, value: number) {
		ports.write(SELECT, register);
		ports.write(ACCESS, value);
	}

	/** Reads the register (via the ports). */
	function readReg(register: number): number {
		ports.write(SELECT, register);
		return ports.read(ACCESS);
	}

	setup(() => {
		ports = new Z80Ports('AND', DEFAULT_PORT_IN);
		regs = new ZxNextRegisters();
	});


	suite('installPorts', () => {

		test('no registers added', () => {
			regs.installPorts(ports);
			// Nothing installed: default port value is returned
			assert.equal(readReg(0x07), DEFAULT_PORT_IN);
		});

		test('unknown register', () => {
			const memory = {setSlot: () => {assert.fail('setSlot called');}, getSlots: () => [0]};
			regs.addMemoryManagementSlotRegisters(memory as any);
			regs.installPorts(ports);
			// Write is ignored
			writeReg(0x06, 5);
			// Read returns 0
			assert.equal(readReg(0x06), 0);
		});
	});


	suite('cpu speed (0x07)', () => {

		let cpu: {freq: number, extraTstates: number, setCpuFreq: (f: number) => void, setExtraTstatesPerInstruction: (t: number) => void};
		let beeper: {freq: number, setCpuFrequency: (f: number) => void};

		setup(() => {
			cpu = {
				freq: 0,
				extraTstates: -1,
				setCpuFreq(f: number) {this.freq = f;},
				setExtraTstatesPerInstruction(t: number) {this.extraTstates = t;}
			};
			beeper = {
				freq: 0,
				setCpuFrequency(f: number) {this.freq = f;}
			};
		});

		test('set / get', () => {
			regs.addCpuSpeedRegister(cpu as any, beeper as any);
			regs.installPorts(ports);

			// Initial value
			assert.equal(readReg(0x07), 0);

			const expected = [
				{speed: 0b00, freq: 3500000, extra: 0},
				{speed: 0b01, freq: 7000000, extra: 0},
				{speed: 0b10, freq: 14000000, extra: 0},
				{speed: 0b11, freq: 28000000, extra: 1},
			];
			for (const e of expected) {
				writeReg(0x07, e.speed);
				assert.equal(cpu.freq, e.freq);
				assert.equal(cpu.extraTstates, e.extra);
				assert.equal(beeper.freq, e.freq);
				// Read back: current and programmed speed
				assert.equal(readReg(0x07), (e.speed << 4) | e.speed);
			}
		});

		test('only the lower 2 bits are used', () => {
			regs.addCpuSpeedRegister(cpu as any, beeper as any);
			regs.installPorts(ports);
			writeReg(0x07, 0b11111101);
			assert.equal(cpu.freq, 7000000);
			assert.equal(readReg(0x07), 0b010001);
		});

		test('without beeper', () => {
			regs.addCpuSpeedRegister(cpu as any);
			regs.installPorts(ports);
			writeReg(0x07, 0b10);
			assert.equal(cpu.freq, 14000000);
		});
	});


	suite('memory management slots (0x50-0x57)', () => {

		// Memory stub: only the slots are required.
		let memory: {slots: number[], setSlot: (slot: number, bank: number) => void, getSlots: () => number[]};

		setup(() => {
			memory = {
				slots: [0xFF, 0xFF, 10, 11, 4, 5, 0, 1],
				setSlot(slot: number, bank: number) {this.slots[slot] = bank;},
				getSlots() {return this.slots;}
			};
			regs.addMemoryManagementSlotRegisters(memory as any);
			regs.installPorts(ports);
		});

		test('set / get bank', () => {
			for (let slot = 0; slot < 8; slot++) {
				const bank = 20 + slot;
				writeReg(0x50 + slot, bank);
				assert.equal(memory.getSlots()[slot], bank);
				assert.equal(readReg(0x50 + slot), bank);
			}
		});

		test('ROM (0xFF) only for slot 0 and 1', () => {
			for (let slot = 0; slot < 8; slot++) {
				writeReg(0x50 + slot, 10);
				writeReg(0x50 + slot, 0xFF);
				const expected = (slot < 2) ? 0xFF : 10;
				assert.equal(memory.getSlots()[slot], expected, 'slot ' + slot);
			}
		});

		test('not existing bank is ignored', () => {
			writeReg(0x52, 30);
			writeReg(0x52, 224);
			assert.equal(memory.getSlots()[2], 30);
			writeReg(0x52, 223);
			assert.equal(memory.getSlots()[2], 223);
		});
	});
});
