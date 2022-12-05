import {AsmNode} from "./core/asmnode";
import {Format} from "./core/format";
import {RenderBase} from "./renderbase";
import {RenderedLines} from "./renderedlines";
import {SmartDisassembler} from "./smartdisassembler";
import {Subroutine} from "./core/subroutine";


/** Used by funcLineAddressAssociation.
 * Returns a guide for the RenderText to render the current line.
 */
export const enum RenderHint {
	RENDER_EVERYTHING,	// Render label, data and disassembly
	RENDER_DATA_AND_DISASSEMBLY,	// Render no label
	RENDER_NOTHING,		// Do not render the current line at all
}


/** Class to render disassembly text.
 */
export class RenderText extends RenderBase {

	/// Column areas. E.g. area for the bytes shown before each command
	public clmnsAddress = 5;		///< size for the address at the beginning of each line.
	public clmnsBytes = 4 * 3 + 1;	///< 4* length of hex-byte

	// The max. number of bytes to print in a data DEFB area per line.
	public defbMaxBytesPerLine = 8;

	// Helper array. During processing this array is filled with all the instruction's
	// data references. 'dataReferencesIndex' points to the currently in use address.
	protected dataReferences: number[] = [];


	/** A function that is called on every disassembled line.
	 * It will check if sourcefile/line already exists for a given address.
	 * Only used for the normal text disassembly.
	 * Not by call graph, flow chart or html disassembly.
	 * Is set by the constructor.
	 * @param addr64k The address.
	 * @returns RenderHint The result of the comparison.
	 */
	protected funcLineAddressAssociation?: (addr64k: number) => RenderHint;

	/** A function that is called on every disassembled line.
	 * It will associate the code lines with addresses.
	 * Only used for the normal text disassembly.
	 * Not by call graph, flow chart or html disassembly.
	 * Is set by the constructor.
	 * @param line The file's line number (starting at 0).
	 * @param addr64k The address.
	 * @param bytesCount The number of bytes. Every address will be associated with the line number.
	 */
	protected funcAssociateLineWithAddress?: (lineNr: number, addr64k: number, bytesCount: number) => void;


	/** Constructor.
	 */
	constructor(disasm: SmartDisassembler, funcLineAddressAssociation?: (addr64k: number) => RenderHint, funcAssociateLineWithAddress?: (lineNr: number, addr64k: number, bytesCount: number) => void) {
		super(disasm);
		this.funcLineAddressAssociation = funcLineAddressAssociation;
		this.funcAssociateLineWithAddress = funcAssociateLineWithAddress;
	}


	/** Formatting of a label at the start of a line ("LABEL:")
	 * @param label E.g. "LABEL"
	 * @return E.g. "<b>LABEL</b>"
	 * Override.
	 */
	protected emphasizeLabel(label: string): string {
		return label;
	}



	/** Surrounds the text with html <span></span> to change the background color
	 * to emphasize the item.
	 * @param text The text to surround.
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-foreground);font-weight:bold">8000 main:'</span>'
	 * Override.
	 */
	protected emphasizeStartLabel(text: string): string {
		return text;
	}


	/** Surrounds the text with html <span></span> to emphasize the comment.
	 * @param comment The text to surround. E.g. "; Note: bla bla"
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">; Note: bla bla</span>'
	 * Override.
	 */
	protected emphasizeComment(comment: string): string {
		return comment;
	}


	/** Formatting of an instruction, e.g. "CALL nnnn"
	 * @param instruction E.g. "CALL $0893"
	 * @return E.g. "<b>CALL $0893</b>"
	 * Override.
	 */
	protected emphasizeAddrBytes(instruction: string): string {
		return instruction;
	}


	/** Formatting of the address and the bytes of the list(ing).
	 * @param addrBytes E.g. "0893 01 34 AF"
	 * @return E.g. "<b>0893 01 34 AF</b>"
	 * Override.
	 */
	protected emphasizeInstruction(addrBytes: string): string {
		return addrBytes;
	}


	/** Formatting of the dat output.
	 * @param data E.g. "DEFB 01 34 AF"
	 * @return E.g. "<b>DEFB 01 34 AF</b>"
	 * Override.
	 */
	protected emphasizeData(data: string): string {
		return data;
	}


	/** Surrounds the text with html <a></a> with href that points to the given address.
	 * @param text The text to surround.
	 * @param addr64k The address to add as a reference.
	 * @returns E.g. '<a href="#8000">8000 main:</a>'
	 * Override.
	 */
	protected addReferences(text: string, addr64k: number): string {
		return text;
	}


	/** Returns a formatted line with address and label.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param label The label, e.g "LBL_C000".
	 * @returns A complete line, e.g. "C000.B1 LABEL1:"
	 */
	protected formatAddressLabel(addr64k: number, label: string): string {
		const addrString = (this.disasm.funcFormatLongAddress(addr64k)).padEnd(this.clmnsAddress - 1) + ' ';
		const s = this.emphasizeAddrBytes(addrString) + this.emphasizeLabel(label + ':');
		return s;
	}


