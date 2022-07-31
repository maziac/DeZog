import {readFileSync} from 'fs';
import {Utility} from './../misc/utility';
import {AsmNode} from './asmnode';
import {Format} from './format';
import {MemAttribute, Memory} from './memory';
import {NumberType} from './numbertype';
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
 * Combines an opcode and the address it references.
 * Helper structure to collect all the addresses that the opcodes
 * reference.
 * At the end these are turned into labels.
 * E.g. "LD A,(1234h)": The 1234h will be stored in refAddress.
 */
interface OpcodeReference {
	// The Opcode
	opcode: Opcode;
	// The address of the opcode
	opcodeAddress: number;
	// The address that it refers to
	refAddress: number;
}


/**
 * The main Disassembler class.
 */
export class DisassemblerNextGen {

	/// A function that can be set to assign other than the standard
	/// label names.
	public funcGetLabel: (addr64k: number) => string | undefined;

	/// A function that can be set to filter out certain addresses from the output.
	/// Note: the addresses are still used for analysis but are simply skipped in the output ('disassembleMemory').
	// If false is returned the line for this address is not shown.
	public funcFilterAddresses: (addr64k: number) => boolean;

	/// A function that formats the long address printed at first in the disassembly.
	/// Used to add bank information after the address. Using the current slot.
	public funcFormatLongAddress: (addr64k: number) => string;

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

	// Blocks (subroutines are put into this array. I.e. all addresses
	// that share the same block.
	protected blocks = new Array<AsmNode>(0x10000);

	// This map contains data labels (strings) that are referenced by instructions.
	// E.g. LD A,(C000h)
	// It does not contain the node labels.
	// It also contains references into code areas for self modifying code.
	protected otherLabels = new Map<number, string>();

	// This is a helper array that collects the opcodes and the reference of the opcode.
	protected opcodeReferences: OpcodeReference[] = [];

