
import * as assert from 'assert';
import {RemoteBase} from '../remotes/remotebase';
import {Settings} from '../settings';
import {Z80RegistersClass, Z80Registers, Z80RegistersStandardDecoder} from '../remotes/z80registers';
import {Opcodes, Opcode} from '../disassembler/opcode';


suite('RemoteBase', () => {

	setup(() => {
		// Initialize Settings
		const cfg: any={
			remoteType: 'zsim'
		};
		Settings.Init(cfg, '');
		Z80RegistersClass.createRegisters();
		Z80Registers.decoder=new Z80RegistersStandardDecoder();
		// Restore 'rst 8' opcode
		Opcodes[0xCF]=new Opcode(0xCF, "RST %s");
	});


	suite('calcStepBp', () => {

		class RemoteBaseMock extends RemoteBase {
			public pc: number;
			public sp: number;
			public hl: number;
			public ix: number;
			public iy: number;
			public pcMemory=new Uint8Array(4);
			public spMemory=new Uint16Array(1);
			public async getRegisters(): Promise<void> {
				const cache=Z80RegistersClass.getRegisterData(this.pc, this.sp, 0, 0, 0, this.hl, this.ix, this.iy, 0, 0, 0, 0, 0, 0, 0);
				Z80Registers.setCache(cache);

			}
			public async readMemoryDump(address: number, size: number): Promise<Uint8Array> {
				switch (address) {
					case this.pc: return this.pcMemory;
					case this.sp: return new Uint8Array(this.spMemory.buffer);
				}
				assert(false);
				return undefined as any;
			}
		}

		test('RET', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.sp=0xF000;
			remote.pcMemory[0]=0xC9;	// RET
			remote.spMemory[0]=0x1234;	// return address

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xC9, opcode.code);
			assert.equal(0x1234, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xC9, opcode.code);
			assert.equal(0x1234, bp1);
			assert.equal(undefined, bp2);
		});

		test('RET cc', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.sp=0xF000;
			remote.pcMemory[0]=0xC0;	// RET NZ
			remote.spMemory[0]=0x1234;	// return address

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xC0, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x1234, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepOver
			assert.equal(0xC0, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x1234, bp2);
		});

		test('CALL (cc) and step over', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCD;	// CALL

			let [opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xCD, opcode.code);
			assert.equal(0x8003, bp1);
			assert.equal(undefined, bp2);

			remote.pcMemory[0]=0xC4;	// CALL cc

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xC4, opcode.code);
			assert.equal(0x8003, bp1);
			assert.equal(undefined, bp2);
		});

		test('CALL (cc) and step into', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCD;	// CALL
			remote.pcMemory[1]=0x67;
			remote.pcMemory[2]=0x45;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xCD, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			remote.pcMemory[0]=0xC4;	// CALL cc
			[opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xC4, opcode.code);
			assert.equal(0x8003, bp1);
			assert.equal(0x4567, bp2);
		});

		test('RST (except 08) and step over', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xC7;	// RST 0

			let [opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xC7, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(undefined, bp2);
		});

		test('RST 08 and step over', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCF;	// RST 8

			let [opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xCF, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x8002, bp2);
		});

		test('ESXDOS RST 08 and step over', async () => {
			// Works the same as "RST 08 and step over"
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCF;	// RST 8

			let [opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xCF, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x8002, bp2);
		});

		test('RST (except 08) and step into', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xD7;	// RST 16

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xD7, opcode.code);
			assert.equal(0x0010, bp1);
			assert.equal(undefined, bp2);
		});

		test('RST 08 and step into', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCF;	// RST 8

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xCF, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x0008, bp2);
		});

		test('ESXDOS RST 08 and step into', async () => {
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
			Settings.launch.disassemblerArgs.esxdosRst=true;
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xCF;	// RST 8

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xCF, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x0008, bp2);
		});

		test('Unconditional branches (JP, JR)', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xC3;	// JP
			remote.pcMemory[1]=0x67;
			remote.pcMemory[2]=0x45;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xC3, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xC3, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			remote.pcMemory[0]=0x18;	// JR
			remote.pcMemory[1]=0x03;

			[opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0x18, opcode.code);
			assert.equal(0x8005, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0x18, opcode.code);
			assert.equal(0x8005, bp1);
			assert.equal(undefined, bp2);
		});

		test('Conditional branch JP cc', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xC2;	// JP Z
			remote.pcMemory[1]=0x67;
			remote.pcMemory[2]=0x45;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xC2, opcode.code);
			assert.equal(0x8003, bp1);
			assert.equal(0x4567, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xC2, opcode.code);
			assert.equal(0x8003, bp1);
			assert.equal(0x4567, bp2);
		});

		test('Conditional branch JR cc', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0x38;	// JR C
			remote.pcMemory[1]=0x05;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0x38, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8007, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0x38, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8007, bp2);
		});

		test('Conditional branch DJNZ', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0x10;	// DJNZ
			remote.pcMemory[1]=256-5;		// -5

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0x10, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x7FFD, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0x10, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x7FFD, bp2);
		});

		test('JP (HL)', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.hl=0x4567;
			remote.pcMemory[0]=0xE9;	// JP (HL)

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);
		});

		test('JP (IX)', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.ix=0x4567;
			remote.pcMemory[0]=0xDD;	// JP (IY)
			remote.pcMemory[1]=0xE9;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);
		});

		test('JP (IY)', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.iy=0x4567;
			remote.pcMemory[0]=0xFD;	// JP (IY)
			remote.pcMemory[1]=0xE9;

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xE9, opcode.code);
			assert.equal(0x4567, bp1);
			assert.equal(undefined, bp2);
		});

		test('LDIR/LDDR', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xED;	// LDIR
			remote.pcMemory[1]=0xB0;	// LDIR

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xB0, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8000, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xB0, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(undefined, bp2);

			remote.pcMemory[0]=0xED;	// LDDR
			remote.pcMemory[1]=0xB8;	// LDDR

			[opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xB8, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8000, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xB8, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(undefined, bp2);
		});

		test('CPIR/CPDR', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0xED;	// CPIR
			remote.pcMemory[1]=0xB1;	// CPIR

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xB1, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8000, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xB1, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(undefined, bp2);

			remote.pcMemory[0]=0xED;	// CPDR
			remote.pcMemory[1]=0xB9;	// CPDR

			[opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0xB9, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(0x8000, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0xB9, opcode.code);
			assert.equal(0x8002, bp1);
			assert.equal(undefined, bp2);
		});

		test('HALT', async () => {
			const remote=new RemoteBaseMock();
			const rem=remote as any;

			remote.pc=0x8000;
			remote.pcMemory[0]=0x76;	// HALT

			let [opcode, bp1, bp2]=await rem.calcStepBp(false);	// stepInto
			assert.equal(0x76, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(0x8000, bp2);

			[opcode, bp1, bp2]=await rem.calcStepBp(true);	// stepOver
			assert.equal(0x76, opcode.code);
			assert.equal(0x8001, bp1);
			assert.equal(undefined, bp2);
		});

	});

});
