
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
			r1.a=0x20;
			setMem([0x0000, 0xA4,
				r1.hl, 0x10,
				r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(16, cpu.tStates);
			assert.equal(0x0001, cpu.pc);
			assert.equal(0x1001, r1.hl);
			assert.equal(0x2001, r1.de);
			assert.equal(0x10, mem.read8(0x2000));

			// A equal, hl overflow
			cpu.pc=0x0000;
			r1.hl=0xFFFF;
			r1.de=0x1000;
			r1.a=0x20;
			setMem([cpu.pc+1, 0xA4,
			r1.hl, 0x11,
			r1.de, 0x00]);
			cpu.executeZ80n();

			assert.equal(0x0002, cpu.pc);
			assert.equal(0x0000, r1.hl);
			assert.equal(0x1001, r1.de);
			assert.equal(0x11, mem.read8(0x1000));

			// A equal, de overflow
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

	});

});

