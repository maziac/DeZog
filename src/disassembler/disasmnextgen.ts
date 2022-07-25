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
	protected nodes = new Map<number, AsmNode>();

	// Blocks (subroutines are put into this array. I.e. all addresses
	// that share the same block.
	protected blocks = new Array<AsmNode>(0x10000);


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

		// Now fill the nodes.
		this.fillNodes();

		// Find which address blocks represent the same subroutine
		// (for local labels)
		this.partitionBlocks();
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
	 * Also fills other nodes:
	 * - callees
	 * - predecessors
	 * Is not recursive.
	 * @param node The node to work on.
	 */
	protected fillNode(node: AsmNode) {
		let address = node.start;

		while (true) {

			// Check for bank border
			if (this.bankBorderPassed(node.slot, address))
				break;	// Bank border

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
					const followingNode = this.nodes.get(address)!;
					Utility.assert(followingNode);
					node.branchNodes.push(followingNode);
					followingNode.predecessors.push(node);
				}

				// Now the branch
				const branchAddress = opcode.value;
				const branchNode = this.nodes.get(branchAddress)!;
				Utility.assert(branchNode);

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

				// Leave loop
				break;
			}

			// Check for RET or JP
			if (opcode.flags & OpcodeFlag.STOP) {
				break;
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
		for (const node of sortedNodes) {
			// Check for block start (subroutine or in addresses)
			if (node.callers.length > 0 || !blockBranches.includes(node)) {
				blockNode = node;
				// Use all block branches
				blockBranches = [];
				node.getBranchesRecursive(blockBranches);
			}

			// Fill addresses
			this.blocks.fill(blockNode, node.start, node.start + node.length);
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
