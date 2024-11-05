import * as assert from 'assert';
import {readFileSync} from 'fs';
import {Format} from '../../src/disassembler/core/format';
import {AsmNode} from '../../src/disassembler/core/asmnode';
import {SmartDisassembler} from '../../src/disassembler/smartdisassembler';
import {Utility} from '../../src/misc/utility';
import {MemoryModelAllRam} from '../../src/remotes/MemoryModel/genericmemorymodels';
import {Settings} from '../../src/settings/settings';
import {Z80Registers, Z80RegistersClass} from '../../src/remotes/z80registers';
import {Z80RegistersStandardDecoder} from '../../src/remotes/z80registersstandarddecoder';
import {Opcode} from '../../src/disassembler/core/opcode';



suite('Disassembler', () => {

	// Function that can strip the main label from a local label.
	function ll(label: string): string {
		const localLabel = label.replace(/\w+\./, '.');
		return localLabel;
	}


	/** Reads a memory area as binary from a file.
	 * @param dng The disassembler object.
	 * @param path The file path to a binary file.
	 */
	function readBinFile(dng: SmartDisassembler, path: string) {
		const bin = new Uint8Array(readFileSync(path));
		dng.setMemory(0, bin);
	}


	suite('General', () => {
		test('Constructor', () => {
			new SmartDisassembler(); // NOSONAR
		});
	});


	suite('nodes', () => {

		let dng: SmartDisassembler;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'zsim'
			};
			const launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters(launch);
			Z80Registers.decoder = new Z80RegistersStandardDecoder();
			Opcode.InitOpcodes();
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr => undefined;
			dng.funcFormatLongAddress = addr => addr.toString(16);
			(dng as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			readBinFile(dng,'./tests/disassembler/projects/nodes/main.bin');
			dngNodes = (dng as any).nodes;
			/* To view in the WATCH pane use e.g.:
			Array.from(dngNodes.values()).map(v => v.start.toString(16).toUpperCase().padStart(4, '0') + ': ' + v.label)
			*/
			const memModel = new MemoryModelAllRam();
			memModel.init();
			dng.setMemoryModel(memModel);
		});


		test('Simple', () => {
			dng.getFlowGraph([0x0000], []);
			assert.equal(dngNodes.size, 1);
			let node = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node, undefined);
			assert.equal(node.instructions.length, 7);
			assert.equal(node.length, 7);
			assert.equal(node.callers.length, 0);
			assert.equal(node.predecessors.length, 0);
			assert.equal(node.callee, undefined);
			assert.equal(node.branchNodes.length, 0);
		});

		test('Simple, multiple addresses', () => {
			dng.getFlowGraph([6, 5, 4, 3, 2, 1, 0], []);
			assert.equal(dngNodes.size, 1);
			let node = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node, undefined);
			assert.equal(node.instructions.length, 7);
			assert.equal(node.length, 7);
			assert.equal(node.callers.length, 0);
			assert.equal(node.predecessors.length, 0);
			assert.equal(node.callee, undefined);
			assert.equal(node.branchNodes.length, 0);
		});

		test('Branch', () => {
			dng.getFlowGraph([0x0100], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0100)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0105)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0107)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 3);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 2);
			assert.ok(node1.branchNodes.includes(node2));
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 2);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 2);
			assert.ok(node3.predecessors.includes(node1));
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('JR after RET', () => {
			dng.getFlowGraph([0x0200], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0200)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0205)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0209)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 3);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 2);
			assert.ok(node1.branchNodes.includes(node2));
			assert.ok(node1.branchNodes.includes(node3));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 2);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node1));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('LOOP', () => {
			dng.getFlowGraph([0x0300], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0300)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0302)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0305)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node2));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 2);
			assert.ok(node2.branchNodes.includes(node2));
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('LOOP self', () => {
			dng.getFlowGraph([0x0400], []);
			assert.equal(dngNodes.size, 2);

			const node2 = dng.getNodeForAddress(0x0400)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0403)!;
			assert.notEqual(node3, undefined);

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node2));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 2);
			assert.ok(node2.branchNodes.includes(node2));
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('2 subs, same block', () => {
			dng.getFlowGraph([0x0500, 0x520], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0500)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0502)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0520)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node3));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 5);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node2));
		});

		test('2 subs, same block, reverse', () => {
			dng.getFlowGraph([0x0520, 0x500], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0500)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0502)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0520)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node3));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 5);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node2));
		});

		test('Simple call', () => {
			dng.getFlowGraph([0x0600], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0600)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0605)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0606)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, node3);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 1);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 2);
			assert.equal(node3.length, 3);
			assert.equal(node3.callers.length, 1);
			assert.ok(node3.callers.includes(node1));
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);
		});

		test('2 calls, same sub', () => {
			dng.getFlowGraph([0x0700], []);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(0x0700)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0705)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0708)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(0x0709)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 5);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, node4);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 3);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, node4);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);

			assert.equal(node4.instructions.length, 2);
			assert.equal(node4.length, 3);
			assert.equal(node4.callers.length, 2);
			assert.ok(node4.callers.includes(node1));
			assert.ok(node4.callers.includes(node2));
			assert.equal(node4.predecessors.length, 0);
			assert.equal(node4.callee, undefined);
			assert.equal(node4.branchNodes.length, 0);
		});

		test('Recursive call', () => {
			dng.getFlowGraph([0x0800], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(0x0800)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0803)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0807)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
			assert.equal(node1.callers.length, 1);
			assert.ok(node1.callers.includes(node2));
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 4);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, node1);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node2.branchNodes.includes(node3));

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 1);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 1);
			assert.ok(node3.predecessors.includes(node2));
			assert.equal(node3.callee, undefined);
			assert.equal(node3.branchNodes.length, 0);

		});

		test('Subroutine inside subroutine', () => {
			dng.getFlowGraph([0x0900, 0x0920], []);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(0x0900)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0902)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(0x0920)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(0x0923)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 2);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 2);
			assert.equal(node2.length, 2);
			assert.equal(node2.callers.length, 1);
			assert.ok(node2.callers.includes(node3));
			assert.equal(node2.predecessors.length, 1);
			assert.ok(node2.predecessors.includes(node1));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 0);

			assert.equal(node3.instructions.length, 1);
			assert.equal(node3.length, 3);
			assert.equal(node3.callers.length, 0);
			assert.equal(node3.predecessors.length, 0);
			assert.equal(node3.callee, node2);
			assert.equal(node3.branchNodes.length, 1);
			assert.ok(node3.branchNodes.includes(node4));

			assert.equal(node4.instructions.length, 1);
			assert.equal(node4.length, 1);
			assert.equal(node4.callers.length, 0);
			assert.equal(node4.predecessors.length, 1);
			assert.ok(node4.predecessors.includes(node3));
			assert.equal(node4.callee, undefined);
			assert.equal(node4.branchNodes.length, 0);
		});

		test('jr $', () => {
			dng.getFlowGraph([0x0A00], []);
			assert.equal(dngNodes.size, 2);

			const node1 = dng.getNodeForAddress(0x0A00)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(0x0A01)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.instructions.length, 1);
			assert.equal(node1.length, 1);
			assert.equal(node1.callers.length, 0);
			assert.equal(node1.predecessors.length, 0);
			assert.equal(node1.callee, undefined);
			assert.equal(node1.branchNodes.length, 1);
			assert.ok(node1.branchNodes.includes(node2));

			assert.equal(node2.instructions.length, 1);
			assert.equal(node2.length, 2);
			assert.equal(node2.callers.length, 0);
			assert.equal(node2.predecessors.length, 2);
			assert.ok(node2.predecessors.includes(node1));
			assert.ok(node2.predecessors.includes(node2));
			assert.equal(node2.callee, undefined);
			assert.equal(node2.branchNodes.length, 1);
			assert.ok(node2.branchNodes.includes(node2));
		});


		test('getNodesForAddresses', () => {
			const n1 = new AsmNode();
			const n2 = new AsmNode();
			const n3 = new AsmNode();
			dngNodes.set(0x0100, n1);
			dngNodes.set(0x0200, n2);
			dngNodes.set(0x0300, n3);
			const addrNodes = dng.getNodesForAddresses([0x200, 0x300, 0x400]);
			assert.equal(addrNodes.length, 2);
			assert.ok(addrNodes.includes(n2));
			assert.ok(addrNodes.includes(n3));
		});
	});


	suite('partitionBlocks', () => {

		let dng: SmartDisassembler;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'zsim'
			};
			const launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters(launch);
			Z80Registers.decoder = new Z80RegistersStandardDecoder();
			Opcode.InitOpcodes();
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr => undefined;
			dng.funcFormatLongAddress = addr => addr.toString(16);
			(dng as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			readBinFile(dng,'./tests/disassembler/projects/partition_blocks/main.bin');
			dngNodes = (dng as any).nodes;
			const memModel = new MemoryModelAllRam();
			memModel.init();
			dng.setMemoryModel(memModel);
		});

		// Checks if the addresses outside the block are all undefinded.
		function checkUndefined(blockStart: number, blockLength: number) {
			// Before
			for (let addr = 0; addr < blockStart; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}

			// After
			for (let addr = blockStart + blockLength; addr < 0x10000; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}
		}


		test('Simple block', () => {
			const startAddr = 0x0000;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			for (let addr = startAddr; addr < startAddr + 7; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(0, 7);
		});

		test('1 branch', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			for (let addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});

		test('JR after RET (2 blocks)', () => {
			const startAddr = 0x0200;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			// node1
			for (let addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (let addr = startAddr + 9; addr < startAddr + 0x0B; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			// Undefined
			const nop = (dng as any).blocks[startAddr + 8];
			assert.equal(nop, undefined, "Address=" + (startAddr + 8).toString(16));
			checkUndefined(startAddr, 0x0B);
		});

		test('Sub in sub', () => {
			const startAddr = 0x0300;
			dng.getFlowGraph([startAddr, startAddr + 4], []);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 2)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node3, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 2; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 4; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			// node3
			for (; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node3, "Address=" + addr.toString(16));
			}

			// Undefined
			checkUndefined(startAddr, 8);
		});

		test('Complex jumping', () => {
			const startAddr = 0x0400;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 5)
			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			for (let addr = startAddr; addr < startAddr + 0x0E; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// Undefined
			checkUndefined(startAddr, 0x0E);
		});

		test('2 subs, sharing block', () => {
			const startAddr = 0x0500;
			dng.getFlowGraph([startAddr, startAddr + 0x20], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 0x20)!;
			assert.notEqual(node2, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 5; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// Undefined
			for (; addr < startAddr + 0x20; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, undefined, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 0x25; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 0x25);
		});

		test('Loop', () => {
			const startAddr = 0x0600;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 6; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 6);
		});

		test('Recursive call', () => {
			const startAddr = 0x1000;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			// node1
			let addr;
			for (addr = startAddr; addr < startAddr + 8; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});

		test('JP', () => {
			const startAddr = 0x1100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 2);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);

			// node1
			let addr = startAddr;
			for (; addr < startAddr + 5; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node1, "Address=" + addr.toString(16));
			}

			// node2
			for (; addr < startAddr + 1; addr++) {
				const node = (dng as any).blocks[addr];
				assert.equal(node, node2, "Address=" + addr.toString(16));
			}

			checkUndefined(startAddr, 8);
		});
	});



	suite('assignLabels', () => {

		let dng: SmartDisassembler;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'zsim'
			};
			const launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters(launch);
			Z80Registers.decoder = new Z80RegistersStandardDecoder();
			Opcode.InitOpcodes();
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr64k => undefined;
			dng.funcFormatLongAddress = addr64k => addr64k.toString(16);
			(dng as any).setSlotBankInfo(0, 0xFFFF, 0, true);
			dng.setCurrentSlots([0]);
			readBinFile(dng,'./tests/disassembler/projects/assign_labels/main.bin');
			dng.labelLblPrefix = 'LLBL_';
			dng.labelSubPrefix = 'SSUB_';
			dng.labelLocalLoopPrefix = 'LLOOP';
			dng.labelLocalLabelPrefix = 'LL';
			dng.labelRstPrefix = 'RRST_';
			dngNodes = (dng as any).nodes;
			const memModel = new MemoryModelAllRam();
			memModel.init();
			dng.setMemoryModel(memModel);
		});

		test('Simple', () => {
			const startAddr = 0x0000;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);

			assert.equal(node1.label, undefined);
		});

		test('1 branch, global label', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, undefined);
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, 'LLBL_0107');
		});

		test('1 branch, local label', () => {
			const startAddr = 0x0180;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 0x0B)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, undefined);
			assert.equal(node2.label, 'SSUB_0184');
			assert.equal(node3.label, 'SSUB_0184.LL1');
		});

		test('JR after RET', () => {
			const startAddr = 0x0200;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, undefined);
			assert.equal(node2.label, 'SSUB_0209');
		});

		test('JR after RET, sub', () => {
			const startAddr = 0x0280;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 0x0D)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, undefined);
			assert.equal(node2.label, 'SSUB_028D');
		});

		test('Sub in sub', () => {
			const startAddr = 0x0300;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_0307');
			assert.equal(node2.label, 'SSUB_0309');
		});

		test('Complex jumping', () => {
			const startAddr = 0x0400;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 7);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 0x0A)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 0x0C)!;
			assert.notEqual(node4, undefined);
			const node5 = dng.getNodeForAddress(startAddr + 0x0F)!;
			assert.notEqual(node5, undefined);

			assert.equal(node1.label, 'SSUB_0404');
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, 'SSUB_0404.LL1');
			assert.equal(node4.label, 'SSUB_0404.LL2');
			assert.equal(node5.label, undefined);
		});

		test('2 subs, sharing block', () => {
			const startAddr = 0x0500;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 6);

			const node1 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 0x20)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.label, 'SSUB_0507');
			assert.equal(node2.label, 'SSUB_0507.LL1');
			assert.equal(node3.label, 'SSUB_0520');
		});

		test('Loop', () => {
			const startAddr = 0x0600;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 5);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.label, 'SSUB_0604');
			assert.equal(node2.label, 'SSUB_0604.LLOOP');
			assert.equal(node3.label, undefined);
		});

		test('Nested loops', () => {
			const startAddr = 0x0700;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 7);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 0x0A)!;
			assert.notEqual(node4, undefined);
			const node5 = dng.getNodeForAddress(startAddr + 0x0D)!;
			assert.notEqual(node5, undefined);

			assert.equal(node1.label, 'SSUB_0704');
			assert.equal(node2.label, 'SSUB_0704.LLOOP1');
			assert.equal(node3.label, 'SSUB_0704.LLOOP2');
			assert.equal(node4.label, undefined);
			assert.equal(node5.label, undefined);
		});

		test('Nested loops, same label', () => {
			const startAddr = 0x0800;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 6);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 0x0A)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 0x0D)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.label, 'SSUB_0804');
			assert.equal(node2.label, 'SSUB_0804.LLOOP');
			assert.equal(node3.label, undefined);
			assert.equal(node4.label, undefined);
		});

		test('Recursive call', () => {
			const startAddr = 0x1000;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 3);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node3, undefined);

			assert.equal(node1.label, 'SSUB_1000');
			assert.equal(node2.label, undefined);
			assert.equal(node3.label, undefined);
		});

		test('JP', () => {
			const startAddr = 0x1100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_1104');
			assert.ok(node1.isSubroutine);
			assert.equal(node2.label, 'SSUB_1104.LL1');
			assert.ok(node2.isSubroutine);
		});

		test('JR $', () => {
			const startAddr = 0x1200;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 2);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 1)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, undefined);
			assert.ok(!node1.isSubroutine);
			assert.equal(node2.label, 'LLBL_1201');
			assert.ok(!node2.isSubroutine);
		});

		test('JR $ / CALL', () => {
			const startAddr = 0x1300;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 4);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 5)!;
			assert.notEqual(node2, undefined);

			assert.equal(node1.label, 'SSUB_1304');
			assert.ok(node1.isSubroutine);
			assert.equal(node2.label, 'SSUB_1304.LLOOP');
			assert.ok(!node2.isSubroutine);
		});
	});


	suite('bank border', () => {

		let dng: SmartDisassembler;
		let dngNodes: Map<number, AsmNode>;
		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'zsim'
			};
			const launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters(launch);
			Z80Registers.decoder = new Z80RegistersStandardDecoder();
			Z80Registers.setSlotsAndBanks(	// Doesn't matter what these functions return:
				(address: number, slots: number[]) => 0x10000 + address,
				(address: number) => 0);
			Opcode.InitOpcodes();
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr => undefined;
			dng.funcFormatLongAddress = addr => addr.toString(16);
			(dng as any).setSlotBankInfo(0x0000, 0x3FFF, 0, true);
			(dng as any).setSlotBankInfo(0x4000, 0x7FFF, 1, false);
			(dng as any).setSlotBankInfo(0x8000, 0xBFFF, 2, false);
			(dng as any).setSlotBankInfo(0xC000, 0xFFFF, 3, false);
			(dng as any).setCurrentSlots([0, 1, 2, 3]);	// A different bank in each slot
			readBinFile(dng,'./tests/disassembler/projects/bank_border/main.bin');
			dngNodes = (dng as any).nodes;
		});

		test('From slot 0', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 6);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.equal(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.equal(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		test('From slot 1', () => {
			const startAddr = 0x4100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 7);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.notEqual(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.equal(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		test('From slot 2', () => {
			const startAddr = 0x8100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 7);

			const node0000 = dng.getNodeForAddress(0x0000)!;
			assert.notEqual(node0000, undefined);
			const node4000 = dng.getNodeForAddress(0x4000)!;
			assert.equal(node4000, undefined);
			const node8000 = dng.getNodeForAddress(0x8000)!;
			assert.notEqual(node8000, undefined);
			const nodeC000 = dng.getNodeForAddress(0xC000)!;
			assert.equal(nodeC000, undefined);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);

			assert.equal(node1.callee?.start, 0x0000);
			assert.equal(node2.callee?.start, 0x4000);
			assert.equal(node3.callee?.start, 0x8000);
			assert.equal(node4.callee?.start, 0xC000);
		});

		/** Test makes no sense:
		test('From slot 3 (not used)', () => {
			// Pathological case: we should not create something in unused memory.
			const startAddr = 0xC100;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);	// A node is created although e.g. length is 0.

			const nodeC100 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(nodeC100, undefined);
			assert.notEqual(nodeC100.comments.length, 0);	// There should be a comment about unassigned memory.
		});
		*/
	});


	suite('Flow through slot', () => {

		let dng: SmartDisassembler;
		let dngNodes: Map<number, AsmNode>;
		let comments: Map<number, string[]>;
		setup(() => {
			Opcode.InitOpcodes();
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr => undefined;
			dng.funcFormatLongAddress = addr => addr.toString(16);
			(dng as any).setSlotBankInfo(0x0000, 0x1FFF, 0, true);
			(dng as any).setSlotBankInfo(0x2000, 0x3FFF, 1, false);
			(dng as any).setSlotBankInfo(0x4000, 0x5FFF, 2, true);
			(dng as any).setSlotBankInfo(0x6000, 0x7FFF, 3, false);
			(dng as any).setSlotBankInfo(0x8000, 0x9FFF, 3, true);
			(dng as any).setSlotBankInfo(0xA000, 0xBFFF, 3, true);
			(dng as any).setSlotBankInfo(0xC000, 0xFFFF, 3, true);
			dng.setCurrentSlots([0, 1, 2, 3, 4, 5, 6]);	// A different bank in each slot
			readBinFile(dng,'./tests/disassembler/projects/flow_through_slot/main.bin');
			dngNodes = (dng as any).nodes;
			comments = (dng as any).comments.addrComments;
		});

		test('Flow through to unassigned or other bank', () => {
			const startAddr = 0x1FFE;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x1FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 1);
			assert.notEqual(comments.get(0x1FFE), undefined);
			assert.equal(node1.length, 2);
			assert.equal(node1.branchNodes.length, 1);

			const successor = node1.branchNodes[0]
			assert.equal(successor.bankBorder, true);
		});

		test('Flow through from multi bank to single bank', () => {
			const startAddr = 0x3FFE;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x3FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});

		test('Flow through with opcode to unassigned or other bank', () => {
			// Now the opcode is split between the banks.
			const startAddr = 0x5FFF;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x5FFF)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 1);
			assert.notEqual(comments.get(0x5FFF), undefined);

			assert.equal(node1.length, 2);
			assert.equal(node1.branchNodes.length, 1);

			const successor = node1.branchNodes[0]
			assert.equal(successor.bankBorder, true);
		});


		test('Flow through with opcode from multi bank to single bank', () => {
			// Now the opcode is split between the banks.
			const startAddr = 0x7FFF;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x7FFF)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});

		test('Flow through single bank to single bank', () => {
			const startAddr = 0x9FFE;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0x9FFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 0);
			assert.equal(node1.instructions.length, 2);
			assert.equal(node1.length, 3);
		});

		test('Continue in other single bank', () => {
			const startAddr = 0xAFFE;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0xAFFE)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 0);
			assert.equal(node1.length, 4);

		});

		test('Opcode continues in other single bank', () => {
			const startAddr = 0xBFFF;
			dng.getFlowGraph([startAddr], []);
			assert.equal(dngNodes.size, 1);

			const node1 = dng.getNodeForAddress(0xBFFF)!;
			assert.notEqual(node1, undefined);
			assert.equal(comments.size, 0);
			assert.equal(node1.length, 3);
		});
	});


	suite('disassembleNodes', () => {

		let dng: SmartDisassembler;
		//let dngNodes: Map<number, AsmNode>;
		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'zsim'
			};
			const launch = Settings.Init(cfg);
			Z80RegistersClass.createRegisters(launch);
			Z80Registers.decoder = new Z80RegistersStandardDecoder();
			Z80Registers.setSlotsAndBanks(	// Doesn't matter what these functions return:
				(address: number, slots: number[]) => 0x10000 + address,
				(address: number) => 0);
			dng = new SmartDisassembler();
			dng.funcGetLabel = addr64k => undefined;
			dng.funcFormatLongAddress = addr64k => addr64k.toString(16);
			(dng as any).setSlotBankInfo(0x0000, 0x3FFF, 0, true);
			(dng as any).setSlotBankInfo(0x4000, 0x7FFF, 1, true);
			(dng as any).setSlotBankInfo(0x8000, 0xFFFF, 3, false);
			dng.setCurrentSlots([0, 1, 2]);	// A different bank in each slot
			readBinFile(dng,'./tests/disassembler/projects/disassemble_nodes/main.bin');
			dng.labelLblPrefix = 'LLBL_';
			dng.labelSubPrefix = 'SSUB_';
			dng.labelLocalLoopPrefix = 'LLOOP';
			dng.labelLocalLabelPrefix = 'LL';
			dng.labelDataLblPrefix = "DDATA_";
			dng.labelRstPrefix = "RRST_";
			Format.hexFormat = '$';
			Opcode.InitOpcodes();
		});

		/**
		 * Checks if the instruction disassemlbies contain the text
		 * in 'lines'.
		 */
		function checkInstructions(node: AsmNode, lines: string[]) {
			let l = 0;
			const instrs = node.instructions.map(i => i.disassembledText);
			for (const instr of instrs) {
				const line = lines[l];
				assert.equal(instr, line, 'Line: ' + l + ' of ["' + instrs.join('", "') + '"] should be ["' + lines.join('", "') + '"]');
				l++;
			}
			// Check for same number of lines
			assert.equal(node.instructions.length, lines.length, "Expected number of lines");
		}

		/**
		 * Outputs a simple disassembly.
		 */
		function dbgDisassembly(nodes: Map<number, AsmNode>) {
			// Sort nodes by address
			const sortedNodes = Array.from(nodes.values());
			 sortedNodes.sort((a, b) => a.start - b.start);
			// Loop over all nodes
			for (const node of sortedNodes) {
				// Print label and address:
				let addr = node.start;
				console.log(Utility.getHexString(addr, 4) + ' ' + node.label + ':');
				// Loop over all instructions
				for (const opcode of node.instructions) {
					console.log(Utility.getHexString(addr, 4) + '\t' + opcode.disassembledText);
					// Next
					addr += opcode.length;
				}
				console.log();
			}
		}


		test('From single bank to multi bank', () => {
			const startAddr = 0x0100;
			dng.getFlowGraph([startAddr, 0x0000, 0x4000, 0x8000], []);
			dng.disassembleNodes();

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			checkInstructions(node1, [
				"LD A,$05",
				"LD DE,$0000",
				"LD HL,(RRST_00)",
				"CALL RRST_00"
			]);

			const node2 = dng.getNodeForAddress(startAddr + 0x0B)!;
			assert.notEqual(node2, undefined);
			checkInstructions(node2, [
				"LD B,C",
				"LD DE,SSUB_4000",
				"LD HL,(SSUB_4000)",
				"CALL SSUB_4000"
			]);

			const node3 = dng.getNodeForAddress(startAddr + 0x15)!;
			assert.notEqual(node3, undefined);
			checkInstructions(node3, [
				"LD DE,$8010",
				"LD HL,($8010)",
				"CALL $8000"
			]);

			const node4 = dng.getNodeForAddress(startAddr + 0x1E)!;
			assert.notEqual(node4, undefined);
			checkInstructions(node4, [
				"NOP",
				"RET"
			]);
		});

		test('From multi bank to single bank', () => {
			const startAddr = 0x8100;
			dng.getFlowGraph([startAddr, 0x0000, 0x4000, 0x8000], []);
			dng.disassembleNodes();

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			checkInstructions(node1, [
				"CALL RRST_00"
			]);

			const node2 = dng.getNodeForAddress(startAddr + 3)!;
			assert.notEqual(node2, undefined);
			checkInstructions(node2, [
				"CALL SSUB_4000"
			]);

			const node3 = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node3, undefined);
			checkInstructions(node3, [
				"CALL SSUB_8000"
			]);

			const node4 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node4, undefined);
			checkInstructions(node4, [
				"RET"
			]);
		});

		test('Loop: Label prior to subroutine, misc references', () => {
			const startAddr = 0xD000;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node0 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node0, undefined);
			checkInstructions(node0, [
				"LD A,$08",
			]);

			const node0b = dng.getNodeForAddress(startAddr + 6)!;
			assert.notEqual(node0b, undefined);
			checkInstructions(node0b, [
				"NOP",
			]);

			const node1 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node1, undefined);
			checkInstructions(node1, [
				"LD (IX+5),A",
			]);

			const node1b = dng.getNodeForAddress(startAddr + 0x0A)!;
			assert.notEqual(node1b, undefined);
			checkInstructions(node1b, [
				"LD A,(IY-7)",
				ll("JR Z,SSUB_D007.LLOOP"),
			]);

			const node2 = dng.getNodeForAddress(startAddr + 0x0F)!;
			assert.notEqual(node2, undefined);
			checkInstructions(node2, [
				"BIT 7,(IX+0)",
				ll("JR NZ,SSUB_D007.LL1"),
			]);

			const node3 = dng.getNodeForAddress(startAddr + 0x15)!;
			assert.notEqual(node3, undefined);
			checkInstructions(node3, [
				"LD BC,(DDATA_D100)",
			]);

			const node4 = dng.getNodeForAddress(startAddr + 0x19)!;
			assert.notEqual(node4, undefined);
			checkInstructions(node4, [
				"LD (DDATA_D102),DE",
				"LD IY,(DDATA_D104)",
				ll("JP P,SSUB_D007.LL2"),
			]);

			const node5 = dng.getNodeForAddress(startAddr + 0x24)!;
			assert.notEqual(node5, undefined);
			checkInstructions(node5, [
				"RET",
			]);

			const node6 = dng.getNodeForAddress(startAddr + 0x25)!;
			assert.notEqual(node6, undefined);
			checkInstructions(node6, [
				"NEG",
				"JR Z,LLBL_D004"
			]);

			const node7 = dng.getNodeForAddress(startAddr + 0x29)!;
			assert.notEqual(node7, undefined);
			checkInstructions(node7, [
				"JP NC,LLBL_D004.LLOOP"
			]);

			const node8 = dng.getNodeForAddress(startAddr + 0x2C)!;
			assert.notEqual(node8, undefined);
			checkInstructions(node8, [
				"RET"
			]);
		});


		test('2 subroutines merged', () => {
			const startAddr = 0xD200;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, 'SSUB_D207');

			const node2 = dng.getNodeForAddress(startAddr + 0x09)!;
			assert.notEqual(node2, undefined);
			assert.equal(node2.label, 'SSUB_D209');

			checkInstructions(node1, [
				"LD A,$01",
			]);
			checkInstructions(node2, [
				"LD A,$02",
				"RET"
			]);
		});

		test('2 subroutines merged, sharing tail', () => {
			const startAddr = 0xD300;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr + 7)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, 'SSUB_D307');

			const node2 = dng.getNodeForAddress(startAddr + 0x0B)!;
			assert.notEqual(node2, undefined);
			assert.equal(node2.label, 'SSUB_D30B');

			const node3 = dng.getNodeForAddress(startAddr + 0x0D)!;
			assert.notEqual(node3, undefined);
			assert.equal(node3.label, 'SSUB_D30B.LL1');

			checkInstructions(node1, [
				"LD A,$01",
				"JR SSUB_D30B.LL1"
			]);
			checkInstructions(node2, [
				"LD A,$02"
			]);
			checkInstructions(node3, [
				"RET"
			]);
		});


		test('Subroutine with jumps < subroutine address, with additional JP', () => {
			const startAddr = 0xD500;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, 'LLBL_D504');

			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);
			assert.equal(node2.label, 'SSUB_D509');


			checkInstructions(node1, [
				"LD A,$01",
				"JP SSUB_D509"
			]);
			checkInstructions(node2, [
				"LD A,$02",
				"JP NC,LLBL_D504"
			]);
		});

		test('Subroutine with jumps < subroutine address, with additional JP with hole', () => {
			const startAddr = 0xD600;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr + 4)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, 'LLBL_D604');

			const node2 = dng.getNodeForAddress(startAddr + 0x0A)!;
			assert.notEqual(node2, undefined);
			assert.equal(node2.label, 'SSUB_D60A');

			checkInstructions(node1, [
				"LD A,$01",
				"JP SSUB_D60A"
			]);
			checkInstructions(node2, [
				"LD A,$02",
				"JP NC,LLBL_D604"
			]);
		});


		test('Self modifying code', () => {
			const startAddr = 0xE000;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, undefined);

			const node2 = dng.getNodeForAddress(startAddr + 9)!;
			assert.notEqual(node2, undefined);
			assert.equal(node2.label, 'SSUB_E009');

			checkInstructions(node1, [
				"LD A,$01",
				"LD (SSUB_E009.CODE_E00B+1),A",
				"CALL SSUB_E009"
			]);
			checkInstructions(node2, [
				"LD A,$02",
				"LD B,$00",
				"RET"
			]);
		});

		test('Self modifying code through bank border', () => {
			const startAddr = 0x6000;
			dng.getFlowGraph([startAddr], []);
			dng.disassembleNodes();

			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, undefined);

			checkInstructions(node1, [
				"LD A,$01",
				"LD ($E00C),A",
				"CALL $E009"
			]);
		});


		test('Label names from outside', () => {
			const startAddr = 0xE100;
			dng.getFlowGraph([startAddr], []);
			dng.funcGetLabel = (addr64k: number) => {
				if (addr64k == 0xE107)
					return "MY_DATA";
				return undefined;
			};
			dng.disassembleNodes();
			dbgDisassembly((dng as any).nodes);

			const node1 = dng.getNodeForAddress(startAddr)!;
			assert.notEqual(node1, undefined);
			assert.equal(node1.label, undefined);

			checkInstructions(node1, [
				"LD A,(MY_DATA)",
				"LD HL,MY_DATA",
				"RET"
			]);
		});
	});
});
