import {readFileSync} from 'fs';
import {Utility} from './../misc/utility';
import {AsmNode} from './asmnode';
import {Format} from './format';
import {MemAttribute, Memory} from './memory';
import {Opcode, OpcodeFlag} from './opcode';



/**
 * The SlotBankInfo is set at the start for every address.
 * It depends on the used memory model.
 */
interface SlotBankInfo {
	// The slot number of an address.
	slot: number;
	// true if non-switchable single bank. false if more than 2 banks or if slot is not used (BankType.UNUSED).
	singleBank: boolean;
}


/**
 * The main Disassembler class.
 */
export class DisassemblerNextGen {

	/// A function that can be set to assign other than the standard
	/// label names.
	public funcAssignLabels: (address: number) => string | undefined;

	/// A function that can be set to filter out certain addresses from the output.
	/// Note: the addresses are still used for analysis but are simply skipped in the output ('disassembleMemory').
	// If false is returned the line for this address is not shown.
	public funcFilterAddresses: (address: number) => boolean;

	/// A function that formats the address printed at first in the disassembly.
	/// Used to add bank information after the address.
	public funcFormatAddress: (address: number) => string;

	/// The memory area to disassemble.
	public memory = new Memory();

	/// Queue for start addresses only addresses of opcodes.
	protected addressQueue = new Array<number>();

	// Holds information to which slot an address belongs.
	// Will be created once and not changed anymore.
	protected addressesSlotBankInfo = new Array<SlotBankInfo>(0x10000);

	// The current slots. Used to append a suffix to labels and addresses if the address in a slot is pageable.
	protected slots: number[];

	// The map of the nodes model of the disassembly.
	// Does NOT include bank border nodes.
	protected nodes = new Map<number, AsmNode>();

	// Blocks all addresses that share the same block are put here.
	// This is similar but not equal to a subroutine.
	// A subroutine can span more than one block.
	// Sparse array.
	protected blocks = new Array<AsmNode>(0x10000);

	// An array with the given label names.
	// E.g. "SUB_04AD", "LBL_FF00", "SUB_04AD.L1", "SUB_04AD.L2", "SUB_04AD.LOOP", "SUB_04AD.LOOP1"
	// Sparse array.
	protected labels = new Array<string>(0x10000);

	/// Label prefixes
	public labelSubPrefix = "SUB_";
	public labelLblPrefix = "LBL_";
	public labelRstPrefix = "RST_";
	public labelDataLblPrefix = "DATA_";
	public labelSelfModifyingPrefix = "SELF_MOD_";	// I guess this is not used anymore if DATA_LBL priority is below CODE_LBLs
	public labelLocalLabelPrefix = "L";	// "_L"
	public labelLoopPrefix = "LOOP";	// "_LOOP"

	public labelIntrptPrefix = "INTRPT";


	/**
	 * Initializes the Opcode formatting.
	 * Note: This does work only if Disassembler is a singleton.
	 */
	constructor() {
		Opcode.InitOpcodes();
	}


	/**
	 * Sets the slot and bank info.
	 * Has to be done before the disassembly.
	 * Is not changed anymore.
	 * @param addrStart The start address.
	 * @param addrEnd The end address (inclusive).
	 * @param slot The slot number for that range.
	 * @param singleBank Set true if single bank. False if multiple banks or if bank/slot is not used.
	 */
	public setSlotBankInfo(addrStart: number, addrEnd: number, slot: number, singleBank: boolean) {
		for (let addr = addrStart; addr <= addrEnd; addr++)
			this.addressesSlotBankInfo[addr] = {slot, singleBank};
	}


	/**
	 * Sets the current slots.
	 * @param slots Array with the slots.
	 */
	public setCurrentSlots(slots: number[]) {
		this.slots = slots;
		const i = 5;
		console.log(i.toString());
	}


	/**
	 * Define the memory area to disassemble.
	 * @param origin The start address of the memory area.
	 * @param memory The memory area.
	 */
	public setMemory(origin: number, memory: Uint8Array) {
		this.memory.setMemory(origin, memory);
		// Set start label
		//this.setLabel(origin, 'BIN_START_'+origin, NumberType.DATA_LBL);
		//const size = memory.length;
		//this.setLabel(origin+size, 'BIN_END_'+origin, NumberType.DATA_LBL);
	}


