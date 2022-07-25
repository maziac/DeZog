import {Opcode} from './opcode';



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
	// It is the address(es) of the calling node(s).
	public callers: AsmNode[] = [];

	// Other predecessors (e.g. JPs, flow through) of the node.
	// It is the address(es) of the previous node(s).
	public predecessors: AsmNode[] = [];

	// The call the node might do, e.g. CALL nn.
	// As the CALL ends the node, there is either 0 (undefined) or 1 call per node.
	public callee: AsmNode | undefined;

	// The following nodes. I.e. all branch addresses except calls.
	// Could be 0 (e.g. RET), 1 (e.g. CALL cc nn) or 2 (e.g. JP Z,nn).
	public branchNodes: AsmNode[] = [];

	// Comments are added here.
	public comments: string[] = [];

	// The global or local name of the node.
	// Can also be undefined.
	// E.g. "SUB_04AD", "LBL_FF00", ".L1", ".L2", ".LOOP", ".LOOP1"
	public label: string;


	/**
	 * Fills the given array with the used branches (recursively).
	 * @param branches At the start an empty array that gets filled.
	 */
	public getBranchesRecursive(branches: AsmNode[]) {
		// Add referenced branches
		for (const branch of this.branchNodes) {
			if (!branches.includes(branch)) {
				branches.push(branch);
				// Step into
				branch.getBranchesRecursive(branches);
			}
		}
	}


	/**
	 * Checks if the node is included in a loop.
	 * A node is a loop if it has at least 1 predecessor that has an
	 * address which is higher than the own one.
	 * Furthermore the predecessor needs to be reachable
	 * from the branchNodes.
	 * @returns true if a loop.
	 */
	public isLoop(): boolean {
		// Check predecessors
		const potentialLoops: AsmNode[] = [];
		for (const predecessor of this.predecessors) {
			if (predecessor.start > this.start)
				potentialLoops.push(predecessor);
		}

		// Return if no potential predecessor
		if (potentialLoops.length == 0)
			return false;

		// Now check if reachable
		const reachable = this.isReachable(potentialLoops);
		return reachable;
	}


	/**
	 * Checks if a node is reachable from this node.
	 * Loops through the branchNodes recursively
	 * until it finds one of the target nodes.
	 * @param targets One or more target nodes.
	 * @return false if no target is reachable.
	 */
	protected isReachable(targets: AsmNode[], alreadyChecked: AsmNode[] = []) {
		// Check if already checked
		if (alreadyChecked.includes(this))
			return false;
		// Check if target is reached
		if (targets.includes(this))
			return true;
		// Now check all branchNodes
		for (const branch of this.branchNodes) {
			if (branch.isReachable(targets, alreadyChecked))
				return true;	// Stop if one found
		}

		// Nothing found
		return false;
	}
}
