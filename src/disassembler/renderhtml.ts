import {AsmNode} from "./asmnode";
import {RenderText} from "./rendertext";



/** Class to render disassembly text.
 */
export class RenderHtml extends RenderText {

	/** Formatting of a label at the start of a line ("LABEL:")
	 * @param label E.g. "LABEL"
	 * @return E.g. "<b>LABEL</b>"
	 */
	protected emphasizeLabel(label: string): string {
		return '<b><span style="color:var(--vscode-editorBracketHighlight-foreground3)">' + label + '</span></b>';
	}


	/** Surrounds the text with html <span></span> to change the background color
	 * to emphasize the item.
	 * @param text The text to surround.
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-foreground);font-weight:bold">8000 main:'</span>'
	 */
	protected emphasizeStartLabel(text: string): string {
		const html = '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">' + text + '</span>';
		return html;
	}


	/** Surrounds the text with html <span></span> to emphasize the comment.
	 * @param comment The text to surround. E.g. "; Note: bla bla"
	 * @returns E.g. '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">; Note: bla bla</span>'
	 */
	protected emphasizeComment(comment: string): string {
		const html = '<span style="background:var(--vscode-editor-selectionBackground);color:var(--vscode-editor-selectionForeground);font-weight:bold">' + comment + '</span>';
		/* light/dark
		--vscode-editorBracketHighlight-foreground1:  blue/yellow(orange)
		--vscode-editorBracketHighlight-foreground2:  green/magenta(pink)
		--vscode-editorBracketHighlight-foreground3:  brown/blue(light)
		--vscode-editorBracketHighlight-foreground4:  /transparent
		--vscode-editorBracketHighlight-foreground5:  /transparent
		--vscode-editorBracketHighlight-foreground6:  /transparent
		*/
		return html;
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
