import { Opcode } from './opcode';



/**
 * The disassembly is converted into a net of connected nodes.
 * Each node contains a (small) block of code up to the next branch.
 * I.e. up to (including) a "JP Z,nn", a "CALL NZ,nn", "CALL nn" or similar.
 */
export class AsmNode {
	// The slot of the complete node.
	public slot: number;
	// The (long) start address.
	public start: number;
	// The length of the block in bytes.
	public length: number;

	// The instruction in the right order of the block.
	public instructions: Opcode[] = [];

	// The callers of the node. Can be 0 length or any size.
	public callers: number[] = [];

	CHANGE all to numbers:

	// The predecessors (callers, JPs, etc.) of the node.
	public predecessors: AsmNode[] = [];

	// The call the node might do, e.g. CALL nn.
	// As the CALL ends the node, there is either 0 (undefined) or 1 call per node.
	public callee: AsmNode | undefined;

	// The following nodes. I.e. all branch addresses except calls.
	// Could be 0 (e.g. RET), 1 (e.g. CALL cc nn) or 2 (e.g. JP Z,nn).
	public branchNodes: AsmNode[] = [];

}
