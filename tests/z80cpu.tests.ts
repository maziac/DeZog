
import * as assert from 'assert';
import {Z80Cpu} from '../src/remotes/zsimulator/z80cpu';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {MemBuffer} from '../src/misc/membuffer';
import {Settings} from '../src/settings/settings';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';


suite('Z80Cpu', () => {
	let cpu;
	let z80;
	let mem;

	// Fills the memory with the given address/value pairs.
	function setMem(memArray: number[]) {
		mem.clear();
		const count = memArray.length;
		for (let i = 0; i < count; i += 2) {
			const addr = memArray[i];
			const val = memArray[i + 1];
			mem.writeBlock(addr, [val]);
		}
	}

	function getFlagZ(regs): boolean {
		const flagZ = regs.af & 0b01000000;
		return (flagZ != 0);
	}

	suite('Serialization', () => {

		setup(() => {
			// Initialize Settings
			const cfg: any = {
				"zsim": {
					"cpuLoadInterruptRange": 1,
					"vsyncInterrupt": true
				}
			};
			Settings.launch = Settings.Init(cfg);
		});


		test('serialize/deserialize', () => {
			let memBuffer;
			let writeSize;
			{
				const memModel = new MemoryModelAllRam();
				const ports = new Z80Ports(true);
				cpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;

				cpu.pc = 0x1020;
				cpu.sp = 0x1121;
				cpu.af = 0x1222;
				cpu.bc = 0x1323;
				cpu.de = 0x1424;
				cpu.hl = 0x1525;
				cpu.ix = 0x1626;
				cpu.iy = 0x1727;
				cpu.af2 = 0x1828;
				cpu.bc2 = 0x1929;
				cpu.de2 = 0x1A2A;
				cpu.hl2 = 0x1B2B;

				cpu.i = 0xC0;
				cpu.r = 0xC1;
				cpu.im = 2;
				cpu.iff1 = 1;
				cpu.iff2 = 3;

				cpu.remainingInterruptTstates = 65536 + 12;

				// Get size
				writeSize = MemBuffer.getSize(cpu);

				// Serialize
				memBuffer = new MemBuffer(writeSize);
				cpu.serialize(memBuffer);
			}

			// Create a new object
			const memModel = new MemoryModelAllRam();
			const ports = new Z80Ports(true);
			const rCpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;
			rCpu.deserialize(memBuffer);

			// Check size
			const readSize = memBuffer.readOffset;
			assert.equal(readSize, writeSize);

			// And test
			const regs = rCpu.getAllRegisters();
			assert.equal(regs.pc, 0x1020);
			assert.equal(regs.sp, 0x1121);
			assert.equal(regs.af, 0x1222);
			assert.equal(regs.bc, 0x1323);
			assert.equal(regs.de, 0x1424);
			assert.equal(regs.hl, 0x1525);
			assert.equal(regs.ix, 0x1626);
			assert.equal(regs.iy, 0x1727);
			assert.equal(regs.af2, 0x1828);
			assert.equal(regs.bc2, 0x1929);
			assert.equal(regs.de2, 0x1A2A);
			assert.equal(regs.hl2, 0x1B2B);

			assert.equal(regs.i, 0xC0);
			assert.equal(regs.r, 0xC1);
			assert.equal(regs.im, 2);
			assert.equal(regs.iff1, 1);
			assert.equal(regs.iff2, 3);

			assert.equal(rCpu.remainingInterruptTstates, 65536 + 12);
		});
	});


	suite('instructions', () => {
		let portAddress;
		let portValue;

		suite('IN/OUT', () => {

			setup(() => {
				Settings.launch = Settings.Init({} as any);
				const memModel = new MemoryModelAllRam();
				const ports = new Z80Ports(true);
				cpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;
				z80 = cpu.z80;
				mem = cpu.memory;
				portAddress = 0;	// Stores the last accessed port address (IN and OUT)
				portValue = 0;	// For IN: the value returned by IN, for OUT: the value written by OUT
				// Register ports
				ports.registerGenericInPortFunction((port: number) => {
					portAddress = port;
					return portValue;
				});
				ports.registerGenericOutPortFunction((port: number, value: number) => {
					portAddress = port;
					portValue = value;
				});
			});


			test('INI', () => {
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x02AA;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA2
				]);

				portValue = 0xC2;
				portAddress = 0;
				const tStates = z80.run_instruction();
				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2000);	// unchanged
				assert.equal(r.bc, 0x01AA);
				assert.equal(r.af >>> 8, 0x20);	// unchanged
				assert.ok(!getFlagZ(r));	// Z not set
				assert.equal(mem.read8(0x1000), 0xC2);	// The value of port IN
				assert.equal(portAddress, 0x02AA);	// The used port address for IN

				cpu.pc = 0x0000;
				z80.run_instruction();	// Dec B
				r = cpu.getAllRegisters();
				assert.equal(r.bc, 0x00AA);
				assert.equal(portAddress, 0x01AA);	// The used port address for IN
				assert.ok(getFlagZ(r));	// Z set
			});


			test('IND', () => {
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x02AA;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xAA
				]);

				portValue = 0xC2;
				portAddress = 0;
				const tStates = z80.run_instruction();
				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x0FFF);
				assert.equal(r.de, 0x2000);	// unchanged
				assert.equal(r.bc, 0x01AA);
				assert.equal(r.af >>> 8, 0x20);	// unchanged
				assert.ok(!getFlagZ(r));	// Z not set
				assert.equal(mem.read8(0x1000), 0xC2);	// The value of port IN
				assert.equal(portAddress, 0x02AA);	// The used port address for IN

				cpu.pc = 0x0000;
				z80.run_instruction();	// Dec B
				r = cpu.getAllRegisters();
				assert.equal(r.bc, 0x00AA);
				assert.equal(portAddress, 0x01AA);	// The used port address for IN
				assert.ok(getFlagZ(r));	// Z set
			});

			test('OUTI', () => {
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x02AA;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA3,
					0x1000, 0xE1
				]);

				portAddress = 0;
				portValue = 0;
				const tStates = z80.run_instruction();
				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2000);	// unchanged
				assert.equal(r.bc, 0x01AA);
				assert.equal(r.af >>> 8, 0x20);	// unchanged
				assert.ok(!getFlagZ(r));	// Z not set
				assert.equal(portAddress, 0x01AA);
				assert.equal(portValue, 0xE1);

				cpu.pc = 0x0000;
				z80.run_instruction();	// Dec B
				r = cpu.getAllRegisters();
				assert.equal(r.bc, 0x00AA);
				assert.ok(getFlagZ(r));	// Z set
			});

			test('OUTD', () => {
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x02AA;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xAB,
					0x1000, 0xE1
				]);

				portAddress = 0;
				portValue = 0;
				const tStates = z80.run_instruction();
				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x0FFF);
				assert.equal(r.de, 0x2000);	// unchanged
				assert.equal(r.bc, 0x01AA);
				assert.equal(r.af >>> 8, 0x20);	// unchanged
				assert.ok(!getFlagZ(r));	// Z not set
				assert.equal(portAddress, 0x01AA);
				assert.equal(portValue, 0xE1);

				cpu.pc = 0x0000;
				z80.run_instruction();	// Dec B
				r = cpu.getAllRegisters();
				assert.equal(r.bc, 0x00AA);
				assert.ok(getFlagZ(r));	// Z set
			});
		});


		suite('Z80N instructions', () => {

			setup(() => {
				const cfg: any = {
					zsim: {
						Z80N: true
					}
				};
				Settings.launch = Settings.Init(cfg);
				const memModel = new MemoryModelAllRam();
				const ports = new Z80Ports(true);
				cpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports) as any;
				z80 = cpu.z80;
				mem = cpu.memory;
			});


			test('LDIX', () => {
				// PC overflow, A not equal
				cpu.pc = 0xFFFF;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x8000;
				cpu.a = 0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xA4,
					0x1000, 0x10,
					0x2000, 0x00]);
				const tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2001);
				assert.equal(r.bc, 0x7FFF);
				assert.equal(mem.read8(0x2000), 0x10);

				// A not equal, hl overflow
				cpu.pc = 0x0000;
				cpu.hl = 0xFFFF;
				cpu.de = 0x1000;
				cpu.bc = 0x0000;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x0000);
				assert.equal(r.de, 0x1001);
				assert.equal(r.bc, 0xFFFF);
				assert.equal(mem.read8(0x1000), 0x11);

				// A not equal, de overflow
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0xFFFF;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0x1000, 0x12,
					0xFFFF, 0x00]);
				z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x0000);
				assert.equal(mem.read8(0xFFFF), 0x12);

				// A equal
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0x1000, 0x20,
					0x2000, 0x00]);
				z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2001);
				assert.equal(mem.read8(0x2000), 0x00);
			});

			test('LDWS', () => {
				// PC, D, L overflow
				cpu.pc = 0xFFFF;
				cpu.hl = 0x10FF;
				cpu.de = 0xFF00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xA5,
					0x10FF, 0x30,
					0xFF00, 0x00]);
				const tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 14);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x1000);
				assert.equal(r.de, 0x0000);
				assert.equal(mem.read8(0xFF00), 0x30);
			});


			test('LDIRX', () => {
				// BC == 0
				cpu.pc = 0xFFFF;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 1;
				cpu.a = 0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xB4,
					0x1000, 0x10,
					0x2000, 0x00]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2001);
				assert.equal(r.bc, 0);
				assert.equal(mem.read8(0x2000), 0x10);

				// BC != 0, PC overflow
				cpu.pc = 0xFFFF;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x0201;
				cpu.a = 0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xB4,
					0x1000, 0x10,
					0x2000, 0x00]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 21);
				assert.equal(r.pc, 0xFFFF);
				assert.equal(r.hl, 0x1001);
				assert.equal(r.de, 0x2001);
				assert.equal(r.bc, 0x0200);
				assert.equal(mem.read8(0x2000), 0x10);

				// BC != 0, HL overflow
				cpu.pc = 0x0000;
				cpu.hl = 0xFFFF;
				cpu.de = 0x1000;
				cpu.bc = 2;
				cpu.a = 0x11;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB4,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 21);
				assert.equal(r.pc, 0x0000);
				assert.equal(r.hl, 0x0000);
				assert.equal(r.de, 0x1001);
				assert.equal(r.bc, 1);
				assert.equal(mem.read8(0x1000), 0x00);
			});


			test('LDDX', () => {
				// A not equal, hl decremented
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0xFFFF;
				cpu.a = 0x20;
				cpu.bc = 6;
				setMem([
					0x0000, 0xED,
					0x0001, 0xAC,
					0x1000, 0x12,
					0xFFFF, 0x00]);
				const tStates = z80.run_instruction();

				const r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x0FFF);
				assert.equal(r.de, 0x0000);
				assert.equal(r.bc, 5);
				assert.equal(mem.read8(0xFFFF), 0x12);
			});


			test('LDDRX', () => {
				// BC == 0
				cpu.pc = 0xFFFF;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 1;
				cpu.a = 0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xBC,
					0x1000, 0x10,
					0x2000, 0x00]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x0FFF);
				assert.equal(r.de, 0x2001);
				assert.equal(r.bc, 0);
				assert.equal(mem.read8(0x2000), 0x10);

				// BC != 0, PC overflow
				cpu.pc = 0xFFFF;
				cpu.hl = 0x1000;
				cpu.de = 0x2000;
				cpu.bc = 0x0201;
				cpu.a = 0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xBC,
					0x1000, 0x10,
					0x2000, 0x00]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 21);
				assert.equal(r.pc, 0xFFFF);
				assert.equal(r.hl, 0x0FFF);
				assert.equal(r.de, 0x2001);
				assert.equal(r.bc, 0x0200);
				assert.equal(mem.read8(0x2000), 0x10);

				// BC != 0, HL overflow
				cpu.pc = 0x0010;
				cpu.hl = 0x0000;
				cpu.de = 0x1000;
				cpu.bc = 2;
				cpu.a = 0x11;
				setMem([
					0x0010, 0xED,
					0x0011, 0xBC,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 21);
				assert.equal(r.pc, 0x0010);
				assert.equal(r.hl, 0xFFFF);
				assert.equal(r.de, 0x1001);
				assert.equal(r.bc, 1);
				assert.equal(mem.read8(0x1000), 0x00);
			});


			test('LDPIRX', () => {
				// BC == 0, A not equal
				cpu.pc = 0x0000;
				cpu.hl = 0x1000;
				cpu.de = 0x20FF;
				cpu.bc = 1;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB7,
					0x1007, 0x10,
					0x20FF, 0x00]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x1000);
				assert.equal(r.de, 0x2100);
				assert.equal(r.bc, 0);
				assert.equal(mem.read8(0x20FF), 0x10);

				// BC == 0, A not equal
				cpu.pc = 0x0000;
				cpu.hl = 0xFFFF;
				cpu.de = 0x20F8;
				cpu.bc = 1;
				cpu.a = 0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB7,
					0xFFF8, 0x11,
					0x20F8, 0x00]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0xFFFF);
				assert.equal(r.de, 0x20F9);
				assert.equal(r.bc, 0);
				assert.equal(mem.read8(0x20F8), 0x11);

				// BC != 0, A equal
				cpu.pc = 0x8000;
				cpu.hl = 0x0000;
				cpu.de = 0x1001;
				cpu.bc = 2;
				cpu.a = 0x13;
				setMem([
					0x8000, 0xED,
					0x8001, 0xB7,
					0x0001, 0x13,
					0x1001, 0x01]);
				tStates = z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(tStates, 21);
				assert.equal(r.pc, 0x8000);
				assert.equal(r.hl, 0x0000);
				assert.equal(r.de, 0x1002);
				assert.equal(r.bc, 1);
				assert.equal(mem.read8(0x1001), 0x01);
			});


			test('OUTINB', () => {
				const outAddr = 0xFFFF;
				let outValue = 0;
				cpu.pc = 0x0000;
				cpu.hl = 0xFFFF;
				cpu.bc = outAddr;
				setMem([
					0x0000, 0xED,
					0x0001, 0x90,
					0xFFFF, 0xAA]);
				cpu.ports.registerSpecificOutPortFunction(0xFFFF, (port, value) => {
					if (port == outAddr)
						outValue = value;
				});
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.hl, 0x0000);
				assert.equal(outValue, 0xAA);
			});

			test('MUL D,E', () => {
				cpu.pc = 0xFFFF;
				cpu.d = 0;
				cpu.e = 0;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x30]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0);

				cpu.pc = 0xFFFF;
				cpu.d = 5;
				cpu.e = 0;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);

				cpu.pc = 0xFFFF;
				cpu.d = 5;
				cpu.e = 0;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);

				cpu.pc = 0xFFFF;
				cpu.d = 0;
				cpu.e = 6;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);

				cpu.pc = 0xFFFF;
				cpu.d = 5;
				cpu.e = 7;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 35);

				cpu.pc = 0xFFFF;
				cpu.d = 255;
				cpu.e = 255;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 65025);
			});


			test('ADD HL,A', () => {
				cpu.pc = 0xFFFF;
				cpu.hl = 0xFFF0;
				cpu.a = 0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x31]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x00EF);
			});

			test('ADD DE,A', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0xFFF0;
				cpu.a = 0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x32]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0x00EF);
			});

			test('ADD BC,A', () => {
				cpu.pc = 0xFFFF;
				cpu.bc = 0xFFF0;
				cpu.a = 0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x33]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.bc, 0x00EF);
			});


			test('ADD HL,nn', () => {
				cpu.pc = 0xFFFF;
				cpu.hl = 0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x34,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0003);
				assert.equal(r.hl, 0x0234);
			});

			test('ADD DE,nn', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x35,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0003);
				assert.equal(r.de, 0x0234);
			});

			test('ADD BC,nn', () => {
				cpu.pc = 0xFFFF;
				cpu.bc = 0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x36,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 16);
				assert.equal(r.pc, 0x0003);
				assert.equal(r.bc, 0x0234);
			});


			test('SWAPNIB', () => {
				cpu.pc = 0xFFFF;
				cpu.a = 0xA5;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x23]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.af >>> 8, 0x5A);
			});

			test('MIRROR', () => {
				cpu.pc = 0xFFFF;
				cpu.a = 0b10000010;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x24]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.af >>> 8, 0b01000001);

				let val = 0b1000_0000;
				let expected = 0b0000_0001;
				for (let i = 0; i < 8; i++) {
					cpu.pc = 0xFFFF;
					cpu.a = val;
					z80.run_instruction();
					r = cpu.getAllRegisters();
					assert.equal(r.af >>> 8, expected);
					// Next
					val >>>= 1;
					expected <<= 1;
				}

				val = 0b1111_1111_0111_1111;
				expected = 0b1111_1110;
				for (let i = 0; i < 8; i++) {
					cpu.pc = 0xFFFF;
					cpu.a = val & 0xFF;
					z80.run_instruction();
					r = cpu.getAllRegisters();
					assert.equal(r.af >>> 8, expected);
					// Next
					val >>>= 1;
					expected <<= 1;
					expected |= 0b01;
					expected &= 0xFF;
				}
			});


			test('PUSH nn', () => {
				cpu.pc = 0xFFFF;
				cpu.sp = 0x8000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x8A,
					0x0001, 0x12,
					0x0002, 0x34]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 23);
				assert.equal(r.pc, 0x0003);
				assert.equal(r.sp, 0x7FFE);
				assert.equal(mem.getMemory16(0x7FFE), 0x1234);

				cpu.pc = 0x1000;
				cpu.sp = 0x0001;
				setMem([
					0x1000, 0xED,
					0x1001, 0x8A,
					0x1002, 0x12,
					0x1003, 0x34]);
				z80.run_instruction();

				r = cpu.getAllRegisters();
				assert.equal(r.pc, 0x1004);
				assert.equal(r.sp, 0xFFFF);
				assert.equal(mem.getMemory16(0xFFFF), 0x1234);
			});


			test('NEXTREG r,n', () => {
				const outRegSelect = 0x243B;
				const outRegAccess = 0x253B;
				let outSelectValue = 0;
				let outAccessValue = 0;
				cpu.ports.registerSpecificOutPortFunction(outRegSelect, (port, value) => {
					if (port == outRegSelect)
						outSelectValue = value;
				});
				cpu.ports.registerSpecificOutPortFunction(outRegAccess, (port, value) => {
					if (port == outRegAccess)
						outAccessValue = value;
				});

				cpu.pc = 0xFFFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x91,
					0x0001, 0xAA,
					0x0002, 0x55]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 20);
				assert.equal(r.pc, 0x0003);
				assert.equal(outSelectValue, 0xAA);
				assert.equal(outAccessValue, 0x55);
			});

			test('NEXTREG r,A', () => {
				const outRegSelect = 0x243B;
				const outRegAccess = 0x253B;
				let outSelectValue = 0;
				let outAccessValue = 0;
				cpu.ports.registerSpecificOutPortFunction(outRegSelect, (port, value) => {
					if (port == outRegSelect)
						outSelectValue = value;
				});
				cpu.ports.registerSpecificOutPortFunction(outRegAccess, (port, value) => {
					if (port == outRegAccess)
						outAccessValue = value;
				});

				cpu.pc = 0xFFFF;
				cpu.a = 0xF5;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x92,
					0x0001, 0xAA]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 17);
				assert.equal(r.pc, 0x0002);
				assert.equal(outSelectValue, 0xAA);
				assert.equal(outAccessValue, 0xF5);
			});


			test('PIXELDN', () => {
				cpu.pc = 0xFFFF;
				cpu.hl = 0xFEFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x93]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0xFFFF);

				cpu.pc = 0xFFFF;
				cpu.hl = 0xFF7F;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.hl, 0xF87F + 0x20);

				cpu.pc = 0xFFFF;
				cpu.hl = 0xFFFF;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.hl, 0x001F);
			});

			test('PIXELAD', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0x0000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x94]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.hl, 0x4000);

				cpu.pc = 0xFFFF;
				cpu.de = 0xFFFF;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.hl, 0x5F1F + 0xE0);
				assert.equal(r.de, 0xFFFF);
			});

			test('SETAE', () => {
				cpu.pc = 0xFFFF;
				cpu.e = 0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x95]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.af >>> 8, 0b1000_0000);

				cpu.pc = 0xFFFF;
				cpu.e = 0x01;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.af >>> 8, 0b0100_0000);

				cpu.pc = 0xFFFF;
				cpu.e = 0x07;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.af >>> 8, 0b0000_0001);

				cpu.pc = 0xFFFF;
				cpu.e = 0xFA;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.af >>> 8, 0b0010_0000);
			});


			test('TEST n', () => {
				cpu.pc = 0xFFFF;
				cpu.a = 0xA5;
				cpu.f = 0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0xFF]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 11);
				assert.equal(r.pc, 0x0002);
				assert.equal(r.af & 0xFF, 0b1000_0000);

				cpu.pc = 0xFFFF;
				cpu.a = 0xA5;
				cpu.f = 0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0x5A]);
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.af & 0xFF, 0b0100_0000);

				cpu.pc = 0xFFFF;
				cpu.a = 0x75;
				cpu.f = 0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0xFF]);
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.af & 0xFF, 0b0000_0000);
			});


			test('BSLA DE,B', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0b1100_0010_1000_0001;
				cpu.b = 0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x28]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0b1000_0101_0000_0010);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100_0010_1000_0001;
				cpu.b = 3;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b001_0100_0000_1000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100_0010_1000_0001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);
			});

			test('BSRA DE,B', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x29]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0b1110000101000000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 3;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b0000100001010000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0xFFFF);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);
			});

			test('BSRL DE,B', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2A]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0b0110000101000000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 3;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b0000100001010000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0);
			});

			test('BSRF DE,B', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2B]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0b1110000101000000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 3;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b1110100001010000);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0xFFFF);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0xFFFF);
			});

			test('BRLC DE,B', () => {
				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2C]);
				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 8);
				assert.equal(r.pc, 0x0001);
				assert.equal(r.de, 0b1000010100000011);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 3;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b0001010000001110);

				cpu.pc = 0xFFFF;
				cpu.de = 0b1100001010000001;
				cpu.b = 16;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b1100001010000001);

				cpu.pc = 0xFFFF;
				cpu.de = 0b0100001010000001;
				cpu.b = 31;
				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.de, 0b1010000101000000);
			});


			test('JP (C)', () => {
				cpu.pc = 0xFFFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x98]);
				cpu.bc = 0x1234;	// port address

				cpu.ports.registerSpecificInPortFunction(0x1234, port => {
					return 0xFF;
				});

				let tStates = z80.run_instruction();

				let r = cpu.getAllRegisters();
				assert.equal(tStates, 13);
				assert.equal(r.pc, 0b0011_1111_1100_0000);

				cpu.pc = 0xC00F;
				setMem([
					0xC00F, 0xED,
					0xC010, 0x98]);
				cpu.bc = 0x1234;	// port address

				cpu.ports.registerSpecificInPortFunction(0x1234, port => {
					return 0b11100011;
				});

				z80.run_instruction();
				r = cpu.getAllRegisters();
				assert.equal(r.pc, 0b1111_1000_1100_0000);
			});

		});
	});
});

