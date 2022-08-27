import {AsmNode} from "./asmnode";
import {RenderText} from "./rendertext";



/** Class to render disassembly text.
 */
export class RenderHtml extends RenderText {

	/** Returns the css for the html, define additional colors.
	 * @param additional An (optional) additional string to add to the style.
	 * @returns The html style.
	 */
	public getHtmlStyle(additional: string = '') {
		return super.getHtmlStyle(`
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
			--dezog-bg-color-emphasize-startlabel: blue;
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

		${additional}
		`);
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
}
