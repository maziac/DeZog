import { Flags } from 'regexpp/ast';
import { AsmNode } from './asmnode';
import {Memory, MemAttribute} from './memory';
import {Opcode, OpcodeFlag} from './opcode';
import {Format} from './format';
import {readFileSync} from 'fs';
import {prototype} from 'events';
import {getNodeMajorVersion} from 'typescript';



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
	 * Follows the execution path.
	 * On each instruction 'func' will be called.
	 * The loop stops if either func returns true or if a stop code (RET instruction) is found.
	 * @param startSlot The slot that belongs to the start address.
	 * @param address The start address of the subroutine.
	 * @param func The function to execute.
	 * @param addrsArray An empty array in the beginning that is filled with
	 * all addresses of the subroutine.
	 */
	protected followFlowPath(startSlot: number, address: number, func: (flags: OpcodeFlag, opcode: Opcode, opcodeAddr: number, branchAddrs: number[]) => boolean, addrsArray?: Array<number>) {
		let flags: OpcodeFlag;
		const branchAddrs: number[] = [];

		do {
			// Check for bank border
			if (this.bankBorderPassed(startSlot, address))
				break;	// Bank border

			const memAttr = this.memory.getAttributeAt(address);
			// Check if already analyzed
			if (memAttr & MemAttribute.FLOW_ANALYZED) {
				// Was already analyzed, skip:
				break;
			}
			// Check if memory exists
			if (!(memAttr & MemAttribute.ASSIGNED)) {
				break;
			}

			// Check opcode
			const opcode = Opcode.getOpcodeAt(this.memory, address);
			this.memory.addAttributesAt(address, opcode.length, MemAttribute.FLOW_ANALYZED);

			// Add to array
			addrsArray?.push(address);

			// Remember flags
			flags = opcode.flags;

			// branch address
			if (func(flags, opcode, address, branchAddrs))
				break;	// Break from loop

			// Proceed to next address
			address += opcode.length;

		} while (!(flags & OpcodeFlag.STOP));

		// Now follow the collected branches
		branchAddrs.sort((a, b) => a - b);	// Sort: small to big
		let len = branchAddrs.length;
		for (let i = 0; i < len; i++) {
			const branchAddress = branchAddrs[i];
			if (branchAddress < address)
				continue;
			if (branchAddress != address)
				break;	// I.e. a hole is found in the block, so most probably the rest does not belong to the subroutine
			address = this.followFlowPath(startSlot, branchAddress, func, addrsArray);
		}

		return address;
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
	 *
	 *
	 */
	public getFlowGraph(addresses: number[]): AsmNode[] {
		this.memory.resetAttributeFlag(MemAttribute.
			FLOW_ANALYZED);
		const rootNodes: AsmNode[] = [];
		for (const addr of addresses) {
			const node = this.followNode(addr);
			rootNodes.push(node);
		}
		return rootNodes;
	}


	/**
	 *Follows the execution path of a node and its sub nodes.
	 * @param address The (long) stat address.
	 * @returns A node with opcodes and sub node branches.
	 */
	public followNode(address: number): AsmNode {
		// Now check if address would hit the middle (or exactly) of another node ad split it
		let node = this.splitOtherNode(address);
		if (node)
			return node;

		// Node does not exist, create  new one
		node = new AsmNode();
		node.start = address;
		node.slot = this.addressesSlotBankInfo[address].slot;
		let opcode;

		while (true) {

			// Check for bank border
			if (this.bankBorderPassed(node.slot, address))
				break;	// Bank border

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
			opcode = {...refOpcode};
			this.memory.addAttributesAt(address, opcode.length, MemAttribute.FLOW_ANALYZED);

			// Next address
			address += opcode.length;

			// Check for branch
			if (opcode.flags & OpcodeFlag.BRANCH_ADDRESS) {
				// First natural flow, i.e. the next address.
				if (!(opcode.flags & OpcodeFlag.STOP)) {
					const naturalNode = this.followNode(address);
					node.branchNodes.push(naturalNode);
				}

				// Now the branch
				const branchAddress = opcode.value;
				const branchNode = this.followNode(branchAddress);

				// Check if it is a call
				if (opcode.flags & OpcodeFlag.CALL) {
					node.callee = branchNode;
				}
				else {
					// No CALL, e.g. a JP etc.
					node.branchNodes.push(branchNode);
				}

				// Leave loop
				break;
			}
		}

		return node;
	}


	/**
	 * Returns the node for an address.
	 * @param address The long address.
	 * @returns The associated node or undefined if node does not exist.
	 */
	protected nodes = new Map<number, AsmNode>();
	protected getNodeForAddress(address: number): AsmNode | undefined {
		const node = this.nodes.get(address);
		return node;
	}


	/**
	 * Checks if a node would split another node.
	 * This happens if the address is inside of another node.
	 * In this case the original node is split in 2.
	 * All branches, calls, predecessors are adjusted correctly.
	 * A new upper part is generated. The lower part is the adjusted already existing node.
	 * If address is exactly the same as an already existing node, nothing happens and
	 * that node is returned.
	 * @param address The long address.
	 * @returns The associated node for the address.
	 */
	protected splitOtherNode(address: number): AsmNode | undefined {
		// First check if a node exactly hits.
		const exactNode = this.getNodeForAddress(address);
		if (exactNode)
			return exactNode;

		// Now loop through all
		for (const [, node] of this.nodes) {
			if (address > node.start && address < node.start + node.length) {
				// Hit found, split node:
				// Create new node
				const upperNode = new AsmNode();

				Besser undersrum: upper part erhalten.
				Dann müsste ich aber die Addressen statt den nodes speichern.
				Schwierig bei Predecessors.


			}
		}

		// Nothing found
		return undefined;
	}


	/**
	 * Follows the execution path and collects used and unchanged registers.
	 * @param address The start address of the subroutine.
	 * @returns
	 */
	public getRegisterUsage(address: number) {
	}

}
