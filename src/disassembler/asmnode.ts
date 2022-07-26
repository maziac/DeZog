import {Opcode} from './opcode';



/**
 * The disassembly is converted into a net of connected nodes.
 * Each node contains a (small) block of code up to the next branch.
 * I.e. up to (including) a "JP Z,nn", a "CALL NZ,nn", "CALL nn" or similar.
 */
export class AsmNode {
	// A bank border node is not included in the this.nodes map.
	// It is used as end-object for calls/jumps into a bank border.
	public bankBorder: boolean = false;

	// The slot of the complete node.
	public slot: number;
	// The (long) start address.
	public start: number;
	// The length of the block in bytes.
	public length: number;

	// If a path of the node is ended by a RET or RET cc than it is
	// marked as a subroutine.
	// Not only the topmost but all paths are marked.
	public isSubroutine: boolean = false;

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

	// If true the node has no "natural" successor. I.e. the last instruction
	// was a JP (branchNodes.length = 1) or RET (branchNodes.length = 0).
	public stop: boolean = false;

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
	 * Returns all nodes belonging to a loop for that node.
	 * Note: Several loops may exist. All are merged.
	 * @param target The node for which to test if it is loop root.
	 */
	public isLoopRoot(target: AsmNode = this, alreadyProcessed: AsmNode[] = []): boolean{
		// Check predecessors
		for (const predecessor of this.predecessors) {
			// Check if already processed
			if (alreadyProcessed.includes(predecessor))
				continue;
			// Check if node is lower than target
			if (predecessor.start < target.start)
				continue;
			// Check if found
			if (target == predecessor)
				return true;
			// Check recursive
			if (predecessor.isLoopRoot(target, alreadyProcessed))
				return true;
			// Mark as processed
			alreadyProcessed.push(predecessor);
		}

		// Nothing found
		return false;
	}


	/**
	 * Checks if a node is reachable from this node.
	 * Loops through the branchNodes recursively
	 * until it finds one of the target nodes.
	 * @param targets One or more target nodes.
	 * @return false if no target is reachable.
	 */
	protected isReachable(targets: AsmNode[], alreadyProcessed: AsmNode[] = []) {
		// Check if already checked
		if (alreadyProcessed.includes(this))
			return false;
		alreadyProcessed.push(this);

		// Check if target is reached
		if (targets.includes(this))
			return true;

		// Now check all branchNodes
		for (const branch of this.branchNodes) {
			if (branch.isReachable(targets, alreadyProcessed))
				return true;	// Stop if one found
		}

		// Nothing found
		return false;
	}


	/**
	 * Checks if a node has no references (predecessors, calls) other
	 * than the natural flow from the previous node.
	 * @return true if there are other references.
	 */
	public otherReference(): boolean {
		if (this.callers.length > 0)
			return true;

		// No reference
		if (this.predecessors.length == 0)
			return false;

		// 1 reference
		if (this.predecessors.length == 1) {
			// Check if first and only predecessor is the natural previous node
			const predec = this.predecessors[0];
			if (predec.start + predec.length == this.start) {
				// The 'stop' test is just for the pathological case that the predecessor was a JP to the this node.
				return predec.stop;
			}
		}

		// Otherwise false
		return true;
	}


	/**
	 * Mark as subroutine. Also recursively the predecessors.
	 * Returns immediately if already marked as subroutine.
	 */
	public markAsSubroutine() {
		if (this.isSubroutine)
			return;
		this.isSubroutine = true;
		for (const predec of this.predecessors) {
			predec.markAsSubroutine();
		}
	}
}
