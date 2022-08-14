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
		r.dataReferences = [];
		Format.hexFormat = '$';
	});

	// Strip html.
	function stripHtml(text: string): string {
		const s = text.replace(/<[^>]*>/g, '');
		return s;
	}
	// Compresses the string.
	function c(text: string): string {
		let s = text.replace(/ +/g, ' ');
		s = stripHtml(s);
		return s;
	}


	suite('misc', () => {
		test('formatAddressLabel', () => {
			r.clmnsAddress = 12;
			let s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(stripHtml(s), '1234.1      LABEL1:');

			r.clmnsAddress = 3;
			s = r.formatAddressLabel(0x1234, 'LABEL1');
			assert.equal(stripHtml(s), '1234.1 LABEL1:');
		});

		test('formatAddressInstruction', () => {
			r.clmnsAddress = 12;
			r.clmnsBytes = 8;
			let s = r.formatAddressPlusText(0x1234, [], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1              LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressPlusText(0x1234, [], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1         LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressPlusText(0x1234, [0xAF], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF      LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressPlusText(0x1234, [0xAF, 0x02], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF 02   LD A,5');

			r.clmnsAddress = 3;
			s = r.formatAddressPlusText(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF ...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 9;
			s = r.formatAddressPlusText(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF 0...  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 10;
			s = r.formatAddressPlusText(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF 02 45  LD A,5');

			r.clmnsAddress = 3;
			r.clmnsBytes = 11;
			s = r.formatAddressPlusText(0x1234, [0xAF, 0x02, 0x45], 'LD A,5');
			assert.equal(stripHtml(s), '1234.1 AF 02 45   LD A,5');
		});

		test('formatAddressPlusText', () => {
			r.clmnsAddress = 12;
			r.clmnsBytes = 8;
			let s = r.formatAddressPlusText(0x1234, [], ';');
			assert.equal(c(s), c('1234.1 ;'));
			s = r.formatAddressPlusText(0x1234, [0x00], 'NOP');
			assert.equal(c(s), c('1234.1 00 NOP'));
			s = r.formatAddressPlusText(0x1234, [0x3E, 0x05], 'LD A,5');
			assert.equal(c(s), c('1234.1 3E 05 LD A,5'));
		});
	});

	suite('render data', () => {
		test('getDefbComment', () => {
			assert.equal(r.getDefbComment(new Uint8Array([])), 'ASCII: ');
			assert.equal(r.getDefbComment(new Uint8Array([65])), 'ASCII: A');
			assert.equal(r.getDefbComment(new Uint8Array([65, 66])), 'ASCII: AB');
			assert.equal(r.getDefbComment(new Uint8Array([65, 66, 0])), 'ASCII: AB?');
		});

		test('getDefbLine', () => {
			assert.equal(r.getDefbLine(new Uint8Array([])), 'DEFB');
			assert.equal(r.getDefbLine(new Uint8Array([65])), 'DEFB 41');
			assert.equal(r.getDefbLine(new Uint8Array([65, 66])), 'DEFB 41 42');
			assert.equal(r.getDefbLine(new Uint8Array([65, 66, 0])), 'DEFB 41 42 00');
			assert.equal(r.getDefbLine(new Uint8Array([0x0A, 0xFC])), 'DEFB 0A FC');
		});

		test('getCompleteDataLine', () => {
			r.clmnsBytes = 8;
			disasm.memory.setMemory(0x1000, new Uint8Array([]));
			assert.equal(c(r.getCompleteDataLine(0x1000, 0)), '1000.1 DEFB ; ASCII: ');

			disasm.memory.setMemory(0x1000, new Uint8Array([65]));
			assert.equal(c(r.getCompleteDataLine(0x1000, 1)), '1000.1 41 DEFB 41 ; ASCII: A');

			disasm.memory.setMemory(0x1000, new Uint8Array([65, 66]));
			assert.equal(c(r.getCompleteDataLine(0x1000, 2)), '1000.1 41 42 DEFB 41 42 ; ASCII: AB');

			disasm.memory.setMemory(0x1000, new Uint8Array([65, 66, 0]));
			assert.equal(c(r.getCompleteDataLine(0x1000, 3)), '1000.1 41 ... DEFB 41 42 00 ; ASCII: AB?');

			disasm.memory.setMemory(0x1000, new Uint8Array([0x0A, 0xFC]));
			assert.equal(c(r.getCompleteDataLine(0x1000, 2)), '1000.1 0A FC DEFB 0A FC ; ASCII: ??');
		});

		test('getAddressLabel', () => {
			assert.equal(c(r.getAddressLabel(0x1000, 'LBL')), '1000.1 LBL:');
		});

		suite('printData', () => {
			test('no label', () => {
				const lines: string[] = [];
				r.printData(lines, 0x1000, 4);
				assert.equal(c(lines.join('\n')), '');
			});

			test('1 label', () => {
				r.clmnsBytes = 8;
				let lines: string[] = [];
				(disasm as any).otherLabels.set(0x1000, 'LBL');
				r.dataReferences.push(0x1000);
				r.printData(lines, 0x1000, 4);
				assert.equal(c(lines.join('\n')), `1000.1 LBL:
1000.1 00 ... DEFB 00 00 00 00 ; ASCII: ????
`);

				lines = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([0x41, 0x42]));
				(disasm as any).otherLabels.set(0x1000, 'LBL');
				r.dataReferences.push(0x1000);
				r.printData(lines, 0x1000, 2);
				assert.equal(c(lines.join('\n')), `1000.1 LBL:
1000.1 41 42 DEFB 41 42 ; ASCII: AB
`);
			});

			test('1 label, more data', () => {
				r.clmnsBytes = 8;
				const lines: string[] = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,
					9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
				(disasm as any).otherLabels.set(0x1000, 'LBL');
				r.dataReferences.push(0x1000);
				r.printData(lines, 0x1000, 20);
				assert.equal(c(lines.join('\n')), `1000.1 LBL:
1000.1 01 ... DEFB 01 02 03 04 05 06 07 08 ; ASCII: ????????
`);
			});

			test('1 label, offset', () => {
				r.clmnsBytes = 8;
				const lines: string[] = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,
					9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
				(disasm as any).otherLabels.set(0x1001, 'LBL');
				r.dataReferences.push(0x1001);
				r.printData(lines, 0x1000, 20);
				assert.equal(c(lines.join('\n')), `1001.1 LBL:
1001.1 02 ... DEFB 02 03 04 05 06 07 08 09 ; ASCII: ????????
`);
			});

			test('2 labels, distance = 1', () => {
				r.clmnsBytes = 8;
				const lines: string[] = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,
					9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
				(disasm as any).otherLabels.set(0x1001, 'LBL1');
				(disasm as any).otherLabels.set(0x1002, 'LBL2');
				r.dataReferences.push(0x1001);
				r.dataReferences.push(0x1002);
				r.dataReferences.sort((a, b) => b - a);
				r.printData(lines, 0x1000, 20);
				assert.equal(c(lines.join('\n')), `1001.1 LBL1:
1001.1 02 DEFB 02 ; ASCII: ?
1002.1 LBL2:
1002.1 03 ... DEFB 03 04 05 06 07 08 09 0A ; ASCII: ????????
`);
			});

			test('2 labels, distance <= 8', () => {
				r.clmnsBytes = 8;
				const lines: string[] = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,
					9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
				(disasm as any).otherLabels.set(0x1001, 'LBL1');
				(disasm as any).otherLabels.set(0x1003, 'LBL2');
				r.dataReferences.push(0x1001);
				r.dataReferences.push(0x1003);
				r.dataReferences.sort((a, b) => b - a);
				r.printData(lines, 0x1000, 20);
				assert.equal(c(lines.join('\n')), `1001.1 LBL1:
1001.1 02 03 DEFB 02 03 ; ASCII: ??
1003.1 LBL2:
1003.1 04 ... DEFB 04 05 06 07 08 09 0A 0B ; ASCII: ????????
`);
			});

			test('2 labels, distance > 8', () => {
				r.clmnsBytes = 8;
				const lines: string[] = [];
				disasm.memory.setMemory(0x1000, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,
					9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
				(disasm as any).otherLabels.set(0x1001, 'LBL1');
				(disasm as any).otherLabels.set(0x100A, 'LBL2');
				r.dataReferences.push(0x1001);
				r.dataReferences.push(0x100A);
				r.dataReferences.sort((a, b) => b - a);
				r.printData(lines, 0x1000, 20);
				assert.equal(c(lines.join('\n')), `1001.1 LBL1:
1001.1 02 ... DEFB 02 03 04 05 06 07 08 09 ; ASCII: ????????
100A.1 LBL2:
100A.1 0B ... DEFB 0B 0C 0D 0E 0F 10 11 12 ; ASCII: ????????
`);
			});
		});
	});

	suite('render code', () => {
		suite('renderNodes', () => {
			// Disassemble
			function disassemble(startAddrs64k: number[]): string {
				(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
				disasm.setCurrentSlots([0]);
				disasm.readBinFile(0, './tests/disassembler/projects/render_text/main.bin');

				disasm.getFlowGraph(startAddrs64k);
				const startNodes = disasm.getNodesForAddresses(startAddrs64k);
				disasm.disassembleNodes();
				const text = r.renderNodes(startNodes);
				return text;
			}

			test('empty', () => {
				assert.equal(r.renderNodes([]), '');
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
					`0100.1 3E 05  LD A,$05
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
					`0100.1 3E 05  LD A,$05
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
					`0700.1 3E 05    LD A,$05
0702.1 CD 09 07 CALL SUB_0709

0705.1 CD 09 07 CALL SUB_0709

0708.1 C9       RET

0709.1       SUB_0709:
0709.1 C6 02    ADD A,$02
070B.1 C9       RET
`));
			});

			test('Different order', () => {
				const text = disassemble([0x0709, 0x0708, 0x0700, 0x0705]);

				assert.equal(c(text), c(
					`0700.1 3E 05    LD A,$05
0702.1 CD 09 07 CALL SUB_0709

0705.1 CD 09 07 CALL SUB_0709

0708.1 C9       RET

0709.1       SUB_0709:
0709.1 C6 02    ADD A,$02
070B.1 C9       RET
`));
			});

			test('self modifying label in sub', () => {
				const text = disassemble([0x1000, 0x1008, 0x1009]);
				assert.equal(c(text), c(
					`1000.1 3E 06     LD A,$06
1002.1 32 0B 10  LD (SUB_1009.CODE_100A+1),A
1005.1 CD 09 10  CALL SUB_1009

1008.1 C9        RET

1009.1       SUB_1009:
1009.1 00        NOP
100A.1       SUB_1009.CODE_100A:
100A.1 0E 07     LD C,$07
100C.1 C9        RET
`));
			});

			test('self modifying label at sub', () => {
				const text = disassemble([0x1100, 0x1108, 0x1109]);
				assert.equal(c(text), c(
					`1100.1 3E 06     LD A,$06
1102.1 32 0A 11  LD (SUB_1109+1),A
1105.1 CD 09 11  CALL SUB_1109

1108.1 C9        RET

1109.1       SUB_1109:
1109.1 0E 07     LD C,$07
110B.1 C9        RET
`));
			});

			test('self modifying label wo sub', () => {
				const text = disassemble([0x1200]);
				assert.equal(c(text), c(
					`1200.1 3E 06     LD A,$06
1202.1 32 07 12  LD (CODE_1206+1),A
1205.1 00        NOP
1206.1       CODE_1206:
1206.1 0E 07     LD C,$07
1208.1 C9        RET
`));
			});

			test('referencing data', () => {
				const text = disassemble([0x1300, 0x130A]);
				assert.equal(c(text), c(
					`1300.1 3E 06       LD A,$06
1302.1 2A 08 13    LD HL,(DATA_1308)
1305.1 C3 0A 13    JP LBL_130A

1308.1 DATA_1308:
1308.1 34 12 DEFB 34 12 ; ASCII: 4?

130A.1           LBL_130A:
130A.1 11 DE DE    LD DE,$DEDE
130D.1 C9          RET
`));
			});

			test('code and data, no reference', () => {
				const text = disassemble([0x5001, 0x5004, 0x5007]);
				assert.equal(c(text), c(
					`5001.1 CD 07 50 CALL SUB_5007

5004.1 C9 RET

5007.1 SUB_5007:
5007.1 00 NOP
5008.1 C9 RET
`));
			});

			test('code and data', () => {
				const text = disassemble([0x5101, 0x5104, 0x5107]);
				assert.equal(c(text), c(
					`5100.1 DATA_5100:
5100.1 7F DEFB 7F ; ASCII: 

5101.1 CD 07 51 CALL SUB_5107

5104.1 C9 RET

5105.1 DATA_5105:
5105.1 2B 1A DEFB 2B 1A ; ASCII: +?

5107.1 SUB_5107:
5107.1 3A 00 51 LD A,(DATA_5100)
510A.1 2A 05 51 LD HL,(DATA_5105)
510D.1 ED 5B... LD DE,(DATA_5120)
5111.1 C9 RET

5120.1 DATA_5120:
5120.1 01 02... DEFB 01 02 03 04 05 06 07 08 ; ASCII: ????????
`));
			});
		});

		suite('renderForDepth', () => {
			// Disassemble
			function disassembleDepth(startAddrs64k: number[], depth: number): string {
				(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
				disasm.setCurrentSlots([0]);
				disasm.readBinFile(0, './tests/disassembler/projects/render_text/main.bin');

				disasm.getFlowGraph(startAddrs64k);
				const startNodes = disasm.getNodesForAddresses(startAddrs64k);
				disasm.disassembleNodes();
				const text = r.renderForDepth(startNodes, depth);
				return text;
			}

			suite('depths', () => {
				test('depth = 0', () => {
					const text = disassembleDepth([0x4000], 0);

					assert.equal(c(text), c(
						`4000.1 CD 04 40   CALL SUB_4004

4003.1 C9         RET
`));
				});

				test('depth = 1', () => {
					const text = disassembleDepth([0x4000], 1);

					assert.equal(c(text), c(
						`4000.1 CD 04 40   CALL SUB_4004

4003.1 C9         RET

4004.1          SUB_4004:
4004.1 CD 08 40   CALL SUB_4008

4007.1 C9         RET
`));
				});

				test('depth = 2', () => {
					const text = disassembleDepth([0x4000], 2);

					assert.equal(c(text), c(
						`4000.1 CD 04 40   CALL SUB_4004

4003.1 C9         RET

4004.1          SUB_4004:
4004.1 CD 08 40   CALL SUB_4008

4007.1 C9         RET

4008.1          SUB_4008:
4008.1 CD 0C 40   CALL SUB_400C

400B.1 C9         RET
`));
				});

				test('depth = 3', () => {
					const text = disassembleDepth([0x4000], 3);

					assert.equal(c(text), c(
						`4000.1 CD 04 40   CALL SUB_4004

4003.1 C9         RET

4004.1          SUB_4004:
4004.1 CD 08 40   CALL SUB_4008

4007.1 C9         RET

4008.1          SUB_4008:
4008.1 CD 0C 40   CALL SUB_400C

400B.1 C9         RET

400C.1          SUB_400C:
400C.1 C9         RET
`));
				});

				test('depth = 4, (max is 3)', () => {
					const text = disassembleDepth([0x4000], 4);

					assert.equal(c(text), c(
						`4000.1 CD 04 40   CALL SUB_4004

4003.1 C9         RET

4004.1          SUB_4004:
4004.1 CD 08 40   CALL SUB_4008

4007.1 C9         RET

4008.1          SUB_4008:
4008.1 CD 0C 40   CALL SUB_400C

400B.1 C9         RET

400C.1          SUB_400C:
400C.1 C9         RET
`));
				});

				test('depth = 3, different call order', () => {
					const text = disassembleDepth([0x4100], 3);

					assert.equal(c(text), c(
						`4100.1 CD 08 41   CALL SUB_4108

4103.1 C9         RET

4104.1          SUB_4104:
4104.1 CD 0C 41   CALL SUB_410C

4107.1 C9         RET

4108.1          SUB_4108:
4108.1 CD 04 41   CALL SUB_4104

410B.1 C9         RET

410C.1          SUB_410C:
410C.1 C9         RET
`));
				});
			});

			test('recursive', () => {
				const text = disassembleDepth([0x4200], 10);

				assert.equal(c(text), c(
					`4200.1 CD 04 42   CALL SUB_4204

4203.1 C9         RET

4204.1          SUB_4204:
4204.1 CD 04 42   CALL SUB_4204

4207.1 C9         RET
`));
			});

			test('partly the same', () => {
				const text = disassembleDepth([0x4300], 10);

				assert.equal(c(text), c(
					`4300.1 CD 07 43   CALL SUB_4307

4303.1 CD 09 43   CALL SUB_4309

4306.1 C9         RET

4307.1          SUB_4307:
4307.1 3E 05      LD A,$05

4309.1          SUB_4309:
4309.1 C9         RET
`));
			});

			test('self mod in other call', () => {
				const text = disassembleDepth([0x5200], 10);

				assert.equal(c(text), c(
					`5200.1 3A 08 52 LD A,(DATA_5208)
5203.1 CD 0A 52 CALL SUB_520A

5206.1 C9 RET

5208.1 DATA_5208:
5208.1 06 C9 DEFB 06 C9 ; ASCII: ??

520A.1 SUB_520A:
520A.1 C9 RET
`));
			});

			test('depth = 1, self mod in call', () => {
				const text = disassembleDepth([0x5300], 1);

				assert.equal(c(text), c(
					`5300.1 32 0B 53 LD (SUB_530A+1),A
5303.1 32 0D 53 LD (SUB_530A.CODE_530C+1),A
5306.1 CD 0F 53 CALL SUB_530F

5309.1 C9 RET

530A.1 SUB_530A:
530A.1 06 06    DEFB 06 06 ; ASCII: ??
530C.1 SUB_530A.CODE_530C:
530C.1 0E 09 C9 DEFB 0E 09 C9 ; ASCII: ???

530F.1 SUB_530F:
530F.1 CD 0A 53 CALL SUB_530A

5312.1 C9       RET
`));
			});

			test('depth = 2, self mod in call', () => {
				const text = disassembleDepth([0x5300], 2);

				assert.equal(c(text), c(
					`5300.1 32 0B 53 LD (SUB_530A+1),A
5303.1 32 0D 53 LD (SUB_530A.CODE_530C+1),A
5306.1 CD 0F 53 CALL SUB_530F

5309.1 C9 RET

530A.1 SUB_530A:
530A.1 06 06    LD B,$06
530C.1 SUB_530A.CODE_530C:
530C.1 0E 09    LD C,$09
530E.1 C9       RET

530F.1 SUB_530F:
530F.1 CD 0A 53 CALL SUB_530A

5312.1 C9       RET
`));
			});
		});


		suite('Strange disassemblies', () => {
			// This contains e.g. code that will lead to strange disassemblies.
			// Code that is probably wrong, but anyhow need to give some
			// disassembly result.

			// Disassemble
			function disassemble(startAddrs64k: number[]): string {
				(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
				disasm.setCurrentSlots([0]);
				disasm.readBinFile(0, './tests/disassembler/projects/render_text_strange/main.bin');

				disasm.getFlowGraph(startAddrs64k);
				const startNodes = disasm.getNodesForAddresses(startAddrs64k);
				disasm.disassembleNodes();
				const text = r.renderNodes(startNodes);
				return text;
			}

			test('jump into opcode', () => {
				const text = disassemble([0x0000]);

				assert.equal(c(text), c(
					`0000.1 00 NOP
0001.1 3E 05 LD A,$05
0003.1 00 NOP
0004.1 00 NOP
0005.1 C3 02 00 JP 0002.1
`));
			});
		});
	});
});
