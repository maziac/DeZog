import {Utility} from "../misc/utility";
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

	// The max. number of bytes to print in a data DEFB area per line.
	public defbMaxBytesPerLine = 8;

	// Helper array. During processing this array is filled with all the instruction's
	// data references. 'dataReferencesIndex' points to the currently in use address.
	protected dataReferences: number[] = [];


	/** Returns a formatted line with address and label.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param label A text to add. Usually the decoded instruction.
	 * @returns A complete line, e.g. "C000.B1 LABEL1:"
	 */
	protected formatAddressLabel(addr64k: number, label: string): string {
		const addrString = (this.disasm.funcFormatLongAddress(addr64k)).padEnd(this.clmnsAddress - 1) + ' ';
		// Make non local labels bold
		if (!label.startsWith('.'))
			label = '<b>' + label + '</b>';
		const s = addrString + label + ':';
		return s;
	}


	/** Returns a formatted line with address bytes and text/opcode.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @returns A complete line, e.g. "C000.B1 3E 05    LD A,5"
	 */
	protected formatAddressPlusText(addr64k: number, bytes: Uint8Array, text: string): string {
		const addrString = this.disasm.funcFormatLongAddress(addr64k).padEnd(this.clmnsAddress - 1);
		let bytesString = '';
		bytes.forEach(value =>
			bytesString += value.toString(16).toUpperCase().padStart(2, '0') + ' '
		);
		bytesString = bytesString.substring(0, bytesString.length - 1);
		bytesString = Format.getLimitedString(bytesString, this.clmnsBytes - 2);
		const s = addrString + ' ' + bytesString + '  ' + text;
		return s;
	}



	/** Surrounds the text with html <span></span> to change the background color
	 * to emphasize the item.
	 * @param text The text to surround.
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-foreground);font-weight:bold">8000 main:'</span>'
	 */
	protected htmlWithColor(text: string): string {
		const html = '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-foreground);font-weight:bold">' + text + '</span>';
		return html;
	}


	/** Surrounds the text with html <a></a> with href that points to the given address.
	 * @param text The text to surround.
	 * @param addr64k The address to add as a reference.
	 * @returns E.g. '<a href="#8000">8000 main:</a>'
	 */
	protected htmlWithReference(text: string, addr64k: number): string {
		const href = 'href="#' + this.disasm.funcFormatLongAddress(addr64k) + '"';
		const html = '<a ' + href + '>' + text + '</a>';
		return html;
	}


	/**
	 * Formats a series of bytes into a comment string.
	 * @param bytes The data to print.
	 * @returns All hex data is converted to ASCII. Non-printable characters are displayed as '?'.
	 * E.g. 'mystring'
	 */
	protected getDefbComment(bytes: Uint8Array): string {
		let result = '';
		for (const byte of bytes) {
			// Check if printable ASCII
			const printable = (byte >= 0x20) && (byte < 0x80);
			// Add to string
			if (printable) {
				const c = String.fromCharCode(byte);
				result += c;
			}
			else {
				// Non-printable
				result += '?'
			}
		}
		// Return
		return "ASCII: " + result;
	}


	/** Returns a line of DEFB data.
	 * @param bytes The data to print.
	 * @returns E.g. 'DEFB C0 AF 01'
	 */
	protected getDefbLine(bytes: Uint8Array) {
		let bytesString = '';
		bytes.forEach(value => {
			bytesString += ' ' + value.toString(16).toUpperCase().padStart(2, '0');
		});
		return 'DEFB' + bytesString;
	}


	/** Returns a complete line of data.
	 * With address and comment.
	 * @param addr64k The start address.
	 * @param len The amount of bytes.
	 * @returns E.g. '8000.1 C0 AF...  DEFB C0 AF 01 CE  ; ASCII: ????'
	 */
	protected getCompleteDataLine(addr64k: number, len: number) {
		const bytes: Uint8Array = this.disasm.memory.getData(addr64k, len);
		let text = this.getDefbLine(bytes);
		text += ' ; ' + this.getDefbComment(bytes);
		const line = this.formatAddressPlusText(addr64k, bytes, text);
		return line;
	}


	/** Creates a string with address and label information.
	 * The label is colored, if it is a start node
	 * @param E.g. E.g. 0x8000
	 * @param label E.g. "LABEL1"
	 * @returns E.g. "<a href="#8000">C0001.1 LABEL1:</a>"
	 */
	protected getAddressLabel(addr64k: number, label: string): string {
		let labelText = this.formatAddressLabel(addr64k, label);
		// Add href
		labelText = this.htmlWithReference(labelText, addr64k);
		return labelText;
	}


	/** Adds a disassembly data block.
	 * It prints only data with labels.
	 * I.e. for each found label it prints at least 8 bytes of data
	 * (= 1 line).
	 * @param lines Array of lines. The new text lines are pushed here.
	 * @param add64k The address to start.
	 * @param dataLen The length of the data to print.
	 */
	protected printData(lines: string[], addr64k: number, dataLen: number) {
		// Find first address in 'dataReferences'
		let dataAddr = this.dataReferences.at(-1);	// Last item
		if (dataAddr == undefined)
			return;

		// Pop until first address in area is found
		while (dataAddr < addr64k) {
			dataAddr = this.dataReferences.pop();
			if (dataAddr == undefined)
				return;
		}

		// Get end address
		let endAddr = addr64k + dataLen;
		if (endAddr > 0x10000)
			endAddr = 0x10000;

		// Continue until area is left
		const prevLineLength = lines.length;
		while (dataAddr < endAddr) {
			// Label is in printed area
			this.dataReferences.pop();
			// Check distance to next label:
			const nextDataAddr = this.dataReferences.at(-1);	// Last item
			let countBytes = this.defbMaxBytesPerLine;
			if (nextDataAddr != undefined) {
				const diffToNext = nextDataAddr - dataAddr;
				if (countBytes > diffToNext)
					countBytes = diffToNext;
			}
			const diffToEnd = endAddr - dataAddr;
			if (countBytes > diffToEnd)
				countBytes = diffToEnd;

			// Print the label
			const label = this.disasm.getLabelForAddr64k(dataAddr)!;
			Utility.assert(label);
			const addressLabel = this.getAddressLabel(dataAddr, label);
			lines.push(addressLabel);

			// Print the data
			const line = this.getCompleteDataLine(dataAddr, countBytes);
			lines.push(line);

			// Check for end
			if (nextDataAddr == undefined)
				break;

			// Next
			dataAddr = nextDataAddr;
		}

		// Add new line only if something was added.
		if (prevLineLength != lines.length)
			lines.push('');
	}


	/** ANCHOR Renders the disassembly text for different depths.
	 * @param startNodes The nodes to disassemble.
	 * @param maxDepth All depths [1..maxDepth] are being rendered.
	 * @returns The html for display.
	 */

	public renderSync(startNodes: AsmNode[], maxDepth: number): string {
		// Prepare an array for each depth
		const texts: string[] = [];

		// Loop all depths
		for (let depth = 0; depth <= maxDepth; depth++) {
			// Render
			const rendered = this.renderForDepth(startNodes, depth);
			// Store
			const html = '<pre>' + rendered + '</pre>';
			texts.push(html);
		}

		return this.addControls(texts, false);
	}


	/** ANCHOR Renders for a particular depth.
	 * @param startNodes The nodes to disassemble.
	 * @param depth The depth to render.
	 * @returns The disassembled text.
	 */
	public renderForDepth(startNodes: AsmNode[], depth: number): string {
		// Get all nodes for the depth
		const nodesForDepth = new Set<AsmNode>();
		for (const node of startNodes) {
			const sub = new Subroutine(node);
			sub.getAllNodesRecursively(depth, nodesForDepth);
		}
		// Render
		const rendered = this.renderNodes(nodesForDepth, startNodes);
		return rendered;
	}


	/** ANCHOR Renders all given nodes to text.
	 * @param nodeSet The nodes to disassemble. The nodes will be sorted by start address.
	 * @param startNodes The start node labels are rendered in a different color.
	 * @returns The disassembly text.
	 */
	public renderNodes(nodeSet: Set<AsmNode>, startNodes: AsmNode[]= []): string {
		// Sort the nodes
		const nodes = Array.from(nodeSet);
		nodes.sort((a, b) => a.start - b.start);

		// Now get all data references (for the nodes = for the depth)
		this.dataReferences = [];
		for (const node of nodes) {
			this.dataReferences.push(...node.dataReferences);
		}
		this.dataReferences.sort((a, b) => b - a); // 0 = highest

		// Loop over all nodes
		const lines: string[] = [];
		let addr64k = 0x0000;
		for (const node of nodes) {
			// Get node address
			const nodeAddr = node.start;

			// Print data between nodes
			const dataLen = nodeAddr - addr64k;
			if (dataLen > 0) {
				this.printData(lines, addr64k, dataLen);
				addr64k = nodeAddr;
			}

			// Disassemble node
			let i = 0;
			for (const opcode of node.instructions) {
				// Check if label exists
				const label = this.disasm.getLabelForAddr64k(addr64k);
				if (label) {
					let labelText = this.getAddressLabel(addr64k, label);
					if (i == 0) {
						// Check if it is a start node
						if (startNodes.includes(node)) {
							// Color the node label
							labelText = this.htmlWithColor(labelText);
						}
					}
					// Store
					lines.push(labelText);
				}

				// Now disassemble instruction
				const len = opcode.length;
				const bytes = this.disasm.memory.getData(addr64k, len);
				const instructionText = this.formatAddressPlusText(addr64k, bytes, opcode.disassembledText);
				const hrefInstrText = this.htmlWithReference(instructionText, addr64k);
				lines.push(hrefInstrText);

				// Next
				addr64k += len;
			}

			// Separate blocks
			lines.push('');
		}

		// Print data after last node
		const dataLen = 0x10000 - addr64k;
		if (dataLen > 0) {
			this.printData(lines, addr64k, dataLen);
		}

		// Return
		const text = lines.join('\n');
		return text;
	}
}
