import * as assert from 'assert';
import {Opcode} from '../../src/disassembler/opcode';
import {AsmNode} from '../../src/disassembler/asmnode';
import {Utility} from '../../src/misc/utility';
import {RenderCallGraph} from '../../src/disassembler/rendercallgraph';
import {Format} from '../../src/disassembler/format';



suite('Disassembler - RenderCallGraph', () => {

	let r: any;
	setup(() => {
		r = new RenderCallGraph(
			addr64k => 'R' + Utility.getHexString(addr64k, 4),
			addr64k => 'LONG' + Utility.getHexString(addr64k, 4)
		);
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