	/**
	 * Reads a memory area as binary from a file.
	 * @param origin The start address of the memory area.
	 * @param path The file path to a binary file.
	 */
	public readBinFile(origin: number, path: string) {
		const bin = readFileSync(path);
		this.setMemory(origin, bin);
	}


	/**
	 * Checks for bank border.
	 * A bank border is recognized if the address64k's slot is different that the
	 * startSlot and the address64k points to pageable memory.
	 * @param startSlot The slot to compare with. E.g. where the process flow started.
	 * @param address64k The address to check.
	 * @returns true if banks would be passed. false if it stays in same bank/slot or
	 * address64k is not pageable.
	 */
	protected bankBorderPassed(startSlot: number, address64k: number): boolean {
		const addressSlotBank = this.addressesSlotBankInfo[address64k];
		if (!addressSlotBank)
			return true;	// Undefined => I.e. not accessible.
		if (startSlot != addressSlotBank.slot) {
			if (!addressSlotBank.singleBank)
				return true;	// Bank border
		}
		// No border, address reachable
		return false;
	}


	/**
	 * Returns the node for a given address.
	 * @param addr64k The 64k address.
	 * @returns The AsmNode or undefined.
	 */
	public getNodeForAddress(addr64k: number): AsmNode | undefined {
		return this.nodes.get(addr64k);
	}


	/**
	 * Returns the label for a given address.
	 * @param addr64k The 64k address.
	 * @returns The label, e.g. "SUB_0456.LOOP1", or undefined.
	 */
	public getLabelForAddress(addr64k: number): string | undefined {
		return this.labels[addr64k];
	}


	/**
	 * Returns a label consisting of the prefix + the address as hex.
	 * @param addr e.g. 0x4AFE
	 * @returns e.g. "LBL_4AFE"
	 */
	protected createLabelName(addr: number) {
		return this.labelLblPrefix + Format.getHexString(addr, 4);
	}


	/**
	 * Runs 2 passes.
	 * First creates the shallow AsmNodes from all branches and calls addresses.
	 * Then all attributes of the nodes are filled (e.g. all calls, callers).
	 * At the end the complete flow graph is setup in the this.nodes
	 * map.
	 * @param addresses All 64k addresses to start flow graphs from.
	 */
	public getFlowGraph(addresses: number[]) {
		this.memory.resetAttributeFlag(MemAttribute.
			FLOW_ANALYZED);
		this.nodes.clear();

		// Create the nodes
		this.createNodes(addresses);

		// Now fill the nodes.
		this.fillNodes();

		// Find nodes that are subroutines.
		this.markSubroutines();

		// Find which address blocks represent the same block
		// (for local labels)
		this.partitionBlocks();

		// Assign global and local labels.
		this.assignLabels();
	}


	/**
	 * Creates all nodes in the this.nodes map.
	 * @param addresses All 64k addresses to start from.
	 */
	protected createNodes(addresses: number[]) {
		// Create all (shallow) AsmNodes
		const sortedAdresses = [...addresses];
		sortedAdresses.sort((a, b) => a - b);
		for (const addr of sortedAdresses) {
			const memAttr = this.memory.getAttributeAt(addr);
			if (!(memAttr & MemAttribute.FLOW_ANALYZED)) {
				// If not already analyzed
				this.createNodeForAddress(addr);
			}
		}
	}


