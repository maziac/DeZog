import {prototype} from "events";
import {addSyntheticLeadingComment} from "typescript";
import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {RenderBase} from "./renderbase";
import {Subroutine} from "./subroutine";



/** Class to render disassembly text.
 */
export class RenderText extends RenderBase {

	/// Column areas. E.g. area for the bytes shown before each command
	public clmnsAddress = 5;		///< size for the address at the beginning of each line.
	public clmnsBytes = 4 * 3 + 1;	///< 4* length of hex-byte
	public clmnsOpcodeFirstPart = 4 + 1;	///< First part of the opcodes, e.g. "LD" in "LD A,7" // TODO : Still required?
	public clmsnOpcodeTotal = 5 + 6 + 1;		///< Total length of the opcodes. After this an optional comment may start. // TODO : Still required?


	/** ANCHOR Renders the disassembly text.
	 * @param nodes The nodes to disassemble.
	 * It is expected that this array is sorted by address from low to high.
	 * @returns The text for the complete disassembly.
	 */

	public renderSync(nodes: AsmNode[]): string {
		const lines: string[] = [];
		// Simply loop all nodes
		for (const node of nodes) {
			// Get label
			const nodeAddr = node.start;
			const nodeLabelName = this.funcGetLabel(nodeAddr) || node.label; // TODO: otherLabels.get()

			// Print label
			if (nodeLabelName) {
				//lines.push(
			}
		}

		return '';
	}


	/** Returns a formatted line with address and label.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param text A text to add. Usually the decoded instruction.
	 * @returns A complete line, e.g. "C000.B1 LABEL1:"
	 */
	protected formatAddressLabel(addr64k: number, text: string): string {
		const addrString = (this.funcFormatLongAddress(addr64k)).padEnd(this.clmnsAddress - 1) + ' ';
		const s = addrString + text + ':';
		return s;
	}


	/** Returns a formatted line with address bytes and text/opcode.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @returns A complete line, e.g. "C000.B1 3E 05    LD A,5"
	 */
	protected formatAddressInstruction(addr64k: number, bytes: number[], text: string): string {
		const addrString = this.funcFormatLongAddress(addr64k).padEnd(this.clmnsAddress - 1);
		const hexBytes = bytes.map(value => value.toString(16).toUpperCase().padStart(2, '0'));
		let bytesString = hexBytes.join(' ');
		bytesString = Format.getLimitedString(bytesString, this.clmnsBytes - 2);
		const s = addrString + ' ' + bytesString + '  ' + text;
		return s;
	}


	/** ANCHOR Renders the disassembly text.
	 * @param startNodes The nodes to disassemble.
	 * It is expected that this array is sorted by address from low to high.
	 * @returns The text for the complete disassembly.
	 */

	public renderSync2(startNodes: AsmNode[]): string {


		for (const node of startNodes) {

		}


		// Color codes (not real colors) used to exchange the colors at the end.
		const mainColor = '#FEFE01';
		const emphasizeColor = '#FEFE02';
		const otherBankColor = '#FEFE03';

		// Header
		const lines: string[] = [];
		lines.push('digraph FlowChart {');
		// Appearance
		lines.push('bgcolor=transparent;');
		lines.push(`node [shape=box, color="${mainColor}", fontcolor="${mainColor}"];`);
		lines.push(`edge [color="${mainColor}"];`);

		for (const startNode of startNodes) {
			// Get complete sub
			const sub = new Subroutine(startNode);

			// Print all nodes belonging to the subroutine
			let endUsed = false;
			let end;
			for (const node of sub.nodes) {
				const dotId = this.getDotId(node);
				let instrTexts: string;
				// Bank border ?
				if (node.bankBorder) {
					lines.push(dotId + ' [fillcolor="' + otherBankColor + '", style=filled];');
					instrTexts = 'Other\\lBank\\l';
				}
				else {
					// Get disassembly text of node.
					instrTexts = node.getAllDisassemblyLines().join('\\l') + '\\l';
				}
				// Print disassembly
				const hrefAddresses = this.getAllRefAddressesFor(node);
				lines.push(dotId + ' [label="' + instrTexts + '", href="#' + hrefAddresses + '"];');

				// Check if someone calls node
				if (node == startNode || node.callers.length > 0) {
					let shape = 'box';
					let href = '';
					const nodeAddr = node.start;
					if (node == startNode) {
						// Shape start node differently
						shape = 'tab';
						// Add href to start
						href = 'href="#' + this.funcFormatLongAddress(nodeAddr) + '"';
						// Define end
						end = 'end' + dotId;
					}
					const nodeLabelName = this.funcGetLabel(nodeAddr) || node.label || Format.getHexFormattedString(nodeAddr);
					const callerDotId = 'caller' + dotId;
					lines.push(callerDotId + ' [label="' + nodeLabelName + '", fillcolor="' + emphasizeColor + '", style=filled, shape="' + shape + '", ' + href + '];');
					lines.push(callerDotId + ' -> ' + dotId + ' [headport="n", tailport="s"];');
				}

				// Print connection to branches
				let i = 0;
				for (const branch of node.branchNodes) {
					const branchDotId = this.getDotId(branch);
					// Color 2nd branch differently
					let dotBranchLabel = '';
					if (i > 0) {
						// TODO: Test if labelling arrows is senseful or overloaded
						const branchLabel = this.funcGetLabel(branch.start) || branch.label || Format.getHexFormattedString(branch.start);
						if (branchLabel)
							dotBranchLabel = 'label="' + branchLabel + '", fontcolor="' + mainColor + '" ';
					}
					// Override if pointing to itself, e.g. JR $, or looping, and not poitint to itself
					let tailport = 's';
					if (branch != node && (i > 0 || node.start >= branch.start))
						tailport = '_'; // east or west (or center)
					lines.push(dotId + ' -> ' + branchDotId + ' [' + dotBranchLabel + 'headport="n", tailport="' + tailport + '"];');
					// Next
					i++;
				}
				// Check for RET
				if (node.isRET() && (end != undefined)) {
					// Connection to end
					lines.push(dotId + ' -> ' + end + ';');
					endUsed = true;
				}
			}

			// Check if end symbol is required
			if(endUsed)
				lines.push(end + ' [label="end", shape=doublecircle];');
		}

		// Ending
		lines.push('}');

		// Return
		return "";
	}
}
