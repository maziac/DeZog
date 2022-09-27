import {BankType, MemoryModel} from '../remotes/MemoryModel/memorymodel';
import {Utility} from '../misc/utility';
import {AsmNode} from './asmnode';
import {Comments} from './comments';
import {Format} from './format';
import {MemAttribute, Memory} from './memory';
import {NumberType} from './numbertype';
import {Opcode, OpcodeFlag} from './opcode';
import {Subroutine} from './subroutine';
import {Z80Registers} from '../remotes/z80registers';
import {Labels} from '../labels/labels';
import {ReverseEngineeringLabelParser} from '../labels/reverseengineeringlabelparser';
import {Remote} from '../remotes/remotebase';
import {SkipPseudoOpcode} from './skippseudoopcode';


// Type used as passed argument for labels.
export type AddressLabel = [number, string];


/** The SlotBankInfo is set at the start for every address.
 * It depends on the used memory model.
 */
interface SlotBankInfo {
	// The slot number of an address.
	slot: number;
	// true if non-switchable single bank. false if more than 2 banks or if slot is not used (BankType.UNUSED).
	singleBank: boolean;
}


/** The main Disassembler class.
 */
export class SmartDisassembler {

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
	// that share the same block.)
	protected blocks = new Array<AsmNode>(0x10000);

	// This map contains data labels (strings) that are referenced by instructions.
	// E.g. LD A,(C000h)
	// It does not contain the node labels.
	// It also contains references into code areas for self modifying code.
	protected otherLabels = new Map<number, string>();

	// The assembly comments are stored here.
	public comments = new Comments();

	// Map with the long address to line number relationship and vice versa.
	protected addrLineMap = new Map<number, number>();
	protected lineAddrArray = new Array<number | undefined>();

	// A map with long addresses for skips. I.e. addresses that the PC should simply skip.
	// E.g. for special RST commands followed by bytes.
	// Used only by the ReverseEngineeringLabelParser.
	protected skipAddrs64k = new Map<number, number>();


	/// Label prefixes
	public labelSubPrefix = "SUB_";
	public labelLblPrefix = "LBL_";
	public labelRstPrefix = "RST_";
	public labelDataLblPrefix = "DATA_";
	public labelCodePrefix = "CODE_";	// Is used if data is read /written to a CODE section. For local (e.g. "SUB_C000.CODE_C00B") and global (e.g. "CODE_C00B").
	public labelLocalLabelPrefix = "L";
	public labelLocalLoopPrefix = "LOOP";


	/**The function that is used to retrieve label names by the disassembler.
	 * @param addr64k The 64k address.
	 * @returns The corresponding first label found. Or undefined.
	 */
	public funcGetLabel(addr64k: number): string | undefined {
		// Convert to long address
		const longAddr = Z80Registers.createLongAddress(addr64k);
		// Check if label already known
		const labels = Labels.getLabelsForLongAddress(longAddr);
		if (labels.length == 0)
			return undefined;
		return labels[0];	// Just return first label
	}


	/** The function that is used to filter out certain addresses from the output by the disassembler.
	 * If false is returned the line for this address is not shown.
	 * @param addr64k The 64k address.
	 * @returns true (show line) / false (do not show line)
	 */

	public funcFilterAddresses(addr64k: number): boolean {
		// Convert to long address
		const longAddr = Z80Registers.createLongAddress(addr64k);
		// Check if label has a file associated
		const entry = Labels.getSourceFileEntryForAddress(longAddr);
		return (entry == undefined || entry.size == 0);	// Filter only non-existing addresses or addresses with no code
	}


	/// A function that formats the long address printed at first in the disassembly.
	/// Used to add bank information after the address by the disassembler.
	/// Uses the current slot.
	public funcFormatLongAddress(addr64k: number): string {
		// Convert to long address
		const longAddr = Z80Registers.createLongAddress(addr64k, this.slots);
		// Formatting
		let addrString = Utility.getHexString(addr64k, 4);
		const shortName = Remote.memoryModel.getBankShortNameForAddress(longAddr);
		if (shortName)
			addrString += ReverseEngineeringLabelParser.bankSeparator + shortName;
		return addrString;
	}