	/**
	 * Follows the execution path of an address recursively.
	 * It fills up the this.nodes map with nodes.
	 * The nodes are just empty containers which contain only the start address.
	 * They will be filled in a secondary pass.
	 * @param address The 64k start address.
	 */
	protected createNodeForAddress(address: number) {
		// Check if address/node already exists.
		if (this.nodes.get(address)) {
			// Node already exists
			return;
		}

		// Node does not exist, create  new one
		const node = new AsmNode();
		node.start = address;
		node.slot = this.addressesSlotBankInfo[address].slot;
		this.nodes.set(address, node);

		const allBranchAddresses: number[] = [];

		while (true) {

			const memAttr = this.memory.getAttributeAt(address);
			// Check if already analyzed
			if (memAttr & MemAttribute.FLOW_ANALYZED) {
				// Was already analyzed, skip
				break;
			}

			// Check if memory exists
			if (!(memAttr & MemAttribute.ASSIGNED)) {
				break;
			}

			// Get opcode
			const refOpcode = Opcode.getOpcodeAt(this.memory, address);
			const opcode = {...refOpcode};
			this.memory.addAttributesAt(address, opcode.length, MemAttribute.FLOW_ANALYZED);

			// Next address
			address += opcode.length;

			// Check for branch
			if (opcode.flags & OpcodeFlag.BRANCH_ADDRESS) {
				// First natural flow, i.e. the next address.
				if (!(opcode.flags & OpcodeFlag.STOP)) {
					allBranchAddresses.push(address);
				}

				// Now the branch
				const branchAddress = opcode.value;
				allBranchAddresses.push(branchAddress);

				// Leave loop
				break;
			}

			// Check for RET cc
			if (opcode.flags & OpcodeFlag.RET && opcode.flags & OpcodeFlag.CONDITIONAL) {
				// Follow natural flow
				allBranchAddresses.push(address);
				break;
			}

			// Check for RET or JP
			if (opcode.flags & OpcodeFlag.STOP) {
				break;
			}

			// Check for bank border
			if (this.bankBorderPassed(node.slot, address))
				break;	// Bank border
		}

		// Now dive into branches
		for (const addr of allBranchAddresses) {
			// Check for bank border
			if (!this.bankBorderPassed(node.slot, addr))
				this.createNodeForAddress(addr);
		}

		return node;
	}


	/**
	 * In the second pass the nodes are filled.
	 * I.e. the calls, the branches, the predecessors and the callers.
	 * @param address The 64k start address.
	 */
	protected fillNodes() {
		for (const [, node] of this.nodes) {
			this.fillNode(node);
		}
	}


	/**
	 * Fills a single node with info:
	 * - calls
	 * - branches
	 * - length
	 * - stop
	 * Also fills other nodes:
	 * - callees
	 * - predecessors
	 * - isSubroutine
	 * Is not recursive.
	 * Does create new nodes (that are not included in the this.nodes map)
	 * for nodes that are reached through a bank border.
	 * @param node The node to work on.
	 */
	protected fillNode(node: AsmNode) {
		let address = node.start;
		const nodeSlot = node.slot;

		// Loop over node's addresses
		while (true) {

			// Check for bank border
			if (this.bankBorderPassed(nodeSlot, address)) {
				// Bank border, flows through into another bank.
				// Check that address is exactly at first address of slot
				const currSlotBank = this.addressesSlotBankInfo[address];
				if (!currSlotBank.singleBank) {
					const prevSlotBank = this.addressesSlotBankInfo[address - 1];
					if (currSlotBank.slot == prevSlotBank.slot) {
						// The last opcode was partly already inside the banked slot.
						node.comments.push('The last opcode spreads over 2 different banks. This could be wrong. The disassembly stops here.');
						break;
					}
				}
				// Create a "fake" AsmNode that is not included in the map.
				// Just an end-object for the caller.
				const fakeNode = this.getNodeForFill(nodeSlot, address);
				node.branchNodes.push(fakeNode);
				fakeNode.predecessors.push(node);
				break;
			}

			const memAttr = this.memory.getAttributeAt(address);
			// Check if memory exists
			if (!(memAttr & MemAttribute.ASSIGNED)) {
				break;
			}

			// Get opcode
			const refOpcode = Opcode.getOpcodeAt(this.memory, address);
			const opcode = refOpcode.clone();
			this.memory.addAttributesAt(address, opcode.length, MemAttribute.FLOW_ANALYZED);

			// Store
			node.instructions.push(opcode);

			// Next address
			address += opcode.length;

			// Check for branch
			if (opcode.flags & OpcodeFlag.BRANCH_ADDRESS) {
				// First natural flow, i.e. the next address.
				if (!(opcode.flags & OpcodeFlag.STOP)) {
					const followingNode = this.getNodeForFill(nodeSlot, address);
					Utility.assert(followingNode);
					node.branchNodes.push(followingNode);
					followingNode.predecessors.push(node);
				}

				// Now the branch
				const branchAddress = opcode.value;
				const branchNode = this.getNodeForFill(nodeSlot, branchAddress);

				// Check if it is a call
				if (opcode.flags & OpcodeFlag.CALL) {
					node.callee = branchNode;
					branchNode.callers.push(node);
				}
				else {
					// No CALL, e.g. a JP etc.
					node.branchNodes.push(branchNode);
					branchNode.predecessors.push(node);
				}

				// Check for JP (RET will not occur because of OpcodeFlag.BRANCH_ADDRESS)
				if (opcode.flags & OpcodeFlag.STOP) {
					node.stop = true;
				}
				// Leave loop
				break;
			}
			else {
				// No branch, e.g. normal opcode (LD A,5), JP, RET or RET cc
				// Check for RET or RET cc
				if (opcode.flags & OpcodeFlag.RET) {
					node.isSubroutine = true;
				}

				// Check for JP (or RET)
				if (opcode.flags & OpcodeFlag.STOP) {
					node.stop = true;
					break;
				}
			}

			// Also stop if next node starts
			const followingNode = this.nodes.get(address)!;
			if (followingNode) {
				node.branchNodes.push(followingNode);
				followingNode.predecessors.push(node);
				break;
			}
		}

		// Set length
		node.length = address - node.start;
		// Comment
		if (node.length == 0) {
			node.comments.push('Probably an error: The subroutine starts in unassigned memory.');
		}
	}