	/** Returns a formatted line with address bytes and text/opcode.
	 * With right clmns spaces.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @param comment An optional comment text.
	 * @returns A complete line, e.g. "C000.B1 3E 05    LD A,5 ; Comment"
	 */
	protected formatAddressPlusText(addr64k: number, bytes: Uint8Array, text: string, comment?: string): string {
		const addrString = this.disasm.funcFormatLongAddress(addr64k).padEnd(this.clmnsAddress - 1);
		let bytesString = '';
		bytes.forEach(value =>
			bytesString += value.toString(16).toUpperCase().padStart(2, '0') + ' '
		);
		bytesString = bytesString.substring(0, bytesString.length - 1);
		bytesString = Format.getLimitedString(bytesString, this.clmnsBytes - 2);
		let s = this.emphasizeAddrBytes(addrString + ' ' + bytesString) + '  ' + this.emphasizeInstruction(text);
		if (comment)
			s += ' ' + this.emphasizeComment('; ' + comment);
		return s;
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
		const text = this.emphasizeData(this.getDefbLine(bytes));
		const comment = this.getDefbComment(bytes);
		const line = this.formatAddressPlusText(addr64k, bytes, text, comment);
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
		labelText = this.addReferences(labelText, addr64k);
		return labelText;
	}


	/** Print comments for addresses.
	 * If comments do exist.
	 * @param lines The comments are put in here.
	 * @param addr64k The address.
	 * @param len The range of addresses to check. [addr64k, addr64k+len-1]
	 */
	protected printComments(lines: RenderedLines, addr64k: number, len: number) {
		const cmnts = this.disasm.comments.getCommentsForAddresses(addr64k, len);
		if (cmnts.length > 0) {
			lines.addNewline();
			cmnts.forEach(c =>
				lines.addLine(this.emphasizeComment('; Note: ' + c)));
		}
	}


	/** Adds a disassembly data block.
	 * It prints only data with labels.
	 * I.e. for each found label it prints at least 8 bytes of data
	 * (= 1 line).
	 * @param lines Array of lines. The new text lines are pushed here.
	 * @param addr64k The address to start.
	 * @param dataLen The length of the data to print.
	 */
	protected printData(lines: RenderedLines, addr64k: number, dataLen: number) {
		// Find first address in 'dataReferences'
		let dataAddr = this.dataReferences.at(-1);	// Last item
		if (dataAddr == undefined) {
			return;
		}

		// Pop until first address in area is found
		while (dataAddr < addr64k) {
			dataAddr = this.dataReferences.pop();
			if (dataAddr == undefined) {
				return;
			}
		}

		// Get end address
		let endAddr = addr64k + dataLen;
		if (endAddr > 0x10000)
			endAddr = 0x10000;

		// Continue until area is left
		while (dataAddr < endAddr) {
			// Label is in printed area
			this.dataReferences.pop();
			// Check distance to next label:
			let nextDataAddr = this.dataReferences.at(-1);	// Last item
			while (nextDataAddr == dataAddr) {
				// Skip same addresses
				this.dataReferences.pop();
				nextDataAddr = this.dataReferences.at(-1);
			}
			let countBytes = this.defbMaxBytesPerLine;
			if (nextDataAddr != undefined) {
				const diffToNext = nextDataAddr - dataAddr;
				if (countBytes > diffToNext)
					countBytes = diffToNext;
			}
			const diffToEnd = endAddr - dataAddr;
			if (countBytes > diffToEnd)
				countBytes = diffToEnd;

			// Check all bytes if a source file already mentions them
			let render = RenderHint.RENDER_EVERYTHING;
			if (this.funcLineAddressAssociation) {
				for (let i = 0; i < countBytes; i++) {
					const tmpRender = this.funcLineAddressAssociation(dataAddr + i);
					if (i == 0)
						render = tmpRender;
					if (tmpRender == RenderHint.RENDER_NOTHING) {
						// Show not all
						countBytes = i;
						break;
					}
				}
			}

			if (countBytes > 0) {
				// Print the label
				if (render === RenderHint.RENDER_EVERYTHING) {
					let label = this.disasm.getLabelForAddr64k(dataAddr);
					if (!label)
						label = this.disasm.getOtherLabel(dataAddr);
					if (label) {
						// Is e.g. not defined if in different bank.
						const addressLabel = this.getAddressLabel(dataAddr, label);
						lines.addLine(addressLabel);
					}
				}

				// Print the data
				const line = this.getCompleteDataLine(dataAddr, countBytes);
				lines.addLine(line);
				// Associate line(s) with addresses
				if (this.funcAssociateLineWithAddress) {
					this.funcAssociateLineWithAddress(lines.length() - 1, dataAddr, countBytes);
				}
			}

			// Check for end
			if (nextDataAddr == undefined)
				break;

			// Next
			dataAddr = nextDataAddr;
		}

		// Add new line only if something was added.
		lines.addNewline();
	}