	/** Sets the slot and bank info.
	 * Has to be done before the disassembly.
	 * Is not changed anymore.
	 * @param addrStart The start address.
	 * @param addrEnd The end address (inclusive).
	 * @param slot The slot number for that range.
	 * @param singleBank Set true if single bank. False if multiple banks or if bank/slot is not used.
	 */
	protected setSlotBankInfo(addrStart: number, addrEnd: number, slot: number, singleBank: boolean) {
		for (let addr = addrStart; addr <= addrEnd; addr++)
			this.addressesSlotBankInfo[addr] = {slot, singleBank};
	}


	/**
	 * Sets the memory model.
	 * Used to check if certain execution flows should be followed or not.
	 * @param memModel The memory model obtained from the settings through the Remote.
	 */
	public setMemoryModel(memModel: MemoryModel) {
		const slotLen = memModel.slotRanges.length;
		for (let slot = 0; slot < slotLen; slot++) {
			const range = memModel.slotRanges[slot];
			// Now check if maybe unused
			const [bankNr] = range.banks;
			const bank = memModel.banks[bankNr];
			const singleBank = (bank.bankType != BankType.UNUSED) && (range.banks.size == 1);
			this.setSlotBankInfo(range.start, range.end, slot, singleBank);
		}

	}


	/** Sets the current slots.
	 * @param slots Array with the slots.
	 */
	public setCurrentSlots(slots: number[]) {
		this.slots = slots;
	}


	/** Get all Labels for the currently mapped in banks.
	 * @returns an array of 64k addresses with associated label string.
	 */
	public get64kLabels(): AddressLabel[] {
		// Get address and one label
		const addressLabels = Labels.getLabelsMap();
		// Filter map by existing address
		const addr64kLabels: AddressLabel[] = [];
		for (const [address, label] of addressLabels) {
			const addr64k = address & 0xFFFF;
			const longAddress = Z80Registers.createLongAddress(addr64k, this.slots);
			// Check if right bank
			if (address == longAddress) {
				addr64kLabels.push([addr64k, label]);
			}
		}
		return addr64kLabels;
	}


	/** Define the memory area to disassemble.
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

	/** Returns the node for a given address.
	 * @param addr64k The 64k address.
	 * @returns The AsmNode or undefined.
	 */
	public getNodeForAddress(addr64k: number): AsmNode | undefined {
		return this.nodes.get(addr64k);
	}


	/** Returns the nodes for the given addresses.
	 * @param addrs64k An array with addresses.
	 * @returns The corresponding nodes. If a node does not exist for an address
	 * it is not included in the returned array.
	 * The returned array is sorted by address from low to high.
	 */
	public getNodesForAddresses(addrs64k: number[]): AsmNode[] {
		// Convert to nodes
		const addrNodes: AsmNode[] = [];
		for (const addr64k of addrs64k) {
			const node = this.nodes.get(addr64k);
			if (node)
				addrNodes.push(node);
		}
		// Sort
		addrNodes.sort((a, b) => a.start - b.start);
		// Return
		return addrNodes;
	}


