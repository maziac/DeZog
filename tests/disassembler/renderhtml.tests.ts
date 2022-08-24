import * as assert from 'assert';
import {readFileSync} from 'fs';
import {Utility} from '../../src/misc/utility';
import {Format} from '../../src/disassembler/format';
import {SmartDisassembler} from '../../src/disassembler/smartdisassembler';
import {RenderHtml} from '../../src/disassembler/renderhtml';



suite('Disassembler - RenderHtml', () => {

	let disasm: SmartDisassembler;
	let r: any;
	setup(() => {
		disasm = new SmartDisassembler();
		disasm.funcGetLabel = addr64k => undefined;
		disasm.funcFilterAddresses = addr64k => true;
		disasm.funcFormatLongAddress = addr64k => Utility.getHexString(addr64k, 4) + '.1';
		r = new RenderHtml(disasm);
		r.clmnsAddress = 7;
		r.clmnsBytes = 10;
		r.dataReferences = [];
		Format.hexFormat = '$';
	});

	// Compresses the string.
	function c(text: string): string {
		let s = text.replace(/ +/g, ' ');
		return s;
	}

	/** Reads a memory area as binary from a file.
	 * @param dng The disassembler object.
	 * @param path The file path to a binary file.
	 */
	function readBinFile(dng: SmartDisassembler, path: string) {
		const bin = new Uint8Array(readFileSync(path));
		dng.setMemory(0, bin);
	}


	suite('html format functions', () => {
		test('emphasizeLabel', () => {
			// Just test that there is some html formatting, don't test contents.
			assert.ok(r.emphasizeLabel('LABEL:').startsWith('<'));
			assert.ok(r.emphasizeLabel('LABEL:').endsWith('>'));
			assert.ok(r.emphasizeLabel('LABEL:').includes('LABEL:'));
		});

		test('emphasizeStartLabel', () => {
			// Just test that there is some html formatting, don't test contents.
			assert.ok(r.emphasizeStartLabel('LABEL:').startsWith('<span'));
			assert.ok(r.emphasizeStartLabel('LABEL:').endsWith('</span>'));
			assert.ok(r.emphasizeStartLabel('LABEL:').includes('LABEL:'));
		});

		test('emphasizeComment', () => {
			// Just test that there is some html formatting, don't test contents.
			assert.ok(r.emphasizeComment('; NOTE: xxx').startsWith('<span'));
			assert.ok(r.emphasizeComment('; NOTE: xxx').endsWith('</span>'));
			assert.ok(r.emphasizeComment('; NOTE: xxx').includes('; NOTE: xxx'));
		});
	});

	suite('html format disassembly', () => {
		// Disassemble
		function disassembleDepth(startAddrs64k: number[], depth: number): string {
			(disasm as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			disasm.setCurrentSlots([0]);
			readBinFile(disasm, './tests/disassembler/projects/render_html/main.bin');

			disasm.getFlowGraph(startAddrs64k, []);
			const startNodes = disasm.getNodesForAddresses(startAddrs64k);
			disasm.disassembleNodes();
			const html = r.renderForDepth(startNodes, depth);
			return html;
		}


		test('start label, label and references', () => {
			const html = disassembleDepth([0x0100], 10);

			assert.equal(c(html), c(
				`<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold"><a href="#0100.1">0100.1 <b><span style="color:var(--vscode-editorBracketHighlight-foreground3)">SUB_0100</span></b>:</a></span>
<a href="#0100.1">0100.1 00 NOP</a>
<a href="#0101.1">0101.1 CD 05 01 CALL SUB_0105</a>

<a href="#0104.1">0104.1 C9 RET</a>

<a href="#0105.1">0105.1 <b><span style="color:var(--vscode-editorBracketHighlight-foreground3)">SUB_0105</span></b>:</a>
<a href="#0105.1">0105.1 C9 RET</a>
`));
		});

		test('Note', () => {
			const html = disassembleDepth([0x0200], 10);

			assert.equal(c(html), c(
				`<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">; Note: The disassembly is ambiguous at $0201.</span>
<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold"><a href="#0200.1">0200.1 <b><span style="color:var(--vscode-editorBracketHighlight-foreground3)">LBL_0200</span></b>:</a></span>
<a href="#0200.1">0200.1 01 34 12 LD BC,$1234</a>

<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">; Note: The disassembly is ambiguous at $0201.</span>
<a href="#0203.1">0203.1 C3 01 02 JP LBL_0200+1</a>
`));
		});
	});
});