	/** ANCHOR Renders the disassembly text.
	 * @param startNodes The nodes to disassemble.
	 * @param depth The (max) depth to render.
	 * @returns The disassembled text.
	 */

	public renderSync(startNodes: AsmNode[], depth: number): string {
		// Render
		const rendered = this.renderForDepth(startNodes, depth);
		return rendered;
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
		// Sort the nodes
		const nodes = Array.from(nodesForDepth);
		nodes.sort((a, b) => a.start - b.start);

		// Render
		const rendered = this.renderNodes(nodes, startNodes);
		return rendered;
	}


	/** ANCHOR Renders all given nodes to text.
	 * @param nodes An array with the sorted nodes (sorted by start address).
	 * @param startNodes The start node labels are rendered in a different color.
	 * @returns The disassembly text.
	 */
	public renderNodes(nodes: AsmNode[], startNodes: AsmNode[] = []): string {
		// Now get all data references (for the nodes = for the depth)
		this.dataReferences = [];
		for (const node of nodes) {
			this.dataReferences.push(...node.dataReferences);
		}
		this.dataReferences.sort((a, b) => b - a); // 0 = highest

		// Loop over all nodes
		let render = RenderHint.RENDER_EVERYTHING;
		const lines = new RenderedLines();
		let addr64k = 0x0000;
		let lastLabel = '';	// Is required for reducing local labels.
		for (const node of nodes) {
			// nodes from sub routine may contain bank border addresses -
			// those are not shown as it is not clear to which bank they belong:
			if (node.bankBorder)
				continue;

			// Get node address
			const nodeAddr = node.start;

			// Print data between nodes
			const dataLen = nodeAddr - addr64k;
			if (dataLen > 0) {
				this.printData(lines, addr64k, dataLen);
			}
			addr64k = nodeAddr;

			// Check if label exists
			let emphasizeStartNode = startNodes.includes(node);
			let label = this.disasm.getLabelForAddr64k(addr64k);
			if (label) {
				// Check if label should be shown at all
				if (this.funcLineAddressAssociation) {
					render = this.funcLineAddressAssociation(addr64k);
				}
				if (render == RenderHint.RENDER_EVERYTHING) {
					// Check if local label.
					const isLocal = label.startsWith(lastLabel + '.');
					if (isLocal) {
						// Is a local label, reduce to e.g. ".L1"
						const kLocal = lastLabel.length;
						label = label.substring(kLocal);
					}
					else {
						// Remember if not local label
						lastLabel = label;
					}
					let labelText = this.getAddressLabel(addr64k, label);
					// Color the node label
					if (emphasizeStartNode) {
						labelText = this.emphasizeStartLabel(labelText);
						// Emphasizing finished
						emphasizeStartNode = false;
					}
					// Store
					lines.addLine(labelText);

					// Associate line(s) with address
					if (this.funcAssociateLineWithAddress) {
						this.funcAssociateLineWithAddress(lines.length()-1, addr64k, 0);
					}
				}
			}

			// Disassemble node
			for (const opcode of node.instructions) {

				// Associate line and address
				const len = opcode.length;
				if (this.funcLineAddressAssociation) {
					render = this.funcLineAddressAssociation(addr64k);
				}
				// Only render if no source file exists with the same address
				if (render != RenderHint.RENDER_NOTHING) {
					// First print comment(s)
					this.printComments(lines, addr64k, opcode.length);

					// Check if an other label needs to be printed (an "opcode reference")
					const otherLabel = this.disasm.getOtherLabel(addr64k);
					if (otherLabel) {
						const labelText = this.getAddressLabel(addr64k, otherLabel);
						// Store
						lines.addLine(labelText);
					}

					// Now disassemble instruction
					const bytes = this.disasm.memory.getData(addr64k, len);
					const instructionText = this.formatAddressPlusText(addr64k, bytes, opcode.disassembledText);
					let hrefInstrText = this.addReferences(instructionText, addr64k);
					if (emphasizeStartNode) {
						hrefInstrText = this.emphasizeStartLabel(hrefInstrText);
						// Emphasizing finished
						emphasizeStartNode = false;
					}
					lines.addLine(hrefInstrText);

					// Associate line(s) with addresses
					if (this.funcAssociateLineWithAddress) {
						this.funcAssociateLineWithAddress(lines.length()-1, addr64k, len);
					}
				}

				// Next
				addr64k += len;
			}

			// Separate blocks
			lines.addNewline();
		}

		// Print data after last node
		const dataLen = 0x10000 - addr64k;
		if (dataLen > 0) {
			this.printData(lines, addr64k, dataLen);
		}

		// Return
		const text = lines.getText();
		return text;
	}
}
