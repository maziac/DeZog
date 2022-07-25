import { AsmNode } from './../../src/disassembler/asmnode';
import * as assert from 'assert';



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


	suite('isLoop', () => {

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
			assert.ok(n1.otherReference());
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

			assert.ok(n2.otherReference());
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

			assert.ok(!n2.otherReference());
		});
	});
});
