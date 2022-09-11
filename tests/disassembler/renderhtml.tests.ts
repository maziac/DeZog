import * as assert from 'assert';
import {readFileSync} from 'fs';
import {Utility} from '../../src/misc/utility';
import {Format} from '../../src/disassembler/format';
import {SmartDisassembler} from '../../src/disassembler/smartdisassembler';
import {RenderHtml} from '../../src/disassembler/renderhtml';
import {MemoryModelAllRam} from '../../src/remotes/MemoryModel/predefinedmemorymodels';
import {Z80RegistersStandardDecoder} from '../../src/remotes/z80registersstandarddecoder';
import {Settings} from '../../src/settings/settings';
import {Z80Registers, Z80RegistersClass} from '../../src/remotes/z80registers';



suite('Disassembler - RenderHtml', () => {

	let disasm: SmartDisassembler;
	let r: any;
	setup(() => {
		// Initialize Settings
		const cfg: any = {
			remoteType: 'zsim'
		};
		Settings.launch = Settings.Init(cfg);
		Z80RegistersClass.createRegisters();
		Z80Registers.decoder = new Z80RegistersStandardDecoder();
		disasm = new SmartDisassembler();
		disasm.funcGetLabel = addr64k => undefined;
		disasm.funcFilterAddresses = addr64k => true;
		disasm.funcFormatLongAddress = addr64k => Utility.getHexString(addr64k, 4) + '.1';
		r = new RenderHtml(disasm);
		r.clmnsAddress = 7;
		r.clmnsBytes = 10;
		r.dataReferences = [];
		Format.hexFormat = '$';
		const memModel = new MemoryModelAllRam();
		memModel.init();
		disasm.setMemoryModelAndArgs(memModel, {callAddressesReturnOffset: []});
	});

	// Compresses the string.
	function c(text: string): string {
		let s = text.replace(/[ \t]+/g, ' ');
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
			// Check for <script>
			const k = html.indexOf('<script>');
			assert.ok(k > 0, "Script expected in html.");
			// Check html before script
			const html2 = html.substring(0, k);
			assert.equal(c(html2), c(
				`<pre><span class="startlabel"><a href="#0100.1"><span class="bytes">0100.1 00 </span> <span id="D10_100"><span class="instruction">NOP</span></span></a></span>
<a href="#0101.1"><span class="bytes">0101.1 CD 05 01</span> <span id="D10_101"><span class="instruction">CALL SUB_0105</span></span></a>

<a href="#0104.1"><span class="bytes">0104.1 C9 </span> <span id="D10_104"><span class="instruction">RET</span></span></a>

<a href="#0105.1"><span class="bytes">0105.1 </span><span class="label">SUB_0105:</span></a>
<a href="#0105.1"><span class="bytes">0105.1 C9 </span> <span id="D10_105"><span class="instruction">RET</span></span></a>
</pre>
 `));
		});

		test('Note', () => {
			const html = disassembleDepth([0x0200], 10);
			// Check for <script>
			const k = html.indexOf('<script>');
			assert.ok(k > 0, "Script expected in html.");
			// Check html before script
			const html2 = html.substring(0, k);
			assert.equal(c(html2), c(
				`<pre><span class="comment">; Note: The disassembly is ambiguous at $0201.</span>
<span class="startlabel"><a href="#0200.1"><span class="bytes">0200.1 01 34 12</span> <span id="D10_200"><span class="instruction">LD BC,$1234</span></span></a></span>

<span class="comment">; Note: The disassembly is ambiguous at $0201.</span>
<a href="#0203.1"><span class="bytes">0203.1 C3 01 02</span> <span id="D10_203"><span class="instruction">JP 0201.1</span></span></a>
</pre>
 `));
		});
	});
});