	/**
	 * Connects node with the node at address.
	 * If no node exists at address a new (bank border) node is created
	 * and connected.
	 * Method is only intended for use in 'fillNode'-
	 * @param slot The slot of the start node.
	 * @param address The address to check if in same slot.
	 * @return An AsmNode, either from the this.nodes map or a new created one.
	 */
	protected getNodeForFill(nodeSlot: number, address: number): AsmNode {
		let otherNode;
		if (this.bankBorderPassed(nodeSlot, address)) {
			// Node does not exist. I.e. it is a node that is reached through
			// a bank border and need to be created.
			otherNode = new AsmNode();
			otherNode.start = address;
			otherNode.bankBorder = true;
			otherNode.comments.push('The address is in a different bank. As the current paged bank might be the wrong one the program flow is not followed further.');
		}
		else {
			// The bank should already exist
			otherNode = this.nodes.get(address)!;
			Utility.assert(otherNode);
		}
		return otherNode;
	}


	/**
	 * Mark all nodes as subroutine that end in a node that is already marked as a subroutine
	 * (i.e. end with a RET, RET cc).
	 */
	protected markSubroutines() {
		// Loop all nodes
		for (const [, node] of this.nodes) {
			if (node.isSubroutine) {
				// Mark recursively
				for (const predec of node.predecessors)
					predec.markAsSubroutine();
			}
		}
	}


	/**
	 * Expects a sorted (by address) nodes map.
	 * Each nodes that are called by some other node are starting points of
	 * subroutines.
	 * The nodes direct trail is followed until it ends or another subroutine is found.
	 * The this.blocks array is filled with the starting node.
	 */

	protected partitionBlocks() {
		// Sort nodes by address
		const sortedNodes = Array.from(this.nodes.values());
		sortedNodes.sort((a, b) => a.start - b.start);

		// Loop all nodes
		let blockNode;
		let blockBranches: AsmNode[] = [];
		let addr;
		for (const node of sortedNodes) {
			// Check for block start
			if (node.start != addr || node.callers.length > 0 || !blockBranches.includes(node)) {
				blockNode = node;
				addr = node.start;
				// Use all block branches
				blockBranches = [];
				node.getBranchesRecursive(blockBranches);
			}

			// Fill addresses
			this.blocks.fill(blockNode, addr, addr + node.length);

			// Next
			addr += node.length;
		}
	}