	/** SECTION getFlowGraph
	 * Runs 2 passes.
	 * First creates the shallow AsmNodes from all branches and calls addresses.
	 * Then all attributes of the nodes are filled (e.g. all calls, callers).
	 * At the end the complete flow graph is setup in the this.nodes
	 * map.
	 * @param addresses All 64k addresses to start flow graphs from.
	 * @param labels Address (64k) label pairs. From the (list) file parsing.
	 */
	public getFlowGraph(addresses: number[], labels: AddressLabel[]) {
		this.nodes.clear();
		this.otherLabels.clear();
		this.comments.clear();

		// Create the nodes
		this.memory.resetAttributeFlag(~MemAttribute.ASSIGNED);	// Memory can be disassembled anew even if it has not been newly fetched.
		this.createNodes(addresses);

		// Now create nodes for the labels
		this.createNodesForLabels(labels);

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


	/** ANCHOR createNodes
	 * Creates all nodes in the this.nodes map.
	 * @param addresses All 64k addresses to start from.
	 */
	protected createNodes(addresses: number[]) {
		// Create all (shallow) AsmNodes
		const sortedAdresses = [...addresses];
		sortedAdresses.sort((a, b) => a - b);
		for (const addr64k of sortedAdresses) {
			const memAttr = this.memory.getAttributeAt(addr64k);
			if (memAttr & MemAttribute.FLOW_ANALYZED) {
				// Does it fit the already done disassembly?
				if (!(memAttr & MemAttribute.CODE_FIRST)) {
					// Not CODE_FIRST: A disassembly at an offset took place -> error
					this.comments.addAmbiguousComment(addr64k, addr64k);
				}
			}
			else {
				// If not already analyzed, create node
				this.createNodeForAddress(addr64k);
			}
		}
	}


	/** Creates a node in the map.
	 * Sets also address and slot.
	 * @param addr64k The address of the node.
	 * @returns The node
	 */
	protected createNodeInMap(addr64k: number): AsmNode {
		const node = new AsmNode();
		node.start = addr64k;
		node.slot = this.addressesSlotBankInfo[addr64k].slot;
		this.nodes.set(addr64k, node);
		return node;
	}


	/** Returns the address that correspondents to a prior CODE_FIRST.
	 * @param addr64k The address
	 * @return The adjusted address
	 */
	protected getAddressForCodeFirst(addr64k: number): number {
		// Adjust address (in case it does not point to the start of instruction)
		while (true) {
			const attr = this.memory.getAttributeAt(addr64k);
			if (attr & MemAttribute.CODE_FIRST)
				break;
			addr64k--;
		}
		return addr64k;
	}


	/**
	 * Follows the execution path of an address recursively.
	 * It fills up the this.nodes map with nodes.
	 * The nodes are just empty containers which contain only the start address.
	 * They will be filled in a secondary pass.
	 * A node is not created if it would start on an already FLOW_ANALYZED address.
	 * A created flow at least would contain one opcode. Even if that opcode is ambiguous.
	 * (Ambiguity: this is to show the user at least one possibly disassembly and let him decide.)
	 * @param addr64k The 64k start address.
	 */
	protected createNodeForAddress(addr64k: number) {
		// Check if address/node already exists.
		if (this.nodes.get(addr64k)) {
			// Node already exists
			return;
		}

		// Check if we reach an area that was already analyzed
		const memAttr = this.memory.getAttributeAt(addr64k);
		// Check if already analyzed
		if (memAttr & MemAttribute.FLOW_ANALYZED) {
			// Does it fit the already done disassembly?
			if (memAttr & MemAttribute.CODE_FIRST) {
				// Yes, so just create a new node
				this.createNodeInMap(addr64k);
				// No analyzes required (was done already)
				return;
			}
			// Not CODE_FIRST: A disassembly at an offset took place -> error
			this.comments.addAmbiguousComment(addr64k, addr64k);
			// Do not create a node
			return;
		}

		// Check if memory exists
		if (!(memAttr & MemAttribute.ASSIGNED)) {
			// A comment is created elsewhere.
			// Do not create a node
			return;
		}

		// Node does not exist, create  new one
		const node = this.createNodeInMap(addr64k);

		const allBranchAddresses: number[] = [];

		while (true) {

			// Get opcode and opcode length
			const refOpcode = Opcode.getOpcodeAt(this.memory, addr64k);
			// Check if opcode addresses (other than starting address) have already been analyzed
			const flowAddr = this.memory.searchAddrWithAttribute(MemAttribute.FLOW_ANALYZED, addr64k + 1, refOpcode.length - 1);
			// Set memory as analyzed
			this.memory.addAttributesAt(addr64k, refOpcode.length, MemAttribute.FLOW_ANALYZED | MemAttribute.CODE);
			this.memory.addAttributeAt(addr64k, MemAttribute.CODE_FIRST);
			// Now check
			if (flowAddr != undefined) {
				// Some analyzes has been done already that assumed that the opcode starts at a different address.
				this.comments.addAmbiguousComment(addr64k, flowAddr);
				// The disassembly will stop after that opcode.
				break;
			}

			// Next address
			addr64k += refOpcode.length;
			const memAttrNext = this.memory.getAttributeAt(addr64k);

			// Check for branch
			const flags = refOpcode.flags;
			if (flags & OpcodeFlag.BRANCH_ADDRESS) {
				const branchAddress = refOpcode.value;
				// First natural flow, i.e. the next address.
				if (!(refOpcode.flags & OpcodeFlag.STOP)) {
					// Adjust return address (if CALL/RST and not conditional)
					let skip;
					while ((skip = this.getSkipForAddress(addr64k))) {
						// Skip bytes
						addr64k = (addr64k + skip) & 0xFFFF;
					}
					allBranchAddresses.push(addr64k);
				}

				// Now the branch
				allBranchAddresses.push(branchAddress);

				// Leave loop
				break;
			}

			// Also stop if end of memory reached
			if (addr64k > 0xFFFF)
				break;

			// Check for RET cc
			if (flags & OpcodeFlag.RET && flags & OpcodeFlag.CONDITIONAL) {
				// Follow natural flow
				allBranchAddresses.push(addr64k);
				break;
			}

			// Check if already analyzed
			if (memAttrNext & MemAttribute.FLOW_ANALYZED) {
				// Everything fine. Code has been already analyzed. Stop.
				break;
			}

			// Check for RET or JP
			if (flags & OpcodeFlag.STOP) {
				break;
			}

			// Check for bank border
			if (this.bankBorderPassed(node.slot, addr64k))
				break;	// Bank border
		}

		// Now dive into branches
		for (const targetAddr of allBranchAddresses) {
			// Check for bank border
			if (!this.bankBorderPassed(node.slot, targetAddr))
				this.createNodeForAddress(targetAddr);
		}

		return node;
	}


	/** ANCHOR createNodesForLabels
	 * Creates extra nodes for the labels.
	 * Creates nodes only at already analyzed memory and only if it is CODE_FIRST.
	 * Labels pointing to data or not at the start of an instruction are added to this.otherLabel.
	 * @param labels The Labels to consider.
	 */
	protected createNodesForLabels(addr64kLabels: AddressLabel[]) {
		for (const [addr64k, label] of addr64kLabels) {
			// Check for CODE_FIRST
			const attr = this.memory.getAttributeAt(addr64k);
			if (attr & MemAttribute.CODE_FIRST) {
				// Is a code label
				// Check if start of node
				let node = this.nodes.get(addr64k);
				if (!node) {
					// Create new node
					node = this.createNodeInMap(addr64k);
				}
				// Use the label name
				node.label = label;
			}
			else {
				// Otherwise add to otherLabels
				this.otherLabels.set(addr64k, label);
			}
		}
	}


	/** ANCHOR fillNodes
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
		let addr64k = node.start;
		const nodeSlot = node.slot;

		// Loop over node's addresses
		while (true) {

			// Get opcode
			const refOpcode = Opcode.getOpcodeAt(this.memory, addr64k);
			const opcode = refOpcode.clone();

			// Check for referenced data addresses
			if (opcode.valueType == NumberType.DATA_LBL) {
				// Adjust address if pointing to CODE (Note: is already checked that this is no bank border address):
				// Check for DATA or CODE
				let adjAddr64k = opcode.value;
				let attr = this.memory.getAttributeAt(adjAddr64k);
				if (attr & MemAttribute.CODE) {
					// CODE
					// Adjust address (in case it does not point to the start of instruction)
					adjAddr64k = this.getAddressForCodeFirst(adjAddr64k);
				}
				// Then collect the address for later usage
				node.dataReferences.push(adjAddr64k);
			}

			// Store
			node.instructions.push(opcode);

			// Next address
			const lastAddr64k = addr64k;
			addr64k += opcode.length;

			// Check for branch
			const flags = opcode.flags;
			if (flags & OpcodeFlag.BRANCH_ADDRESS) {
				const branchAddress = opcode.value;
				// First natural flow, i.e. the next address.
				if (!(flags & OpcodeFlag.STOP)) {
					// Adjust return address (if CALL/RST and not conditional)
					let skip;
					while ((skip = this.getSkipForAddress(addr64k))) {
						// Read memory
						const data = this.memory.getData(addr64k, skip);
						// Add instructions
						const skipOpcode = new SkipPseudoOpcode(data);
						node.instructions.push(skipOpcode)
						// Skip bytes
						addr64k = (addr64k + skip) & 0xFFFF;
					}
					// Store
					const followingNode = this.getNodeForFill(nodeSlot, lastAddr64k, addr64k);
					Utility.assert(followingNode);
					node.branchNodes.push(followingNode);
					followingNode.predecessors.push(node);
				}

				// Now the branch
				const branchNode = this.getNodeForFill(nodeSlot, lastAddr64k, branchAddress);

				// Check if it is a call
				if (flags & OpcodeFlag.CALL) {
					node.callee = branchNode;
					branchNode.callers.push(node);
				}
				else {
					// No CALL, e.g. a JP etc.
					node.branchNodes.push(branchNode);
					branchNode.predecessors.push(node);
				}

				// Check for JP (RET will not occur because of OpcodeFlag.BRANCH_ADDRESS)
				if (flags & OpcodeFlag.STOP) {
					node.stop = true;
				}
				// Leave loop
				break;
			}
			else {
				// No branch, e.g. normal opcode (LD A,5), JP, RET or RET cc
				// Check for RET or RET cc
				if (flags & OpcodeFlag.RET) {
					node.isSubroutine = true;
				}

				// Check for JP (or RET)
				if (flags & OpcodeFlag.STOP) {
					node.stop = true;
					break;
				}
			}

			// Also stop if end of memory reached
			if (addr64k > 0xFFFF)
				break;

			// Also stop if next node starts
			const followingNode = this.nodes.get(addr64k)!;
			if (followingNode) {
				node.branchNodes.push(followingNode);
				followingNode.predecessors.push(node);
				break;
			}

			// Check if opcode is ambiguous
			const flowAddr = this.memory.searchAddrWithAttribute(MemAttribute.CODE_FIRST, lastAddr64k + 1, opcode.length - 1);
			// Break if ambiguous disassembly
			if (flowAddr != undefined)
				break;

			// Check for bank border
			if (this.bankBorderPassed(nodeSlot, addr64k)) {
				// Bank border, flows through into another bank.
				// Check that address is exactly at first address of slot
				const currSlotBank = this.addressesSlotBankInfo[addr64k];
				if (!currSlotBank.singleBank) {
					const prevSlotBank = this.addressesSlotBankInfo[addr64k - 1];
					if (currSlotBank.slot == prevSlotBank.slot) {
						// The last opcode was partly already inside the banked slot.
						this.comments.addOpcodeSpreadsOverBanks(lastAddr64k);
					}
					// No else: the error will be created in 'getNodeFill'
					// else {
					// 	// Just the next opcode is in new bank
					// 	this.comments.addONextOpcodeInOtherBank(lastAddr64k);
					// }
				}
				// Create a "fake" AsmNode that is not included in the map.
				// Just an end-object for the caller.
				const fakeNode = this.getNodeForFill(nodeSlot, lastAddr64k, addr64k);
				node.branchNodes.push(fakeNode);
				fakeNode.predecessors.push(node);
				break;
			}
		}

		// Set length
		node.length = addr64k - node.start;
	}


	/** Returns the 'return' offset for an opcode.
	 * Only if it is an unconditional CALL or RST.
	 * Otherwise 0 is returned.
	 * @param addr64k The address to check.
	 * @returns undefined, 1 or 2.
	 */
	public getSkipForAddress(addr64k: number): number | undefined {
		const skip = this.skipAddrs64k.get(addr64k);
		return skip;
	}


	/**
	 * Connects node with the node at address.
	 * If no node exists at address a new (bank border) node is created
	 * and connected.
	 * Method is only intended for use in 'fillNode'.
	 * @param originSlot The slot of the start node (origin).
	 * @param originAddress The originating address. E.g. the previous address or the address
	 * of the JP or CALL instruction.
	 * @param targetAddress The address to check if in same slot.
	 * @return An AsmNode, either from the this.nodes map or a new created one.
	 */
	protected getNodeForFill(originSlot: number, originAddress: number, targetAddress: number): AsmNode {
		let otherNode;
		if (this.bankBorderPassed(originSlot, targetAddress)) {
			// Node does not exist. I.e. it is a node that is reached through
			// a bank border and need to be created.
			otherNode = new AsmNode();
			otherNode.start = targetAddress;
			otherNode.bankBorder = true;
			this.comments.addDifferentBankAccessComment(originAddress, targetAddress);
		}
		else {
			// The node should already exist
			otherNode = this.nodes.get(targetAddress)!;
			//Utility.assert(otherNode);
			// Several reason a node does not exist:
			// - For ambiguous code it can happen that there is no node for an address
			// - A jump to code in UNASSIGNED memory also has no node.
			if (!otherNode) {
				// Node does not exist, so create one that can be returned
				otherNode = new AsmNode();
				otherNode.start = targetAddress;
				const attr = this.memory.getAttributeAt(targetAddress);
				if (attr & MemAttribute.ASSIGNED) {
					// So it is because of ambiguous code
					this.comments.addAmbiguousComment(originAddress, targetAddress);
				}
				else {
					// Memory was not ASSIGNED
					this.comments.addBranchToUnassignedMemory(originAddress, targetAddress);
				}
			}
		}
		return otherNode;
	}


	/** ANCHOR markSubroutines
	 * Mark all nodes as subroutine that end in a node that is already marked as a subroutine
	 * (i.e. end with a RET, RET cc).
	 * Mark also all nodes that are called and there successors.
	 */
	protected markSubroutines() {
		// Loop all nodes
		for (const [, node] of this.nodes) {
			// If a node was marked as subroutine (because of RET) then
			// mark also all predecessors.
			if (node.isSubroutine) {
				// Mark recursively
				for (const predec of node.predecessors)
					predec.markPredecessorsAsSubroutine();
			}
			else {
				// Now mark node if it has callers
				if (node.callers.length) {
					node.isSubroutine = true;
				}
			}
		}
	}


	/** ANCHOR partitionBlocks
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


	/** ANCHOR assignNodeLabels
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
				if (!node.label) {
					// Only if not already assigned
					if (node.callers.length > 0 || node.predecessors.length > 0) {
						let prefix;
						// First check if it is a subroutine
						if (blockNode.isSubroutine) {
							// Now check for RST addresses
							if (blockNode.start & ~0b00111000) {
								// Is normal CALL
								prefix = this.labelSubPrefix;
							}
							else {
								// Is RST
								prefix = this.labelRstPrefix;
							}
						}
						else {
							// Use normal label
							prefix = this.labelLblPrefix;
						}
						// Add global label name
						node.label = prefix + Utility.getHexString(addr64k, 4);
					}
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
			const preLabel = '.';	// Just local label
			// const preLabel = node.label + '.';	// Full label
			for (const localNode of localNodes) {
				localNode.label = preLabel + this.labelLocalLabelPrefix + i;
				i++;
			}

			// Number the local loops
			if (loopNodes.length == 1) {
				// Just one loop, omit index
				loopNodes[0].label = preLabel + this.labelLocalLoopPrefix;
			}
			else {
				// Add index
				let k = 1;
				for (const loopNode of loopNodes) {
					loopNode.label = preLabel + this.labelLocalLoopPrefix + k;
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
				loopNode.label = this.labelLblPrefix + Utility.getHexString(loopNode.start, 4);
			}
		}
	}


	/** ANCHOR assignOpcodeReferenceLabels
	 * For the opcode references (e.g. the 1234h in "LD A,(1234h)")
	 * the this.opcodeReferences array has been filled with
	 * opcodes and addresses.
	 * For each of the address a labels is now created and put into
	 * this.otherLabels.
	 */
	protected assignOpcodeReferenceLabels() {
		// Loop over all nodes
		for (const [, node] of this.nodes) {
			const slot = node.slot;
			// Loop over all data references of that node
			for (let addr64k of node.dataReferences) {
				// Check first if bank border crossed
				if (this.bankBorderPassed(slot, addr64k))
					continue;	// Does not create a label

				// Check if there is already a label
				let label = this.funcGetLabel(addr64k);
				if (!label)
					label = this.nodes.get(addr64k)?.label;
				if (!label)
					label = this.otherLabels.get(addr64k);

				if (!label) {
					// Check for DATA or CODE
					let attr = this.memory.getAttributeAt(addr64k);
					if (attr & MemAttribute.CODE) {
						// CODE
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
					else {
						// DATA
						// Now create a new label
						label = this.labelDataLblPrefix + Utility.getHexString(addr64k, 4);
						// And store
						this.otherLabels.set(addr64k, label);
					}
				}
			}
		}
	}


	// !SECTION

	/** Returns the label for the given address.
	 * It first checks with the given function this.funcGetLabel.
	 * If nothing is found it checks the this.nodes labels.
	 * If still nothing is found it checks this.otherLabels.
	 * If nothing is found the address in hex is returned.
	 * @param addr64k The 64k address.
	 * @param slot The slot where the access originated. I.e. if there is a bank
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
		let suffixDiff = 0;
		let attr = this.memory.getAttributeAt(addr64k);
		if (attr & MemAttribute.CODE) {
			// Adjust address (in case it does not point to the start of instruction)
			const origAddress = addr64k;
			while (!(attr & MemAttribute.CODE_FIRST)) {
				addr64k--;
				attr = this.memory.getAttributeAt(addr64k);
			}
			suffixDiff = origAddress - addr64k;
		}
		// Find label
		let label = this.funcGetLabel(addr64k);
		if (!label)
			label = this.nodes.get(addr64k)?.label;
		if (!label)
			label = this.otherLabels.get(addr64k);

		// Note: it can still happen that a label is not found. One case is that
		// There e.g. is:
		// LBL:  LD A,6
		// and somewhere else is:
		//   JP LBL+1
		if (!label) {
			// In that case just return the address (with bank)
			return this.funcFormatLongAddress(addr64k + suffixDiff);
		}

		// Suffix?
		if (suffixDiff != 0)
			label += '+' + suffixDiff;

		// Return
		return label;
	}


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
			//let blockNodeLabel;
			const slot = this.addressesSlotBankInfo[node.start].slot;
			let addr64k = node.start;
			for (const opcode of node.instructions) {
				opcode.disassembleOpcode((addr64k: number) => {
					// Return an existing label for the address or just the address
					const labelName = this.getLabelFromSlotForAddress(slot, addr64k);
					return labelName;
				});
				opcode.addr64k = addr64k;
				addr64k += opcode.length;
			}
		}
	}


	/**
	 * Follows the execution path and collects used and unchanged registers.
	 * @param address The start address of the subroutine.
	 * @returns
	 */
	public getRegisterUsage(address: number) {
		// TODO
	}


	/** Returns a map with all node subroutines associations used by the starting nodes.
	 * Infinite depth.
	 * @param startNodes The nodes the processing should start on.
	 * @returns Map with nodes and subroutines and the depth
	 */
	public getSubroutinesFor(startNodes: AsmNode[]): {depth: number, nodeSubs: Map<AsmNode, Subroutine>} {
		const nodeSubs = new Map<AsmNode, Subroutine>();
		let maxDepth = 0;
		for (const node of startNodes) {
			const depth = this.getSubroutinesRecursive(node, nodeSubs);
			if (depth > maxDepth)
				maxDepth = depth;
		}
		return {depth: maxDepth, nodeSubs};
	}


	/** Helper method for getSubroutinesFor().
	 * @param node The node to get all node/subroutines for.
	 * @param allSubs This map gets filled with all subroutines and sub-subroutines used by node.
	 * @returns The calling depth. Starts at 0 (=no called functions)
	 */
	public getSubroutinesRecursive(node: AsmNode, allSubs: Map<AsmNode, Subroutine>): number {
		let maxDepth = -1;
		let sub = allSubs.get(node);
		if (!sub) {
			// subroutine not yet known
			sub = new Subroutine(node);
			allSubs.set(node, sub);
			for (const callee of sub.callees) {
				const depth = this.getSubroutinesRecursive(callee, allSubs);
				if (depth > maxDepth)
					maxDepth = depth;
			}
		}
		return maxDepth + 1;
	}


	/** Returns the label used at a specific address.
	 * Check first this.funcGetLabel, then this.nodes and then
	 * this.otherLabels.
	 * @param addr64k The address.
	 * @returns A string with the label or undefined.
	 */
	public getLabelForAddr64k(addr64k: number): string | undefined {
		let label = this.funcGetLabel(addr64k);
		if (label)
			return label;
		const node = this.nodes.get(addr64k);
		if (node)
			label = node.label;
		return label;
	}


	/** Returns the other label entry
	 * @param addr64k The address.
	 * @returns A string with the label or undefined.
	 */
	public getOtherLabel(addr64k: number): string | undefined {
		const label = this.otherLabels.get(addr64k);
		return label;
	}


	/** Returns the block node the address belongs to.
	 * @param addr64k An address.
	 * @returns The corresponding block node.
	 */
	public getBlockNode(addr64k: number): AsmNode {
		return this.blocks[addr64k];
	}
}
