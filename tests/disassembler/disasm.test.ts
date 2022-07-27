import * as assert from 'assert';
import {writeFileSync} from 'fs';
import {Disassembler} from '../../src/disassembler/disasm';
import {Format} from '../../src/disassembler/format';
import {MemAttribute} from '../../src/disassembler/memory';
import {NumberType} from '../../src/disassembler/numbertype';
import {Opcode} from '../../src/disassembler/opcode';
import {AsmNode} from './../../src/disassembler/asmnode';
import {DisassemblerNextGen} from './../../src/disassembler/disasmnextgen';



let dasm: any;


suite('Disassembler', () => {

	/// Strip all labels, comments from the assembly.
	function trimAllLines(lines: Array<string>): Array<string> {
		const lines2 = new Array<string>();
		for (let line of lines) {
			// remove comment
			const match = /(^\S*:|^([0-9a-f]{4})?\s+([^;:]*).*|^[^\s].*)/.exec(line);
			if (match)
				line = match[3] || '';
			line = line.trim();
			// compress multiple spaces into one
			line = line.replace(/\s\s+/g, ' ');
			// Remove empty lines (labels)
			if (line.length > 0)
				lines2.push(line);
		}
		return lines2;
	}


	/// Called for each test.
	setup(() => {
		dasm = new Disassembler() as any; 	// 'as any' allows access to protected methods

		dasm.labelSubPrefix = "SUB";
		dasm.labelLblPrefix = "LBL";
		dasm.labelDataLblPrefix = "DATA";
		dasm.labelLocalLabelPrefix = "_lbl";
		dasm.labelLoopPrefix = "_LOOP";
		dasm.labelSelfModifyingPrefix = "SELF_MOD";
		dasm.DBG_ADD_DEC_ADDRESS = false;

		dasm.clmnsAddress = 0;
		dasm.addOpcodeBytes = false;
		dasm.opcodesLowerCase = false;

		dasm.setSlotBankInfo(0, 0xFFFF, 0, true);
		dasm.setCurrentSlots([0]);
		dasm.initLabels();
	});

	//teardown();


	suite('General', () => {
		test('Constructor', () => {
			new Disassembler(); // NOSONAR
		});
	});


	suite('collectLabels', () => {

		test('0 labels', () => {
			dasm.on('warning', msg => {
				assert(false);	// no warning should occur
			});

			const memory = [
				0x3e, 0x01,			// LD a,1
				0x3e, 0x02,			// LD a,2
				0x3e, 0x03,			// LD a,3
				0xc9,				// ret
			];

			const org = 0x32;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			//dasm.setLabel(org); Do not set
			dasm.collectLabels(65536);
			assert.equal(dasm.labels.size, 0);
		});

		test('1 label', () => {
			dasm.on('warning', msg => {
				assert(false);	// no warning should occur
			});

			const memory = [
				0x3e, 0x01,			// LD a,1
				0x3e, 0x02,			// LD a,2
				0x3e, 0x03,			// LD a,3
				0xc9,				// ret
			];

			const org = 0x32;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);
			assert.equal(dasm.labels.size, 1);
			assert(dasm.labels.get(org) != undefined);
		});

		test('2 labels UNASSIGNED', () => {
			const memory = [
				0x3e, 0x01,			// LD a,1
				0xc3, 0x00, 0x40,	// JP 0x4000
			];

			const org = 0x1000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);

			assert.equal(dasm.labels.size, 2);

			const label1 = dasm.labels.get(org);
			assert(label1 != undefined);
			assert(!label1.isEqu);

			const label2 = dasm.labels.get(0x4000);
			assert(label2 != undefined);
			assert(label2.isEqu);
		});

		test('2 labels ASSIGNED', () => {
			const memory = [
				0x3e, 0x01,			// LD a,1
				// L1002:
				0xc3, 0x02, 0x10,	// JP 0x1002
			];

			const org = 0x1000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);

			assert.equal(dasm.labels.size, 2);

			const label1 = dasm.labels.get(org);
			assert(label1 != undefined);
			assert(!label1.isEqu);

			const label2 = dasm.labels.get(0x1002);
			assert(label2 != undefined);
			assert(!label2.isEqu);
		});

		test('label types', () => {
			const memory = [
/*4000*/					// START:
/*4000*/ 0x3e, 0x01,	    //     ld a,1
/*4002*/					// START2:
/*4002*/ 0x28, 0xfe,		//     jr z,START2
/*4004*/ 0xda, 0x02, 0x40,	// 	   jp c,START2
/*4007*/					// LBL1:
/*4007*/ 0x00,				//     nop
/*4008*/ 0x10, 0xfd,		//     djnz LBL1
/*400a*/					// LBL2:
/*400a*/ 0x30, 0xfe,		//     jr nc,LBL2
/*400c*/ 0xca, 0x02, 0x40,	// 	   jp z,START2
/*400f*/ 0x00,				//     nop
/*4010*/ 0xcd, 0x1a, 0x40,	// 	   call SUB1
/*4013*/ 0xc9,				//     ret
/*4014*/ 0x00,				//     nop
/*4015*/					// SUB2:
/*4015*/ 0x28, 0x01,		//     jr z,LBL3
/*4017*/ 0x00,				//     nop
/*4018*/					// LBL3:
/*4018*/ 0xc9,				//     ret
/*4019*/ 0x00,				//     nop
/*401a*/					// SUB1:
/*401a*/ 0x3a, 0x0a, 0x40,	//	   ld a,(LBL2)
/*401d*/ 0xc8,				//     ret z
/*401e*/ 0x0e, 0x02,		//     ld c,2
/*4020*/ 0x20, 0xf6,		//     jr nz,LBL3
/*4022*/ 0x06, 0x05,		//     ld b,5
/*4024*/ 0x21, 0x03, 0x00,	//     ld hl,3
/*4027*/ 0x32, 0x36, 0x40,	//     ld (DATA1),a
/*402a*/ 0x3a, 0x00, 0x50,	//     ld a,(0x5000)
/*402d*/ 0xca, 0x00, 0x51,	//     jp z,0x5100 ; Jump to unassigned memory is treated as a CALL
/*4030*/ 0xc9,				//     ret
/*4031*/ 0x00,				//     nop
/*4032*/					// LBL4:
/*4032*/ 0x00,				//     nop
/*4033*/ 0xc3, 0x32, 0x40,	//     jp LBL4
/*4036*/					// DATA1:
/*4036*/ 0x00				//     defb 0
			];

			const org = 0x4000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 9);

			let label;

			label = dasm.labels.get(0x4000);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LBL);
			assert(!label.isEqu);

			label = dasm.labels.get(0x4002);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LBL);
			assert(!label.isEqu);

			label = dasm.labels.get(0x4007);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LOCAL_LOOP);
			assert(!label.isEqu);

			label = dasm.labels.get(0x400a);
			assert(label != undefined);
			//assert.equal(label.type, NumberType.DATA_LBL); Depends on priority
			assert.equal(label.type, NumberType.CODE_LOCAL_LOOP);
			assert(!label.isEqu);

			label = dasm.labels.get(0x4018);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LOCAL_LOOP);
			assert(!label.isEqu);

			label = dasm.labels.get(0x401a);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_SUB);
			assert(!label.isEqu);

			label = dasm.labels.get(0x4036);
			assert(label != undefined);
			assert.equal(label.type, NumberType.DATA_LBL);
			assert(!label.isEqu);

			label = dasm.labels.get(0x5000);
			assert(label != undefined);
			assert.equal(label.type, NumberType.DATA_LBL);
			assert(label.isEqu);

			label = dasm.labels.get(0x5100);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_SUB);	// Jump to unassigned memory is treated as a CALL
			assert(label.isEqu);
		});

		test('self-modifying code', () => {
			// Note: Regex to exchange list-output with bytes:
			// find-pattern: ^([0-9a-f]+)\s+([0-9a-f]+)?\s+([0-9a-f]+)?\s+([0-9a-f]+)?\s?(.*)
			// subst-pattern: /*$1*/ 0x$2, 0x$3, 0x$4,\t// $5

			const memory = [
/*5000*/ 					// STARTA1:
/*5000*/ 0xc3, 0x00, 0x00,	// 	    jp 0x0000
/*5003*/ 					// STARTA2:
/*5003*/ 0x21, 0x00, 0x60,	// 	    ld hl,0x6000
/*5006*/ 0x22, 0x01, 0x50,	// 	    ld (STARTA1+1),hl
/*5009*/ 0xc9, 				// ret
			];

			const org = 0x5000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.setLabel(org + 3);
			dasm.collectLabels(65536);

			assert.equal(dasm.labels.size, 4);

			let label;

			label = dasm.labels.get(0x0000);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_SUB);
			assert(label.isEqu);

			label = dasm.labels.get(org);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LBL);
			assert(!label.isEqu);

			label = dasm.labels.get(org + 3);
			assert(label != undefined);
			assert.equal(label.type, NumberType.CODE_LBL);
			assert(!label.isEqu);

			// self.modifying label
			label = dasm.labels.get(org + 1);
			assert(label != undefined);
			assert.equal(label.type, NumberType.DATA_LBL);
			assert(!label.isEqu);
		});

	});


	suite('references', () => {

		test('count references', () => {
			const memory = [
/*8000*/ 					// DSTART:
/*8000*/ 0x00,				// 		nop
/*8001*/ 					// DCODE1:
/*8001*/ 0xca, 0x0e, 0x80,	// 	    jp z,DCODE2
/*8004*/ 0xcc, 0x0e, 0x80,	// 	    call z,DCODE2
/*8007*/ 0x10, 0xf8, 		// 		djnz DCODE1
/*8009*/ 0x3a, 0x01, 0x80,	// 	    ld a,(DCODE1)
/*800c*/ 0x18, 0x00, 		// 		jr DCODE2
/*800e*/ 					// DCODE2:
/*800e*/ 0xc9, 				// 		ret
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 3);

			let label;

			label = dasm.labels.get(0x8000);
			assert.equal(label.references.size, 0);

			label = dasm.labels.get(0x8001);
			assert.equal(label.references.size, 2);

			label = dasm.labels.get(0x800e);
			assert.equal(label.references.size, 3);

		});
	});


	suite('assignLabelNames', () => {

		test('addParentReferences', () => {
			const memory = [
/*6000*/ 					// BCODE_START:
/*6000*/ 0x3E, 16,	// LD A,16
/*6002*/ 0xC9,		// ret
			];

			dasm.labelSubPrefix = "BSUB";
			//dasm.labelLblPrefix = "BCODE";
			//dasm.labelDataLblPrefix = "BDATA";

			const org = 0x6000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);

			// Test:
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 1);

			let label;

			label = dasm.labels.get(0x6000);
			assert.equal(label.name, 'BSUB6000');
			assert(!label.isEqu);

			const addrParents = dasm.addressParents;
			assert(addrParents[org - 1] == undefined);
			assert.equal(addrParents[org], label);
			assert(addrParents[org + 1] == undefined);
			assert(addrParents[org + 2] == label);
			assert(addrParents[org + 3] == undefined);
		});


		test('addParentReferences 2', () => {
			const memory = [
/*+0*/ 					// BSUB1:
/*+0*/ 0xca, 0x07, 0x00,	// 	    jp z,BSUB2
/*+3*/ 0x3E, 16,			// 		LD A,16
/*+5*/ 0xC9,				// 		ret

/*+6*/ 					// BSUB2:
/*+6*/ 0x3E, 16,			// 		LD A,16
/*+8*/ 0xC9,				// 		ret

			];

			dasm.labelSubPrefix = "BSUB";
			//dasm.labelLblPrefix = "BCODE";
			//dasm.labelDataLblPrefix = "BDATA";

			const org = 0x0001;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);

			// Test:
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 2);

			const label1 = dasm.labels.get(org);
			assert.equal(label1.name, 'BSUB0001');
			assert(!label1.isEqu);

			const label2 = dasm.labels.get(org + 6);
			assert.equal(label2.name, 'BSUB0001._lbl1');
			assert(!label2.isEqu);
			assert.equal(label2.type, NumberType.CODE_LOCAL_LBL);

			const addrParents = dasm.addressParents;
			assert.equal(addrParents[org], label1);
			assert(addrParents[org + 1] == undefined);
			assert(addrParents[org + 2] == undefined);
			assert(addrParents[org + 3] == label1);
			assert(addrParents[org + 4] == undefined);
			assert(addrParents[org + 5] == label1);

			assert(addrParents[org + 6] == label1);
			assert(addrParents[org + 7] == undefined);
			assert(addrParents[org + 8] == label1);
			assert(addrParents[org + 9] == undefined);
		});


		test('findLocalLabels 1', () => {
			const memory = [
/*6000*/ 					// BCODE_START:
/*6000*/ 0xca, 0x03, 0x60,	// 	    jp z,BCODE2
/*6003*/ 					// BCODE2:
/*6003*/ 0xca, 0x06, 0x60,	// 	    jp z,BCODE3
/*6006*/ 					// BCODE3:
/*6006*/ 0xca, 0x09, 0x60,	// 	    jp z,BCODE4
/*6009*/ 					// BCODE4:
/*6009*/ 0x3a, 0x19, 0x60,	// 	    ld a,(BDATA1)
/*600c*/ 0x2a, 0x1a, 0x60,	// 	    ld hl,(BDATA2)
/*600f*/ 0x22, 0x1b, 0x60,	// 	    ld (BDATA3),hl
/*6012*/ 0xcd, 0x15, 0x60,	// 	    call BSUB1
/*6015*/ 					// BSUB1:
/*6015*/ 0xcd, 0x18, 0x60,	// 	    call BSUB2
/*6018*/ 					// BSUB2:
/*6018*/ 0xc9,				// 		ret
/*6019*/ 0x01,				// BDATA1: defb 1
/*601a*/ 0x02,				// BDATA2: defb 2
/*601b*/ 0x03,				// BDATA3: defb 3
			];

			dasm.labelSubPrefix = "BSUB";
			dasm.labelLblPrefix = "BCODE";
			dasm.labelDataLblPrefix = "BDATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";

			const org = 0x6000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.collectLabels(65536);

			// Test:
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 9);

			let label;

			label = dasm.labels.get(0x6000);
			assert.equal(label.name, 'BSUB6000');
			assert(!label.isEqu);

			label = dasm.labels.get(0x6003);
			assert.equal(label.name, 'BSUB6000._lbl1');
			assert(!label.isEqu);

			label = dasm.labels.get(0x6006);
			assert.equal(label.name, 'BSUB6000._lbl2');

			label = dasm.labels.get(0x6009);
			assert.equal(label.name, 'BSUB6000._lbl3');

			label = dasm.labels.get(0x6015);
			assert.equal(label.name, 'BSUB6000._lbl4');

			label = dasm.labels.get(0x6018);
			assert.equal(label.name, 'BSUB6000._lbl5');

			label = dasm.labels.get(0x6019);
			assert.equal(label.name, 'BDATA6019');

			label = dasm.labels.get(0x601a);
			assert.equal(label.name, 'BDATA601A');

			label = dasm.labels.get(0x601b);
			assert.equal(label.name, 'BDATA601B');
		});


		test('assignLabelNames relative', () => {
			const memory = [
/*7000*/ 					// CCODE_START:
/*7000*/ 0x28, 0x00,		// 		jr z,l1_rel1
/*7002*/ 					// l1_rel1:
/*7002*/ 0x28, 0x00,		// 		jr z,l1_rel2
/*7004*/ 					// l1_rel2:
/*7004*/ 0x00,				// 		nop
/*7005*/					// l1_loop1:
/*7005*/ 0x10, 0xfe,		// 		djnz l1_loop1
/*7007*/ 0xcd, 0x0b, 0x70,	// 	    call CSUB1
/*700a*/ 0xc9,				// 		ret
/*700b*/ 					// CSUB1:
/*700b*/ 0x28, 0x00,		// 		jr z,s1_rel1
/*700d*/ 					// s1_rel1:
/*700d*/ 0x28, 0x00,		// 		jr z,s1_rel2
/*700f*/ 					// s1_rel2:
/*700f*/ 0x00, 				// 		nop
/*7010*/ 					// s1_loop1:
/*7010*/ 0x10, 0xfe,		// 		djnz s1_loop1
/*7012*/ 					// s1_loop2:
/*7012*/ 0x10, 0xfe,		// 		djnz s1_loop2
/*7014*/ 0xc9,				// 		ret
/*7015*/ 0xcd, 0x0B, 0x70	// 		JP CSUB2

			];

			dasm.labelSubPrefix = "CSUB";
			dasm.labelLblPrefix = "CCODE";
			dasm.labelLocalLabelPrefix = "_l";
			dasm.labelLoopPrefix = "_loop";

			const org = 0x7000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.setLabel(0x7015);

			// Test:
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			//dasm.printLabels();

			assert.equal(dasm.labels.size, 10);

			let label;

			label = dasm.labels.get(0x7000);
			assert.equal(label.name, 'CSUB7000');
			assert(!label.isEqu);

			label = dasm.labels.get(0x7002);
			assert.equal(label.name, 'CSUB7000._l1');
			assert(!label.isEqu);

			label = dasm.labels.get(0x7004);
			assert.equal(label.name, 'CSUB7000._l2');
			assert(!label.isEqu);

			label = dasm.labels.get(0x7005);
			assert.equal(label.name, 'CSUB7000._loop');

			label = dasm.labels.get(0x700B);
			assert.equal(label.name, 'CSUB700B');

			label = dasm.labels.get(0x700d);
			assert.equal(label.name, 'CSUB700B._l1');

			label = dasm.labels.get(0x700f);
			assert.equal(label.name, 'CSUB700B._l2');

			label = dasm.labels.get(0x7010);
			assert.equal(label.name, 'CSUB700B._loop1');

			label = dasm.labels.get(0x7012);
			assert.equal(label.name, 'CSUB700B._loop2');

			label = dasm.labels.get(0x7015);
			assert.equal(label.name, 'CCODE7015');
		});
	});


	suite('disassemble', () => {

		/**
		 * Function to test disassembly of a memory area.
		 * Convenience function used by other tests.
		 * @param combined: An array of numbers (opcodes) and strings
		 * (the mnemonics).
		 * @param org The origin. Defaults to 0000h.
		 * @returns The disassembly is compared against the mnemonics.
		 * On a mismatch an error string is returned.
		 * On success undefined is returned.
		 */
		function checkDisassembly(combined: Array<number|string>, org = 0): string|undefined {
			// Convert into memory and expected strings
			const memory: number[] = [];
			const expected: string[] = [];
			for (const value of combined) {
				switch (typeof value) {
					case 'number': memory.push(value); break;
					case 'string': expected.push(value); break;
					default: assert(false, 'Cannot convert type into number or string.');
				}
			}

			// Disassemble
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.disassemble(65536);
			const linesUntrimmed = dasm.disassembledLines;

			const lines = trimAllLines(linesUntrimmed);
			//console.log(lines.join('\n'));

			// Not required for the testcase itself, but helpful debugging the testcase:
			const mainLabels = dasm.getMainLabels();
			console.log(mainLabels);

			const orgString = 'ORG ' + Format.getConversionForAddress(org);
			if (lines[0] != orgString)
				return "Origin wrong: '" + lines[0] + "'";
			lines.shift();
			const len = expected.length;
			for (let i = 0; i < len; i++) {
				if (expected[i] == "")
					continue;	// Skip if nothing expected (used for filler jumps)
				if (lines[i] != expected[i]) {
					const error = 'Index=' + i + ': ' + lines[i] + ' != ' + expected[i];
					console.log('Error: ' + error);
					return error;
				}
			}
			if (lines.length != len)
				return 'Disassembled length does not match expected length.';

			// Everything fine
			return undefined;
		}


		test('main instructions', () => {
			dasm.labelLocalLabelPrefix = '_lbl';
			dasm.labelLoopPrefix = '_loop';
			const combined = [
				0x00, "NOP",
				0x01, 0x12, 0x34, "LD BC,3412h",
				0x02, "LD (BC),A",
				0x03, "INC BC",
				0x04, "INC B",
				0x05, "DEC B",
				0x06, 0x0A, "LD B,0Ah",
				0x07, "RLCA",
				0x08, "EX AF,AF'",
				0x09, "ADD HL,BC",
				0x0A, "LD A,(BC)",
				0x0B, "DEC BC",
				0x0C, "INC C",
				0x0D, "DEC C",
				0x0E, 0x0A, "LD C,0Ah",
				0x0F, "RRCA",
				0x10, 0xFD, "DJNZ ._loop",
				0x11, 0x12, 0x34, "LD DE,3412h",
				0x12, "LD (DE),A",
				0x13, "INC DE",
				0x14, "INC D",
				0x15, "DEC D",
				0x16, 0x0A, "LD D,0Ah",
				0x17, "RLA",
				0x18, 0x00, "JR ._lbl1",
				0x19, "ADD HL,DE",
				0x1A, "LD A,(DE)",
				0x1B, "DEC DE",
				0x1C, "INC E",
				0x1D, "DEC E",
				0x1E, 0x0A, "LD E,0Ah",
				0x1F, "RRA",
				0x20, 0x03, "JR NZ,._lbl2",
				0x21, 0x12, 0x34, "LD HL,3412h",
				0x22, 0x12, 0x34, "LD (DATA3412),HL",
				0x23, "INC HL",
				0x24, "INC H",
				0x25, "DEC H",
				0x26, 0x0A, "LD H,0Ah",
				0x27, "DAA",
				0x28, 0x01, "JR Z,._lbl3",
				0x29, "ADD HL,HL",
				0x2A, 0x12, 0x34, "LD HL,(DATA3412)",
				0x2B, "DEC HL",
				0x2C, "INC L",
				0x2D, "DEC L",
				0x2E, 0x0A, "LD L,0Ah",
				0x2F, "CPL",
				0x30, 0x03, "JR NC,._lbl4",
				0x31, 0x12, 0x34, "LD SP,DATA3412",
				0x32, 0x12, 0x34, "LD (DATA3412),A",
				0x33, "INC SP",
				0x34, "INC (HL)",
				0x35, "DEC (HL)",
				0x36, 0x0A, "LD (HL),0Ah",
				0x37, "SCF",
				0x38, 0x01, "JR C,._lbl5",
				0x39, "ADD HL,SP",
				0x3A, 0x12, 0x34, "LD A,(DATA3412)",
				0x3B, "DEC SP",
				0x3C, "INC A",
				0x3D, "DEC A",
				0x3E, 0x0A, "LD A,0Ah",
				0x3F, "CCF",
				0x40, "LD B,B",
				0x41, "LD B,C",
				0x42, "LD B,D",
				0x43, "LD B,E",
				0x44, "LD B,H",
				0x45, "LD B,L",
				0x46, "LD B,(HL)",
				0x47, "LD B,A",
				0x48, "LD C,B",
				0x49, "LD C,C",
				0x4A, "LD C,D",
				0x4B, "LD C,E",
				0x4C, "LD C,H",
				0x4D, "LD C,L",
				0x4E, "LD C,(HL)",
				0x4F, "LD C,A",
				0x50, "LD D,B",
				0x51, "LD D,C",
				0x52, "LD D,D",
				0x53, "LD D,E",
				0x54, "LD D,H",
				0x55, "LD D,L",
				0x56, "LD D,(HL)",
				0x57, "LD D,A",
				0x58, "LD E,B",
				0x59, "LD E,C",
				0x5A, "LD E,D",
				0x5B, "LD E,E",
				0x5C, "LD E,H",
				0x5D, "LD E,L",
				0x5E, "LD E,(HL)",
				0x5F, "LD E,A",
				0x60, "LD H,B",
				0x61, "LD H,C",
				0x62, "LD H,D",
				0x63, "LD H,E",
				0x64, "LD H,H",
				0x65, "LD H,L",
				0x66, "LD H,(HL)",
				0x67, "LD H,A",
				0x68, "LD L,B",
				0x69, "LD L,C",
				0x6A, "LD L,D",
				0x6B, "LD L,E",
				0x6C, "LD L,H",
				0x6D, "LD L,L",
				0x6E, "LD L,(HL)",
				0x6F, "LD L,A",
				0x70, "LD (HL),B",
				0x71, "LD (HL),C",
				0x72, "LD (HL),D",
				0x73, "LD (HL),E",
				0x74, "LD (HL),H",
				0x75, "LD (HL),L",
				0x76, "HALT",
				0x77, "LD (HL),A",
				0x78, "LD A,B",
				0x79, "LD A,C",
				0x7A, "LD A,D",
				0x7B, "LD A,E",
				0x7C, "LD A,H",
				0x7D, "LD A,L",
				0x7E, "LD A,(HL)",
				0x7F, "LD A,A",
				0x80, "ADD A,B",
				0x81, "ADD A,C",
				0x82, "ADD A,D",
				0x83, "ADD A,E",
				0x84, "ADD A,H",
				0x85, "ADD A,L",
				0x86, "ADD A,(HL)",
				0x87, "ADD A,A",
				0x88, "ADC A,B",
				0x89, "ADC A,C",
				0x8A, "ADC A,D",
				0x8B, "ADC A,E",
				0x8C, "ADC A,H",
				0x8D, "ADC A,L",
				0x8E, "ADC A,(HL)",
				0x8F, "ADC A,A",
				0x90, "SUB B",
				0x91, "SUB C",
				0x92, "SUB D",
				0x93, "SUB E",
				0x94, "SUB H",
				0x95, "SUB L",
				0x96, "SUB (HL)",
				0x97, "SUB A",
				0x98, "SBC A,B",
				0x99, "SBC A,C",
				0x9A, "SBC A,D",
				0x9B, "SBC A,E",
				0x9C, "SBC A,H",
				0x9D, "SBC A,L",
				0x9E, "SBC A,(HL)",
				0x9F, "SBC A,A",
				0xA0, "AND B",
				0xA1, "AND C",
				0xA2, "AND D",
				0xA3, "AND E",
				0xA4, "AND H",
				0xA5, "AND L",
				0xA6, "AND (HL)",
				0xA7, "AND A",
				0xA8, "XOR B",
				0xA9, "XOR C",
				0xAA, "XOR D",
				0xAB, "XOR E",
				0xAC, "XOR H",
				0xAD, "XOR L",
				0xAE, "XOR (HL)",
				0xAF, "XOR A",
				0xB0, "OR B",
				0xB1, "OR C",
				0xB2, "OR D",
				0xB3, "OR E",
				0xB4, "OR H",
				0xB5, "OR L",
				0xB6, "OR (HL)",
				0xB7, "OR A",
				0xB8, "CP B",
				0xB9, "CP C",
				0xBA, "CP D",
				0xBB, "CP E",
				0xBC, "CP H",
				0xBD, "CP L",
				0xBE, "CP (HL)",
				0xBF, "CP A",
				0xC0, "RET NZ",
				0xC1, "POP BC",
				0xC2, 0xE6, 0x10, "JP NZ,._lbl6",
				0xC3, 0xEF, 0x10, "JP ._lbl7",
/* 10E6h */		0xC4, 0x04, 0x10, "CALL NZ,SUB1004",
				0xC5, "PUSH BC",
				0xC6, 0x0A, "ADD A,0Ah",
				0xC7, "RST 00h",
				0xC8, "RET Z",
				0xC9, "RET",
/* 10EFh */		0xCA, 0x04, 0x10, "JP Z,SUB1004",
				0xCC, 0x04, 0x10, "CALL Z,SUB1004",
				0xCD, 0x04, 0x10, "CALL SUB1004",
				0xCE, 0x0A, "ADC A,0Ah",
				0xCF, "RST 08h",
				0xD0, "RET NC",
				0xD1, "POP DE",
				0xD2, 0x04, 0x10, "JP NC,SUB1004",
				0xD3, 0x0A, "OUT (000Ah),A",
				0xD4, 0x04, 0x10, "CALL NC,SUB1004",
				0xD5, "PUSH DE",
				0xD6, 0x0A, "SUB 0Ah",
				0xD7, "RST 10h",
				0xD8, "RET C",
				0xD9, "EXX",
				0xDA, 0x04, 0x10, "JP C,SUB1004",
				0xDB, 0x0A, "IN A,(000Ah)",
				0xDC, 0x04, 0x10, "CALL C,SUB1004",
				0xDE, 0x0A, "SBC A,0Ah",
				0xDF, "RST 18h",
				0xE0, "RET PO",
				0xE1, "POP HL",
				0xE2, 0x04, 0x10, "JP PO,SUB1004",
				0xE3, "EX (SP),HL",
				0xE4, 0x25, 0x11, "CALL PO,SUB1125",
				0xE5, "PUSH HL",
				0xE6, 0x0A, "AND 0Ah",
				0xE7, "RST 20h",
				0xE8, "RET PE",
				0xE9, "JP (HL)",
/* 1125h */		0xEA, 0x04, 0x10, "JP PE,SUB1004",
				0xEB, "EX DE,HL",
				0xEC, 0x04, 0x10, "CALL PE,SUB1004",
				0xEE, 0x0A, "XOR 0Ah",
				0xEF, "RST 28h",
				0xF0, "RET P",
				0xF1, "POP AF",
				0xF2, 0x04, 0x10, "JP P,SUB1004",
				0xF3, "DI",
				0xF4, 0x04, 0x10, "CALL P,SUB1004",
				0xF5, "PUSH AF",
				0xF6, 0x0A, "OR 0Ah",
				0xF7, "RST 30h",
				0xF8, "RET M",
				0xF9, "LD SP,HL",
				0xFA, 0x04, 0x10, "JP M,SUB1004",
				0xFB, "EI",
				0xFC, 0x04, 0x10, "CALL M,SUB1004",
				0xFE, 0x0A, "CP 0Ah",
				0xFF, "RST 38h"
			];
			const org = 0x1000;
			const error = checkDisassembly(combined, org);
			assert.equal(error, undefined, error);
		});


		test('ED (extended instructions)', () => {
			const combined = [
				0xED, 0x00, "INVALID INSTRUCTION",
				0xED, 0x01, "INVALID INSTRUCTION",
				0xED, 0x02, "INVALID INSTRUCTION",
				0xED, 0x03, "INVALID INSTRUCTION",
				0xED, 0x04, "INVALID INSTRUCTION",
				0xED, 0x05, "INVALID INSTRUCTION",
				0xED, 0x06, "INVALID INSTRUCTION",
				0xED, 0x07, "INVALID INSTRUCTION",
				0xED, 0x08, "INVALID INSTRUCTION",
				0xED, 0x09, "INVALID INSTRUCTION",
				0xED, 0x0A, "INVALID INSTRUCTION",
				0xED, 0x0B, "INVALID INSTRUCTION",
				0xED, 0x0C, "INVALID INSTRUCTION",
				0xED, 0x0D, "INVALID INSTRUCTION",
				0xED, 0x0E, "INVALID INSTRUCTION",
				0xED, 0x0F, "INVALID INSTRUCTION",
				0xED, 0x10, "INVALID INSTRUCTION",
				0xED, 0x11, "INVALID INSTRUCTION",
				0xED, 0x12, "INVALID INSTRUCTION",
				0xED, 0x13, "INVALID INSTRUCTION",
				0xED, 0x14, "INVALID INSTRUCTION",
				0xED, 0x15, "INVALID INSTRUCTION",
				0xED, 0x16, "INVALID INSTRUCTION",
				0xED, 0x17, "INVALID INSTRUCTION",
				0xED, 0x18, "INVALID INSTRUCTION",
				0xED, 0x19, "INVALID INSTRUCTION",
				0xED, 0x1A, "INVALID INSTRUCTION",
				0xED, 0x1B, "INVALID INSTRUCTION",
				0xED, 0x1C, "INVALID INSTRUCTION",
				0xED, 0x1D, "INVALID INSTRUCTION",
				0xED, 0x1E, "INVALID INSTRUCTION",
				0xED, 0x1F, "INVALID INSTRUCTION",
				0xED, 0x20, "INVALID INSTRUCTION",
				0xED, 0x21, "INVALID INSTRUCTION",
				0xED, 0x22, "INVALID INSTRUCTION",

				//0xED, 0x23, "SWAPNIB",     // ZX Spectrum Next
				//0xED, 0x24, "MIRROR",     // ZX Spectrum Next
				//0xED, 0x00, "INVALID INSTRUCTION",
				//0xED, 0x27, 0x0B, "TEST 0Bh",     // ZX Spectrum Next

				//0xED, 0x28, "BSLA DE,B",     // ZX Spectrum Next
				//0xED, 0x29, "BSRA DE,B",     // ZX Spectrum Next
				//0xED, 0x2A, "BSRL DE,B",     // ZX Spectrum Next
				//0xED, 0x2B, "BSRF DE,B",     // ZX Spectrum Next
				//0xED, 0x2C, "BRLC DE,B",     // ZX Spectrum Next

				0xED, 0x2D, "INVALID INSTRUCTION",
				0xED, 0x2E, "INVALID INSTRUCTION",
				0xED, 0x2F, "INVALID INSTRUCTION",

				//0xED, 0x30, "MUL D,E",     // ZX Spectrum Next
				//0xED, 0x31, "ADD HL,A",     // ZX Spectrum Next
				//0xED, 0x32, "ADD DE,A",     // ZX Spectrum Next
				//0xED, 0x33, "ADD BC,A",     // ZX Spectrum Next
				//0xED, 0x34, 0x12, 0x34, "ADD HL,3421h",     // ZX Spectrum Next
				//0xED, 0x35, 0x12, 0x34, "ADD DE,3421h",     // ZX Spectrum Next
				//0xED, 0x36, 0x12, 0x34, "ADD BC,3421h",     // ZX Spectrum Next

				0xED, 0x37, "INVALID INSTRUCTION",
				0xED, 0x38, "INVALID INSTRUCTION",
				0xED, 0x39, "INVALID INSTRUCTION",
				0xED, 0x3A, "INVALID INSTRUCTION",
				0xED, 0x3B, "INVALID INSTRUCTION",
				0xED, 0x3C, "INVALID INSTRUCTION",
				0xED, 0x3D, "INVALID INSTRUCTION",
				0xED, 0x3E, "INVALID INSTRUCTION",
				0xED, 0x3F, "INVALID INSTRUCTION",

				0xED, 0x40, "IN B,(C)",
				0xED, 0x41, "OUT (C),B",
				0xED, 0x42, "SBC HL,BC",
				0xED, 0x43, 0x12, 0x34, "LD (DATA3412),BC",
				0xED, 0x44, "NEG",

				0x28, 0x02, "",	//  To overcome next disassembly stopping instruction
				0xED, 0x45, "RETN",

				0xED, 0x46, "IM 0",
				0xED, 0x47, "LD I,A",
				0xED, 0x48, "IN C,(C)",
				0xED, 0x49, "OUT (C),C",
				0xED, 0x4A, "ADC HL,BC",
				0xED, 0x4B, 0x12, 0x34, "LD BC,(DATA3412)",
				0xED, 0x4C, "[neg]",

				0x28, 0x02, "",	//  To overcome next disassembly stopping instruction
				0xED, 0x4D, "RETI",

				0xED, 0x4E, "[im0]",
				0xED, 0x4F, "LD R,A",
				0xED, 0x50, "IN D,(C)",
				0xED, 0x51, "OUT (C),D",
				0xED, 0x52, "SBC HL,DE",
				0xED, 0x53, 0x12, 0x34, "LD (DATA3412),DE",
				0xED, 0x54, "[neg]",
				0xED, 0x55, "[retn]",
				0xED, 0x56, "IM 1",
				0xED, 0x57, "LD A,I",
				0xED, 0x58, "IN E,(C)",
				0xED, 0x59, "OUT (C),E",
				0xED, 0x5A, "ADC HL,DE",
				0xED, 0x5B, 0x12, 0x34, "LD DE,(DATA3412)",
				0xED, 0x5C, "[neg]",
				0xED, 0x5D, "[reti]",
				0xED, 0x5E, "IM 2",
				0xED, 0x5F, "LD A,R",
				0xED, 0x60, "IN H,(C)",
				0xED, 0x61, "OUT (C),H",
				0xED, 0x62, "SBC HL,HL",
				0xED, 0x63, 0x12, 0x34, "LD (DATA3412),HL",
				0xED, 0x64, "[neg]",
				0xED, 0x65, "[retn]",
				0xED, 0x66, "[im0]",
				0xED, 0x67, "RRD",
				0xED, 0x68, "IN L,(C)",
				0xED, 0x69, "OUT (C),L",
				0xED, 0x6A, "ADC HL,HL",
				0xED, 0x6B, 0x12, 0x34, "LD HL,(DATA3412)",
				0xED, 0x6C, "[neg]",
				0xED, 0x6D, "[reti]",
				0xED, 0x6E, "[im0]",
				0xED, 0x6F, "RLD",
				0xED, 0x70, "IN F,(C)",
				0xED, 0x71, "OUT (C),F",
				0xED, 0x72, "SBC HL,SP",
				0xED, 0x73, 0x12, 0x34, "LD (DATA3412),SP",
				0xED, 0x74, "[neg]",
				0xED, 0x75, "[retn]",
				0xED, 0x76, "[im1]",
				0xED, 0x77, "[ld i,i?]",
				0xED, 0x78, "IN A,(C)",
				0xED, 0x79, "OUT (C),A",
				0xED, 0x7A, "ADC HL,SP",
				0xED, 0x7B, 0x12, 0x34, "LD SP,(DATA3412)",
				0xED, 0x7C, "[neg]",
				0xED, 0x7D, "[reti]",
				0xED, 0x7E, "[im2]",
				0xED, 0x7F, "[ld r,r?]",

				0xED, 0x80, "INVALID INSTRUCTION",
				0xED, 0x81, "INVALID INSTRUCTION",
				0xED, 0x82, "INVALID INSTRUCTION",
				0xED, 0x83, "INVALID INSTRUCTION",
				0xED, 0x84, "INVALID INSTRUCTION",
				0xED, 0x85, "INVALID INSTRUCTION",
				0xED, 0x86, "INVALID INSTRUCTION",
				0xED, 0x87, "INVALID INSTRUCTION",
				0xED, 0x88, "INVALID INSTRUCTION",
				0xED, 0x89, "INVALID INSTRUCTION",

				//0xED, 0x8A, 0x12, 0x34, "PUSH 3421h",     // ZX Spectrum Next

				0xED, 0x8B, "INVALID INSTRUCTION",
				0xED, 0x8C, "INVALID INSTRUCTION",
				0xED, 0x8D, "INVALID INSTRUCTION",
				0xED, 0x8E, "INVALID INSTRUCTION",
				0xED, 0x8F, "INVALID INSTRUCTION",
				0xED, 0x90, "INVALID INSTRUCTION",

				//0xED, 0x91, 0x05, 0x06, "NEXTREG #n,#n",     // ZX Spectrum Next
				//0xED, 0x92, 0x05, "NEXTREG #n,A",     // ZX Spectrum Next
				//0xED, 0x93, "PIXELDN",     // ZX Spectrum Next
				//0xED, 0x94, "PIXELAD",     // ZX Spectrum Next
				//0xED, 0x95, "SETAE",     // ZX Spectrum Next

				0xED, 0x96, "INVALID INSTRUCTION",
				0xED, 0x97, "INVALID INSTRUCTION",

				//0xED, 0x98, "JP (C)",     // ZX Spectrum Next

				0xED, 0x99, "INVALID INSTRUCTION",
				0xED, 0x9A, "INVALID INSTRUCTION",
				0xED, 0x9B, "INVALID INSTRUCTION",
				0xED, 0x9C, "INVALID INSTRUCTION",
				0xED, 0x9D, "INVALID INSTRUCTION",
				0xED, 0x9E, "INVALID INSTRUCTION",
				0xED, 0x9F, "INVALID INSTRUCTION",

				0xED, 0xA0, "LDI",
				0xED, 0xA1, "CPI",
				0xED, 0xA2, "INI",
				0xED, 0xA3, "OUTI",

				//0xED, 0xA4, "LDIX",     // ZX Spectrum Next
				//0xED, 0xA5, "LDWS",     // ZX Spectrum Next

				0xED, 0xA6, "INVALID INSTRUCTION",
				0xED, 0xA7, "INVALID INSTRUCTION",

				0xED, 0xA8, "LDD",
				0xED, 0xA9, "CPD",
				0xED, 0xAA, "IND",
				0xED, 0xAB, "OUTD",

				//0xED, 0xAC, "LDDX",     // ZX Spectrum Next

				0xED, 0xAD, "INVALID INSTRUCTION",
				0xED, 0xAE, "INVALID INSTRUCTION",
				0xED, 0xAF, "INVALID INSTRUCTION",

				0xED, 0xB0, "LDIR",
				0xED, 0xB1, "CPIR",
				0xED, 0xB2, "INIR",
				0xED, 0xB3, "OUTIR",

				//0xED, 0xB4, "LDIRX",     // ZX Spectrum Next

				0xED, 0xB5, "INVALID INSTRUCTION",

				//0xED, 0xB6, "LDIRSCALE",     // ZX Spectrum Next
				//0xED, 0xB7, "LDPIRX",     // ZX Spectrum Next

				0xED, 0xB8, "LDDR",
				0xED, 0xB9, "CPDR",
				0xED, 0xBA, "INDR",
				0xED, 0xBB, "OUTDR",

				//0xED, 0xBC, "LDDRX",     // ZX Spectrum Next

				0xED, 0xBD, "INVALID INSTRUCTION",
				0xED, 0xBE, "INVALID INSTRUCTION",
				0xED, 0xBF, "INVALID INSTRUCTION",

				0xED, 0xC0, "INVALID INSTRUCTION",
				0xED, 0xC1, "INVALID INSTRUCTION",
				0xED, 0xC2, "INVALID INSTRUCTION",
				0xED, 0xC3, "INVALID INSTRUCTION",
				0xED, 0xC4, "INVALID INSTRUCTION",
				0xED, 0xC5, "INVALID INSTRUCTION",
				0xED, 0xC6, "INVALID INSTRUCTION",
				0xED, 0xC7, "INVALID INSTRUCTION",
				0xED, 0xC8, "INVALID INSTRUCTION",
				0xED, 0xC9, "INVALID INSTRUCTION",
				0xED, 0xCA, "INVALID INSTRUCTION",
				0xED, 0xCB, "INVALID INSTRUCTION",
				0xED, 0xCC, "INVALID INSTRUCTION",
				0xED, 0xCD, "INVALID INSTRUCTION",
				0xED, 0xCE, "INVALID INSTRUCTION",
				0xED, 0xCF, "INVALID INSTRUCTION",

				0xED, 0xD0, "INVALID INSTRUCTION",
				0xED, 0xD1, "INVALID INSTRUCTION",
				0xED, 0xD2, "INVALID INSTRUCTION",
				0xED, 0xD3, "INVALID INSTRUCTION",
				0xED, 0xD4, "INVALID INSTRUCTION",
				0xED, 0xD5, "INVALID INSTRUCTION",
				0xED, 0xD6, "INVALID INSTRUCTION",
				0xED, 0xD7, "INVALID INSTRUCTION",
				0xED, 0xD8, "INVALID INSTRUCTION",
				0xED, 0xD9, "INVALID INSTRUCTION",
				0xED, 0xDA, "INVALID INSTRUCTION",
				0xED, 0xDB, "INVALID INSTRUCTION",
				0xED, 0xDC, "INVALID INSTRUCTION",
				0xED, 0xDD, "INVALID INSTRUCTION",
				0xED, 0xDE, "INVALID INSTRUCTION",
				0xED, 0xDF, "INVALID INSTRUCTION",

				0xED, 0xE0, "INVALID INSTRUCTION",
				0xED, 0xE1, "INVALID INSTRUCTION",
				0xED, 0xE2, "INVALID INSTRUCTION",
				0xED, 0xE3, "INVALID INSTRUCTION",
				0xED, 0xE4, "INVALID INSTRUCTION",
				0xED, 0xE5, "INVALID INSTRUCTION",
				0xED, 0xE6, "INVALID INSTRUCTION",
				0xED, 0xE7, "INVALID INSTRUCTION",
				0xED, 0xE8, "INVALID INSTRUCTION",
				0xED, 0xE9, "INVALID INSTRUCTION",
				0xED, 0xEA, "INVALID INSTRUCTION",
				0xED, 0xEB, "INVALID INSTRUCTION",
				0xED, 0xEC, "INVALID INSTRUCTION",
				0xED, 0xED, "INVALID INSTRUCTION",
				0xED, 0xEE, "INVALID INSTRUCTION",
				0xED, 0xEF, "INVALID INSTRUCTION",

				0xED, 0xF0, "INVALID INSTRUCTION",
				0xED, 0xF1, "INVALID INSTRUCTION",
				0xED, 0xF2, "INVALID INSTRUCTION",
				0xED, 0xF3, "INVALID INSTRUCTION",
				0xED, 0xF4, "INVALID INSTRUCTION",
				0xED, 0xF5, "INVALID INSTRUCTION",
				0xED, 0xF6, "INVALID INSTRUCTION",
				0xED, 0xF7, "INVALID INSTRUCTION",
				0xED, 0xF8, "INVALID INSTRUCTION",
				0xED, 0xF9, "INVALID INSTRUCTION",
				0xED, 0xFA, "INVALID INSTRUCTION",
				0xED, 0xFB, "INVALID INSTRUCTION",
				0xED, 0xFC, "INVALID INSTRUCTION",
				0xED, 0xFD, "INVALID INSTRUCTION",
				0xED, 0xFE, "INVALID INSTRUCTION",
				0xED, 0xFF, "INVALID INSTRUCTION",
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('CB (bit instructions)', () => {
			const combined = [
				0xCB, 0x00, "RLC B",
				0xCB, 0x01, "RLC C",
				0xCB, 0x02, "RLC D",
				0xCB, 0x03, "RLC E",
				0xCB, 0x04, "RLC H",
				0xCB, 0x05, "RLC L",
				0xCB, 0x06, "RLC (HL)",
				0xCB, 0x07, "RLC A",
				0xCB, 0x08, "RRC B",
				0xCB, 0x09, "RRC C",
				0xCB, 0x0A, "RRC D",
				0xCB, 0x0B, "RRC E",
				0xCB, 0x0C, "RRC H",
				0xCB, 0x0D, "RRC L",
				0xCB, 0x0E, "RRC (HL)",
				0xCB, 0x0F, "RRC A",
				0xCB, 0x10, "RL B",
				0xCB, 0x11, "RL C",
				0xCB, 0x12, "RL D",
				0xCB, 0x13, "RL E",
				0xCB, 0x14, "RL H",
				0xCB, 0x15, "RL L",
				0xCB, 0x16, "RL (HL)",
				0xCB, 0x17, "RL A",
				0xCB, 0x18, "RR B",
				0xCB, 0x19, "RR C",
				0xCB, 0x1A, "RR D",
				0xCB, 0x1B, "RR E",
				0xCB, 0x1C, "RR H",
				0xCB, 0x1D, "RR L",
				0xCB, 0x1E, "RR (HL)",
				0xCB, 0x1F, "RR A",
				0xCB, 0x20, "SLA B",
				0xCB, 0x21, "SLA C",
				0xCB, 0x22, "SLA D",
				0xCB, 0x23, "SLA E",
				0xCB, 0x24, "SLA H",
				0xCB, 0x25, "SLA L",
				0xCB, 0x26, "SLA (HL)",
				0xCB, 0x27, "SLA A",
				0xCB, 0x28, "SRA B",
				0xCB, 0x29, "SRA C",
				0xCB, 0x2A, "SRA D",
				0xCB, 0x2B, "SRA E",
				0xCB, 0x2C, "SRA H",
				0xCB, 0x2D, "SRA L",
				0xCB, 0x2E, "SRA (HL)",
				0xCB, 0x2F, "SRA A",
				0xCB, 0x30, "SLL B",
				0xCB, 0x31, "SLL C",
				0xCB, 0x32, "SLL D",
				0xCB, 0x33, "SLL E",
				0xCB, 0x34, "SLL H",
				0xCB, 0x35, "SLL L",
				0xCB, 0x36, "SLL (HL)",
				0xCB, 0x37, "SLL A",
				0xCB, 0x38, "SRL B",
				0xCB, 0x39, "SRL C",
				0xCB, 0x3A, "SRL D",
				0xCB, 0x3B, "SRL E",
				0xCB, 0x3C, "SRL H",
				0xCB, 0x3D, "SRL L",
				0xCB, 0x3E, "SRL (HL)",
				0xCB, 0x3F, "SRL A",
				0xCB, 0x40, "BIT 0,B",
				0xCB, 0x41, "BIT 0,C",
				0xCB, 0x42, "BIT 0,D",
				0xCB, 0x43, "BIT 0,E",
				0xCB, 0x44, "BIT 0,H",
				0xCB, 0x45, "BIT 0,L",
				0xCB, 0x46, "BIT 0,(HL)",
				0xCB, 0x47, "BIT 0,A",
				0xCB, 0x48, "BIT 1,B",
				0xCB, 0x49, "BIT 1,C",
				0xCB, 0x4A, "BIT 1,D",
				0xCB, 0x4B, "BIT 1,E",
				0xCB, 0x4C, "BIT 1,H",
				0xCB, 0x4D, "BIT 1,L",
				0xCB, 0x4E, "BIT 1,(HL)",
				0xCB, 0x4F, "BIT 1,A",
				0xCB, 0x50, "BIT 2,B",
				0xCB, 0x51, "BIT 2,C",
				0xCB, 0x52, "BIT 2,D",
				0xCB, 0x53, "BIT 2,E",
				0xCB, 0x54, "BIT 2,H",
				0xCB, 0x55, "BIT 2,L",
				0xCB, 0x56, "BIT 2,(HL)",
				0xCB, 0x57, "BIT 2,A",
				0xCB, 0x58, "BIT 3,B",
				0xCB, 0x59, "BIT 3,C",
				0xCB, 0x5A, "BIT 3,D",
				0xCB, 0x5B, "BIT 3,E",
				0xCB, 0x5C, "BIT 3,H",
				0xCB, 0x5D, "BIT 3,L",
				0xCB, 0x5E, "BIT 3,(HL)",
				0xCB, 0x5F, "BIT 3,A",
				0xCB, 0x60, "BIT 4,B",
				0xCB, 0x61, "BIT 4,C",
				0xCB, 0x62, "BIT 4,D",
				0xCB, 0x63, "BIT 4,E",
				0xCB, 0x64, "BIT 4,H",
				0xCB, 0x65, "BIT 4,L",
				0xCB, 0x66, "BIT 4,(HL)",
				0xCB, 0x67, "BIT 4,A",
				0xCB, 0x68, "BIT 5,B",
				0xCB, 0x69, "BIT 5,C",
				0xCB, 0x6A, "BIT 5,D",
				0xCB, 0x6B, "BIT 5,E",
				0xCB, 0x6C, "BIT 5,H",
				0xCB, 0x6D, "BIT 5,L",
				0xCB, 0x6E, "BIT 5,(HL)",
				0xCB, 0x6F, "BIT 5,A",
				0xCB, 0x70, "BIT 6,B",
				0xCB, 0x71, "BIT 6,C",
				0xCB, 0x72, "BIT 6,D",
				0xCB, 0x73, "BIT 6,E",
				0xCB, 0x74, "BIT 6,H",
				0xCB, 0x75, "BIT 6,L",
				0xCB, 0x76, "BIT 6,(HL)",
				0xCB, 0x77, "BIT 6,A",
				0xCB, 0x78, "BIT 7,B",
				0xCB, 0x79, "BIT 7,C",
				0xCB, 0x7A, "BIT 7,D",
				0xCB, 0x7B, "BIT 7,E",
				0xCB, 0x7C, "BIT 7,H",
				0xCB, 0x7D, "BIT 7,L",
				0xCB, 0x7E, "BIT 7,(HL)",
				0xCB, 0x7F, "BIT 7,A",
				0xCB, 0x80, "RES 0,B",
				0xCB, 0x81, "RES 0,C",
				0xCB, 0x82, "RES 0,D",
				0xCB, 0x83, "RES 0,E",
				0xCB, 0x84, "RES 0,H",
				0xCB, 0x85, "RES 0,L",
				0xCB, 0x86, "RES 0,(HL)",
				0xCB, 0x87, "RES 0,A",
				0xCB, 0x88, "RES 1,B",
				0xCB, 0x89, "RES 1,C",
				0xCB, 0x8A, "RES 1,D",
				0xCB, 0x8B, "RES 1,E",
				0xCB, 0x8C, "RES 1,H",
				0xCB, 0x8D, "RES 1,L",
				0xCB, 0x8E, "RES 1,(HL)",
				0xCB, 0x8F, "RES 1,A",
				0xCB, 0x90, "RES 2,B",
				0xCB, 0x91, "RES 2,C",
				0xCB, 0x92, "RES 2,D",
				0xCB, 0x93, "RES 2,E",
				0xCB, 0x94, "RES 2,H",
				0xCB, 0x95, "RES 2,L",
				0xCB, 0x96, "RES 2,(HL)",
				0xCB, 0x97, "RES 2,A",
				0xCB, 0x98, "RES 3,B",
				0xCB, 0x99, "RES 3,C",
				0xCB, 0x9A, "RES 3,D",
				0xCB, 0x9B, "RES 3,E",
				0xCB, 0x9C, "RES 3,H",
				0xCB, 0x9D, "RES 3,L",
				0xCB, 0x9E, "RES 3,(HL)",
				0xCB, 0x9F, "RES 3,A",
				0xCB, 0xA0, "RES 4,B",
				0xCB, 0xA1, "RES 4,C",
				0xCB, 0xA2, "RES 4,D",
				0xCB, 0xA3, "RES 4,E",
				0xCB, 0xA4, "RES 4,H",
				0xCB, 0xA5, "RES 4,L",
				0xCB, 0xA6, "RES 4,(HL)",
				0xCB, 0xA7, "RES 4,A",
				0xCB, 0xA8, "RES 5,B",
				0xCB, 0xA9, "RES 5,C",
				0xCB, 0xAA, "RES 5,D",
				0xCB, 0xAB, "RES 5,E",
				0xCB, 0xAC, "RES 5,H",
				0xCB, 0xAD, "RES 5,L",
				0xCB, 0xAE, "RES 5,(HL)",
				0xCB, 0xAF, "RES 5,A",
				0xCB, 0xB0, "RES 6,B",
				0xCB, 0xB1, "RES 6,C",
				0xCB, 0xB2, "RES 6,D",
				0xCB, 0xB3, "RES 6,E",
				0xCB, 0xB4, "RES 6,H",
				0xCB, 0xB5, "RES 6,L",
				0xCB, 0xB6, "RES 6,(HL)",
				0xCB, 0xB7, "RES 6,A",
				0xCB, 0xB8, "RES 7,B",
				0xCB, 0xB9, "RES 7,C",
				0xCB, 0xBA, "RES 7,D",
				0xCB, 0xBB, "RES 7,E",
				0xCB, 0xBC, "RES 7,H",
				0xCB, 0xBD, "RES 7,L",
				0xCB, 0xBE, "RES 7,(HL)",
				0xCB, 0xBF, "RES 7,A",
				0xCB, 0xC0, "SET 0,B",
				0xCB, 0xC1, "SET 0,C",
				0xCB, 0xC2, "SET 0,D",
				0xCB, 0xC3, "SET 0,E",
				0xCB, 0xC4, "SET 0,H",
				0xCB, 0xC5, "SET 0,L",
				0xCB, 0xC6, "SET 0,(HL)",
				0xCB, 0xC7, "SET 0,A",
				0xCB, 0xC8, "SET 1,B",
				0xCB, 0xC9, "SET 1,C",
				0xCB, 0xCA, "SET 1,D",
				0xCB, 0xCB, "SET 1,E",
				0xCB, 0xCC, "SET 1,H",
				0xCB, 0xCD, "SET 1,L",
				0xCB, 0xCE, "SET 1,(HL)",
				0xCB, 0xCF, "SET 1,A",
				0xCB, 0xD0, "SET 2,B",
				0xCB, 0xD1, "SET 2,C",
				0xCB, 0xD2, "SET 2,D",
				0xCB, 0xD3, "SET 2,E",
				0xCB, 0xD4, "SET 2,H",
				0xCB, 0xD5, "SET 2,L",
				0xCB, 0xD6, "SET 2,(HL)",
				0xCB, 0xD7, "SET 2,A",
				0xCB, 0xD8, "SET 3,B",
				0xCB, 0xD9, "SET 3,C",
				0xCB, 0xDA, "SET 3,D",
				0xCB, 0xDB, "SET 3,E",
				0xCB, 0xDC, "SET 3,H",
				0xCB, 0xDD, "SET 3,L",
				0xCB, 0xDE, "SET 3,(HL)",
				0xCB, 0xDF, "SET 3,A",
				0xCB, 0xE0, "SET 4,B",
				0xCB, 0xE1, "SET 4,C",
				0xCB, 0xE2, "SET 4,D",
				0xCB, 0xE3, "SET 4,E",
				0xCB, 0xE4, "SET 4,H",
				0xCB, 0xE5, "SET 4,L",
				0xCB, 0xE6, "SET 4,(HL)",
				0xCB, 0xE7, "SET 4,A",
				0xCB, 0xE8, "SET 5,B",
				0xCB, 0xE9, "SET 5,C",
				0xCB, 0xEA, "SET 5,D",
				0xCB, 0xEB, "SET 5,E",
				0xCB, 0xEC, "SET 5,H",
				0xCB, 0xED, "SET 5,L",
				0xCB, 0xEE, "SET 5,(HL)",
				0xCB, 0xEF, "SET 5,A",
				0xCB, 0xF0, "SET 6,B",
				0xCB, 0xF1, "SET 6,C",
				0xCB, 0xF2, "SET 6,D",
				0xCB, 0xF3, "SET 6,E",
				0xCB, 0xF4, "SET 6,H",
				0xCB, 0xF5, "SET 6,L",
				0xCB, 0xF6, "SET 6,(HL)",
				0xCB, 0xF7, "SET 6,A",
				0xCB, 0xF8, "SET 7,B",
				0xCB, 0xF9, "SET 7,C",
				0xCB, 0xFA, "SET 7,D",
				0xCB, 0xFB, "SET 7,E",
				0xCB, 0xFC, "SET 7,H",
				0xCB, 0xFD, "SET 7,L",
				0xCB, 0xFE, "SET 7,(HL)",
				0xCB, 0xFF, "SET 7,A"
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('DD (IX instructions)', () => {
			const combined = [
				0xDD, 0x00, "INVALID INSTRUCTION",
				0xDD, 0x01, "INVALID INSTRUCTION",
				0xDD, 0x02, "INVALID INSTRUCTION",
				0xDD, 0x03, "INVALID INSTRUCTION",
				0xDD, 0x04, "INVALID INSTRUCTION",
				0xDD, 0x05, "INVALID INSTRUCTION",
				0xDD, 0x06, "INVALID INSTRUCTION",
				0xDD, 0x07, "INVALID INSTRUCTION",
				0xDD, 0x08, "INVALID INSTRUCTION",
				0xDD, 0x09, "ADD IX,BC",
				0xDD, 0x0A, "INVALID INSTRUCTION",
				0xDD, 0x0B, "INVALID INSTRUCTION",
				0xDD, 0x0C, "INVALID INSTRUCTION",
				0xDD, 0x0D, "INVALID INSTRUCTION",
				0xDD, 0x0E, "INVALID INSTRUCTION",
				0xDD, 0x0F, "INVALID INSTRUCTION",
				0xDD, 0x10, "INVALID INSTRUCTION",
				0xDD, 0x11, "INVALID INSTRUCTION",
				0xDD, 0x12, "INVALID INSTRUCTION",
				0xDD, 0x13, "INVALID INSTRUCTION",
				0xDD, 0x14, "INVALID INSTRUCTION",
				0xDD, 0x15, "INVALID INSTRUCTION",
				0xDD, 0x16, "INVALID INSTRUCTION",
				0xDD, 0x17, "INVALID INSTRUCTION",
				0xDD, 0x18, "INVALID INSTRUCTION",
				0xDD, 0x19, "ADD IX,DE",
				0xDD, 0x1A, "INVALID INSTRUCTION",
				0xDD, 0x1B, "INVALID INSTRUCTION",
				0xDD, 0x1C, "INVALID INSTRUCTION",
				0xDD, 0x1D, "INVALID INSTRUCTION",
				0xDD, 0x1E, "INVALID INSTRUCTION",
				0xDD, 0x1F, "INVALID INSTRUCTION",
				0xDD, 0x20, "INVALID INSTRUCTION",
				0xDD, 0x21, 0x12, 0x34, "LD IX,3412h",
				0xDD, 0x22, 0x12, 0x34, "LD (DATA3412),IX",
				0xDD, 0x23, "INC IX",
				0xDD, 0x24, "INC IXH",
				0xDD, 0x25, "DEC IXH",
				0xDD, 0x26, 0x0A, "LD IXH,0Ah",
				0xDD, 0x29, "ADD IX,IX",
				0xDD, 0x2A, 0x12, 0x34, "LD IX,(DATA3412)",
				0xDD, 0x2B, "DEC IX",
				0xDD, 0x2C, "INC IXL",
				0xDD, 0x2D, "DEC IXL",
				0xDD, 0x2E, 0x05, "LD IXL,05h",
				0xDD, 0x2F, "INVALID INSTRUCTION",
				0xDD, 0x30, "INVALID INSTRUCTION",
				0xDD, 0x31, "INVALID INSTRUCTION",
				0xDD, 0x32, "INVALID INSTRUCTION",
				0xDD, 0x33, "INVALID INSTRUCTION",
				0xDD, 0x34, 0,  "INC (IX+0)",
				0xDD, 0x34, 7,  "INC (IX+7)",
				0xDD, 0x34, -8, "INC (IX-8)",
				0xDD, 0x35, 0,  "DEC (IX+0)",
				0xDD, 0x35, 7,  "DEC (IX+7)",
				0xDD, 0x35, -8, "DEC (IX-8)",
				0xDD, 0x36, 0xFC, 0x05, 'LD (IX-4),05h',
				0xDD, 0x37, "INVALID INSTRUCTION",
				0xDD, 0x38, "INVALID INSTRUCTION",
				0xDD, 0x39, "ADD IX,SP",
				0xDD, 0x3A, "INVALID INSTRUCTION",
				0xDD, 0x3B, "INVALID INSTRUCTION",
				0xDD, 0x3C, "INVALID INSTRUCTION",
				0xDD, 0x3D, "INVALID INSTRUCTION",
				0xDD, 0x3E, "INVALID INSTRUCTION",
				0xDD, 0x3F, "INVALID INSTRUCTION",
				0xDD, 0x40, "INVALID INSTRUCTION",
				0xDD, 0x41, "INVALID INSTRUCTION",
				0xDD, 0x42, "INVALID INSTRUCTION",
				0xDD, 0x43, "INVALID INSTRUCTION",
				0xDD, 0x44, "LD B,IXH",
				0xDD, 0x45, "LD B,IXL",
				0xDD, 0x46, 0xFC, "LD B,(IX-4)",
				0xDD, 0x47, "INVALID INSTRUCTION",
				0xDD, 0x48, "INVALID INSTRUCTION",
				0xDD, 0x49, "INVALID INSTRUCTION",
				0xDD, 0x4A, "INVALID INSTRUCTION",
				0xDD, 0x4B, "INVALID INSTRUCTION",
				0xDD, 0x4C, "LD C,IXH",
				0xDD, 0x4D, "LD C,IXL",
				0xDD, 0x4E, 0xFC, "LD C,(IX-4)",
				0xDD, 0x4F, "INVALID INSTRUCTION",
				0xDD, 0x50, "INVALID INSTRUCTION",
				0xDD, 0x51, "INVALID INSTRUCTION",
				0xDD, 0x52, "INVALID INSTRUCTION",
				0xDD, 0x53, "INVALID INSTRUCTION",
				0xDD, 0x54, "LD D,IXH",
				0xDD, 0x55, "LD D,IXL",
				0xDD, 0x56, 0xFC, "LD D,(IX-4)",
				0xDD, 0x57, "INVALID INSTRUCTION",
				0xDD, 0x58, "INVALID INSTRUCTION",
				0xDD, 0x59, "INVALID INSTRUCTION",
				0xDD, 0x5A, "INVALID INSTRUCTION",
				0xDD, 0x5B, "INVALID INSTRUCTION",
				0xDD, 0x5C, "LD E,IXH",
				0xDD, 0x5D, "LD E,IXL",
				0xDD, 0x5E, 0xFC, "LD E,(IX-4)",
				0xDD, 0x5F, "INVALID INSTRUCTION",
				0xDD, 0x60, "LD IXH,B",
				0xDD, 0x61, "LD IXH,C",
				0xDD, 0x62, "LD IXH,D",
				0xDD, 0x63, "LD IXH,E",
				0xDD, 0x64, "LD IXH,IXH",
				0xDD, 0x65, "LD IXH,IXL",
				0xDD, 0x66, 0xFC, "LD H,(IX-4)",
				0xDD, 0x67, "LD IXH,A",
				0xDD, 0x68, "LD IXL,B",
				0xDD, 0x69, "LD IXL,C",
				0xDD, 0x6A, "LD IXL,D",
				0xDD, 0x6B, "LD IXL,E",
				0xDD, 0x6C, "LD IXL,IXH",
				0xDD, 0x6D, "LD IXL,IXL",
				0xDD, 0x6E, 0xFC, "LD L,(IX-4)",
				0xDD, 0x6F, "LD IXL,A",
				0xDD, 0x70, 0xFC, "LD (IX-4),B",
				0xDD, 0x71, 0xFC, "LD (IX-4),C",
				0xDD, 0x72, 0xFC, "LD (IX-4),D",
				0xDD, 0x73, 0xFC, "LD (IX-4),E",
				0xDD, 0x74, 0xFC, "LD (IX-4),H",
				0xDD, 0x75, 0xFC, "LD (IX-4),L",
				0xDD, 0x76, "INVALID INSTRUCTION",
				0xDD, 0x77, 0xFC, "LD (IX-4),A",
				0xDD, 0x78, "INVALID INSTRUCTION",
				0xDD, 0x79, "INVALID INSTRUCTION",
				0xDD, 0x7A, "INVALID INSTRUCTION",
				0xDD, 0x7B, "INVALID INSTRUCTION",
				0xDD, 0x7C, "LD A,IXH",
				0xDD, 0x7D, "LD A,IXL",
				0xDD, 0x7E, 0xFC, "LD A,(IX-4)",
				0xDD, 0x7F, "INVALID INSTRUCTION",
				0xDD, 0x80, "INVALID INSTRUCTION",
				0xDD, 0x81, "INVALID INSTRUCTION",
				0xDD, 0x82, "INVALID INSTRUCTION",
				0xDD, 0x83, "INVALID INSTRUCTION",
				0xDD, 0x84, "ADD A,IXH",
				0xDD, 0x85, "ADD A,IXL",
				0xDD, 0x86, 0xFC, "ADD A,(IX-4)",
				0xDD, 0x87, "INVALID INSTRUCTION",
				0xDD, 0x88, "INVALID INSTRUCTION",
				0xDD, 0x89, "INVALID INSTRUCTION",
				0xDD, 0x8A, "INVALID INSTRUCTION",
				0xDD, 0x8B, "INVALID INSTRUCTION",
				0xDD, 0x8C, "ADC A,IXH",
				0xDD, 0x8D, "ADC A,IXL",
				0xDD, 0x8E, 0xFC, "ADC A,(IX-4)",
				0xDD, 0x8F, "INVALID INSTRUCTION",
				0xDD, 0x90, "INVALID INSTRUCTION",
				0xDD, 0x91, "INVALID INSTRUCTION",
				0xDD, 0x92, "INVALID INSTRUCTION",
				0xDD, 0x93, "INVALID INSTRUCTION",
				0xDD, 0x94, "SUB IXH",
				0xDD, 0x95, "SUB IXL",
				0xDD, 0x96, 0xFC, "SUB (IX-4)",
				0xDD, 0x97, "INVALID INSTRUCTION",
				0xDD, 0x98, "INVALID INSTRUCTION",
				0xDD, 0x99, "INVALID INSTRUCTION",
				0xDD, 0x9A, "INVALID INSTRUCTION",
				0xDD, 0x9B, "INVALID INSTRUCTION",
				0xDD, 0x9C, "SBC A,IXH",
				0xDD, 0x9D, "SBC A,IXL",
				0xDD, 0x9E, 0xFC, "SBC A,(IX-4)",
				0xDD, 0x9F, "INVALID INSTRUCTION",
				0xDD, 0xA0, "INVALID INSTRUCTION",
				0xDD, 0xA1, "INVALID INSTRUCTION",
				0xDD, 0xA2, "INVALID INSTRUCTION",
				0xDD, 0xA3, "INVALID INSTRUCTION",
				0xDD, 0xA4, "AND IXH",
				0xDD, 0xA5, "AND IXL",
				0xDD, 0xA6, 0xFC, "AND (IX-4)",
				0xDD, 0xA7, "INVALID INSTRUCTION",
				0xDD, 0xA8, "INVALID INSTRUCTION",
				0xDD, 0xA9, "INVALID INSTRUCTION",
				0xDD, 0xAA, "INVALID INSTRUCTION",
				0xDD, 0xAB, "INVALID INSTRUCTION",
				0xDD, 0xAC, "XOR IXH",
				0xDD, 0xAD, "XOR IXL",
				0xDD, 0xAE, 0xFC, "XOR (IX-4)",
				0xDD, 0xAF, "INVALID INSTRUCTION",
				0xDD, 0xB0, "INVALID INSTRUCTION",
				0xDD, 0xB1, "INVALID INSTRUCTION",
				0xDD, 0xB2, "INVALID INSTRUCTION",
				0xDD, 0xB3, "INVALID INSTRUCTION",
				0xDD, 0xB4, "OR IXH",
				0xDD, 0xB5, "OR IXL",
				0xDD, 0xB6, 0xFC, "OR (IX-4)",
				0xDD, 0xB7, "INVALID INSTRUCTION",
				0xDD, 0xB8, "INVALID INSTRUCTION",
				0xDD, 0xB9, "INVALID INSTRUCTION",
				0xDD, 0xBA, "INVALID INSTRUCTION",
				0xDD, 0xBB, "INVALID INSTRUCTION",
				0xDD, 0xBC, "CP IXH",
				0xDD, 0xBD, "CP IXL",
				0xDD, 0xBE, 0xFC, "CP (IX-4)",
				0xDD, 0xBF, "INVALID INSTRUCTION",
				0xDD, 0xC0, "INVALID INSTRUCTION",
				0xDD, 0xC1, "INVALID INSTRUCTION",
				0xDD, 0xC2, "INVALID INSTRUCTION",
				0xDD, 0xC3, "INVALID INSTRUCTION",
				0xDD, 0xC4, "INVALID INSTRUCTION",
				0xDD, 0xC5, "INVALID INSTRUCTION",
				0xDD, 0xC6, "INVALID INSTRUCTION",
				0xDD, 0xC7, "INVALID INSTRUCTION",
				0xDD, 0xC8, "INVALID INSTRUCTION",
				0xDD, 0xC9, "INVALID INSTRUCTION",
				0xDD, 0xCA, "INVALID INSTRUCTION",
				// 0xDD, 0xCB -> Extended
				0xDD, 0xCC, "INVALID INSTRUCTION",
				0xDD, 0xCD, "INVALID INSTRUCTION",
				0xDD, 0xCE, "INVALID INSTRUCTION",
				0xDD, 0xCF, "INVALID INSTRUCTION",
				0xDD, 0xD0, "INVALID INSTRUCTION",
				0xDD, 0xD1, "INVALID INSTRUCTION",
				0xDD, 0xD2, "INVALID INSTRUCTION",
				0xDD, 0xD3, "INVALID INSTRUCTION",
				0xDD, 0xD4, "INVALID INSTRUCTION",
				0xDD, 0xD5, "INVALID INSTRUCTION",
				0xDD, 0xD6, "INVALID INSTRUCTION",
				0xDD, 0xD7, "INVALID INSTRUCTION",
				0xDD, 0xD8, "INVALID INSTRUCTION",
				0xDD, 0xD9, "INVALID INSTRUCTION",
				0xDD, 0xDA, "INVALID INSTRUCTION",
				0xDD, 0xDB, "INVALID INSTRUCTION",
				0xDD, 0xDC, "INVALID INSTRUCTION",
				//0xDD, "[NOP]", // Because a 0xDD is following
				0xDD, 0xDE, "INVALID INSTRUCTION",
				0xDD, 0xDF, "INVALID INSTRUCTION",
				0xDD, 0xE0, "INVALID INSTRUCTION",
				0xDD, 0xE1, "POP IX",
				0xDD, 0xE2, "INVALID INSTRUCTION",
				0xDD, 0xE3, "EX (SP),IX",
				0xDD, 0xE4, "INVALID INSTRUCTION",
				0xDD, 0xE5, "PUSH IX",
				0xDD, 0xE6, "INVALID INSTRUCTION",
				0xDD, 0xE7, "INVALID INSTRUCTION",
				0xDD, 0xE8, "INVALID INSTRUCTION",
				//0xDD, 0xE9, "JP (IX)",  // Is done at last, otherwise below code is not recognized as program.
				0xDD, 0xEA, "INVALID INSTRUCTION",
				0xDD, 0xEB, "INVALID INSTRUCTION",
				0xDD, 0xEC, "INVALID INSTRUCTION",
				//0xDD, 0xED, "[NOP]",
				0xDD, 0xEE, "INVALID INSTRUCTION",
				0xDD, 0xEF, "INVALID INSTRUCTION",
				0xDD, 0xF0, "INVALID INSTRUCTION",
				0xDD, 0xF1, "INVALID INSTRUCTION",
				0xDD, 0xF2, "INVALID INSTRUCTION",
				0xDD, 0xF3, "INVALID INSTRUCTION",
				0xDD, 0xF4, "INVALID INSTRUCTION",
				0xDD, 0xF5, "INVALID INSTRUCTION",
				0xDD, 0xF6, "INVALID INSTRUCTION",
				0xDD, 0xF7, "INVALID INSTRUCTION",
				0xDD, 0xF8, "INVALID INSTRUCTION",
				0xDD, 0xF9, "LD SP,IX",
				0xDD, 0xFA, "INVALID INSTRUCTION",
				0xDD, 0xFB, "INVALID INSTRUCTION",
				0xDD, 0xFC, "INVALID INSTRUCTION",
				//0xDD, 0xFD, "[NOP]",
				0xDD, 0xFE, "INVALID INSTRUCTION",
				0xDD, 0xFF, "INVALID INSTRUCTION",

				0xDD, 0xE9, "JP (IX)",
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('DDCB (IX bit instructions)', () => {
			const combined = [
				0xDD, 0xCB, 0x06, 0x00, "RLC (IX+6),B",
				0xDD, 0xCB, 0x06, 0x01, "RLC (IX+6),C",
				0xDD, 0xCB, 0x06, 0x02, "RLC (IX+6),D",
				0xDD, 0xCB, 0x06, 0x03, "RLC (IX+6),E",
				0xDD, 0xCB, 0x06, 0x04, "RLC (IX+6),H",
				0xDD, 0xCB, 0x06, 0x05, "RLC (IX+6),L",
				0xDD, 0xCB, 0x06, 0x06, "RLC (IX+6)",
				0xDD, 0xCB, 0x06, 0x07, "RLC (IX+6),A",
				0xDD, 0xCB, 0x06, 0x08, "RRC (IX+6),B",
				0xDD, 0xCB, 0x06, 0x09, "RRC (IX+6),C",
				0xDD, 0xCB, 0x06, 0x0A, "RRC (IX+6),D",
				0xDD, 0xCB, 0x06, 0x0B, "RRC (IX+6),E",
				0xDD, 0xCB, 0x06, 0x0C, "RRC (IX+6),H",
				0xDD, 0xCB, 0x06, 0x0D, "RRC (IX+6),L",
				0xDD, 0xCB, 0x06, 0x0E, "RRC (IX+6)",
				0xDD, 0xCB, 0x06, 0x0F, "RRC (IX+6),A",
				0xDD, 0xCB, 0x06, 0x10, "RL (IX+6),B",
				0xDD, 0xCB, 0x06, 0x11, "RL (IX+6),C",
				0xDD, 0xCB, 0x06, 0x12, "RL (IX+6),D",
				0xDD, 0xCB, 0x06, 0x13, "RL (IX+6),E",
				0xDD, 0xCB, 0x06, 0x14, "RL (IX+6),H",
				0xDD, 0xCB, 0x06, 0x15, "RL (IX+6),L",
				0xDD, 0xCB, 0x06, 0x16, "RL (IX+6)",
				0xDD, 0xCB, 0x06, 0x17, "RL (IX+6),A",
				0xDD, 0xCB, 0x06, 0x18, "RR (IX+6),B",
				0xDD, 0xCB, 0x06, 0x19, "RR (IX+6),C",
				0xDD, 0xCB, 0x06, 0x1A, "RR (IX+6),D",
				0xDD, 0xCB, 0x06, 0x1B, "RR (IX+6),E",
				0xDD, 0xCB, 0x06, 0x1C, "RR (IX+6),H",
				0xDD, 0xCB, 0x06, 0x1D, "RR (IX+6),L",
				0xDD, 0xCB, 0x06, 0x1E, "RR (IX+6)",
				0xDD, 0xCB, 0x06, 0x1F, "RR (IX+6),A",
				0xDD, 0xCB, 0x06, 0x20, "SLA (IX+6),B",
				0xDD, 0xCB, 0x06, 0x21, "SLA (IX+6),C",
				0xDD, 0xCB, 0x06, 0x22, "SLA (IX+6),D",
				0xDD, 0xCB, 0x06, 0x23, "SLA (IX+6),E",
				0xDD, 0xCB, 0x06, 0x24, "SLA (IX+6),H",
				0xDD, 0xCB, 0x06, 0x25, "SLA (IX+6),L",
				0xDD, 0xCB, 0x06, 0x26, "SLA (IX+6)",
				0xDD, 0xCB, 0x06, 0x27, "SLA (IX+6),A",
				0xDD, 0xCB, 0x06, 0x28, "SRA (IX+6),B",
				0xDD, 0xCB, 0x06, 0x29, "SRA (IX+6),C",
				0xDD, 0xCB, 0x06, 0x2A, "SRA (IX+6),D",
				0xDD, 0xCB, 0x06, 0x2B, "SRA (IX+6),E",
				0xDD, 0xCB, 0x06, 0x2C, "SRA (IX+6),H",
				0xDD, 0xCB, 0x06, 0x2D, "SRA (IX+6),L",
				0xDD, 0xCB, 0x06, 0x2E, "SRA (IX+6)",
				0xDD, 0xCB, 0x06, 0x2F, "SRA (IX+6),A",
				0xDD, 0xCB, 0x06, 0x30, "SLL (IX+6),B",
				0xDD, 0xCB, 0x06, 0x31, "SLL (IX+6),C",
				0xDD, 0xCB, 0x06, 0x32, "SLL (IX+6),D",
				0xDD, 0xCB, 0x06, 0x33, "SLL (IX+6),E",
				0xDD, 0xCB, 0x06, 0x34, "SLL (IX+6),H",
				0xDD, 0xCB, 0x06, 0x35, "SLL (IX+6),L",
				0xDD, 0xCB, 0x06, 0x36, "SLL (IX+6)",
				0xDD, 0xCB, 0x06, 0x37, "SLL (IX+6),A",
				0xDD, 0xCB, 0x06, 0x38, "SRL (IX+6),B",
				0xDD, 0xCB, 0x06, 0x39, "SRL (IX+6),C",
				0xDD, 0xCB, 0x06, 0x3A, "SRL (IX+6),D",
				0xDD, 0xCB, 0x06, 0x3B, "SRL (IX+6),E",
				0xDD, 0xCB, 0x06, 0x3C, "SRL (IX+6),H",
				0xDD, 0xCB, 0x06, 0x3D, "SRL (IX+6),L",
				0xDD, 0xCB, 0x06, 0x3E, "SRL (IX+6)",
				0xDD, 0xCB, 0x06, 0x3F, "SRL (IX+6),A",
				0xDD, 0xCB, 0x06, 0x40, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x41, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x42, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x43, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x44, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x45, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x46, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x47, "BIT 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x48, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x49, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4A, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4B, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4C, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4D, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4E, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x4F, "BIT 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x50, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x51, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x52, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x53, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x54, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x55, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x56, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x57, "BIT 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x58, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x59, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5A, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5B, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5C, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5D, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5E, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x5F, "BIT 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x60, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x61, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x62, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x63, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x64, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x65, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x66, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x67, "BIT 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0x68, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x69, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6A, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6B, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6C, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6D, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6E, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x6F, "BIT 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0x70, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x71, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x72, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x73, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x74, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x75, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x76, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x77, "BIT 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0x78, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x79, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7A, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7B, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7C, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7D, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7E, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x7F, "BIT 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0x80, "RES 0,(IX+6),B",
				0xDD, 0xCB, 0x06, 0x81, "RES 0,(IX+6),C",
				0xDD, 0xCB, 0x06, 0x82, "RES 0,(IX+6),D",
				0xDD, 0xCB, 0x06, 0x83, "RES 0,(IX+6),E",
				0xDD, 0xCB, 0x06, 0x84, "RES 0,(IX+6),H",
				0xDD, 0xCB, 0x06, 0x85, "RES 0,(IX+6),L",
				0xDD, 0xCB, 0x06, 0x86, "RES 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0x87, "RES 0,(IX+6),A",
				0xDD, 0xCB, 0x06, 0x88, "RES 1,(IX+6),B",
				0xDD, 0xCB, 0x06, 0x89, "RES 1,(IX+6),C",
				0xDD, 0xCB, 0x06, 0x8A, "RES 1,(IX+6),D",
				0xDD, 0xCB, 0x06, 0x8B, "RES 1,(IX+6),E",
				0xDD, 0xCB, 0x06, 0x8C, "RES 1,(IX+6),H",
				0xDD, 0xCB, 0x06, 0x8D, "RES 1,(IX+6),L",
				0xDD, 0xCB, 0x06, 0x8E, "RES 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0x8F, "RES 1,(IX+6),A",
				0xDD, 0xCB, 0x06, 0x90, "RES 2,(IX+6),B",
				0xDD, 0xCB, 0x06, 0x91, "RES 2,(IX+6),C",
				0xDD, 0xCB, 0x06, 0x92, "RES 2,(IX+6),D",
				0xDD, 0xCB, 0x06, 0x93, "RES 2,(IX+6),E",
				0xDD, 0xCB, 0x06, 0x94, "RES 2,(IX+6),H",
				0xDD, 0xCB, 0x06, 0x95, "RES 2,(IX+6),L",
				0xDD, 0xCB, 0x06, 0x96, "RES 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0x97, "RES 2,(IX+6),A",
				0xDD, 0xCB, 0x06, 0x98, "RES 3,(IX+6),B",
				0xDD, 0xCB, 0x06, 0x99, "RES 3,(IX+6),C",
				0xDD, 0xCB, 0x06, 0x9A, "RES 3,(IX+6),D",
				0xDD, 0xCB, 0x06, 0x9B, "RES 3,(IX+6),E",
				0xDD, 0xCB, 0x06, 0x9C, "RES 3,(IX+6),H",
				0xDD, 0xCB, 0x06, 0x9D, "RES 3,(IX+6),L",
				0xDD, 0xCB, 0x06, 0x9E, "RES 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0x9F, "RES 3,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xA0, "RES 4,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xA1, "RES 4,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xA2, "RES 4,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xA3, "RES 4,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xA4, "RES 4,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xA5, "RES 4,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xA6, "RES 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0xA7, "RES 4,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xA8, "RES 5,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xA9, "RES 5,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xAA, "RES 5,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xAB, "RES 5,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xAC, "RES 5,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xAD, "RES 5,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xAE, "RES 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0xAF, "RES 5,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xB0, "RES 6,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xB1, "RES 6,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xB2, "RES 6,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xB3, "RES 6,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xB4, "RES 6,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xB5, "RES 6,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xB6, "RES 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0xB7, "RES 6,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xB8, "RES 7,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xB9, "RES 7,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xBA, "RES 7,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xBB, "RES 7,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xBC, "RES 7,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xBD, "RES 7,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xBE, "RES 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0xBF, "RES 7,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xC0, "SET 0,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xC1, "SET 0,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xC2, "SET 0,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xC3, "SET 0,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xC4, "SET 0,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xC5, "SET 0,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xC6, "SET 0,(IX+6)",
				0xDD, 0xCB, 0x06, 0xC7, "SET 0,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xC8, "SET 1,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xC9, "SET 1,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xCA, "SET 1,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xCB, "SET 1,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xCC, "SET 1,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xCD, "SET 1,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xCE, "SET 1,(IX+6)",
				0xDD, 0xCB, 0x06, 0xCF, "SET 1,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xD0, "SET 2,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xD1, "SET 2,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xD2, "SET 2,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xD3, "SET 2,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xD4, "SET 2,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xD5, "SET 2,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xD6, "SET 2,(IX+6)",
				0xDD, 0xCB, 0x06, 0xD7, "SET 2,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xD8, "SET 3,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xD9, "SET 3,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xDA, "SET 3,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xDB, "SET 3,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xDC, "SET 3,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xDD, "SET 3,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xDE, "SET 3,(IX+6)",
				0xDD, 0xCB, 0x06, 0xDF, "SET 3,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xE0, "SET 4,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xE1, "SET 4,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xE2, "SET 4,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xE3, "SET 4,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xE4, "SET 4,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xE5, "SET 4,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xE6, "SET 4,(IX+6)",
				0xDD, 0xCB, 0x06, 0xE7, "SET 4,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xE8, "SET 5,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xE9, "SET 5,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xEA, "SET 5,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xEB, "SET 5,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xEC, "SET 5,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xED, "SET 5,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xEE, "SET 5,(IX+6)",
				0xDD, 0xCB, 0x06, 0xEF, "SET 5,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xF0, "SET 6,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xF1, "SET 6,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xF2, "SET 6,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xF3, "SET 6,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xF4, "SET 6,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xF5, "SET 6,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xF6, "SET 6,(IX+6)",
				0xDD, 0xCB, 0x06, 0xF7, "SET 6,(IX+6),A",
				0xDD, 0xCB, 0x06, 0xF8, "SET 7,(IX+6),B",
				0xDD, 0xCB, 0x06, 0xF9, "SET 7,(IX+6),C",
				0xDD, 0xCB, 0x06, 0xFA, "SET 7,(IX+6),D",
				0xDD, 0xCB, 0x06, 0xFB, "SET 7,(IX+6),E",
				0xDD, 0xCB, 0x06, 0xFC, "SET 7,(IX+6),H",
				0xDD, 0xCB, 0x06, 0xFD, "SET 7,(IX+6),L",
				0xDD, 0xCB, 0x06, 0xFE, "SET 7,(IX+6)",
				0xDD, 0xCB, 0x06, 0xFF, "SET 7,(IX+6),A"
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('FD (IY instructions)', () => {
			const combined = [
				0xFD, 0x00, "INVALID INSTRUCTION",
				0xFD, 0x01, "INVALID INSTRUCTION",
				0xFD, 0x02, "INVALID INSTRUCTION",
				0xFD, 0x03, "INVALID INSTRUCTION",
				0xFD, 0x04, "INVALID INSTRUCTION",
				0xFD, 0x05, "INVALID INSTRUCTION",
				0xFD, 0x06, "INVALID INSTRUCTION",
				0xFD, 0x07, "INVALID INSTRUCTION",
				0xFD, 0x08, "INVALID INSTRUCTION",
				0xFD, 0x09, "ADD IY,BC",
				0xFD, 0x0A, "INVALID INSTRUCTION",
				0xFD, 0x0B, "INVALID INSTRUCTION",
				0xFD, 0x0C, "INVALID INSTRUCTION",
				0xFD, 0x0D, "INVALID INSTRUCTION",
				0xFD, 0x0E, "INVALID INSTRUCTION",
				0xFD, 0x0F, "INVALID INSTRUCTION",
				0xFD, 0x10, "INVALID INSTRUCTION",
				0xFD, 0x11, "INVALID INSTRUCTION",
				0xFD, 0x12, "INVALID INSTRUCTION",
				0xFD, 0x13, "INVALID INSTRUCTION",
				0xFD, 0x14, "INVALID INSTRUCTION",
				0xFD, 0x15, "INVALID INSTRUCTION",
				0xFD, 0x16, "INVALID INSTRUCTION",
				0xFD, 0x17, "INVALID INSTRUCTION",
				0xFD, 0x18, "INVALID INSTRUCTION",
				0xFD, 0x19, "ADD IY,DE",
				0xFD, 0x1A, "INVALID INSTRUCTION",
				0xFD, 0x1B, "INVALID INSTRUCTION",
				0xFD, 0x1C, "INVALID INSTRUCTION",
				0xFD, 0x1D, "INVALID INSTRUCTION",
				0xFD, 0x1E, "INVALID INSTRUCTION",
				0xFD, 0x1F, "INVALID INSTRUCTION",
				0xFD, 0x20, "INVALID INSTRUCTION",
				0xFD, 0x21, 0x12, 0x34, "LD IY,3412h",
				0xFD, 0x22, 0x12, 0x34, "LD (DATA3412),IY",
				0xFD, 0x23, "INC IY",
				0xFD, 0x24, "INC IYH",
				0xFD, 0x25, "DEC IYH",
				0xFD, 0x26, 0x0A, "LD IYH,0Ah",
				0xFD, 0x29, "ADD IY,IY",
				0xFD, 0x2A, 0x12, 0x34, "LD IY,(DATA3412)",
				0xFD, 0x2B, "DEC IY",
				0xFD, 0x2C, "INC IYL",
				0xFD, 0x2D, "DEC IYL",
				0xFD, 0x2E, 0x05, "LD IYL,05h",
				0xFD, 0x2F, "INVALID INSTRUCTION",
				0xFD, 0x30, "INVALID INSTRUCTION",
				0xFD, 0x31, "INVALID INSTRUCTION",
				0xFD, 0x32, "INVALID INSTRUCTION",
				0xFD, 0x33, "INVALID INSTRUCTION",
				0xFD, 0x34, 0,  "INC (IY+0)",
				0xFD, 0x34, 1,  "INC (IY+1)",
				0xFD, 0x34, -1, "INC (IY-1)",
				0xFD, 0x35, 0,  "DEC (IY+0)",
				0xFD, 0x35, 1,  "DEC (IY+1)",
				0xFD, 0x35, -1, "DEC (IY-1)",
				0xFD, 0x36, 0xFC, 0x05, 'LD (IY-4),05h',
				0xFD, 0x37, "INVALID INSTRUCTION",
				0xFD, 0x38, "INVALID INSTRUCTION",
				0xFD, 0x39, "ADD IY,SP",
				0xFD, 0x3A, "INVALID INSTRUCTION",
				0xFD, 0x3B, "INVALID INSTRUCTION",
				0xFD, 0x3C, "INVALID INSTRUCTION",
				0xFD, 0x3D, "INVALID INSTRUCTION",
				0xFD, 0x3E, "INVALID INSTRUCTION",
				0xFD, 0x3F, "INVALID INSTRUCTION",
				0xFD, 0x40, "INVALID INSTRUCTION",
				0xFD, 0x41, "INVALID INSTRUCTION",
				0xFD, 0x42, "INVALID INSTRUCTION",
				0xFD, 0x43, "INVALID INSTRUCTION",
				0xFD, 0x44, "LD B,IYH",
				0xFD, 0x45, "LD B,IYL",
				0xFD, 0x46, 0xFC, "LD B,(IY-4)",
				0xFD, 0x47, "INVALID INSTRUCTION",
				0xFD, 0x48, "INVALID INSTRUCTION",
				0xFD, 0x49, "INVALID INSTRUCTION",
				0xFD, 0x4A, "INVALID INSTRUCTION",
				0xFD, 0x4B, "INVALID INSTRUCTION",
				0xFD, 0x4C, "LD C,IYH",
				0xFD, 0x4D, "LD C,IYL",
				0xFD, 0x4E, 0xFC, "LD C,(IY-4)",
				0xFD, 0x4F, "INVALID INSTRUCTION",
				0xFD, 0x50, "INVALID INSTRUCTION",
				0xFD, 0x51, "INVALID INSTRUCTION",
				0xFD, 0x52, "INVALID INSTRUCTION",
				0xFD, 0x53, "INVALID INSTRUCTION",
				0xFD, 0x54, "LD D,IYH",
				0xFD, 0x55, "LD D,IYL",
				0xFD, 0x56, 0xFC, "LD D,(IY-4)",
				0xFD, 0x57, "INVALID INSTRUCTION",
				0xFD, 0x58, "INVALID INSTRUCTION",
				0xFD, 0x59, "INVALID INSTRUCTION",
				0xFD, 0x5A, "INVALID INSTRUCTION",
				0xFD, 0x5B, "INVALID INSTRUCTION",
				0xFD, 0x5C, "LD E,IYH",
				0xFD, 0x5D, "LD E,IYL",
				0xFD, 0x5E, 0xFC, "LD E,(IY-4)",
				0xFD, 0x5F, "INVALID INSTRUCTION",
				0xFD, 0x60, "LD IYH,B",
				0xFD, 0x61, "LD IYH,C",
				0xFD, 0x62, "LD IYH,D",
				0xFD, 0x63, "LD IYH,E",
				0xFD, 0x64, "LD IYH,IYH",
				0xFD, 0x65, "LD IYH,IYL",
				0xFD, 0x66, 0xFC, "LD H,(IY-4)",
				0xFD, 0x67, "LD IYH,A",
				0xFD, 0x68, "LD IYL,B",
				0xFD, 0x69, "LD IYL,C",
				0xFD, 0x6A, "LD IYL,D",
				0xFD, 0x6B, "LD IYL,E",
				0xFD, 0x6C, "LD IYL,IYH",
				0xFD, 0x6D, "LD IYL,IYL",
				0xFD, 0x6E, 0xFC, "LD L,(IY-4)",
				0xFD, 0x6F, "LD IYL,A",
				0xFD, 0x70, 0xFC, "LD (IY-4),B",
				0xFD, 0x71, 0xFC, "LD (IY-4),C",
				0xFD, 0x72, 0xFC, "LD (IY-4),D",
				0xFD, 0x73, 0xFC, "LD (IY-4),E",
				0xFD, 0x74, 0xFC, "LD (IY-4),H",
				0xFD, 0x75, 0xFC, "LD (IY-4),L",
				0xFD, 0x76, "INVALID INSTRUCTION",
				0xFD, 0x77, 0xFC, "LD (IY-4),A",
				0xFD, 0x78, "INVALID INSTRUCTION",
				0xFD, 0x79, "INVALID INSTRUCTION",
				0xFD, 0x7A, "INVALID INSTRUCTION",
				0xFD, 0x7B, "INVALID INSTRUCTION",
				0xFD, 0x7C, "LD A,IYH",
				0xFD, 0x7D, "LD A,IYL",
				0xFD, 0x7E, 0xFC, "LD A,(IY-4)",
				0xFD, 0x7F, "INVALID INSTRUCTION",
				0xFD, 0x80, "INVALID INSTRUCTION",
				0xFD, 0x81, "INVALID INSTRUCTION",
				0xFD, 0x82, "INVALID INSTRUCTION",
				0xFD, 0x83, "INVALID INSTRUCTION",
				0xFD, 0x84, "ADD A,IYH",
				0xFD, 0x85, "ADD A,IYL",
				0xFD, 0x86, 0xFC, "ADD A,(IY-4)",
				0xFD, 0x87, "INVALID INSTRUCTION",
				0xFD, 0x88, "INVALID INSTRUCTION",
				0xFD, 0x89, "INVALID INSTRUCTION",
				0xFD, 0x8A, "INVALID INSTRUCTION",
				0xFD, 0x8B, "INVALID INSTRUCTION",
				0xFD, 0x8C, "ADC A,IYH",
				0xFD, 0x8D, "ADC A,IYL",
				0xFD, 0x8E, 0xFC, "ADC A,(IY-4)",
				0xFD, 0x8F, "INVALID INSTRUCTION",
				0xFD, 0x90, "INVALID INSTRUCTION",
				0xFD, 0x91, "INVALID INSTRUCTION",
				0xFD, 0x92, "INVALID INSTRUCTION",
				0xFD, 0x93, "INVALID INSTRUCTION",
				0xFD, 0x94, "SUB IYH",
				0xFD, 0x95, "SUB IYL",
				0xFD, 0x96, 0xFC, "SUB (IY-4)",
				0xFD, 0x97, "INVALID INSTRUCTION",
				0xFD, 0x98, "INVALID INSTRUCTION",
				0xFD, 0x99, "INVALID INSTRUCTION",
				0xFD, 0x9A, "INVALID INSTRUCTION",
				0xFD, 0x9B, "INVALID INSTRUCTION",
				0xFD, 0x9C, "SBC A,IYH",
				0xFD, 0x9D, "SBC A,IYL",
				0xFD, 0x9E, 0xFC, "SBC A,(IY-4)",
				0xFD, 0x9F, "INVALID INSTRUCTION",
				0xFD, 0xA0, "INVALID INSTRUCTION",
				0xFD, 0xA1, "INVALID INSTRUCTION",
				0xFD, 0xA2, "INVALID INSTRUCTION",
				0xFD, 0xA3, "INVALID INSTRUCTION",
				0xFD, 0xA4, "AND IYH",
				0xFD, 0xA5, "AND IYL",
				0xFD, 0xA6, 0xFC, "AND (IY-4)",
				0xFD, 0xA7, "INVALID INSTRUCTION",
				0xFD, 0xA8, "INVALID INSTRUCTION",
				0xFD, 0xA9, "INVALID INSTRUCTION",
				0xFD, 0xAA, "INVALID INSTRUCTION",
				0xFD, 0xAB, "INVALID INSTRUCTION",
				0xFD, 0xAC, "XOR IYH",
				0xFD, 0xAD, "XOR IYL",
				0xFD, 0xAE, 0xFC, "XOR (IY-4)",
				0xFD, 0xAF, "INVALID INSTRUCTION",
				0xFD, 0xB0, "INVALID INSTRUCTION",
				0xFD, 0xB1, "INVALID INSTRUCTION",
				0xFD, 0xB2, "INVALID INSTRUCTION",
				0xFD, 0xB3, "INVALID INSTRUCTION",
				0xFD, 0xB4, "OR IYH",
				0xFD, 0xB5, "OR IYL",
				0xFD, 0xB6, 0xFC, "OR (IY-4)",
				0xFD, 0xB7, "INVALID INSTRUCTION",
				0xFD, 0xB8, "INVALID INSTRUCTION",
				0xFD, 0xB9, "INVALID INSTRUCTION",
				0xFD, 0xBA, "INVALID INSTRUCTION",
				0xFD, 0xBB, "INVALID INSTRUCTION",
				0xFD, 0xBC, "CP IYH",
				0xFD, 0xBD, "CP IYL",
				0xFD, 0xBE, 0xFC, "CP (IY-4)",
				0xFD, 0xBF, "INVALID INSTRUCTION",
				0xFD, 0xC0, "INVALID INSTRUCTION",
				0xFD, 0xC1, "INVALID INSTRUCTION",
				0xFD, 0xC2, "INVALID INSTRUCTION",
				0xFD, 0xC3, "INVALID INSTRUCTION",
				0xFD, 0xC4, "INVALID INSTRUCTION",
				0xFD, 0xC5, "INVALID INSTRUCTION",
				0xFD, 0xC6, "INVALID INSTRUCTION",
				0xFD, 0xC7, "INVALID INSTRUCTION",
				0xFD, 0xC8, "INVALID INSTRUCTION",
				0xFD, 0xC9, "INVALID INSTRUCTION",
				0xFD, 0xCA, "INVALID INSTRUCTION",
				// 0xDD, 0xCB -> Extended
				0xFD, 0xCC, "INVALID INSTRUCTION",
				0xFD, 0xCD, "INVALID INSTRUCTION",
				0xFD, 0xCE, "INVALID INSTRUCTION",
				0xFD, 0xCF, "INVALID INSTRUCTION",
				0xFD, 0xD0, "INVALID INSTRUCTION",
				0xFD, 0xD1, "INVALID INSTRUCTION",
				0xFD, 0xD2, "INVALID INSTRUCTION",
				0xFD, 0xD3, "INVALID INSTRUCTION",
				0xFD, 0xD4, "INVALID INSTRUCTION",
				0xFD, 0xD5, "INVALID INSTRUCTION",
				0xFD, 0xD6, "INVALID INSTRUCTION",
				0xFD, 0xD7, "INVALID INSTRUCTION",
				0xFD, 0xD8, "INVALID INSTRUCTION",
				0xFD, 0xD9, "INVALID INSTRUCTION",
				0xFD, 0xDA, "INVALID INSTRUCTION",
				0xFD, 0xDB, "INVALID INSTRUCTION",
				0xFD, 0xDC, "INVALID INSTRUCTION",
				//0xFD, 0xDD, "[NOP]",
				0xFD, 0xDE, "INVALID INSTRUCTION",
				0xFD, 0xDF, "INVALID INSTRUCTION",
				0xFD, 0xE0, "INVALID INSTRUCTION",
				0xFD, 0xE1, "POP IY",
				0xFD, 0xE2, "INVALID INSTRUCTION",
				0xFD, 0xE3, "EX (SP),IY",
				0xFD, 0xE4, "INVALID INSTRUCTION",
				0xFD, 0xE5, "PUSH IY",
				0xFD, 0xE6, "INVALID INSTRUCTION",
				0xFD, 0xE7, "INVALID INSTRUCTION",
				0xFD, 0xE8, "INVALID INSTRUCTION",
				//0xDD, 0xE9, "JP (IY)",  // Is done at last, otherwise below code is not recognized as program.
				0xFD, 0xEA, "INVALID INSTRUCTION",
				0xFD, 0xEB, "INVALID INSTRUCTION",
				0xFD, 0xEC, "INVALID INSTRUCTION",
				//0xFD, 0xED, "[NOP]",
				0xFD, 0xEE, "INVALID INSTRUCTION",
				0xFD, 0xEF, "INVALID INSTRUCTION",
				0xFD, 0xF0, "INVALID INSTRUCTION",
				0xFD, 0xF1, "INVALID INSTRUCTION",
				0xFD, 0xF2, "INVALID INSTRUCTION",
				0xFD, 0xF3, "INVALID INSTRUCTION",
				0xFD, 0xF4, "INVALID INSTRUCTION",
				0xFD, 0xF5, "INVALID INSTRUCTION",
				0xFD, 0xF6, "INVALID INSTRUCTION",
				0xFD, 0xF7, "INVALID INSTRUCTION",
				0xFD, 0xF8, "INVALID INSTRUCTION",
				0xFD, 0xF9, "LD SP,IY",
				0xFD, 0xFA, "INVALID INSTRUCTION",
				0xFD, 0xFB, "INVALID INSTRUCTION",
				0xFD, 0xFC, "INVALID INSTRUCTION",
				//0xFD, 0xFD, "[NOP]",
				0xFD, 0xFE, "INVALID INSTRUCTION",
				0xFD, 0xFF, "INVALID INSTRUCTION",

				0xFD, 0xE9, "JP (IY)",
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('FDCB (IY bit instructions)', () => {
			const combined = [
				0xFD, 0xCB, 0x06, 0x00, "RLC (IY+6),B",
				0xFD, 0xCB, 0x06, 0x01, "RLC (IY+6),C",
				0xFD, 0xCB, 0x06, 0x02, "RLC (IY+6),D",
				0xFD, 0xCB, 0x06, 0x03, "RLC (IY+6),E",
				0xFD, 0xCB, 0x06, 0x04, "RLC (IY+6),H",
				0xFD, 0xCB, 0x06, 0x05, "RLC (IY+6),L",
				0xFD, 0xCB, 0x06, 0x06, "RLC (IY+6)",
				0xFD, 0xCB, 0x06, 0x07, "RLC (IY+6),A",
				0xFD, 0xCB, 0x06, 0x08, "RRC (IY+6),B",
				0xFD, 0xCB, 0x06, 0x09, "RRC (IY+6),C",
				0xFD, 0xCB, 0x06, 0x0A, "RRC (IY+6),D",
				0xFD, 0xCB, 0x06, 0x0B, "RRC (IY+6),E",
				0xFD, 0xCB, 0x06, 0x0C, "RRC (IY+6),H",
				0xFD, 0xCB, 0x06, 0x0D, "RRC (IY+6),L",
				0xFD, 0xCB, 0x06, 0x0E, "RRC (IY+6)",
				0xFD, 0xCB, 0x06, 0x0F, "RRC (IY+6),A",
				0xFD, 0xCB, 0x06, 0x10, "RL (IY+6),B",
				0xFD, 0xCB, 0x06, 0x11, "RL (IY+6),C",
				0xFD, 0xCB, 0x06, 0x12, "RL (IY+6),D",
				0xFD, 0xCB, 0x06, 0x13, "RL (IY+6),E",
				0xFD, 0xCB, 0x06, 0x14, "RL (IY+6),H",
				0xFD, 0xCB, 0x06, 0x15, "RL (IY+6),L",
				0xFD, 0xCB, 0x06, 0x16, "RL (IY+6)",
				0xFD, 0xCB, 0x06, 0x17, "RL (IY+6),A",
				0xFD, 0xCB, 0x06, 0x18, "RR (IY+6),B",
				0xFD, 0xCB, 0x06, 0x19, "RR (IY+6),C",
				0xFD, 0xCB, 0x06, 0x1A, "RR (IY+6),D",
				0xFD, 0xCB, 0x06, 0x1B, "RR (IY+6),E",
				0xFD, 0xCB, 0x06, 0x1C, "RR (IY+6),H",
				0xFD, 0xCB, 0x06, 0x1D, "RR (IY+6),L",
				0xFD, 0xCB, 0x06, 0x1E, "RR (IY+6)",
				0xFD, 0xCB, 0x06, 0x1F, "RR (IY+6),A",
				0xFD, 0xCB, 0x06, 0x20, "SLA (IY+6),B",
				0xFD, 0xCB, 0x06, 0x21, "SLA (IY+6),C",
				0xFD, 0xCB, 0x06, 0x22, "SLA (IY+6),D",
				0xFD, 0xCB, 0x06, 0x23, "SLA (IY+6),E",
				0xFD, 0xCB, 0x06, 0x24, "SLA (IY+6),H",
				0xFD, 0xCB, 0x06, 0x25, "SLA (IY+6),L",
				0xFD, 0xCB, 0x06, 0x26, "SLA (IY+6)",
				0xFD, 0xCB, 0x06, 0x27, "SLA (IY+6),A",
				0xFD, 0xCB, 0x06, 0x28, "SRA (IY+6),B",
				0xFD, 0xCB, 0x06, 0x29, "SRA (IY+6),C",
				0xFD, 0xCB, 0x06, 0x2A, "SRA (IY+6),D",
				0xFD, 0xCB, 0x06, 0x2B, "SRA (IY+6),E",
				0xFD, 0xCB, 0x06, 0x2C, "SRA (IY+6),H",
				0xFD, 0xCB, 0x06, 0x2D, "SRA (IY+6),L",
				0xFD, 0xCB, 0x06, 0x2E, "SRA (IY+6)",
				0xFD, 0xCB, 0x06, 0x2F, "SRA (IY+6),A",
				0xFD, 0xCB, 0x06, 0x30, "SLL (IY+6),B",
				0xFD, 0xCB, 0x06, 0x31, "SLL (IY+6),C",
				0xFD, 0xCB, 0x06, 0x32, "SLL (IY+6),D",
				0xFD, 0xCB, 0x06, 0x33, "SLL (IY+6),E",
				0xFD, 0xCB, 0x06, 0x34, "SLL (IY+6),H",
				0xFD, 0xCB, 0x06, 0x35, "SLL (IY+6),L",
				0xFD, 0xCB, 0x06, 0x36, "SLL (IY+6)",
				0xFD, 0xCB, 0x06, 0x37, "SLL (IY+6),A",
				0xFD, 0xCB, 0x06, 0x38, "SRL (IY+6),B",
				0xFD, 0xCB, 0x06, 0x39, "SRL (IY+6),C",
				0xFD, 0xCB, 0x06, 0x3A, "SRL (IY+6),D",
				0xFD, 0xCB, 0x06, 0x3B, "SRL (IY+6),E",
				0xFD, 0xCB, 0x06, 0x3C, "SRL (IY+6),H",
				0xFD, 0xCB, 0x06, 0x3D, "SRL (IY+6),L",
				0xFD, 0xCB, 0x06, 0x3E, "SRL (IY+6)",
				0xFD, 0xCB, 0x06, 0x3F, "SRL (IY+6),A",
				0xFD, 0xCB, 0x06, 0x40, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x41, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x42, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x43, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x44, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x45, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x46, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x47, "BIT 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x48, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x49, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4A, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4B, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4C, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4D, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4E, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x4F, "BIT 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x50, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x51, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x52, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x53, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x54, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x55, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x56, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x57, "BIT 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x58, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x59, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5A, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5B, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5C, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5D, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5E, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x5F, "BIT 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x60, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x61, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x62, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x63, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x64, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x65, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x66, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x67, "BIT 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0x68, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x69, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6A, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6B, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6C, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6D, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6E, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x6F, "BIT 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0x70, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x71, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x72, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x73, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x74, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x75, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x76, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x77, "BIT 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0x78, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x79, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7A, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7B, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7C, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7D, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7E, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x7F, "BIT 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0x80, "RES 0,(IY+6),B",
				0xFD, 0xCB, 0x06, 0x81, "RES 0,(IY+6),C",
				0xFD, 0xCB, 0x06, 0x82, "RES 0,(IY+6),D",
				0xFD, 0xCB, 0x06, 0x83, "RES 0,(IY+6),E",
				0xFD, 0xCB, 0x06, 0x84, "RES 0,(IY+6),H",
				0xFD, 0xCB, 0x06, 0x85, "RES 0,(IY+6),L",
				0xFD, 0xCB, 0x06, 0x86, "RES 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0x87, "RES 0,(IY+6),A",
				0xFD, 0xCB, 0x06, 0x88, "RES 1,(IY+6),B",
				0xFD, 0xCB, 0x06, 0x89, "RES 1,(IY+6),C",
				0xFD, 0xCB, 0x06, 0x8A, "RES 1,(IY+6),D",
				0xFD, 0xCB, 0x06, 0x8B, "RES 1,(IY+6),E",
				0xFD, 0xCB, 0x06, 0x8C, "RES 1,(IY+6),H",
				0xFD, 0xCB, 0x06, 0x8D, "RES 1,(IY+6),L",
				0xFD, 0xCB, 0x06, 0x8E, "RES 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0x8F, "RES 1,(IY+6),A",
				0xFD, 0xCB, 0x06, 0x90, "RES 2,(IY+6),B",
				0xFD, 0xCB, 0x06, 0x91, "RES 2,(IY+6),C",
				0xFD, 0xCB, 0x06, 0x92, "RES 2,(IY+6),D",
				0xFD, 0xCB, 0x06, 0x93, "RES 2,(IY+6),E",
				0xFD, 0xCB, 0x06, 0x94, "RES 2,(IY+6),H",
				0xFD, 0xCB, 0x06, 0x95, "RES 2,(IY+6),L",
				0xFD, 0xCB, 0x06, 0x96, "RES 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0x97, "RES 2,(IY+6),A",
				0xFD, 0xCB, 0x06, 0x98, "RES 3,(IY+6),B",
				0xFD, 0xCB, 0x06, 0x99, "RES 3,(IY+6),C",
				0xFD, 0xCB, 0x06, 0x9A, "RES 3,(IY+6),D",
				0xFD, 0xCB, 0x06, 0x9B, "RES 3,(IY+6),E",
				0xFD, 0xCB, 0x06, 0x9C, "RES 3,(IY+6),H",
				0xFD, 0xCB, 0x06, 0x9D, "RES 3,(IY+6),L",
				0xFD, 0xCB, 0x06, 0x9E, "RES 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0x9F, "RES 3,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xA0, "RES 4,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xA1, "RES 4,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xA2, "RES 4,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xA3, "RES 4,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xA4, "RES 4,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xA5, "RES 4,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xA6, "RES 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0xA7, "RES 4,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xA8, "RES 5,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xA9, "RES 5,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xAA, "RES 5,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xAB, "RES 5,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xAC, "RES 5,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xAD, "RES 5,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xAE, "RES 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0xAF, "RES 5,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xB0, "RES 6,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xB1, "RES 6,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xB2, "RES 6,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xB3, "RES 6,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xB4, "RES 6,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xB5, "RES 6,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xB6, "RES 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0xB7, "RES 6,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xB8, "RES 7,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xB9, "RES 7,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xBA, "RES 7,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xBB, "RES 7,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xBC, "RES 7,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xBD, "RES 7,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xBE, "RES 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0xBF, "RES 7,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xC0, "SET 0,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xC1, "SET 0,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xC2, "SET 0,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xC3, "SET 0,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xC4, "SET 0,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xC5, "SET 0,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xC6, "SET 0,(IY+6)",
				0xFD, 0xCB, 0x06, 0xC7, "SET 0,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xC8, "SET 1,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xC9, "SET 1,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xCA, "SET 1,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xCB, "SET 1,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xCC, "SET 1,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xCD, "SET 1,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xCE, "SET 1,(IY+6)",
				0xFD, 0xCB, 0x06, 0xCF, "SET 1,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xD0, "SET 2,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xD1, "SET 2,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xD2, "SET 2,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xD3, "SET 2,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xD4, "SET 2,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xD5, "SET 2,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xD6, "SET 2,(IY+6)",
				0xFD, 0xCB, 0x06, 0xD7, "SET 2,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xD8, "SET 3,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xD9, "SET 3,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xDA, "SET 3,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xDB, "SET 3,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xDC, "SET 3,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xDD, "SET 3,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xDE, "SET 3,(IY+6)",
				0xFD, 0xCB, 0x06, 0xDF, "SET 3,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xE0, "SET 4,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xE1, "SET 4,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xE2, "SET 4,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xE3, "SET 4,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xE4, "SET 4,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xE5, "SET 4,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xE6, "SET 4,(IY+6)",
				0xFD, 0xCB, 0x06, 0xE7, "SET 4,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xE8, "SET 5,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xE9, "SET 5,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xEA, "SET 5,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xEB, "SET 5,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xEC, "SET 5,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xED, "SET 5,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xEE, "SET 5,(IY+6)",
				0xFD, 0xCB, 0x06, 0xEF, "SET 5,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xF0, "SET 6,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xF1, "SET 6,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xF2, "SET 6,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xF3, "SET 6,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xF4, "SET 6,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xF5, "SET 6,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xF6, "SET 6,(IY+6)",
				0xFD, 0xCB, 0x06, 0xF7, "SET 6,(IY+6),A",
				0xFD, 0xCB, 0x06, 0xF8, "SET 7,(IY+6),B",
				0xFD, 0xCB, 0x06, 0xF9, "SET 7,(IY+6),C",
				0xFD, 0xCB, 0x06, 0xFA, "SET 7,(IY+6),D",
				0xFD, 0xCB, 0x06, 0xFB, "SET 7,(IY+6),E",
				0xFD, 0xCB, 0x06, 0xFC, "SET 7,(IY+6),H",
				0xFD, 0xCB, 0x06, 0xFD, "SET 7,(IY+6),L",
				0xFD, 0xCB, 0x06, 0xFE, "SET 7,(IY+6)",
				0xFD, 0xCB, 0x06, 0xFF, "SET 7,(IY+6),A"
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('invalid opcodes', () => {
			const combined = [
				// invalid instruction
				0xED, 0xCB, 'INVALID INSTRUCTION',
				0xED, 0x10, 'INVALID INSTRUCTION',
				// etc.
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('nop opcodes', () => {
			const combined = [
				0xDD, '[NOP]',
				0xDD, 0x09, 'ADD IX,BC',
				0xDD, '[NOP]',
				0xED, 0x40, 'IN B,(C)',
				0xDD, '[NOP]',
				0xFD, 0x19, 'ADD IY,DE',
				0xFD, '[NOP]',
				0xDD, 0x09, 'ADD IX,BC',
				0xFD, '[NOP]',
				0xED, 0x40, 'IN B,(C)',
				0xFD, '[NOP]',
				0xFD, 0x19, 'ADD IY,DE',
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('RST n', () => {
			const combined = [
				0xC7, 'RST 00h',
				0xCF, 'RST 08h',
				0xD7, 'RST 10h',
				0xDF, 'RST 18h',
				0xE7, 'RST 20h',
				0xEF, 'RST 28h',
				0xF7, 'RST 30h',
				0xFF, 'RST 38h',
			];
			const org = 0x1000;
			const error = checkDisassembly(combined, org);
			assert.equal(error, undefined, error);
		});


		test('ZX Next opcodes', () => {
			const combined = [
				0xED, 0xA4, 'LDIX',
				0xED, 0xA5, 'LDWS',
				0xED, 0xB4, 'LDIRX',
				0xED, 0xAC, 'LDDX',
				0xED, 0xBC, 'LDDRX',
				0xED, 0xB6, 'LDIRSCALE',
				0xED, 0xB7, 'LDPIRX',

				0xED, 0x30, 'MUL D,E',

				0xED, 0x31, 'ADD HL,A',
				0xED, 0x32, 'ADD DE,A',
				0xED, 0x33, 'ADD BC,A',
				0xED, 0x34, 0x34, 0x12, 'ADD HL,1234h',
				0xED, 0x35, 0x45, 0x23, 'ADD DE,2345h',
				0xED, 0x36, 0x56, 0x34, 'ADD BC,3456h',

				0xED, 0x23, 'SWAPNIB',

				0xED, 0x24, 'MIRROR',

				0xED, 0x8A, 0x11, 0x88, 'PUSH 1188h', // (big endian)

				0xED, 0x91, 0, 10, 'NEXTREG REG_MACHINE_ID,RMI_ZXNEXT',
				0xED, 0x91, 3, 0b10010010, 'NEXTREG REG_MACHINE_TYPE,92h (lock timing|Timing',
				0xED, 0x92, 5, 'NEXTREG REG_PERIPHERAL_1,A',
				0xED, 0x91, 250, 251, 'NEXTREG FAh,FBh',

				0xED, 0x93, 'PIXELDN',
				0xED, 0x94, 'PIXELAD',

				0xED, 0x95, 'SETAE',

				0xED, 0x27, 11, 'TEST 0Bh',

				0xED, 0x28, 'BSLA DE,B',
				0xED, 0x29, 'BSRA DE,B',
				0xED, 0x2A, 'BSRL DE,B',
				0xED, 0x2B, 'BSRF DE,B',
				0xED, 0x2C, 'BRLC DE,B',

				0xED, 0x98, 'JP (C)' // Should be last instruction to test.
			];
			const error = checkDisassembly(combined);
			assert.equal(error, undefined, error);
		});


		test('custom opcode', () => {
			const combined = [
				/*1000*/	0xCF, 0x99, 'RST 08h, CODE=99h',
				/*1002*/	0xD7, 0x01, 0x34, 0x12, 0xFF, 'RST 10h, a=01h, b=1234h, c=FFh'
			];
			Opcode.Opcodes[0xCF].appendToOpcode(", CODE=#n");
			Opcode.Opcodes[0xD7].appendToOpcode(", a=#n, b=#nn, c=#n");
			const org = 0x1000;
			const error = checkDisassembly(combined, org);
			assert.equal(error, undefined, error);
		});


		test('simple', () => {
			const combined = [
/*8000*/ 0x3e, 0xfd, 'LD A,FDh',
/*8002*/ 0x21, 0xdc, 0xfe, 'LD HL,FEDCh',
/*8005*/ 0xc9, 'RET'
			];
			const org = 0x8000;
			const error = checkDisassembly(combined, org);
			assert.equal(error, undefined, error);
		});


		test('more complex', () => {
			const memory = [
/*7000*/ 					// CCODE_START:
/*7000*/ 0x28, 0x00,		// 		jr z,l1_rel1
/*7002*/ 					// l1_rel1:
/*7002*/ 0x28, 0x00,		// 		jr z,l1_rel2
/*7004*/ 					// l1_rel2:
/*7004*/ 0x00,				// 		nop
/*7005*/					// l1_loop1:
/*7005*/ 0x10, 0xfe,		// 		djnz l1_loop1
/*7007*/ 0xcd, 0x0b, 0x70,	// 	    call CSUB1
/*700a*/ 0xc9,				// ret
/*700b*/ 					// CSUB1:
/*700b*/ 0x28, 0x00,		// 		jr z,s1_rel1
/*700d*/ 					// s1_rel1:
/*700d*/ 0x28, 0x00,		// 		jr z,s1_rel2
/*700f*/ 					// s1_rel2:
/*700f*/ 0x00, 				// 		nop
/*7010*/ 					// s1_loop1:
/*7010*/ 0x10, 0xfe,		// 		djnz s1_loop1
/*7012*/ 					// s1_loop2:
/*7012*/ 0x10, 0xfe,		// 		djnz s1_loop2
/*7014*/ 0xc9,				// 		ret
			];

			dasm.labelSubPrefix = "SUB";
			dasm.labelLblPrefix = "LBL";
			dasm.labelDataLblPrefix = "DATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";

			const org = 0x7000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.disassemble(65536);
			const lines = dasm.disassembledLines;

			//dasm.printLabels();
			//console.log('\n');
			//console.log(lines.join('\n'));

			assert(lines.length > 10);	// It's hard to find a good assert here.
		});


		test('self-modifying jp', () => {
			// Note: Regex to exchange list-output with bytes:
			// find-pattern: ^([0-9a-f]+)\s+([0-9a-f]+)?\s+([0-9a-f]+)?\s+([0-9a-f]+)?\s?(.*)
			// subst-pattern: /*$1*/ 0x$2, 0x$3, 0x$4,\t// $5

			const memory = [
/*5000*/ 					// STARTA1:
/*5000*/ 0xc3, 0x03, 0x50,	// 	    jp 0x5003
/*5003*/ 					// STARTA2:
/*5003*/ 0x21, 0x00, 0x60,	// 	    ld hl,0x6000
/*5006*/ 0x22, 0x01, 0x50,	// 	    ld (STARTA1+1),hl
/*5009*/ 0xc9, 				// ret
			];

			const org = 0x5000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.disassemble(65536);
			const linesUntrimmed = dasm.disassembledLines;

			const lines = trimAllLines(linesUntrimmed);

			//dasm.printLabels();

			//assert.equal(linesUntrimmed[5], 'SELF_MOD1:'); // Depends on priority
			//assert.equal(lines[3], 'LD (SELF_MOD1+1),HL');
			assert.equal(linesUntrimmed[3], 'SUB5000:');
			assert.equal(lines[3], 'LD (SUB5000+1),HL');
			assert(linesUntrimmed[7].indexOf("WARNING") >= 0);
		});


		test('wrong jp', () => {
			const memory = [
/*5000*/ 					// START:
/*5000*/ 0x21, 0x00, 0x60,	// 	    ld hl,0x6000
/*5003*/ 0xC3, 0x01, 0x50,	//		jp START+1
/*5006*/ //0xC9, 				// 		ret
			];

			const org = 0x5000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.disassemble(65536);
			const linesUntrimmed = dasm.disassembledLines;

			const lines = trimAllLines(linesUntrimmed);

			//dasm.printLabels();

			assert.equal(linesUntrimmed[3], 'LBL5000:');
			assert.equal(lines[2], 'JP LBL5000+1');
			assert(linesUntrimmed[5].indexOf("WARNING") >= 0);
		});


		test('jp (hl)', () => {
			const memory = [
/* 5000h */
0x21, 0x00, 0x60,	// ld hl,0x6000
0x28, 0x02,			// jr z,+2 to reach the next instruction
0xE9,				// jp (hl)
0x00,				// Is a 'DEFB 0' and not a 'NOP'
0x28, 0x03,			// jr z,+3 to reach the next instruction
0xDD, 0xE9,			// jp (ix)
0x00,				// Is a 'DEFB 0' and not a 'NOP'
0x28, 0x03,			// jr z,+3 to reach the next instruction
0xFD, 0xE9,			// jp (iy)
0x00,				// Is a 'DEFB 0' and not a 'NOP'
0xED, 0x98,			// jp (c)
0x00,				// Is a 'DEFB 0' and not a 'NOP'
			];


			const org = 0x5000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);
			dasm.disassemble(65536);
			const linesUntrimmed = dasm.disassembledLines;

			const lines = trimAllLines(linesUntrimmed);

			//dasm.printLabels();

			let i = 3;
			assert.equal(lines[i], 'JP (HL)');
			assert.equal(lines[++i], 'DEFB 00h');
			i += 2
			assert.equal(lines[i], 'JP (IX)');
			assert.equal(lines[++i], 'DEFB 00h');
			i += 2
			assert.equal(lines[i], 'JP (IY)');
			assert.equal(lines[++i], 'DEFB 00h');
			assert.equal(lines[++i], 'JP (C)');
			assert.equal(lines[++i], 'DEFB 00h'); // NOSONAR
		});

		test('Assemble until unassigned area', () => {
			let warning = undefined;
			dasm.on('warning', msg => {
				warning = msg;
			});

			const memory = [
				0x3e, 0x01,			// LD a,1
				0x3e, 0x02,			// LD a,2
			];

			const org = 0x0;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setLabel(org);

			// Disassemble
			dasm.collectLabels(65536);
			dasm.disassemble(65536);
			const linesUntrimmed = dasm.getDisassemblyLines();
			const lines = trimAllLines(linesUntrimmed);

			assert.equal(lines.length, 3);
			assert.equal(lines[0], "ORG 0000h");
			assert.equal(lines[1], "LD A,01h");
			assert.equal(lines[2], "LD A,02h");
			assert(warning != undefined);
		});

    });


	suite('several memories', () => {

		test('2 areas', () => {
			const memory1 = [
				0xC7,	// RST 0
			];

			const memory2 = [
				0xE7,	// RST 32
			];

			const org1 = 0x1000;
			dasm.setMemory(org1, new Uint8Array(memory1));
			dasm.setLabel(org1);

			const org2 = 0x2000;
			dasm.setMemory(org2, new Uint8Array(memory2));
			dasm.setLabel(org2);

			dasm.disassemble(65536);
			const linesUntrimmed = dasm.disassembledLines;

			const lines = trimAllLines(linesUntrimmed);
			//console.log(lines.join('\n'));

			let i = -1;
			assert.equal(lines[++i], 'ORG 1000h')
			assert.equal(lines[++i], 'RST 00h')
			assert.equal(lines[++i], 'ORG 2000h');
			assert.equal(lines[++i], 'RST 20h') // NOSONAR
		});

	});



	suite('complete binaries', () => {

		test('currah', () => {
			// configure
			dasm.labelSubPrefix = "SUB";
			dasm.labelLblPrefix = "LBL";
			dasm.labelDataLblPrefix = "DATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";

			const org = 0x8000;
			dasm.readBinFile(org, './tests/disassembler/data/currah.bin');
			dasm.setLabel(org);

			// Set the 3 call tables
			dasm.setJmpTable(0x80E5, 10);
			dasm.setJmpTable(0x80FD, 10);
			dasm.setJmpTable(0x8115, 10);

			// Disassemble
			dasm.disassemble(65536);
			const lines = dasm.disassembledLines;

			//dasm.printLabels();
			//console.log(lines.join('\n'));

			// There is no special check, basically just that it does not crash.
			assert(lines.length > 1000);
		});

		test('sw', () => {
			// configure
			dasm.labelSubPrefix = "SUB";
			dasm.labelLblPrefix = "LBL";
			dasm.labelDataLblPrefix = "DATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";
			dasm.clmnsAddress = 5;
			dasm.addOpcodeBytes = true;

			const org = 0x4000;
			dasm.memory.readBinFile(org, './tests/disassembler/data/sw.obj');
			dasm.setLabel(0xA660, "LBL_MAIN");
			dasm.setLabel(0xA5F7, "LBL_MAIN_INTERRUPT");

			// Disassemble
			dasm.disassemble(65536);
			const lines = dasm.disassembledLines;

			//dasm.printLabels();
			//console.log(lines.join('\n'));
			writeFileSync('./out/tests/out.asm', lines.join('\n'));

			// There is no special check, basically just that it does not crash.
			assert(lines.length > 1000);
		});

    });

	suite('complete sna files', () => {

		test('sw', () => {
			//return;
			// configure
			dasm.labelSubPrefix = "SUB";
			dasm.labelLblPrefix = "LBL";
			dasm.labelDataLblPrefix = "DATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";

			dasm.clmnsAddress = 5;
			dasm.addOpcodeBytes = true;

			dasm.readSnaFile('./tests/disassembler/data/sw.sna');
			dasm.setLabel(0xA5F7, "LBL_MAIN_INTERRUPT");

			// Disassemble
			dasm.disassemble(65536);
			const lines = dasm.disassembledLines;

			//dasm.printLabels();
			//console.log(lines.join('\n'));
			writeFileSync('./out/tests/out.asm', lines.join('\n'));

			// There is no special check, basically just that it does not crash.
			assert(lines.length > 1000);
		});

    });


	suite('mame', () => {

		test('.tr trace file', () => {
			// configure
			dasm.labelSubPrefix = "SUB";
			dasm.labelLblPrefix = "LBL";
			dasm.labelDataLblPrefix = "DATA";
			dasm.labelLocalLabelPrefix = "_lbl";
			dasm.labelLoopPrefix = "_loop";

			dasm.clmnsAddress = 5;
			dasm.addOpcodeBytes = true;

			dasm.readSnaFile('./tests/disassembler/data/sw.sna');
			//dasm.setLabel(0xA5F7, "LBL_MAIN_INTERRUPT");

			// Set tr file
			dasm.useMameTraceFile('./tests/disassembler/data/sw.tr');

			// Disassemble
			dasm.disassemble(65536);
			const lines = dasm.disassembledLines;

			//dasm.printLabels();
			//console.log(lines.join('\n'));
			writeFileSync('./out/tests/out.asm', lines.join('\n'));

			// There is no special check, basically just that it does not crash.
			assert(lines.length > 1000);
		});

    });


	suite('disassemble - labels', () => {

		test('findInterruptLabels 1', () => {
			const memory = [
				//8000 SUB:
				/*8000*/ 0x3A, 0x04, 0x80,	//     	ld   a,(nn)
				/*8003*/ 0xC9,           	//		ret
				/*8004*/ 0x06,				//		defb 6
				//8005 Interrupt:
				/*8005*/ 0x80,           	//		add  a,b
				/*8006*/ 0x47,           	//		ld   b,a
				/*8007*/ 0xC9,           	//		ret
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.addressQueue.push(0x8005)
			dasm.labelIntrptPrefix = "INTRPT";
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check size
			const labels = dasm.labels;
			const labelInt = labels.get(0x8005);
			assert(labelInt);
			assert(labelInt.name.startsWith('INTRPT'));
		});


		test('findInterruptLabels 2', () => {
			const memory1 = [
				//8000 SUB2:
				/*8000*/ 0x3E, 0x040,	//     	ld   a,4
				/*8002*/ 0xC9,           	//		ret
			];
			const memory2 = [
				//9000 SUB2:
				/*9000*/ 0x80,           	//		add  a,b
				/*9001*/ 0xC9,           	//		ret
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory1));
			dasm.memory.setMemory(0x9000, new Uint8Array(memory2));
			dasm.setFixedCodeLabel(org);
			dasm.addressQueue.push(0x9000)
			dasm.labelIntrptPrefix = "INTRPT";
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check size
			const labels = dasm.labels;
			const labelInt = labels.get(0x9000);
			assert(labelInt);
			assert(labelInt.name.startsWith('INTRPT'));
		});


		test('findInterruptLabels 3', () => {
			const memory = [
				//8000 SUB:
				/*8000*/ 0x3E, 0x04,		//     	ld   a,4
				/*8002*/ 0xC9,           	//		ret
				//8003 Interrupt:
				/*8003*/ 0x80,           	//		add  a,b
				/*8004*/ 0x47,           	//		ld   b,a
				/*8005*/ 0xC9,           	//		ret
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.addressQueue.push(0x8003)
			dasm.labelIntrptPrefix = "INTRPT";
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check size
			const labels = dasm.labels;
			const labelInt = labels.get(0x8003);
			assert(labelInt);
			assert(labelInt.name.startsWith('INTRPT'));
		});



		test('addFlowThroughReferences', () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,	//   LD   A,34
				/*8002*/ 0x3E, 0x01,	//   LD   A,01

				//8004 SUB2: <- This should become referenced by SUB1
				/*8004*/ 0x3E, 0x21,	//   LD   A,33
				/*8006*/ 0xC9,     		//	 RET

				// This is here to make sure that SUB1/2 labels are created.
				//8007 START:
				/*8007*/ 0xCD, 0x00, 0x80,//	 CALL SUB1
				/*800A*/ 0xCD, 0x04, 0x80,//	 CALL SUB2
				/*800D*/ 0xC9,     		//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.setFixedCodeLabel(0x8007, "START");
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;
			//const total = linesUntrimmed.join('\n');

			// Check label references
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8000);
			assert.equal(labelSUB1.references.size, 1);
			// Turn set into array
			const refs = [...labelSUB1.references];
			assert(refs.indexOf(0x8007) >= 0);

			const labelSUB2 = labels.get(0x8004);
			assert.equal(labelSUB2.references.size, 2);
			// Turn set into array
			const refs2 = [...labelSUB2.references];
			assert(refs2.indexOf(0x8002) >= 0);
			assert(refs2.indexOf(0x800A) >= 0);
		});


		// Same as before but changes order of 'setFixedCodeLabel'
		test('addFlowThroughReferences changed order', () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,	//   LD   A,34
				/*8002*/ 0x3E, 0x01,	//   LD   A,01


				//8004 SUB2: <- This should become referenced by SUB1
				/*8004*/ 0x3E, 0x21,	//   LD   A,33
				/*8006*/ 0xC9,     		//	 RET

				// This is here to make sure that SUB1/2 labels are created.
				//8007 START:
				/*8007*/ 0xCD, 0x00, 0x80,//	 CALL SUB1
				/*800A*/ 0xCD, 0x04, 0x80,//	 CALL SUB2
				/*800D*/ 0xC9,     		//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(0x8007, "START");
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label references
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8000);
			assert.equal(labelSUB1.references.size, 1);
			// Turn set into array
			const refs = [...labelSUB1.references];
			assert(refs.indexOf(0x8007) >= 0);

			const labelSUB2 = labels.get(0x8004);
			assert.equal(labelSUB2.references.size, 2);
			// Turn set into array
			const refs2 = [...labelSUB2.references];
			assert(refs2.indexOf(0x8002) >= 0);
			assert(refs2.indexOf(0x800A) >= 0);
		});



		// Same as before but changes order o CALLs'
		test('addFlowThroughReferences changed order 2', () => {
			const memory = [
				// This is here to make sure that SUB1/2 labels are created.
				//7FF9 START:
				/*7FF9*/ 0xCD, 0x00, 0x80,//	 CALL SUB1
				/*7FFC*/ 0xCD, 0x04, 0x80,//	 CALL SUB2
				/*7FFF*/ 0xC9,     			//	 RET

				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,	//   LD   A,34
				/*8002*/ 0x3E, 0x01,	//   LD   A,01


				//8004 SUB2: <- This should become referenced by SUB1
				/*8004*/ 0x3E, 0x21,	//   LD   A,33
				/*8006*/ 0xC9,     		//	 RET

			];

			const org = 0x7FF9;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(0x7FF9, "START");
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label references
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8000);
			assert.equal(labelSUB1.references.size, 1);
			// Turn set into array
			const refs = [...labelSUB1.references];
			assert(refs.indexOf(0x7FF9) >= 0);

			const labelSUB2 = labels.get(0x8004);
			assert.equal(labelSUB2.references.size, 2);
			// Turn set into array
			const refs2 = [...labelSUB2.references];
			assert(refs2.indexOf(0x8002) >= 0);
			assert(refs2.indexOf(0x7FFC) >= 0);
		});


		test('turnLBLintoSUB', () => {
			const memory = [
				// This is here to make sure that SUB1/2 labels are created.
				//8000 START:
				/*8000*/ 0xC2, 0x09, 0x80,	//	 JP NZ,LBL1
				/*8003*/ 0xCD, 0x0E, 0x80,	//   CALL SUB2
				/*8006*/ 0xC3, 0x00, 0x80,	//	 JP START

				//8009 LBL1/SUB1:	This is initially a LBL that is turned into a SUB
				/*8009*/ 0x3E, 0x22,	//   LD   A,34
				/*800B*/ 0x3E, 0x01,	//   LD   A,01
				/*800D*/ 0xC9,     		//	 RET

				//800E SUB2:
				/*800E*/ 0xC2, 0x09, 0x80,	// JP NZ,LBL1
				/*800F*/ 0xC9,     		//	 RET

			];
			// Note: 8009 is turned from a LBL into a SUB although no CALL reaches
			// it. It is changed because it ends with a RET.

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org, "START");
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label type
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8009);
			assert.equal(labelSUB1.type, NumberType.CODE_SUB);
		});


		test('findLocalLabelsInSubroutines', () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,		//   LD   A,34
				/*8002*/ 0xC2, 0x06, 0x80,	//   JP NZ,LBL1
				/*8005*/ 0xC9,     			//	 RET
				//8006 LBL1:	<- should be turned in a local label
				/*8000*/ 0x3E, 0x23,		//   LD   A,35
				//8008 LBL2:		<- should be turned in a local loop label
				/*8008*/ 0x3E, 0x24,		//   LD   A,36
				/*800A*/ 0x3E, 0x24,		//   LD   A,36
				/*800C*/ 0xC2, 0x08, 0x80,	//   JP NZ,LBL2
				/*800F*/ 0xC9,     			//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label types
			const labels = dasm.labels;
			const labelLBL1 = labels.get(0x8006);
			assert.equal(labelLBL1.type, NumberType.CODE_LOCAL_LBL);

			const labelLBL2 = labels.get(0x8008);
			assert.equal(labelLBL2.type, NumberType.CODE_LOCAL_LOOP);
		});


		test('addParentReferences', () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,		//   LD   A,34
				/*8002*/ 0xCD, 0x09, 0x80,	//   CALL SUB2
				/*8005*/ 0xCD, 0x09, 0x80,	//   CALL SUB2
				/*8008*/ 0xC9,     			//	 RET
				//8009 SUB2:	<- should be turned in a local label
				/*8009*/ 0x3E, 0x23,		//   LD   A,35
				/*800B*/ 0xC9,     			//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label types
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8000);
			const labelSUB2 = labels.get(0x8009);
			assert.equal(labelSUB2.references.size, 2);

			// Turn set into array
			const refs2 = [...labelSUB2.references];
			let k = refs2.indexOf(0x8002);
			assert(k >= 0);	// Reference exists
			const addrParents = dasm.addressParents;
			let addr = refs2[k];
			let parent = addrParents[addr]
			assert.equal(parent, labelSUB1);	// and has right parent
			k = refs2.indexOf(0x8005);
			assert(k >= 0);	// Reference exists
			addr = refs2[k];
			parent = addrParents[addr]
			assert.equal(parent, labelSUB1);	// and has right parent

			// SUB1 has no ref
			const refs1 = [...labelSUB1.references];
			assert.equal(refs1.length, 0);
		});


		test("addParentReferences - remove self references: don't remove call", () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,		//   LD   A,34
				/*8002*/ 0xCD, 0x00, 0x80,	//   CALL SUB1
				/*8005*/ 0xC9,     			//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label types
			const labels = dasm.labels;
			const labelSUB1 = labels.get(0x8000);
			assert.equal(labelSUB1.references.size, 1);
		});

		test('addParentReferences - remove self references: remove jump', () => {
			const memory = [
				//8000 SUB1:
				/*8000*/ 0x3E, 0x22,		//   LD   A,34
				/*8002*/ 0x10, 256-4,		//   DJNZ SUB1
				/*8005*/ 0xC9,     			//	 RET
			];

			const org = 0x8000;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check label types
			const labels = dasm.labels;
			assert.equal(labels.size, 1);
			const labelSUB1 = labels.get(0x8000);
			assert.equal(labelSUB1.references.size, 0);
		});

	});


	suite('statistics', () => {

		test('size', () => {
			const memory = [
				//7216 SUB006:
				/*7216*/ 0x01, 0x11, 0x02,	//     ld   bc,529 ; 0211h
				/*7219*/ 0x3A, 0x13, 0x70,	//     ld   a,(DATA131) ; 7013h
				/*721C*/ 0xFE, 0x12,      	//	   cp   18     ; 12h
				/*721E*/ 0x38, 0x03,        //		jr   c,.sub006_l ; 7223h
				/*7220*/ 0x0C,           	//		inc  c
				/*7221*/ 0xD6, 0x12,        //		sub  a,18   ; 12h
				/*7223 .sub006_l:
				/*7223*/ 0x80,           	//		add  a,b
				/*7224*/ 0x47,           	//		ld   b,a
				/*7225*/ 0xCD, 0x28, 0x7C,	//     call SUB081 ; 7C28h
				/*7228*/ 0x3E, 0x8F,		//     ld   a,143  ; 8Fh, -113
				/*722A*/ 0xC9,
			];

			const org = 0x7216;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check size
			const labels = dasm.labels;
			const statistics = dasm.subroutineStatistics;
			const labelSub = labels.get(org);
			const stats = statistics.get(labelSub);
			assert.equal(stats.sizeInBytes, 21);
			assert.equal(stats.countOfInstructions, 11);
		});


		test('cyclomatic complexity', () => {
			const memory = [
				//7216 SUB006: (29206)		// CC: 1
				/*7216*/ 0x01, 0x11, 0x02,	//     ld   bc,529 ; 0211h
				/*7219*/ 0x3A, 0x13, 0x70,	//     ld   a,(DATA131) ; 7013h
				/*721C*/ 0xFE, 0x12,      	// +1	   cp   18     ; 12h
				/*721E*/ 0x38, 0x03,        //		jr   c,.sub006_l ; 7223h
				/*7220*/ 0xC4, 0x28, 0x7C,  // +1	call nz,SUB081 ; 7C28h
				/*7223 .sub006_l:
				/*7223*/ 0x80,           	//		add  a,b
				/*7224*/ 0xC0,           	// +1		ret nz
				/*7225*/ 0xCD, 0x28, 0x7C,	//     call SUB081 ; 7C28h
				/*7228*/ 0x3E, 0x8F,		//     ld   a,143  ; 8Fh, -113
				/*722A*/ 0xC9,		// CC-> 4
			];

			const org = 0x7216;
			dasm.memory.setMemory(org, new Uint8Array(memory));
			dasm.setFixedCodeLabel(org);
			dasm.disassemble(65536);
			//const linesUntrimmed = dasm.disassembledLines;

			// Check size
			const labels = dasm.labels;
			const statistics = dasm.subroutineStatistics;
			const labelSub = labels.get(org);
			const stats = statistics.get(labelSub);
			assert.equal(stats.CyclomaticComplexity, 4);
		});

	});


	suite('nodes', () => {

		let dng: DisassemblerNextGen;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			dng.readBinFile(0, './tests/disassembler/projects/nodes/main.bin');
			dngNodes = (dng as any).nodes;
			/* To view in the WATCH pane use e.g.:
			Array.from(dngNodes.values()).map(v => v.start.toString(16).toUpperCase().padStart(4, '0') + ': ' + v.label)
			*/
		});

		test('Simple', () => {
			dng.getFlowGraph([0x0000]);
			assert.equal(dngNodes.size, 1);
			let node = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node, undefined);
			assert.equal(node.instructions.length, 7);
			assert.equal(node.length, 7);
			assert.equal(node.callers.length, 0);
			assert.equal(node.predecessors.length, 0);
			assert.equal(node.callee, undefined);
			assert.equal(node.branchNodes.length, 0);
		});

		test('Simple, multiple addresses', () => {
			dng.getFlowGraph([6, 5, 4, 3, 2, 1, 0]);
			assert.equal(dngNodes.size, 1);
			let node = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node, undefined);
			assert.equal(node.instructions.length, 7);
			assert.equal(node.length, 7);
			assert.equal(node.callers.length, 0);
			assert.equal(node.predecessors.length, 0);
			assert.equal(node.callee, undefined);
			assert.equal(node.branchNodes.length, 0);
		});

		test('Branch', () => {
			dng.getFlowGraph([0x0100]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0100)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0105)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0107)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 3);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 2);
			assert.ok(node1.branchNodes.includes(node2));
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 2);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 2);
			assert.ok(node3.predecessors.includes(node1));
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('JR after RET', () => {
			dng.getFlowGraph([0x0200]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0200)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0205)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0209)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 3);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 2);
			assert.ok(node1.branchNodes.includes(node2));
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 2);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node1));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('LOOP', () => {
			dng.getFlowGraph([0x0300]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0300)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0302)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0305)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node2));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 2);
			assert.ok(node2.branchNodes.includes(node2));
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('LOOP self', () => {
			dng.getFlowGraph([0x0400]);
			assert.equal(dngNodes.size, 2);

			const node2 = dng.getNodeForAddress(0x0400)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0403)!;
			assert.notEqual(node3, undefined);

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node2));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 2);
			assert.ok(node2.branchNodes.includes(node2));
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('2 subs, same block', () => {
			dng.getFlowGraph([0x0500, 0x520]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0500)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0502)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0520)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node3));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 5);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node2));
		});

		test('2 subs, same block, reverse', () => {
			dng.getFlowGraph([0x0520, 0x500]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0500)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0502)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0520)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node3));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 5);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node2));
		});

		test('Simple call', () => {
			dng.getFlowGraph([0x0600]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0600)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0605)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0606)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, node3);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 1);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 3);
			assert.equal(node3.callers.length, 1);
			assert.ok(node3.callers.includes(node1));
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('2 calls, same sub', () => {
			dng.getFlowGraph([0x0700]);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(0x0700)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0705)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0708)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(0x0709)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, node4);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, node4);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);

			assert.equal(node4.instructions.length, 2);
			assert.equal(node4.length, 3);
			assert.equal(node4.callers.length, 2);
			assert.ok(node4.callers.includes(node1));
			assert.ok(node4.callers.includes(node2));
			assert.equal(node4.predecessors.length, 0);
			assert.equal(node4.callee, undefined);
			assert.equal(node4.branchNodes.length, 0);
		});

		test('Recursive call', () => {
			dng.getFlowGraph([0x0800]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0800)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0803)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0807)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
			assert.equal(node1.callers.length, 1);
			assert.ok(node1.callers.includes(node2));
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 4);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, node1);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);

		});

		test('Subroutine inside subroutine', () => {
			dng.getFlowGraph([0x0900, 0x0920]);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(0x0900)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0902)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0920)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(0x0923)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 2);
			assert.equal(node2.callers.length, 1);
			assert.ok(node2.callers.includes(node3));
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 3);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, node2);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node4));

			assert.equal(node4.instructions.length, 1);
			assert.equal(node4.length, 1);
			assert.equal(node4.callers.length, 0);
			assert.equal(node4.predecessors.length, 1);
			assert.ok(node4.predecessors.includes(node3));
			assert.equal(node4.callee, undefined);
			assert.equal(node4.branchNodes.length, 0);
		});
	});


	suite('partitionBlocks', () => {

		let dng: DisassemblerNextGen;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			dng.readBinFile(0, './tests/disassembler/projects/partition_blocks/main.bin');
			dngNodes = (dng as any).nodes;
		});

		// Checks if the addresses outside the block are all undefinded.
		function checkUndefined(blockStart: number, blockLength: number) {
			// Before
			for (let addr = 0; addr < blockStart; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}

			// After
			for (let addr = blockStart + blockLength; addr < 0x10000; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}
		}


		test('Simple block', () => {
			const startAddr = 0x0000;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			for (let addr = startAddr; addr < startAddr + 7; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(0, 7);
		});

		test('1 branch', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			for (let addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});

		test('JR after RET (2 blocks)', () => {
			const startAddr = 0x0200;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			// node1
			for (let addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (let addr = startAddr + 9; addr < startAddr + 0x0B; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			// Undefined
			const nop = (dng as any).blocks[startAddr + 8];
			assert.equal(nop, undefined, "Address=" + (startAddr + 8).toString(16));
			checkUndefined(startAddr, 0x0B);
		});

		test('Sub in sub', () => {
			const startAddr = 0x0300;
			dng.getFlowGraph([startAddr, startAddr + 4]);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node3, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 2; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 4; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			// node3
			for (; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node3, "Address=" + addr.toString(16));
			}

			// Undefined
			checkUndefined(startAddr, 8);
		});

		test('Complex jumping', () => {
			const startAddr = 0x0400;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 5)
			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			for (let addr = startAddr; addr < startAddr + 0x0E; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// Undefined
			checkUndefined(startAddr, 0x0E);
		});

		test('2 subs, sharing block', () => {
			const startAddr = 0x0500;
			dng.getFlowGraph([startAddr, startAddr + 0x20]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 0x20)!;
			assert.notEqual(node2, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 5; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// Undefined
			for (; addr < startAddr + 0x20; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 0x25; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 0x25);
		});

		test('Loop', () => {
			const startAddr = 0x0600;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 6; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 6);
		});

		test('Recursive call', () => {
			const startAddr = 0x1000;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});

		test('JP', () => {
			const startAddr = 0x1100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 2);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);

			// node1
			let addr = startAddr;
			for (; addr < startAddr + 5; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 1; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});
	});



	suite('assignLabels', () => {

		let dng: DisassemblerNextGen;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.labelLblPrefix = 'LLBL_';
			dng.labelSubPrefix = 'SSUB_';
			dng.labelLoopPrefix = 'LLOOP';
			dng.labelLocalLabelPrefix = 'LL';
			dng.setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			dng.readBinFile(0, './tests/disassembler/projects/assign_labels/main.bin');
			dngNodes = (dng as any).nodes;
		});

		test('Simple', () => {
			const startAddr = 0x0000;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			assert.equal(node1.label, 'SSUB_0000');
		});

		test('1 branch, local label', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_0100');
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, '.LL1');
		});

		test('JR after RET, global label', () => {
			const startAddr = 0x0200;
			dng.getFlowGraph([startAddr, startAddr + 9]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_0200');
			assert.equal(node2.label, 'SSUB_0209');
		});

		test('Sub in sub', () => {
			const startAddr = 0x0300;
			dng.getFlowGraph([startAddr, startAddr + 4]);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.label, 'SSUB_0300');
			assert.equal(node2.label, 'SSUB_0302');
			assert.equal(node3.label, 'LLBL_0304');
			assert.equal(node4.label, '.LLOOP');
		});


		test('Complex jumping', () => {
			const startAddr = 0x0400;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 8)!;
			assert.notEqual(node4, undefined);
			const node5 = dng.getNodeForAddress(startAddr + 0x0B)!;
			assert.notEqual(node5, undefined);

			assert.equal(node1.label, 'SSUB_0400');
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, '.LL1');
			assert.equal(node4.label, '.LL2');
			assert.equal(node5.label, undefined);
		});

		test('Loop', () => {
			const startAddr = 0x0600;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.label, 'SSUB_0600');
			assert.equal(node2.label, '.LLOOP');
			assert.equal(node3.label, undefined);
		});

		test('Nested loops', () => {
			const startAddr = 0x0700;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node4, undefined);
			const node5 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node5, undefined);

			assert.equal(node1.label, 'SSUB_0700');
			assert.equal(node2.label, '.LLOOP1');
			assert.equal(node3.label, '.LLOOP2');
			assert.equal(node4.label, undefined);
			assert.equal(node5.label, undefined);
		});

		test('Nested loops, same label', () => {
			const startAddr = 0x0800;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.label, 'SSUB_0800');
			assert.equal(node2.label, '.LLOOP');
			assert.equal(node3.label, undefined);
			assert.equal(node4.label, undefined);
		});

		test('Recursive call', () => {
			const startAddr = 0x1000;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.label, 'SSUB_1000');
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, undefined);
		});

		test('JP', () => {
			const startAddr = 0x1100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 2);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_1100');
			assert.ok(node1.isSubroutine);
			assert.equal(node2.label, '.LL1');
			assert.ok(node2.isSubroutine);
		});
	});


	suite('bank border', () => {

		let dng: DisassemblerNextGen;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.setSlotBankInfo(0x0000, 0x3FFF, 0, true);
			dng.setSlotBankInfo(0x4000, 0x7FFF, 1, false);
			dng.setSlotBankInfo(0x8000, 0xBFFF, 2, false);
			dng.setSlotBankInfo(0xC000, 0xFFFF, 3, false);
			dng.setCurrentSlots([0, 1, 2, 3]);	// A different bank in each slot
			dng.readBinFile(0, './tests/disassembler/projects/bank_border/main.bin');
			dngNodes = (dng as any).nodes;
		});

		test('From slot 0', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 6);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.equal(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.equal(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		test('From slot 1', () => {
			const startAddr = 0x4100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 7);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.notEqual(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.equal(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		test('From slot 2', () => {
			const startAddr = 0x8100;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 7);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.equal(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.notEqual(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		test('From slot 3', () => {
			const startAddr = 0xC000;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);	// A node is created although e.g. length is 0.

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.equal(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.equal(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.equal(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.notEqual(nodeC000, undefined);
		});
	});


	suite('Flow through slot', () => {

		let dng: DisassemblerNextGen;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.setSlotBankInfo(0x0000, 0x1FFF, 0, true);
			dng.setSlotBankInfo(0x2000, 0x3FFF, 1, false);
			dng.setSlotBankInfo(0x4000, 0x5FFF, 2, true);
			dng.setSlotBankInfo(0x6000, 0x7FFF, 3, false);
			dng.setSlotBankInfo(0x8000, 0x9FFF, 3, true);
			dng.setSlotBankInfo(0xA000, 0xBFFF, 3, true);
			dng.setSlotBankInfo(0xC000, 0xFFFF, 3, true);
			dng.setCurrentSlots([0, 1, 2, 3, 4, 5, 6]);	// A different bank in each slot
			dng.readBinFile(0, './tests/disassembler/projects/flow_through_slot/main.bin');
			dngNodes = (dng as any).nodes;
		});

		test('Flow through to unassigned or other bank', () => {
			const startAddr = 0x1FFE;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x1FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.comments.length, 0);

			const successor = node1.branchNodes[0];
			assert.equal(successor.start, 0x2000);
			assert.equal(successor.length, 0);
			assert.notEqual(successor.comments.length, 0);
		});

		test('Flow through from multi bank to single bank', () => {
			const startAddr = 0x3FFE;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x3FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.comments.length, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});

		test('Flow through with opcode to unassigned or other bank', () => {
			// Now the opcode is split between the banks.
			const startAddr = 0x5FFF;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x5FFF)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.comments.length, 1);

			assert.equal(node1.branchNodes.length, 0);
		});


		test('Flow through with opcode from multi bank to single bank', () => {
			// Now the opcode is split between the banks.
			const startAddr = 0x7FFF;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x7FFF)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.comments.length, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});

		test('Flow through single bank to single bank', () => {
			const startAddr = 0x9FFE;
			dng.getFlowGraph([startAddr]);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x9FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.comments.length, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});
	});


	suite('adjustAddress', () => {

		let dng: DisassemblerNextGen;
		setup(() => {
			dng = new DisassemblerNextGen();
			dng.setMemory(0x1000, new Uint8Array([0, 0, 0, 0, 1, 1, 1, 2]));
		});

		test('adjustAddress', () => {

			dng.memory.setAttributesAt(0x1004, 3, MemAttribute.CODE)
			dng.memory.addAttributeAt(0x1004, MemAttribute.CODE_FIRST);

			assert.equal((dng as any).adjustAddress(0x200), 0x200);
			assert.equal((dng as any).adjustAddress(0x1001), 0x1001);
			assert.equal((dng as any).adjustAddress(0x1003), 0x1003);
			assert.equal((dng as any).adjustAddress(0x1004), 0x1004);
			assert.equal((dng as any).adjustAddress(0x1005), 0x1004);
			assert.equal((dng as any).adjustAddress(0x1006), 0x1004);
			assert.equal((dng as any).adjustAddress(0x1007), 0x1007);
			assert.equal((dng as any).adjustAddress(0x1008), 0x1008);
			assert.equal((dng as any).adjustAddress(0x1009), 0x1009);
		});
	});
});
