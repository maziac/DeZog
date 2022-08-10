import * as assert from 'assert';
import {Utility} from '../../src/misc/utility';
import {Format} from '../../src/disassembler/format';
import {RenderText} from '../../src/disassembler/rendertext';
import {DisassemblerNextGen} from '../../src/disassembler/disasmnextgen';



suite('Disassembler - RenderText', () => {

	let disasm: DisassemblerNextGen;
	let r: any;
	setup(() => {
		disasm = new DisassemblerNextGen(
			addr64k => undefined,
			() => false,
			addr64k => Utility.getHexString(addr64k, 4) + '.1'
		);
		r = new RenderText(disasm);
		r.clmnsAddress = 7;
		r.clmnsBytes = 10;
		Format.hexFormat = '$';
	});

	suite('misc', () => {
		test('formatAddressLabel', () => {
			r.clmnsAddress = 12;
			let s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, '1234.1      LABEL1:');

			r.clmnsAddress = 3;
			s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, '1234.1 LABEL1:');
		});

		test('formatAddressInstruction', () => {
			r.clmnsAddress = 12;
			r.clmnsBytes = 8;
			let s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, '1234.1              LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, '1234.1         LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF], 'LD A,5');
			assert.equal(s, '1234.1 AF      LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02], 'LD A,5');
			assert.equal(s, '1234.1 AF 02   LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, '1234.1 AF ...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 9;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, '1234.1 AF 0...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 10;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, '1234.1 AF 02 45  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 11;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, '1234.1 AF 02 45   LD A,5');
		});
	});

	suite('printData', () => {
		test('printData', () => {
			assert.ok(false);
		});
	});


	suite('renderAllNodes', () => {
		// Disassemble
		function disassemble(startAddrs64k: number[]): string {
			(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			disasm.setCurrentSlots([0]);
			disasm.readBinFile(0, './tests/disassembler/projects/render_text/main.bin');

			disasm.getFlowGraph(startAddrs64k);
			const startNodes = disasm.getNodesForAddresses(startAddrs64k);
			disasm.disassembleNodes();
			const text = r.renderAllNodes(startNodes);
			return text;
		}

		// Compresses the string.
		function c(text: string): string {
			const s = text.replace(/ +/g, ' ');
			return s;
		}

		test('empty', () => {
			assert.equal(r.renderAllNodes([]), '');
		});

		test('simple node', () => {
			const text = disassemble([0x0000]);

			assert.equal(c(text), c(
				`0000.1 E5     PUSH HL
0001.1 23     INC HL
0002.1 78     LD A,B
0003.1 3C     INC A
0004.1 77     LD (HL),A
0005.1 E1     POP HL
0006.1 C9     RET
`));
		});

		test('1 branch', () => {
			const text = disassemble([0x0100, 0x0105, 0x0107]);

			assert.equal(c(text), c(
				`; Data: $0000-$00FF

0100.1 3E 05  LD A,$05
0102.1 B8     CP B
0103.1 28 02  JR Z,LBL_0107

0105.1 ED 44  NEG

0107.1 LBL_0107:
0107.1 C9     RET
`));
		});

		test('label', () => {
			disasm.funcGetLabel = (addr64k) => (addr64k == 0x107) ? 'MYLABEL' : undefined;
			const text = disassemble([0x0100, 0x0105, 0x0107]);

			assert.equal(c(text), c(
				`; Data: $0000-$00FF

0100.1 3E 05  LD A,$05
0102.1 B8     CP B
0103.1 28 02  JR Z,MYLABEL

0105.1 ED 44  NEG

0107.1 MYLABEL:
0107.1 C9     RET
`));
		});

		test('2 calls, same sub', () => {
			const text = disassemble([0x0700, 0x0705, 0x0708, 0x0709]);

			assert.equal(c(text), c(
				`; Data: $0000-$06FF

0700.1 3E 05    LD A,$05
0702.1 CD 09 07 CALL SUB_0709

0705.1 CD 09 07 CALL SUB_0709

0708.1 C9       RET

0709.1       SUB_0709:
0709.1 C6 02    ADD A,$02
070B.1 C9       RET
`));
		});

		test('opcode reference', () => {
			const text = disassemble([0x0700, 0x0705, 0x0708, 0x0709]);

			assert.equal(c(text), c(
				`; Data: $0000-$06FF

0700.1 3E 05    LD A,$05
0702.1 CD 09 07 CALL SUB_0709

0705.1 CD 09 07 CALL SUB_0709

0708.1 C9       RET

0709.1       SUB_0709:
0709.1 C6 02    ADD A,$02
070B.1 C9       RET
`));
		});


	});
});
