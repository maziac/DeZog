
import * as assert from 'assert';
import {Z80Cpu} from '../remotes/zxsimulator/z80cpu';
import {ZxMemory} from '../remotes/zxsimulator/zxmemory';
import {ZxPorts} from '../remotes/zxsimulator/zxports';
import {MemBuffer} from '../misc/membuffer';

suite('Z80Cpu', () => {

	suite('Serialization', () => {

		test('serialize/deserialize', () => {
			let memBuffer;
			let writeSize;
			{
				const cpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;
				const r1=cpu.r1;
				const r2=cpu.r2;

				cpu.pc=0x1020;
				cpu.sp=0x1121;
				r1.af=0x1222;
				r1.bc=0x1323;
				r1.de=0x1424;
				r1.hl=0x1525;
				r1.ix=0x1626;
				r1.iy=0x1727;
				r2.af=0x1828;
				r2.bc=0x1929;
				r2.de=0x1A2A;
				r2.hl=0x1B2B;

				cpu.i=0xC0;
				cpu.r=0xC1;
				cpu.im=0xC2;
				cpu.iff1=0xC3;
				cpu.iff2=0xC4;

				cpu.remaingInterruptTstates=65536+12;

				// Get size
				writeSize=cpu.getSerializedSize();

				// Serialize
				memBuffer=new MemBuffer(writeSize);
				cpu.serialize(memBuffer);
			}

			// Create a new object
			const rCpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;
			const rR1=rCpu.r1;
			const rR2=rCpu.r2;
			rCpu.deserialize(memBuffer);

			// Check size
			const readSize=(memBuffer as any).readOffset;
			assert.equal(writeSize, readSize);

			// And test
			assert.equal(0x1020, rCpu.pc);
			assert.equal(0x1121, rCpu.sp);
			assert.equal(0x1222, rR1.af);
			assert.equal(0x1323, rR1.bc);
			assert.equal(0x1424, rR1.de);
			assert.equal(0x1525, rR1.hl);
			assert.equal(0x1626, rR1.ix);
			assert.equal(0x1727, rR1.iy);
			assert.equal(0x1828, rR2.af);
			assert.equal(0x1929, rR2.bc);
			assert.equal(0x1A2A, rR2.de);
			assert.equal(0x1B2B, rR2.hl);

			assert.equal(0xC0, rCpu.i);
			assert.equal(0xC1, rCpu.r);
			assert.equal(0xC2, rCpu.im);
			assert.equal(0xC3, rCpu.iff1);
			assert.equal(0xC4, rCpu.iff2);

			assert.equal(65536+12, rCpu.remaingInterruptTstates);
		});
	});



	suite('Z80N instructions', () => {
		let cpu;
		let r1;
		let mem;


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

		setup(() => {
			cpu=new Z80Cpu(new ZxMemory(), new ZxPorts()) as any;
			r1=cpu.r1;
			mem=cpu.memory;
		});

		test('LDIX', () => {
			// PC overflow, A not equal
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0x1000;
			r1.de=0x2000;
			r1.bc=0x8000;
			r1.a=0x20;
			setMem([0x0000, 0xA4,
				r1.hl, 0x10,
				r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x1001, r1.hl);
			assert.equal(0x2001, r1.de);
			assert.equal(0x7FFF, r1.bc);
			assert.equal(0x10, mem.read8(0x2000));

			// A not equal, hl overflow
			cpu.pc=0x0000;
			r1.hl=0xFFFF;
			r1.de=0x1000;
			r1.bc=0x0000;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xA4,
			r1.hl, 0x11,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(0x0002, cpu.pc);
			assert.equal(0x0000, r1.hl);
			assert.equal(0x1001, r1.de);
			assert.equal(0xFFFF, r1.bc);
			assert.equal(0x11, mem.read8(0x1000));

			// A not equal, de overflow
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0xFFFF;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xA4,
			r1.hl, 0x12,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(0x0002, cpu.pc);
			assert.equal(0x1001, r1.hl);
			assert.equal(0x0000, r1.de);
			assert.equal(0x12, mem.read8(0xFFFF));

			// A equal
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0x2000;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xA4,
			r1.hl, 0x20,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(0x0002, cpu.pc);
			assert.equal(0x1001, r1.hl);
			assert.equal(0x2001, r1.de);
			assert.equal(0x00, mem.read8(0x2000));
		});

		test('LDWS', () => {
			// PC, D, L overflow
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0x10FF;
			r1.de=0xFF00;
			setMem([0x0000, 0xA5,
				r1.hl, 0x30,
				r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(14, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x1000, r1.hl);
			assert.equal(0x0000, r1.de);
			assert.equal(0x30, mem.read8(0xFF00));
		});


		test('LDIRX', () => {
			// BC == 0
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0x2000;
			r1.bc=1;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xB4,
			r1.hl, 0x10,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0x1001, r1.hl);
			assert.equal(0x2001, r1.de);
			assert.equal(0, r1.bc);
			assert.equal(0x10, mem.read8(0x2000));

			// BC != 0
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0xFFFF;
			r1.de=0x1000;
			r1.bc=2;
			r1.a=0x11;
			setMem([cpu.pc+1, 0xB4,
			r1.hl, 0x11,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(21, cpu.tStates);
			assert.equal(0x0000, cpu.pc);
			assert.equal(0x0000, r1.hl);
			assert.equal(0x1001, r1.de);
			assert.equal(1, r1.bc);
			assert.equal(0x00, mem.read8(0x1000));
		});


		test('LDDX', () => {
			// A not equal, hl decremented
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0xFFFF;
			r1.a=0x20;
			r1.bc=6;
			setMem([cpu.pc+1, 0xAC,
			r1.hl, 0x12,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0x0FFF, r1.hl);
			assert.equal(0x0000, r1.de);
			assert.equal(5, r1.bc);
			assert.equal(0x12, mem.read8(0xFFFF));

		});


		test('LDDRX', () => {
			// BC == 0
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0x2000;
			r1.bc=1;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xBC,
			r1.hl, 0x10,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0x0FFF, r1.hl);
			assert.equal(0x2001, r1.de);
			assert.equal(0, r1.bc);
			assert.equal(0x10, mem.read8(0x2000));

			// BC != 0
			cpu.tStates=0;
			cpu.pc=0x8000;
			r1.hl=0x0000;
			r1.de=0x1000;
			r1.bc=2;
			r1.a=0x11;
			setMem([cpu.pc+1, 0xBC,
			r1.hl, 0x11,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(21, cpu.tStates);
			assert.equal(0x8000, cpu.pc);
			assert.equal(0xFFFF, r1.hl);
			assert.equal(0x1001, r1.de);
			assert.equal(1, r1.bc);
			assert.equal(0x00, mem.read8(0x1000));
		});


		test('LDPIRX', () => {
			// BC == 0, A not equal
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0x1000;
			r1.de=0x20FF;
			r1.bc=1;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xB7,
				0x1007, 0x10,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0x1000, r1.hl);
			assert.equal(0x2100, r1.de);
			assert.equal(0, r1.bc);
			assert.equal(0x10, mem.read8(0x20FF));

			// BC == 0, A not equal
			cpu.tStates=0;
			cpu.pc=0x0000;
			r1.hl=0xFFFF;
			r1.de=0x20F8;
			r1.bc=1;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xB7,
				0xFFF8, 0x11,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0xFFFF, r1.hl);
			assert.equal(0x20F9, r1.de);
			assert.equal(0, r1.bc);
			assert.equal(0x11, mem.read8(0x20F8));

			// BC != 0, A equal
			cpu.tStates=0;
			cpu.pc=0x8000;
			r1.hl=0x0000;
			r1.de=0x1001;
			r1.bc=2;
			r1.a=0x13;
			setMem([cpu.pc+1, 0xB7,
			0x0001, 0x13,
			r1.de, 0x01]);
			cpu.executeZ80n();

			assert.equal(21, cpu.tStates);
			assert.equal(0x8000, cpu.pc);
			assert.equal(0x0000, r1.hl);
			assert.equal(0x1002, r1.de);
			assert.equal(1, r1.bc);
			assert.equal(0x01, mem.read8(0x1001));
		});


		test('OUTINB', () => {
			const outAddr=0xFFFF;
			let outValue=0;
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0xFFFF;
			r1.bc=outAddr;
			setMem([0x0000, 0x90,
				r1.hl, 0xAA]);
			cpu.io.registerOutPortFunction(r1.hl, (port, value) => {
				if (port==outAddr)
					outValue=value;
			});
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x0000, r1.hl);
			assert.equal(0xAA, outValue);
		});

		test('MUL D,E', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.d=0;
			r1.e=0;
			setMem([0x0000, 0x30]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0, r1.de);

			cpu.pc=0xFFFF;
			r1.d=5;
			r1.e=0;
			cpu.executeZ80n();
			assert.equal(0, r1.de);

			cpu.pc=0xFFFF;
			r1.d=5;
			r1.e=0;
			cpu.executeZ80n();
			assert.equal(0, r1.de);

			cpu.pc=0xFFFF;
			r1.d=0;
			r1.e=6;
			cpu.executeZ80n();
			assert.equal(0, r1.de);

			cpu.pc=0xFFFF;
			r1.d=5;
			r1.e=7;
			cpu.executeZ80n();
			assert.equal(35, r1.de);

			cpu.pc=0xFFFF;
			r1.d=255;
			r1.e=255;
			cpu.executeZ80n();
			assert.equal(65025, r1.de);
		});


		test('ADD HL,A', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0xFFF0;
			r1.a=0xFF;
			setMem([0x0000, 0x31]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x00EF, r1.hl);
		});

		test('ADD DE,A', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.de=0xFFF0;
			r1.a=0xFF;
			setMem([0x0000, 0x32]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x00EF, r1.de);
		});

		test('ADD BC,A', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.bc=0xFFF0;
			r1.a=0xFF;
			setMem([0x0000, 0x33]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x00EF, r1.bc);
		});


		test('ADD HL,nn', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0xF000;
			setMem([0x0000, 0x34,
				0x0001, 0x34,
				0x0002, 0x12]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0003, cpu.pc);
			assert.equal(0x0234, r1.hl);
		});

		test('ADD DE,nn', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.de=0xF000;
			setMem([0x0000, 0x35,
				0x0001, 0x34,
				0x0002, 0x12]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0003, cpu.pc);
			assert.equal(0x0234, r1.de);
		});

		test('ADD BC,nn', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.bc=0xF000;
			setMem([0x0000, 0x36,
				0x0001, 0x34,
				0x0002, 0x12]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0003, cpu.pc);
			assert.equal(0x0234, r1.bc);
		});


		test('SWAPNIB', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.a=0xA5;
			setMem([0x0000, 0x23]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x5A, r1.a);
		});

		test('MIRROR', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.a=0b10000010;
			setMem([0x0000, 0x24]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0b01000001, r1.a);

			let val=0b1000_0000;
			let expected=0b0000_0001;
			for (let i=0; i<8; i++) {
				cpu.pc=0xFFFF;
				r1.a=val;
				cpu.executeZ80n();
				assert.equal(expected, r1.a);
				// Next
				val>>>=1;
				expected<<=1;
			}

			val=0b1111_1111_0111_1111;
			expected=0b1111_1110;
			for (let i=0; i<8; i++) {
				cpu.pc=0xFFFF;
				r1.a=val&0xFF;
				cpu.executeZ80n();
				assert.equal(expected, r1.a);
				// Next
				val>>>=1;
				expected<<=1;
				expected|=0b01;
				expected&=0xFF;
			}
		});


		test('PUSH nn', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.sp=0x8000;
			setMem([0x0000, 0x8A,
				0x0001, 0x12,
				0x0002, 0x34]);
			cpu.executeZ80n();

			assert.equal(23, cpu.tStates);
			assert.equal(0x0003, cpu.pc);
			assert.equal(0x7FFE, r1.sp);
			assert.equal(0x1234, mem.getMemory16(0x7FFE));

			cpu.pc=0x1000;
			r1.sp=0x0001;
			setMem([0x1001, 0x8A,
				0x1002, 0x12,
				0x1003, 0x34]);
			cpu.executeZ80n();

			assert.equal(0x1004, cpu.pc);
			assert.equal(0xFFFF, r1.sp);
			assert.equal(0x1234, mem.getMemory16(0xFFFF));
		});


		test('NEXTREG r,n', () => {
			const outRegSelect=0x243B;
			const outRegAccess=0x253B;
			let outSelectValue=0;
			let outAccessValue=0;
			cpu.io.registerOutPortFunction(outRegSelect, (port, value) => {
				if (port==outRegSelect)
					outSelectValue=value;
			});
			cpu.io.registerOutPortFunction(outRegAccess, (port, value) => {
				if (port==outRegAccess)
					outAccessValue=value;
			});

			cpu.tStates=0;
			cpu.pc=0xFFFF;
			setMem([0x0000, 0x91,
				0x0001, 0xAA,
				0x0002, 0x55]);
			cpu.executeZ80n();

			assert.equal(20, cpu.tStates);
			assert.equal(0x0003, cpu.pc);
			assert.equal(0xAA, outSelectValue);
			assert.equal(0x55, outAccessValue);
		});

		test('NEXTREG r,A', () => {
			const outRegSelect=0x243B;
			const outRegAccess=0x253B;
			let outSelectValue=0;
			let outAccessValue=0;
			cpu.io.registerOutPortFunction(outRegSelect, (port, value) => {
				if (port==outRegSelect)
					outSelectValue=value;
			});
			cpu.io.registerOutPortFunction(outRegAccess, (port, value) => {
				if (port==outRegAccess)
					outAccessValue=value;
			});

			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.a=0xF5;
			setMem([0x0000, 0x92,
				0x0001, 0xAA]);
			cpu.executeZ80n();

			assert.equal(17, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0xAA, outSelectValue);
			assert.equal(0xF5, outAccessValue);
		});


		test('PIXELDN', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.hl=0xFEFF;
			setMem([0x0000, 0x93]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0xFFFF, r1.hl);

			cpu.pc=0xFFFF;
			r1.hl=0xFF7F;
			cpu.executeZ80n();
			assert.equal(0xF87F+0x20, r1.hl);

			cpu.pc=0xFFFF;
			r1.hl=0xFFFF;
			cpu.executeZ80n();
			assert.equal(0x001F, r1.hl);
		});

		test('PIXELAD', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.de=0x0000;
			setMem([0x0000, 0x94]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x4000, r1.hl);

			cpu.pc=0xFFFF;
			r1.de=0xFFFF;
			cpu.executeZ80n();
			assert.equal(0x5F1F+0xE0, r1.hl);
			assert.equal(0xFFFF, r1.de);
		});

		test('SETAE', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.e=0x00;
			setMem([0x0000, 0x95]);
			cpu.executeZ80n();

			assert.equal(8, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0b1000_0000, r1.a);

			cpu.pc=0xFFFF;
			r1.e=0x01;
			cpu.executeZ80n();
			assert.equal(0b0100_0000, r1.a);

			cpu.pc=0xFFFF;
			r1.e=0x07;
			cpu.executeZ80n();
			assert.equal(0b0000_0001, r1.a);

			cpu.pc=0xFFFF;
			r1.e=0xFA;
			cpu.executeZ80n();
			assert.equal(0b0010_0000, r1.a);
		});


		test('TEST n', () => {
			cpu.tStates=0;
			cpu.pc=0xFFFF;
			r1.a=0xA5;
			r1.f=0x00;
			setMem([0x0000, 0x27,
				0x0001, 0xFF]);
			cpu.executeZ80n();

			assert.equal(11, cpu.tStates);
			assert.equal(0x0002, cpu.pc);
			assert.equal(0b1000_0000, r1.f);

			cpu.pc=0xFFFF;
			r1.a=0xA5;
			r1.f=0x00;
			setMem([0x0000, 0x27,
				0x0001, 0x5A]);
			cpu.executeZ80n();
			assert.equal(0b0100_0000, r1.f);

			cpu.pc=0xFFFF;
			r1.a=0x75;
			r1.f=0x00;
			setMem([0x0000, 0x27,
				0x0001, 0xFF]);
			cpu.executeZ80n();
			assert.equal(0b0000_0000, r1.f);
		});
	});

});

