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
		r.clmnsBytes = 7;
		Format.hexFormat = '$';
	});

	suite('misc', () => {
		test('formatAddressLabel', () => {
			r.clmnsAddress = 12;
			let s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, 'LONG1234    LABEL1:');

			r.clmnsAddress = 3;
			s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(s, 'LONG1234 LABEL1:');
		});

		test('formatAddressInstruction', () => {
			r.clmnsAddress = 12;
			r.clmnsBytes = 8;
			let s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, 'LONG1234            LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [], 'LD A,5');
			assert.equal(s, 'LONG1234         LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF], 'LD A,5');
			assert.equal(s, 'LONG1234 AF      LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02   LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF ...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 9;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 0...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 10;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02 45  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 11;
			s = r.formatAddressInstruction(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(s, 'LONG1234 AF 02 45   LD A,5');
		});
	});

	suite('printData', () => {
		test('printData', () => {
			assert.ok(false);
		});
	});


	suite('renderAllNodes', () => {
		setup(() => {
			(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			disasm.setCurrentSlots([0]);
			disasm.readBinFile(0, './tests/disassembler/projects/nodes/main.bin');
		});

		test('empty', () => {
			assert.equal(r.renderAllNodes([]), '');
		});

		test('simple node', () => {
			const startAddrs64k = [0x0000];
			disasm.getFlowGraph(startAddrs64k);
			const startNodes = disasm.getNodesForAddresses(startAddrs64k);
			disasm.disassembleNodes();
			const text = r.renderAllNodes(startNodes);

			assert.equal(text,
				`0000.1 E5     PUSH HL
0001.1 23     INC HL
0002.1 78     LD A,B
0003.1 3C     INC A
0004.1 77     LD (HL),A
0005.1 E1     POP HL
0006.1 C9     RET
`);
		});

		test('1 branch', () => {
			const startAddrs64k = [0x0100, 0x0105, 0x0107];
			disasm.getFlowGraph(startAddrs64k);
			const startNodes = disasm.getNodesForAddresses(startAddrs64k);
			disasm.disassembleNodes();
			const text = r.renderAllNodes(startNodes);

			assert.equal(text,
				`; Data: $0100-$01FF

0100.1 3E 05  LD A,$05
0102.1 B8     CP B
0103.1 28 02  JR Z,LBL_0107

0105.1 ED 44  NEG

0107.1 LBL_0107:
0107.1 C9     RET
`);
		});

	});
});