	/// Label prefixes
	public labelSubPrefix = "SUB_";
	public labelLblPrefix = "LBL_";
	public labelRstPrefix = "RST_";
	public labelDataLblPrefix = "DATA_";
	public labelCodePrefix = "CODE_";	// Is used if data is read /written to a CODE section. For local (e.g. "SUB_C000.CODE_C00B") and global (e.g. "CODE_C00B").
	public labelLocalLabelPrefix = "L";	// "_L"
	public labelLocalLoopPrefix = "LOOP";	// "_LOOP"

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
	public getNodeForAddress(addr64k: number): AsmNode | undefined{
		return this.nodes.get(addr64k);
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

		// Assign global and local labels to the nodes.
		this.assignNodeLabels();

		// Assign labels from the opcode references, e.g. "LD A,(1234h)"
		this.assignOpcodeReferenceLabels();
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
				this.createNodeForAddress(addr, false);
			}
		}
	}


	/**
	 * Follows the execution path of an address recursively.
	 * It fills up the this.nodes map with nodes.
	 * The nodes are just empty containers which contain only the start address.
	 * They will be filled in a secondary pass.
	 * @param address The 64k start address.
	 * @param startingNode Set to true for the first call (from createNodes).
	 * Will set node.isStartingNode. Later also all called nodes will get
	 * this set.
	 */
	protected createNodeForAddress(address: number, startingNode: boolean) {
		// Check if address/node already exists.
		if (this.nodes.get(address)) {
			// Node already exists
			return;
		}

		// Node does not exist, create  new one
		const node = new AsmNode();
		node.isStartingNode = startingNode;
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
			const refOpcode = Opcode.getOpcodeAt(this.memory, address);	// TODO: getOpcodeAt should already return a clone.
			const opcode = {...refOpcode};
			this.memory.addAttributesAt(address, opcode.length, MemAttribute.FLOW_ANALYZED | MemAttribute.CODE);
			this.memory.addAttributeAt(address, MemAttribute.CODE_FIRST);

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
				this.createNodeForAddress(addr, false);
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
	 * - callers
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

			// Check for referenced data addresses
			if (opcode.valueType == NumberType.DATA_LBL) {
				// Then collect the address for later usage
				const opcRef: OpcodeReference = {
					opcode,
					opcodeAddress: address,
					refAddress: opcode.value
				}
				this.opcodeReferences.push(opcRef);
			}

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
					branchNode.isStartingNode = true;
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
	 * Fills the this.blocks array. A block is a concatenated area of code that can be labelled with a global label.
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
			//if (node.start != addr || node.callers.length > 0 || !blockBranches.includes(node)) {
			if (node.start != addr || node.isStartingNode || !blockBranches.includes(node)) {
				blockNode = node;
				addr = node.start;
				//node.isStartingNode = true;
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
	public assignNodeLabels() {
		// Loop over all nodes
		for (const [addr64k, node] of this.nodes) {
			// Print label and address:
			// Get the block
			const blockNode = this.blocks[addr64k];
			//Utility.assert(blockNode);	// If false, a label has been requested for a not analyzed address.
			if (!blockNode)
				continue;	// A label has been requested for a not analyzed address.

			// Check for block start / global node (label)
			if (blockNode == node) {
				// Assign label only if starting node (callers or predecessors, predecessors is for the case that there is e.g. a loop from subroutine to an address prior to the subroutine).
				if (node.isStartingNode || node.predecessors.length > 0)
				//if (node.callers.length > 0 || node.predecessors.length > 0)
				{
					// Now check if it is a subroutine, if some other node
					// called it.
					const prefix = (blockNode.isSubroutine && blockNode.isStartingNode) ? this.labelSubPrefix : this.labelLblPrefix;
					// Add global label name
					node.label = prefix + Utility.getHexString(addr64k, 4);
				}

				// Now dive into node and assign local names.
				this.assignLocalLabels(node);
			}
		}
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
				if (!blockNode.label) {	// Only if not already assigned
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

		// Normally the node.label exists. But for the start of disassembly
		// it may not be there. In that case, instead of local labels, normal
		// labels are assigned.
		if (node.label) {
			// Local label
			// Number the local labels
			let i = 1;
			for (const localNode of localNodes) {
				localNode.label = node.label + '.' + this.labelLocalLabelPrefix + i;
				i++;
			}

			// Number the local loops
			if (loopNodes.length == 1) {
				// Just one loop, omit index
				loopNodes[0].label = node.label + '.' + this.labelLocalLoopPrefix;
			}
			else {
				// Add index
				let k = 1;
				for (const loopNode of loopNodes) {
					loopNode.label = node.label + '.' + this.labelLocalLoopPrefix + k;
					k++;
				}
			}
		}
		else {
			// Global labels:
			// Labels
			for (const localNode of localNodes) {
				localNode.label = this.labelLblPrefix + Utility.getHexString(localNode.start, 4);
			}
			// Loops
			for (const loopNode of loopNodes) {
				node.label = this.labelLblPrefix + Utility.getHexString(loopNode.start, 4);
			}
		}
	}


	/**
	 * For the opcode references (e.g. the 1234h in "LD A,(1234h)")
	 * the this.opcodeReferences array has been filled with
	 * opcodes and addresses.
	 * For each of the address a labels is now created and put into
	 * this.otherLabels.
	 */
	protected assignOpcodeReferenceLabels() {
		// Loop over all collected addresses
		for (const opcRef of this.opcodeReferences) {
			// Check first if bank border crossed
			let addr64k = opcRef.refAddress;
			const slot = this.addressesSlotBankInfo[opcRef.opcodeAddress].slot;
			if (this.bankBorderPassed(slot, addr64k))
				continue;	// Does not create a label

			// Check for DATA or CODE
			let attr = this.memory.getAttributeAt(addr64k);
			if (attr & MemAttribute.CODE) {
				// CODE
				// Adjust address (in case it does not point to the start of instruction)
				while (!(attr & MemAttribute.CODE_FIRST)) {
					addr64k--;
					attr = this.memory.getAttributeAt(addr64k);
				}

				// Check if there is already a label
				let label = this.funcGetLabel(addr64k);
				if (!label)
					label = this.nodes.get(addr64k)?.label;
				if (!label)
					label = this.otherLabels.get(addr64k);
				if (!label) {
					// Now create a new label
					// Get the block node
					const blockNode = this.blocks[addr64k];
					Utility.assert(blockNode);
					label = blockNode.label;
					if (label) {
						// Create a new local label, e.g. "SUB_C000.CODE_C00B"
						label += '.' + this.labelCodePrefix + Utility.getHexString(addr64k, 4);
					}
					else {
						// Create a new label, e.g. "CODE_C00B"
						label = this.labelCodePrefix + Utility.getHexString(addr64k, 4);
					}
					// And store
					this.otherLabels.set(addr64k, label);
				}
			}
			else {
				// DATA
				// Check if label already exists.
				let label = this.funcGetLabel(addr64k);
				if (!label)
					label = this.nodes.get(addr64k)?.label;
				if (!label)
					label = this.otherLabels.get(addr64k);
				if (!label) {
					// Now create a new label
					label = this.labelDataLblPrefix + Utility.getHexString(addr64k, 4);
					// And store
					this.otherLabels.set(addr64k, label);
				}
			}
		}
	}


	/**
	 * Returns the label for the given address.
	 * It first checks with the given function this.funcGetLabel.
	 * If nothing found it checks the this.nodes labels.
	 * If still nothing found it checks this.otherLabels.
	 * If nothing is found the address in hex is returned.
	 * //If not found there it just returns undefined.
	 * @param addr64k The 64k address.
	 * @param slot The slot where the access origined. I.e. if there is a bank
	 * border not the label but a pure hex address is shown.
	 * @returns The label as string e.g. "SUB_0604.LOOP" or "LBL_0788+1" (in case address points to 0x0789 inside an instruction) or "$C000".
	 */
	protected getLabelFromSlotForAddress(slot: number, addr64k: number): string {
		// Check if no bank border
		if (this.bankBorderPassed(slot, addr64k)) {
			// Just return the address as hex string
			return Format.getHexFormattedString(addr64k, 4);
		}

		// Check for CODE and adjust address.
		let suffix = '';
		let attr = this.memory.getAttributeAt(addr64k);
		if (attr & MemAttribute.CODE) {
			// Adjust address (in case it does not point to the start of instruction)
			const origAddress = addr64k;
			while (!(attr & MemAttribute.CODE_FIRST)) {
				addr64k--;
				attr = this.memory.getAttributeAt(addr64k);
			}
			const diff = origAddress - addr64k;
			if (diff > 0)
				suffix = '+' + diff;
		}
		// Find label
		let label = this.funcGetLabel(addr64k);
		if (!label)
			label = this.nodes.get(addr64k)?.label;
		if (!label)
			label = this.otherLabels.get(addr64k);
		Utility.assert(label);
		return label! + suffix;
	}


	/**
	 * Disassembles one opcode together with a referenced label (if there
	 * is one).
	 * @param opcode The opcode to disassemble.
	 * @returns A string that contains the disassembly, e.g. "LD A,(DATA_LBL1)"
	 * or "JR Z,.sub1_lbl3".
	 */
	// TODO: REMOVE
	/*
	public disassembleOpcode(opcode: Opcode) {
		opcode.disassembleOpcode((addr64k: number) => {
			// Return an existing label for the address or invent one.
			const labelName = this.getLabelForAddress(addr64k);
			return labelName;
		});
	}
	*/


	/**
	 * Disassembles all nodes.
	 * The text is assigned to the nodes.
	 * This is the same and required for:
	 * - disassembly text
	 * - flow chart
	 * For call graph this step is not required (as no disassembly is shown).
	 * Puts the disassembled texts into the opcodes. e.g. "LD A,(DATA_LBL1)"
	 * or "JR Z,.sub1_lbl3".
	 */
	public disassembleNodes() {
		// Loop over all nodes
		for (const [, node] of this.nodes) {
			// Loop over all instructions/opcodes
			const slot = this.addressesSlotBankInfo[node.start].slot;
			for (const opcode of node.instructions) {
				opcode.disassembleOpcode((addr64k: number) => {
					// Return an existing label for the address or just the address
					const labelName = this.getLabelFromSlotForAddress(slot, addr64k);
					return labelName;
				});
			}
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
