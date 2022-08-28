import { Utility } from './../misc/utility';
import {Opcode, OpcodeFlag} from './opcode';



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
	public length: number = 0;

	// If a path of the node is ended by a RET or RET cc than it is
	// marked as a subroutine.
	// Not only the topmost but all paths are marked.
	// Is used only to distinguish label prefix "SUB" or "LBL".
	// A block is also marked if it is target of a CALL.
	public isSubroutine: boolean = false;

	// Is set either if it is the first address given to decode
	// or if node is CALLed by someone.
	// Used to determine the start of a subroutine for labels:
	// "SUB_" is used if '(isSubroutine && isStartingNode) == true'
	// otherwise "LBL_" (or local label).
	public isStartingNode: boolean = false;


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
	// Could be empty (e.g. RET), 1 (e.g. CALL cc nn) or 2 (e.g. JP Z,nn).
	public branchNodes: AsmNode[] = [];

	// All addresses that are directly referenced by instructions, other than the jumps/calls.
	// E.g. "LD A,(nn)".
	// Note that in case of a reference into a CODE area, the address might be decreased to the next
	// CODE_FIRST byte. E.g. the reference in the instruction might be "LD A,($8001)"
	// but the stored reference might be $8000.
	public dataReferences: number[] = [];

	// If true the node has no "natural" successor. I.e. the last instruction
	// was a JP (branchNodes.length = 1) or RET (branchNodes.length = 0).
	public stop: boolean = false;

	// The global or local name of the node.
	// Can also be undefined.
	// E.g. "SUB_04AD", "LBL_FF00", ".L1", ".L2", ".LOOP", ".LOOP1"
	public label: string;

	// The indentation of the block. Is used to print an indented block.
	// Calculation:
	// If an instruction is branching to another address and all instructions
	// in-between do not branch outside this range, then all blocks get an
	// indentation.
	public indentation: number = 0;


	/**
	 * For debugging in the watch window.
	 */
	public toString() {
		return "AsmNode: start=" + Utility.getHexString(this.start,4) + ', label=' + this.label;
	}


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
	 * Checks if target is the smallest address of all predecessors.
	 * @param target The node for which to test if it is loop root.
	 * @returns true if target is the lowest predecessor of the loop.
	 */
	public isLoopRoot(target: AsmNode = this, alreadyProcessed: AsmNode[] = []): boolean{
		// Check predecessors
		for (const predecessor of this.predecessors) {
			// Check if already processed
			if (alreadyProcessed.includes(predecessor))
				continue;
			// Mark as processed
			alreadyProcessed.push(predecessor);
			// Check if node is lower than target
			if (predecessor.start < target.start)
				continue;
			// Check if found
			if (target == predecessor)
				return true;
			// Check recursive
			if (predecessor.isLoopRoot(target, alreadyProcessed))
				return true;
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
	protected isReachable(targets: AsmNode[], alreadyProcessed: AsmNode[] = []): boolean {
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


	/** @returns Returns true if the last instruction is a RET, RETI, RETN or RET cc.
	 */
	public isRET() {
		/*
		const len = this.instructions.length;
		if (len == 0)
			return false;
			*/
		// Get last opcode
		const lastOpcode = this.instructions.slice(-1)[0];
		if (lastOpcode == undefined)
			return false;
		const isRET = (lastOpcode.flags & OpcodeFlag.RET);
		return isRET;
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
	public markPredecessorsAsSubroutine() {
		if (this.isSubroutine)
			return;
		this.isSubroutine = true;
		for (const predec of this.predecessors) {
			predec.markPredecessorsAsSubroutine();
		}
	}


	/** Returns all addresses belonging to the node.
	 * @returns An array with all addresses.
	 */
	public getAllAddresses(): number[] {
		let addr = this.start;
		const addrs: number[] = [];
		for (const opcode of this.instructions) {
			addrs.push(addr);
			addr += opcode.length;
		}
		// At least add start address (e.g. if bank border node/length = 0)
		//if (addrs.length == 0)
		//	addrs.push(addr);
		// Return
		return addrs;
	}


	/** Returns an array with the disassembled text.
	 * @returns instructions disassembled to array.
	 */
	public getAllDisassemblyLines(): string[] {
		return this.instructions.map(opcode => opcode.disassembledText);
	}
}
