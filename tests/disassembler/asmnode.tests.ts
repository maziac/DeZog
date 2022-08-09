import { AsmNode } from './../../src/disassembler/asmnode';
import * as assert from 'assert';
import {Opcode} from '../../src/disassembler/opcode';



suite('AsmNode', () => {

	suite('isReachable', () => {

		test('Simple', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			assert.ok((n1 as any).isReachable([n2]));
			assert.ok(!(n2 as any).isReachable([n1]));
		});

		test('Several nodes', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();
			const n4 = new AsmNode();

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			n2.branchNodes.push(n3);
			n3.predecessors.push(n2);

			n3.branchNodes.push(n4);
			n4.predecessors.push(n3);

			// Reachable
			assert.ok((n1 as any).isReachable([n4]));
			assert.ok((n2 as any).isReachable([n4]));
			assert.ok((n3 as any).isReachable([n4]));

			assert.ok((n1 as any).isReachable([n3]));
			assert.ok((n2 as any).isReachable([n3]));

			assert.ok((n1 as any).isReachable([n2]));

			// Not reachable
			assert.ok(!(n4 as any).isReachable([n1]));
			assert.ok(!(n4 as any).isReachable([n2]));
			assert.ok(!(n4 as any).isReachable([n3]));

			assert.ok(!(n3 as any).isReachable([n1]));
			assert.ok(!(n3 as any).isReachable([n2]));

			assert.ok(!(n2 as any).isReachable([n1]));
		});

		test('Just one node', () => {
			const n1 = new AsmNode();

			assert.ok((n1 as any).isReachable([n1]));
		});

		test('2 nodes, unconnected', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();

			assert.ok(!(n1 as any).isReachable([n2]));
			assert.ok(!(n2 as any).isReachable([n1]));
		});

		test('Recursive nodes', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			n2.branchNodes.push(n3);
			n3.predecessors.push(n2);
			// Recursive:
			n2.branchNodes.push(n1);
			n1.predecessors.push(n2);

			// Reachable
			assert.ok((n1 as any).isReachable([n3]));
			assert.ok((n2 as any).isReachable([n1]));
			assert.ok((n2 as any).isReachable([n3]));

			assert.ok((n1 as any).isReachable([n2]));

			// Not reachable
			assert.ok(!(n3 as any).isReachable([n1]));
			assert.ok(!(n3 as any).isReachable([n2]));

		});
	});


	suite('isLoopRoot', () => {

		test('Simple', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();

			n1.start = 0;
			n2.start = 10;

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			// Loop:
			n2.branchNodes.push(n1);
			n1.predecessors.push(n2);

			assert.ok(n1.isLoopRoot());
			assert.ok(!n2.isLoopRoot());
		});


		test('Self loop', () => {
			const n1 = new AsmNode();
			n1.start = 100;

			n1.branchNodes.push(n1);
			n1.predecessors.push(n1);

			assert.ok(n1.isLoopRoot());
		});

		test('3 nodes', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();

			n1.start = 100;
			n2.start = 200;
			n3.start = 300;

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			n2.branchNodes.push(n3);
			n3.predecessors.push(n2);

			n3.branchNodes.push(n1);
			n1.predecessors.push(n3);


			assert.ok(n1.isLoopRoot());
			assert.ok(!n2.isLoopRoot());
			assert.ok(!n3.isLoopRoot());
		});

		test('3 nodes, shuffled', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();

			n1.start = 100;
			n2.start = 300;
			n3.start = 200;

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			n2.branchNodes.push(n3);
			n3.predecessors.push(n2);

			n3.branchNodes.push(n1);
			n1.predecessors.push(n3);


			assert.ok(n1.isLoopRoot());
			assert.ok(!n2.isLoopRoot());
			assert.ok(!n3.isLoopRoot());
		});
	});

	suite('noOtherReference', () => {

		test('Single node', () => {
			const n1 = new AsmNode();
			n1.start = 0;
			n1.length = 10;
			assert.ok(!n1.otherReference());
		});

		test('Single node, natural flow', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();

			n1.start = 0;
			n1.length = 100;
			n2.start = 100;
			n2.length = 10;

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			assert.ok(!n2.otherReference());
		});

		test('Single node, no natural flow', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();

			n1.start = 0;
			n1.length = 5;
			n2.start = 100;
			n2.length = 10;

			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);

			assert.ok(n2.otherReference());
		});
	});

	suite('isRET', () => {

		test('No RET, empty node', () => {
			const n = new AsmNode();
			assert.ok(!n.isRET());
		});

		test('No RET, one instruction', () => {
			const n = new AsmNode();
			n.instructions.push(new Opcode(0x00, "NOP"));	// NOP
			assert.ok(!n.isRET());
		});

		test('RET, 1 instruction', () => {
			const n = new AsmNode();
			n.instructions.push(new Opcode(0xC9, "RET"));	// RET
			assert.ok(n.isRET());
		});

		test('RET, 2 instructions', () => {
			const n = new AsmNode();
			n.instructions.push(new Opcode(0x00, "NOP"));	// NOP
			n.instructions.push(new Opcode(0xC9, "RET"));	// RET
			assert.ok(n.isRET());
		});
	});

	suite('getAllAddresses', () => {
		test('AsmNode, 0 instructions', () => {
			const n = new AsmNode();
			n.start = 0x8000;
			assert.equal(n.getAllAddresses().length, 0);
		});

		test('AsmNode, 1 instruction', () => {
			const n = new AsmNode();
			n.start = 0x8000;
			n.instructions.push(new Opcode(0x3E, "LD A,#n"));	// LD A,n
			const addrs = n.getAllAddresses();
			assert.equal(addrs.length, 1);
			assert.equal(addrs[0], 0x8000);
		});

		test('AsmNode, 2 instructions', () => {
			const n = new AsmNode();
			n.start = 0x8000;
			n.instructions.push(new Opcode(0x3E, "LD A,#n"));	// LD A,n
			n.instructions.push(new Opcode(0xC1, "POP BC"));	// POP BC
			const addrs = n.getAllAddresses();
			assert.equal(addrs.length, 2);
			assert.equal(addrs[0], 0x8000);
			assert.equal(addrs[1], 0x8002);
		});
	});


	suite('getBranchesRecursive', () => {
		test('no branch', () => {
			const n = new AsmNode();
			const branches: AsmNode[] = [];
			n.getBranchesRecursive(branches);
			assert.equal(branches.length, 0);
		});

		test('1 branch', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const unrelated = new AsmNode();
			n1.branchNodes.push(n2);
			const branches: AsmNode[] = [unrelated];
			n1.getBranchesRecursive(branches);
			assert.equal(branches.length, 2);
			assert.ok(branches.includes(n2));
			assert.ok(branches.includes(unrelated));
		});

		test('1 branch, already included', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const unrelated = new AsmNode();
			n1.branchNodes.push(n2);
			const branches: AsmNode[] = [unrelated, n2];
			n1.getBranchesRecursive(branches);
			assert.equal(branches.length, 2);
			assert.ok(branches.includes(n2));
			assert.ok(branches.includes(unrelated));
		});

		test('3 branches, recursive', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();
			n1.branchNodes.push(n2);
			n2.branchNodes.push(n3);
			n3.branchNodes.push(n1);
			const branches: AsmNode[] = [];
			n1.getBranchesRecursive(branches);
			assert.equal(branches.length, 3);
			assert.ok(branches.includes(n1));
			assert.ok(branches.includes(n2));
			assert.ok(branches.includes(n3));
		});
	});


	suite('markAsSubroutine', () => {
		test('not predecessor', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);
			n1.markAsSubroutine();
			assert.ok(n1.isSubroutine);
			assert.ok(!n2.isSubroutine);
		});

		test('predecessor', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);
			n2.markAsSubroutine();
			assert.ok(n1.isSubroutine);
			assert.ok(n2.isSubroutine);
		});

		test('already marked', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			n1.branchNodes.push(n2);
			n2.predecessors.push(n1);
			n2.isSubroutine = true;
			n2.markAsSubroutine();
			assert.ok(!n1.isSubroutine);
			assert.ok(n2.isSubroutine);
		});
	});

	suite('getAllDisassemblyLines', () => {
		test('different instructions', () => {
			const n1 = new AsmNode();

			// No instructions
			assert.equal(n1.getAllDisassemblyLines().length, 0);

			// 1 instruction
			const opc1 = new Opcode(0x00, "FIRST");
			n1.instructions.push(opc1);
			let lines = n1.getAllDisassemblyLines()
			assert.equal(lines.length, 1);
			assert.equal(lines[0], undefined);

			// Now disassembled
			opc1.disassembleOpcode(() => '');
			lines = n1.getAllDisassemblyLines()
			assert.equal(lines.length, 1);
			assert.equal(lines[0], "FIRST");

			// 2 instructions
			const opc2 = new Opcode(0x00, "SECOND");
			opc2.disassembleOpcode(() => '');
			n1.instructions.push(opc2);
			lines = n1.getAllDisassemblyLines()
			assert.equal(lines.length, 2);
			assert.equal(lines[0], "FIRST");
			assert.equal(lines[1], "SECOND");
		});
	});
});
