
import * as assert from 'assert';
import {Z80Cpu} from '../remotes/zxsimulator/z80cpu';
import {ZxMemory} from '../remotes/zxsimulator/zxmemory';
import {ZxPorts} from '../remotes/zxsimulator/zxports';
import {MemBuffer} from '../misc/membuffer';
import {Settings} from '../settings';

suite('Z80Cpu', () => {

	suite('Serialization', () => {

		test('serialize/deserialize', () => {
			let memBuffer;
			let writeSize;
			{
				const cpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;

				cpu.pc=0x1020;
				cpu.sp=0x1121;
				cpu.af=0x1222;
				cpu.bc=0x1323;
				cpu.de=0x1424;
				cpu.hl=0x1525;
				cpu.ix=0x1626;
				cpu.iy=0x1727;
				cpu.af2=0x1828;
				cpu.bc2=0x1929;
				cpu.de2=0x1A2A;
				cpu.hl2=0x1B2B;

				cpu.i=0xC0;
				cpu.r=0xC1;
				cpu.im=2;
				cpu.iff1=1;
				cpu.iff2=3;

				cpu.remaingInterruptTstates=65536+12;

				// Get size
				writeSize=cpu.getSerializedSize();

				// Serialize
				memBuffer=new MemBuffer(writeSize);
				cpu.serialize(memBuffer);
			}

			// Create a new object
			const rCpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;
			rCpu.deserialize(memBuffer);

			// Check size
			const readSize=(memBuffer as any).readOffset;
			assert.equal(writeSize, readSize);

			// And test
			const regs=rCpu.getAllRegisters();
			assert.equal(0x1020, regs.pc);
			assert.equal(0x1121, regs.sp);
			assert.equal(0x1222, regs.af);
			assert.equal(0x1323, regs.bc);
			assert.equal(0x1424, regs.de);
			assert.equal(0x1525, regs.hl);
			assert.equal(0x1626, regs.ix);
			assert.equal(0x1727, regs.iy);
			assert.equal(0x1828, regs.af2);
			assert.equal(0x1929, regs.bc2);
			assert.equal(0x1A2A, regs.de2);
			assert.equal(0x1B2B, regs.hl2);

			assert.equal(0xC0, regs.i);
			assert.equal(0xC1, regs.r);
			assert.equal(2, regs.im);
			assert.equal(1, regs.iff1);
			assert.equal(3, regs.iff2);

			assert.equal(65536+12, rCpu.remaingInterruptTstates);
		});
	});



	suite('instructions', () => {
		let cpu;
		let z80;
		let mem;
		let ports;


		// Fills the memory with the given address/value pairs.
		function setMem(memArray: number[]) {
			mem.clear();
			const count=memArray.length;
			for (let i=0; i<count; i+=2) {
				const addr=memArray[i];
				const val=memArray[i+1];
				mem.setMemory8(addr, val);
			}
		}

		// Fills the ports with the given address/value pairs.
		function setPorts(portsArray: number[]) {
			const count=portsArray.length;
			for (let i=0; i<count; i+=2) {
				const addr=portsArray[i];
				const val=portsArray[i+1];
				ports.setPortValue(addr, val);
			}
		}


		suite('Z80N instructions', () => {

			setup(() => {
				const cfg: any={
					zsim: {
						Z80N: true
					}
				};
				Settings.Init(cfg, '');
				cpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;
				z80=cpu.z80;
				mem=cpu.memory;
				ports=cpu.ports;
				// Make sure whole memory is RAM
				for (let i=0; i<8; i++)
					mem.setSlot(i, i);
			});


			test('LDIX', () => {
				// PC overflow, A not equal
				cpu.pc=0xFFFF;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.bc=0x8000;
				cpu.a=0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xA4,
					0x1000, 0x10,
					0x2000, 0x00]);
				const tStates = z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x1001, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0x7FFF, r.bc);
				assert.equal(0x10, mem.read8(0x2000));

				// A not equal, hl overflow
				cpu.pc=0x0000;
				cpu.hl=0xFFFF;
				cpu.de=0x1000;
				cpu.bc=0x0000;
				cpu.a=0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(0x0002, r.pc);
				assert.equal(0x0000, r.hl);
				assert.equal(0x1001, r.de);
				assert.equal(0xFFFF, r.bc);
				assert.equal(0x11, mem.read8(0x1000));

				// A not equal, de overflow
				cpu.pc=0x0000;
				cpu.hl=0x1000;
				cpu.de=0xFFFF;
				cpu.a=0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0x1000, 0x12,
					0xFFFF, 0x00]);
				z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(0x0002, r.pc);
				assert.equal(0x1001, r.hl);
				assert.equal(0x0000, r.de);
				assert.equal(0x12, mem.read8(0xFFFF));

				// A equal
				cpu.pc=0x0000;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.a=0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xA4,
					0x1000, 0x20,
					0x2000, 0x00]);
				z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(0x0002, r.pc);
				assert.equal(0x1001, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0x00, mem.read8(0x2000));
			});

			test('LDWS', () => {
				// PC, D, L overflow
				cpu.pc=0xFFFF;
				cpu.hl=0x10FF;
				cpu.de=0xFF00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xA5,
					0x10FF, 0x30,
					0xFF00, 0x00]);
				const tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(14, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x1000, r.hl);
				assert.equal(0x0000, r.de);
				assert.equal(0x30, mem.read8(0xFF00));
			});


			test('LDIRX', () => {
				// BC == 0
				cpu.pc=0xFFFF;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.bc=1;
				cpu.a=0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xB4,
					0x1000, 0x10,
					0x2000, 0x00]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x1001, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0, r.bc);
				assert.equal(0x10, mem.read8(0x2000));

				// BC != 0, PC overflow
				cpu.pc=0xFFFF;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.bc=0x0201;
				cpu.a=0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xB4,
					0x1000, 0x10,
					0x2000, 0x00]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(21, tStates);
				assert.equal(0xFFFF, r.pc);
				assert.equal(0x1001, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0x0200, r.bc);
				assert.equal(0x10, mem.read8(0x2000));

				// BC != 0, HL overflow
				cpu.pc=0x0000;
				cpu.hl=0xFFFF;
				cpu.de=0x1000;
				cpu.bc=2;
				cpu.a=0x11;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB4,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(21, tStates);
				assert.equal(0x0000, r.pc);
				assert.equal(0x0000, r.hl);
				assert.equal(0x1001, r.de);
				assert.equal(1, r.bc);
				assert.equal(0x00, mem.read8(0x1000));
			});


			test('LDDX', () => {
				// A not equal, hl decremented
				cpu.pc=0x0000;
				cpu.hl=0x1000;
				cpu.de=0xFFFF;
				cpu.a=0x20;
				cpu.bc=6;
				setMem([
					0x0000, 0xED,
					0x0001, 0xAC,
					0x1000, 0x12,
					0xFFFF, 0x00]);
				const tStates=z80.run_instruction();

				const r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0x0FFF, r.hl);
				assert.equal(0x0000, r.de);
				assert.equal(5, r.bc);
				assert.equal(0x12, mem.read8(0xFFFF));
			});


			test('LDDRX', () => {
				// BC == 0
				cpu.pc=0xFFFF;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.bc=1;
				cpu.a=0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xBC,
					0x1000, 0x10,
					0x2000, 0x00]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x0FFF, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0, r.bc);
				assert.equal(0x10, mem.read8(0x2000));

				// BC != 0, PC overflow
				cpu.pc=0xFFFF;
				cpu.hl=0x1000;
				cpu.de=0x2000;
				cpu.bc=0x0201;
				cpu.a=0x20;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0xBC,
					0x1000, 0x10,
					0x2000, 0x00]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(21, tStates);
				assert.equal(0xFFFF, r.pc);
				assert.equal(0x0FFF, r.hl);
				assert.equal(0x2001, r.de);
				assert.equal(0x0200, r.bc);
				assert.equal(0x10, mem.read8(0x2000));

				// BC != 0, HL overflow
				cpu.pc=0x0010;
				cpu.hl=0x0000;
				cpu.de=0x1000;
				cpu.bc=2;
				cpu.a=0x11;
				setMem([
					0x0010, 0xED,
					0x0011, 0xBC,
					0xFFFF, 0x11,
					0x1000, 0x00]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(21, tStates);
				assert.equal(0x0010, r.pc);
				assert.equal(0xFFFF, r.hl);
				assert.equal(0x1001, r.de);
				assert.equal(1, r.bc);
				assert.equal(0x00, mem.read8(0x1000));
			});


			test('LDPIRX', () => {
				// BC == 0, A not equal
				cpu.pc=0x0000;
				cpu.hl=0x1000;
				cpu.de=0x20FF;
				cpu.bc=1;
				cpu.a=0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB7,
					0x1007, 0x10,
					0x20FF, 0x00]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0x1000, r.hl);
				assert.equal(0x2100, r.de);
				assert.equal(0, r.bc);
				assert.equal(0x10, mem.read8(0x20FF));

				// BC == 0, A not equal
				cpu.pc=0x0000;
				cpu.hl=0xFFFF;
				cpu.de=0x20F8;
				cpu.bc=1;
				cpu.a=0x20;
				setMem([
					0x0000, 0xED,
					0x0001, 0xB7,
					0xFFF8, 0x11,
					0x20F8, 0x00]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0xFFFF, r.hl);
				assert.equal(0x20F9, r.de);
				assert.equal(0, r.bc);
				assert.equal(0x11, mem.read8(0x20F8));

				// BC != 0, A equal
				cpu.pc=0x8000;
				cpu.hl=0x0000;
				cpu.de=0x1001;
				cpu.bc=2;
				cpu.a=0x13;
				setMem([
					0x8000, 0xED,
					0x8001, 0xB7,
					0x0001, 0x13,
					0x1001, 0x01]);
				tStates=z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(21, tStates);
				assert.equal(0x8000, r.pc);
				assert.equal(0x0000, r.hl);
				assert.equal(0x1002, r.de);
				assert.equal(1, r.bc);
				assert.equal(0x01, mem.read8(0x1001));
			});


			test('OUTINB', () => {
				const outAddr=0xFFFF;
				let outValue=0;
				cpu.pc=0x0000;
				cpu.hl=0xFFFF;
				cpu.bc=outAddr;
				setMem([
					0x0000, 0xED,
					0x0001, 0x90,
					0xFFFF, 0xAA]);
				cpu.ports.registerOutPortFunction(0xFFFF, (port, value) => {
					if (port==outAddr)
						outValue=value;
				});
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0x0000, r.hl);
				assert.equal(0xAA, outValue);
			});

			test('MUL D,E', () => {
				cpu.pc=0xFFFF;
				cpu.d=0;
				cpu.e=0;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x30]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0, r.de);

				cpu.pc=0xFFFF;
				cpu.d=5;
				cpu.e=0;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);

				cpu.pc=0xFFFF;
				cpu.d=5;
				cpu.e=0;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);

				cpu.pc=0xFFFF;
				cpu.d=0;
				cpu.e=6;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);

				cpu.pc=0xFFFF;
				cpu.d=5;
				cpu.e=7;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(35, r.de);

				cpu.pc=0xFFFF;
				cpu.d=255;
				cpu.e=255;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(65025, r.de);
			});


			test('ADD HL,A', () => {
				cpu.pc=0xFFFF;
				cpu.hl=0xFFF0;
				cpu.a=0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x31]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x00EF, r.hl);
			});

			test('ADD DE,A', () => {
				cpu.pc=0xFFFF;
				cpu.de=0xFFF0;
				cpu.a=0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x32]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x00EF, r.de);
			});

			test('ADD BC,A', () => {
				cpu.pc=0xFFFF;
				cpu.bc=0xFFF0;
				cpu.a=0xFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x33]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x00EF, r.bc);
			});


			test('ADD HL,nn', () => {
				cpu.pc=0xFFFF;
				cpu.hl=0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x34,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0003, r.pc);
				assert.equal(0x0234, r.hl);
			});

			test('ADD DE,nn', () => {
				cpu.pc=0xFFFF;
				cpu.de=0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x35,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0003, r.pc);
				assert.equal(0x0234, r.de);
			});

			test('ADD BC,nn', () => {
				cpu.pc=0xFFFF;
				cpu.bc=0xF000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x36,
					0x0001, 0x34,
					0x0002, 0x12]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(16, tStates);
				assert.equal(0x0003, r.pc);
				assert.equal(0x0234, r.bc);
			});


			test('SWAPNIB', () => {
				cpu.pc=0xFFFF;
				cpu.a=0xA5;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x23]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x5A, r.af>>>8);
			});

			test('MIRROR', () => {
				cpu.pc=0xFFFF;
				cpu.a=0b10000010;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x24]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b01000001, r.af>>>8);

				let val=0b1000_0000;
				let expected=0b0000_0001;
				for (let i=0; i<8; i++) {
					cpu.pc=0xFFFF;
					cpu.a=val;
					z80.run_instruction();
					r=cpu.getAllRegisters();
					assert.equal(expected, r.af>>>8);
					// Next
					val>>>=1;
					expected<<=1;
				}

				val=0b1111_1111_0111_1111;
				expected=0b1111_1110;
				for (let i=0; i<8; i++) {
					cpu.pc=0xFFFF;
					cpu.a=val&0xFF;
					z80.run_instruction();
					r=cpu.getAllRegisters();
					assert.equal(expected, r.af>>>8);
					// Next
					val>>>=1;
					expected<<=1;
					expected|=0b01;
					expected&=0xFF;
				}
			});


			test('PUSH nn', () => {
				cpu.pc=0xFFFF;
				cpu.sp=0x8000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x8A,
					0x0001, 0x12,
					0x0002, 0x34]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(23, tStates);
				assert.equal(0x0003, r.pc);
				assert.equal(0x7FFE, r.sp);
				assert.equal(0x1234, mem.getMemory16(0x7FFE));

				cpu.pc=0x1000;
				cpu.sp=0x0001;
				setMem([
					0x1000, 0xED,
					0x1001, 0x8A,
					0x1002, 0x12,
					0x1003, 0x34]);
				z80.run_instruction();

				r=cpu.getAllRegisters();
				assert.equal(0x1004, r.pc);
				assert.equal(0xFFFF, r.sp);
				assert.equal(0x1234, mem.getMemory16(0xFFFF));
			});


			test('NEXTREG r,n', () => {
				const outRegSelect=0x243B;
				const outRegAccess=0x253B;
				let outSelectValue=0;
				let outAccessValue=0;
				cpu.ports.registerOutPortFunction(outRegSelect, (port, value) => {
					if (port==outRegSelect)
						outSelectValue=value;
				});
				cpu.ports.registerOutPortFunction(outRegAccess, (port, value) => {
					if (port==outRegAccess)
						outAccessValue=value;
				});

				cpu.pc=0xFFFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x91,
					0x0001, 0xAA,
					0x0002, 0x55]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(20, tStates);
				assert.equal(0x0003, r.pc);
				assert.equal(0xAA, outSelectValue);
				assert.equal(0x55, outAccessValue);
			});

			test('NEXTREG r,A', () => {
				const outRegSelect=0x243B;
				const outRegAccess=0x253B;
				let outSelectValue=0;
				let outAccessValue=0;
				cpu.ports.registerOutPortFunction(outRegSelect, (port, value) => {
					if (port==outRegSelect)
						outSelectValue=value;
				});
				cpu.ports.registerOutPortFunction(outRegAccess, (port, value) => {
					if (port==outRegAccess)
						outAccessValue=value;
				});

				cpu.pc=0xFFFF;
				cpu.a=0xF5;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x92,
					0x0001, 0xAA]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(17, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0xAA, outSelectValue);
				assert.equal(0xF5, outAccessValue);
			});


			test('PIXELDN', () => {
				cpu.pc=0xFFFF;
				cpu.hl=0xFEFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x93]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0xFFFF, r.hl);

				cpu.pc=0xFFFF;
				cpu.hl=0xFF7F;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0xF87F+0x20, r.hl);

				cpu.pc=0xFFFF;
				cpu.hl=0xFFFF;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0x001F, r.hl);
			});

			test('PIXELAD', () => {
				cpu.pc=0xFFFF;
				cpu.de=0x0000;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x94]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0x4000, r.hl);

				cpu.pc=0xFFFF;
				cpu.de=0xFFFF;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0x5F1F+0xE0, r.hl);
				assert.equal(0xFFFF, r.de);
			});

			test('SETAE', () => {
				cpu.pc=0xFFFF;
				cpu.e=0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x95]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b1000_0000, r.af>>>8);

				cpu.pc=0xFFFF;
				cpu.e=0x01;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0100_0000, r.af>>>8);

				cpu.pc=0xFFFF;
				cpu.e=0x07;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0000_0001, r.af>>>8);

				cpu.pc=0xFFFF;
				cpu.e=0xFA;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0010_0000, r.af>>>8);
			});


			test('TEST n', () => {
				cpu.pc=0xFFFF;
				cpu.a=0xA5;
				cpu.f=0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0xFF]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(11, tStates);
				assert.equal(0x0002, r.pc);
				assert.equal(0b1000_0000, r.af&0xFF);

				cpu.pc=0xFFFF;
				cpu.a=0xA5;
				cpu.f=0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0x5A]);
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0100_0000, r.af&0xFF);

				cpu.pc=0xFFFF;
				cpu.a=0x75;
				cpu.f=0x00;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x27,
					0x0001, 0xFF]);
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0000_0000, r.af&0xFF);
			});


			test('BSLA DE,B', () => {
				cpu.pc=0xFFFF;
				cpu.de=0b1100_0010_1000_0001;
				cpu.b=0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x28]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b1000_0101_0000_0010, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100_0010_1000_0001;
				cpu.b=3;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b001_0100_0000_1000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100_0010_1000_0001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);
			});

			test('BSRA DE,B', () => {
				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x29]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b1110000101000000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=3;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0000100001010000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0xFFFF, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);
			});

			test('BSRL DE,B', () => {
				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2A]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b0110000101000000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=3;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0000100001010000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0, r.de);
			});

			test('BSRF DE,B', () => {
				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2B]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b1110000101000000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=3;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b1110100001010000, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0xFFFF, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0xFFFF, r.de);
			});

			test('BRLC DE,B', () => {
				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=0xE1;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x2C]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(8, tStates);
				assert.equal(0x0001, r.pc);
				assert.equal(0b1000010100000011, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=3;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b0001010000001110, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b1100001010000001;
				cpu.b=16;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b1100001010000001, r.de);

				cpu.pc=0xFFFF;
				cpu.de=0b0100001010000001;
				cpu.b=31;
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b1010000101000000, r.de);
			});


			test('JP (C)', () => {
				cpu.pc=0xFFFF;
				setMem([
					0xFFFF, 0xED,
					0x0000, 0x98]);
				cpu.bc=0x1234;	// port address
				setPorts([0x1234, 0xFF]);
				let tStates=z80.run_instruction();

				let r=cpu.getAllRegisters();
				assert.equal(13, tStates);
				assert.equal(0b0011_1111_1100_0000, r.pc);

				cpu.pc=0xC00F;
				setMem([
					0xC00F, 0xED,
					0xC010, 0x98]);
				cpu.bc=0x1234;	// port address
				setPorts([0x1234, 0b11100011]);
				z80.run_instruction();
				r=cpu.getAllRegisters();
				assert.equal(0b1111_1000_1100_0000, r.pc);
			});

		});
	});
});

