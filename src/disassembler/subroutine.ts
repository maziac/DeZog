import {AsmNode} from "./asmnode";


/** A subroutine is a collection nodes.
 * In fact this collection does not really have to be subroutine.
 * I.e. it could also be a main loop with no RET at all.
 * Anyhow in 99% of the cases the node collection is a subroutine.
 * So this notion is used here.
 * Additionally to the array of nodes the subroutine holds a few more data:
 * - The number of total bytes of all collected nodes.
 * - The callees of all collected nodes.
 *
 * Note:
 * - In assembler there is no clear entry or exit point for a subroutine.
 * - Different subroutines might share nodes.
 */
export class Subroutine {
	// The nodes that belong to the subroutine.
	public nodes: AsmNode[] = [];

	// All called nodes.
	public callees: AsmNode[] = [];

	// The number of accumulated bytes of all nodes.
	public sizeInBytes: number = 0;


	/** Constructor.
	 * Creates a subroutine from the given node.
	 * @param node To use for the subroutine.
	 */
	constructor(node: AsmNode) {
		this.processAllBranchNodes(node);
	}


	/**
	 * Follows the trace and fill this.nodes with all branches.
	 * Works recursively.
	 * @param node The node for which to get all branches.
	 */
	protected processAllBranchNodes(node: AsmNode) {
		// Check if it we already used it
		if (this.nodes.includes(node))
			return;
		// Store
		this.nodes.push(node);

		// Process size
		this.sizeInBytes += node.length;

		// Add callees
		if (node.callee)
			this.callees.push(node.callee);

		// Follow all branches
		for (const branchNode of node.branchNodes) {
			this.processAllBranchNodes(branchNode);
		}
	}


	/** Returns all addresses belonging to the subroutine.
	 * @returns An array with all addresses.
	 */
	public getAllAddresses(): number[] {
		const addrs: number[] = [];
		for (const node of this.nodes) {
			const nodeAddrs = node.getAllAddresses();
			addrs.push(...nodeAddrs);
		}
		return addrs;
	}
}
