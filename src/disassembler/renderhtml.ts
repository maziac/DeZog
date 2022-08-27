import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {RenderText} from "./rendertext";



/** Class to render disassembly text.
 */
export class RenderHtml extends RenderText {

	/** Returns the css for the html, define additional colors.
	 * @returns The html style.
	 */
	public getHtmlHeader(): string {
		// Create header
		let header = super.getHtmlHeader();
		header += `
	<style>
		body.vscode-light {
			--dezog-fg-color-emphasize-label: #001080;
			--dezog-bg-color-emphasize-startlabel: lightblue;
			--dezog-fg-color-emphasize-comment: #008000;
			--dezog-fg-color-emphasize-bytes: ##098658;
			--dezog-fg-color-emphasize-instruction: #0000FF;
			--dezog-fg-color-emphasize-data: #098658
		}

		body.vscode-dark {
			--dezog-fg-color-emphasize-label: #9CDCFE;
			--dezog-bg-color-emphasize-startlabel: navy;
			--dezog-fg-color-emphasize-comment: #6A9955;
			--dezog-fg-color-emphasize-bytes: #B5CEA8;
			--dezog-fg-color-emphasize-instruction: #569CD6;
			--dezog-fg-color-emphasize-data: #B5CEA8
		}

		body.vscode-high-contrast {	/* Same as vscode-light */
			--dezog-fg-color-emphasize-label: #001080;
			--dezog-bg-color-emphasize-startlabel: lightblue;
			--dezog-fg-color-emphasize-comment: #008000;
			--dezog-fg-color-emphasize-bytes: ##098658;
			--dezog-fg-color-emphasize-instruction: #0000FF;
			--dezog-fg-color-emphasize-data: #098658
		}

		.startlabel {
			background:var(--dezog-bg-color-emphasize-startlabel);
			font-weight:bold;
		}
		.label {
			color:var(--dezog-fg-color-emphasize-label);
		}
		.comment {
			color:var(--dezog-fg-color-emphasize-comment);
			font-weight:bold;
		}
		.bytes {
			color:var(--dezog-fg-color-emphasize-bytes);
		}
		.instruction {
			color:var(--dezog-fg-color-emphasize-instruction);
		}
		.data {
			color:var(--dezog-fg-color-emphasize-data);
		}
    </style>

	<script src="node_modules/leader-line/leader-line.min.js"></script>

	`;
		return header;
	}

	/** Surrounds the text with html <span></span> to change the background color
	 * to emphasize the item.
	 * @param text The text to surround.
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-foreground);font-weight:bold">8000 main:'</span>'
	 */
	protected emphasizeStartLabel(text: string): string {
		const html = '<span class="startlabel">' + text + '</span>';
		return html;
	}


	/** Formatting of a label at the start of a line ("LABEL:")
	 * @param label E.g. "LABEL"
	 * @return E.g. "<b>LABEL</b>"
	 */
	protected emphasizeLabel(label: string): string {
		return '<span class="label">' + label + '</span>';
	}


	/** Surrounds the text with html <span></span> to emphasize the comment.
	 * @param comment The text to surround. E.g. "; Note: bla bla"
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">; Note: bla bla</span>'
	 */
	protected emphasizeComment(comment: string): string {
		const html = '<span class="comment">' + comment + '</span>';
		return html;
	}


	/** Formatting of an instruction, e.g. "CALL nnnn"
	 * @param instruction E.g. "CALL $0893"
	 * @return E.g. "<b>CALL $0893</b>"
	 */
	protected emphasizeAddrBytes(instruction: string): string {
		return '<span class="bytes">' + instruction + '</span>';
	}


	/** Formatting of the address and the bytes of the list(ing).
	 * @param addrBytes E.g. "0893 01 34 AF"
	 * @return E.g. "<b>0893 01 34 AF</b>"
	 */
	protected emphasizeInstruction(instruction: string): string {
		return '<span class="instruction">' + instruction + '</span>';
	}


	/** Formatting of the dat output.
	 * @param data E.g. "DEFB 01 34 AF"
	 * @return E.g. "<b>DEFB 01 34 AF</b>"
	 * Override.
	 */
	protected emphasizeData(data: string): string {
		return '<span class="data">' + data + '</span>';
	}


	/** Surrounds the text with html <a></a> with href that points to the given address.
	 * @param text The text to surround.
	 * @param addr64k The address to add as a reference.
	 * @returns E.g. '<a href="#8000">8000 main:</a>'
	 */
	protected addReferences(text: string, addr64k: number): string {
		const href = 'href="#' + this.disasm.funcFormatLongAddress(addr64k) + '"';
		const html = '<a ' + href + '>' + text + '</a>';
		return html;
	}



	/** Adds an id.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param label The label, e.g "LBL_C000".
	 * @returns A complete line, e.g. "<span id="L.c000">C000.B1 LABEL1:</span>"
	 */
	protected formatAddressLabel(addr64k: number, label: string): string {
		const s = super.formatAddressLabel(addr64k, label);
		const id = this.getHtmlId(addr64k, 'T');
		return '<span id="' + id + '">' + s + '</span>';
	}


	/** Adds an id.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @param comment An optional comment text.
	 * @returns A complete line, e.g. ""<span id="L.c000">C000.B1 3E 05    LD A,5 ; Comment</span>"
	 */
	protected formatAddressPlusText(addr64k: number, bytes: Uint8Array, text: string, comment?: string): string {
		const s = super.formatAddressPlusText(addr64k, bytes, text, comment);
		const id = this.getHtmlId(addr64k, 'S');	// TODO: Should be optimized: not every address line is a source (branches)
		return '<span id="' + id + '">' + s + '</span>';
	}


	/** Returns the html ID of a html object, e.g. a <span>.
	 * @param addr64k The address of the label. Only labels have IDs.
	 * @param type 'S' = Source, for e.g. JP nnnn.
	 * 'T' = Target, the target, i.e. a label.
	 * @return E.g. "L.C0AF"
	 */
	protected getHtmlId(addr64k: number, type: 'S' | 'T'): string {
		//const longAddrString = this.disasm.funcFormatLongAddress(addr64k);
		//return 'L.' + longAddrString;
		return type + '.' + addr64k.toString(16);
	}


	/** ANCHOR Renders the disassembly text for different depths.
	 * @param startNodes The nodes to disassemble.
	 * @param maxDepth All depths [1..maxDepth] are being rendered.
	 * @returns The html for display.
	 */

	public renderSync(startNodes: AsmNode[], maxDepth: number): string {
		// Prepare an array for each depth
		const htmls: string[] = [];

		// Loop all depths
		for (let depth = maxDepth; depth <= maxDepth; depth++) {	// TODO
			// Render and store
			const html = this.renderForDepth(startNodes, depth);
			htmls.push(html);
		}

		return this.addControls(htmls, false);
	}


	/** ANCHOR Renders for a particular depth and adds the arrows (for branches).
	 * @param startNodes The nodes to disassemble.
	 * @param depth The depth to render.
	 * @returns The disassembled text.
	 */
	public renderForDepth(startNodes: AsmNode[], depth: number): string {
		// Normal rendering
		let rendered = '<pre>' + super.renderForDepth(startNodes, depth) + '</pre>';

		// Now add lines
		rendered += `
			<script>

				new LeaderLine(
					document.getElementById('S.810c'),
					document.getElementById('T.810b'),
					{
						path: 'grid',
						startSocket: 'right',
						endSocket: 'right'
					}
				);

   				//# sourceURL=Arrows.js
			</script>
		`;

		return rendered;
	}
}
