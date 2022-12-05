import * as assert from 'assert';
import {Utility} from '../../src/misc/utility';
import {Format} from '../../src/disassembler/coredisassembler/format';
import {SmartDisassembler} from '../../src/disassembler/smartdisassembler';
import {RenderCallGraph} from '../../src/disassembler/rendercallgraph';



suite('Disassembler - RenderCallGraph', () => {

	let r: any;
	setup(() => {
		const disasm = new SmartDisassembler();
		disasm.funcGetLabel = addr64k => undefined;
		disasm.funcFormatLongAddress = addr64k => 'LONG' + Utility.getHexString(addr64k, 4);
		r = new RenderCallGraph(disasm);
		Format.hexFormat = '$';
	});

	suite('misc', () => {
		test('nodeFormat', () => {
			assert.equal(r.nodeFormat('SUB1234', 0x1234, 15), 'SUB1234\\n$1234\\n15 bytes\\n');
			assert.equal(r.nodeFormat('SUB1234', 0x1234, 1), 'SUB1234\\n$1234\\n1 byte\\n');
			assert.equal(r.nodeFormat(undefined, 0x1234, 1), '$1234\\n1 byte\\n');
			assert.equal(r.nodeFormat('SUB1234', 0x1234, undefined), 'SUB1234\\n$1234\\n');
			assert.equal(r.nodeFormat(undefined, 0x1234, undefined), '$1234\\n');
		});
	});
});
