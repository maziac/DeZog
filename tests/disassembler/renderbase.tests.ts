import * as assert from 'assert';
import {Opcode} from '../../src/disassembler/opcode';
import {AsmNode} from '../../src/disassembler/asmnode';
import {Utility} from '../../src/misc/utility';
import {RenderBase} from '../../src/disassembler/renderbase';



suite('Disassembler - RenderBase', () => {

	let r: any;
	setup(() => {
		r = new RenderBase(
			addr64k => 'R' + Utility.getHexString(addr64k, 4),
			addr64k => 'LONG' + Utility.getHexString(addr64k, 4)
		);
	});

	suite('misc', () => {
		test('getDotId', () => {
			const n = new AsmNode();
			n.start = 0x0001;
			assert.equal(r.getDotId(n), 'dot1');
			n.start = 0xF1FA;
			assert.equal(r.getDotId(n), 'dotf1fa');
		});

		test("addControls, don't crash", () => {
			r.addControls([''], false);
			r.addControls(['', ''], false);
			r.addControls([''], true);
			r.addControls(['', ''], true);
		});

		test("renderLines, don't crash", () => {
			r.renderLines(['']);
			r.renderLines(['', '']);
		});
	});

	suite('getAllRefAddressesFor', () => {
		test('AsmNode', () => {
			const n = new AsmNode();
			n.start = 0x8000;
			assert.equal(r.getAllRefAddressesFor(n), '');
			n.instructions.push(new Opcode(0x3E, "LD A,#n"));	// LD A,n
			assert.equal(r.getAllRefAddressesFor(n), 'LONG8000;');
			n.instructions.push(new Opcode(0xC1, "POP BC"));	// POP BC
			assert.equal(r.getAllRefAddressesFor(n), 'LONG8000;LONG8002;');
		});
	});

	suite('adjustSvg', () => {
		test('colors', () => {
			const text = '#FEFE01,#FEFE02,#FEFE03,#FEFE01,#FEFE02,#FEFE03,';
			assert.equal(r.adjustSvg(text), 'var(--vscode-editor-foreground),var(--vscode-editor-selectionBackground),var(--vscode-editor-inactiveSelectionBackground),var(--vscode-editor-foreground),var(--vscode-editor-selectionBackground),var(--vscode-editor-inactiveSelectionBackground),');
		});

		test('xlink:title', () => {
			const text = 'xlink:title="AAA",xlink:title="BB"';
			assert.equal(r.adjustSvg(text), 'xlink:title="",xlink:title=""');
		});

		test('<title>', () => {
			const text = '<title>XXXX<\/title>,<title>YY<\/title>';
			assert.equal(r.adjustSvg(text), ',');
		});
	});
});