	/**
	 * Assigns the labels to the nodes.
	 * Local and global labels.
	 * E.g. "SUB_04AD", "LBL_FF00", ".L1", ".L2", ".LOOP", ".LOOP1"
	 */
	public assignLabels() {
		// Loop over all nodes
		for (const [addr64k, node] of this.nodes) {
			// Get the block
			const blockNode = this.blocks[addr64k];
			//Utility.assert(blockNode);	// If false, a label has been requested for a not analyzed address.
			if (!blockNode)
				continue;	// A label has been requested for a not analyzed address.

			// Check for block start / global node (label)
			if (blockNode == node) {
				// Now check if it is a subroutine, if some other node
				// called it.
				const prefix = (blockNode.isSubroutine) ? this.labelSubPrefix : this.labelLblPrefix;
				// Add global label name
				const label = prefix + Utility.getHexString(addr64k, 4);
				this.setLabel(addr64k, label, node);

				// Now dive into node and assign local names.
				this.assignLocalLabels(node);
			}
		}
	}

	/**
	 * Sets a label for an address.
	 * Also sets the associated node's dbgName (if any).
	 * @param addr64k The 64k address.
	 * @param label and it'S associated label name, e.g. "SUB_0456.LOOP1"
	 */
	protected setLabel(addr64k: number, label: string, node?: AsmNode) {
		this.labels[addr64k] = label;
		if(node)
			node.dbgName = label;
	}


	/**
	 * Assigns the local labels for a node.
	 * Since local labels are indexed it is necessary to count the number
	 * of indices before assigning.
	 * Examples: ".L1", ".L2", ".LOOP", ".LOOP1"
	 * @param node The node for which local labels are assigned.
	 */
	public assignLocalLabels(node: AsmNode) {
		const localNodes: AsmNode[] = [];
		const loopNodes: AsmNode[] = [];
		let addr = node.start;
		let blockNode = node;
		while (addr < 0x10000) {
			// Check if block is referenced out of the normal flow
			if (blockNode.otherReference()) {
				// Check all branches
				const label = this.labels[addr];
				if (!label) {	// Only if not already assigned
					// Check if loop
					if (blockNode.isLoopRoot()) {
						// A loop
						loopNodes.push(blockNode);
					}
					else {
						// Just a local label
						localNodes.push(blockNode);
					}
				}
			}
			// Next address
			Utility.assert(addr == blockNode.start);
			addr += blockNode.length;
			// Leave if block ends
			if (this.blocks[addr] != node)
				break;
			// Next block
			blockNode = this.nodes.get(addr)!;
			Utility.assert(blockNode);
		}

		// Number the local labels
		let i = 1;
		for (const node of localNodes) {
			const label = '.' + this.labelLocalLabelPrefix + i;
			this.setLabel(node.start, label, node);
			i++;
		}

		// Number the local loops
		if (loopNodes.length == 1) {
			// Just one loop, omit index
			const node = loopNodes[0];
			const label = '.' + this.labelLoopPrefix;
			this.setLabel(node.start, label, node);
		}
		else {
			// Add index
			let k = 1;
			for (const node of loopNodes) {
				const label = '.' + this.labelLoopPrefix + k;
				this.setLabel(node.start, label, node);
				k++;
			}
		}
	}


	/**
	 * Returns an adjusted address.
	 * The address is returned unchanged if the address does not point to
	 * CODE or to CODE_FIRST.
	 * The idea is to adjust a label to the start of an opcode.
	 * @param addr64k A 64k address.
	 * @returns The adjusted address.
	 */
	protected adjustAddress(addr64k: number): number {
		while (true) {
			const attr = this.memory.getAttributeAt(addr64k);
			if (attr & MemAttribute.CODE_FIRST || !(attr & MemAttribute.CODE))
				return addr64k;
			// Next
			addr64k--;
		}
	}


	/**
	 * Follows the execution path and collects used and unchanged registers.
	 * @param address The start address of the subroutine.
	 * @returns
	 */
	public getRegisterUsage(address: number) {
	}

}
