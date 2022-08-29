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
	protected formatAddressLabel2(addr64k: number, label: string): string {
		const addrString = (this.disasm.funcFormatLongAddress(addr64k)).padEnd(this.clmnsAddress - 1) + ' ';
		const s = this.emphasizeAddrBytes(addrString) + this.emphasizeLabel(label + ':');
		return s;
	}



	/** Adds an id.
	 * @param addr64k The address for the line. Is converted into a long address.
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @param comment An optional comment text.
	 * @returns A complete line, e.g. ""<span id="L.c000">C000.B1 3E 05    LD A,5 ; Comment</span>"
	 */
	protected formatAddressPlusText(addr64k: number, bytes: Uint8Array, text: string, comment?: string): string {
		const id = this.getHtmlId(addr64k, 'S');	// TODO: Should be optimized: not every address line is a source (branches)
		const addrString = this.disasm.funcFormatLongAddress(addr64k).padEnd(this.clmnsAddress - 1);
		let bytesString = '';
		bytes.forEach(value =>
			bytesString += value.toString(16).toUpperCase().padStart(2, '0') + ' '
		);
		bytesString = bytesString.substring(0, bytesString.length - 1);
		bytesString = Format.getLimitedString(bytesString, this.clmnsBytes - 2);
		let s = this.emphasizeAddrBytes(addrString + ' ' + bytesString) + '  <span id="' + id + '">' + this.emphasizeInstruction(text) + '</span>';
		if (comment)
			s += ' ' + this.emphasizeComment('; ' + comment);
		return s;

	}
	protected formatAddressPlusText2(addr64k: number, bytes: Uint8Array, text: string, comment?: string): string {
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


	/** Returns a radom colr as a string with some transparency.
	 * @returns E.g. "hsla(131, 0.75, 0.8, 0.5)"
	 */
	protected getRndColor() {
		//return 'red';
		return `hsla(${Math.floor(360 * Math.random())}, ${Math.floor(50 + 50 * Math.random())}%, ${Math.floor(50 + 50 * Math.random())}%, 0.5)`;
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


	/** ANCHOR Renders all given nodes to text.
	 * @param nodeSet The nodes to disassemble. The nodes will be sorted by start address.
	 * @param startNodes The start node labels are rendered in a different color.
	 * @returns The disassembly text.
	 */
	public renderNodes(nodeSet: Set<AsmNode>, startNodes: AsmNode[] = []): string {
		// Call super
		let rendered = '<pre>' + super.renderNodes(nodeSet, startNodes) + '</pre>';

		// Now add arrows
		rendered += `
			<script>
			`;

		// Sort the nodes	// TODO: Optimize, was done already by super.renderNodes()
		const nodes = Array.from(nodeSet); //.filter(node => (node.length > 0));	// Filter nodes in other banks
		nodes.sort((a, b) => a.start - b.start);

		// Colors for the arrows
		// const arrowColors = ['coral', 'yellow', 'white', 'red', 'green'];
		// const arrowColorLength = arrowColors.length;
		// let arrowColorIndex = 0;

		// Loop all nodes and branches
		for (const node of nodes) {
			// Check if node branches
			if (node.branchNodes.length > 1) {
				// Get node address as source
				let addr64k = node.start;
				const len = node.instructions.length - 1;
				for (let i = 0; i < len; i++)
					addr64k += node.instructions[i].length;
				const src = this.getHtmlId(addr64k, 'S');
				// Get target
				const tgtAddr64k = node.branchNodes[1].start;
				const tgt = this.getHtmlId(tgtAddr64k, 'S');

				// Add arrow
				let distance = Math.abs(addr64k - tgtAddr64k);
				//if (distance > 30)
				//	distance = 30;
				let gravity;
				let side;
				if (addr64k < tgtAddr64k) {
					// Forward
					gravity = 10 * Math.random() + 20 * distance;
					side ='right';
				}
				else {
					// Backward
					gravity = -10 * Math.random() - 3 * distance;
					side = 'left';
				}
				rendered += `
				new LeaderLine(
					document.getElementById('${src}'),
					document.getElementById('${tgt}'),
					{
						startSocket: '${side}',
						endSocket: '${side}',
						color: '${this.getRndColor()}',
						startSocketGravity: [${gravity}, 0],
						endSocketGravity: [${gravity}, 0]
					}
				);
				`;
			}

			// Check if node calls
			if (node.callee) {
				// Get node address as source
				let addr64k = node.start;
				const len = node.instructions.length - 1;
				for (let i = 0; i < len; i++)
					addr64k += node.instructions[i].length;
				const src = this.getHtmlId(addr64k, 'S');
				// Get target
				const tgtAddr64k = node.callee.start;
				const tgt = this.getHtmlId(tgtAddr64k, 'T');

				// Add arrow
				const gravity = 20 + 200*Math.random();
				rendered += `
				src = document.getElementById('${src}');
				gotoElement = document.createElement('span')
				gotoElement.innerHTML = "→";
				src.appendChild(gotoElement);
				gotoElement.addEventListener('click', function(event) {
					const src = document.getElementById('${src}');
					historyStackAdd(src);
					const tgt = document.getElementById('${tgt}');
					scrollTo(tgt);
				});

				new LeaderLine(
					LeaderLine.mouseHoverAnchor(src, {style: {backgroundColor: null}, hoverStyle: {backgroundColor: null}}),
					document.getElementById('${tgt}'),
					{
						path: 'grid',
						startSocket: 'right',
						endSocket: 'right',
						dash: true,
						color: '${this.getRndColor()}',
						startSocketGravity: [${gravity}, 0]
					}
				);
				`;
			}
		}
		rendered += `
   				//# sourceURL=Arrows.js
			</script>
		`;

		return rendered;
	}


	/** Additionally adds a back button.
	 * @param enableScaleSlider true to enable/false to disable the scale slider
	 * @param htmls The SVG/html code of all depths.
	 * @returns Html code with the added sliders. The depth slider is only added if htmls contains
	 * more than 1 items.
	 */
	protected addControls(htmls: string[], enableScaleSlider = true): string {
		// Add button
		let html = `
		<script>
			const historyStack = [];
			let historyStackIndex;

			function clearHistoryStack() {
				historyStack.length = 0;
				historyStackIndex = 0;
			}

			function scrollTo(tgt) {
				if(tgt) {
					tgt.scrollIntoView({
						behavior: "smooth",
						block: "start",
						inline: "nearest"
					});
				}
			}

			function backButtonPressed() {
				historyStackIndex--;
				const tgt = historyStack[historyStackIndex];
				scrollTo(tgt);
				// Possibly disable back button
				if(historyStackIndex == 0)
					document.getElementById("backButton").disabled = true;
				// Enable fwd button
				document.getElementById("fwdButton").disabled = false;
			}

			function fwdButtonPressed() {
				historyStackIndex++;
				const tgt = historyStack[historyStackIndex];
				scrollTo(tgt);
				// Enable back button
				document.getElementById("backButton").disabled = false;
				// Possibly disable fwd button
				if(historyStackIndex == historyStack.length-1)
					document.getElementById("fwdButton").disabled = true;
			}

			function historyStackAdd(tgt) {
				// Clear any possible additional stack items
				historyStack.length = historyStackIndex;
				// Add item
				historyStack.push(tgt);
				historyStackIndex++;
				// Enable back button
				document.getElementById("backButton").disabled = false;
				// Disable fwd button
				document.getElementById("fwdButton").disabled = true;
			}

			// Init
			clearHistoryStack();

			//# sourceURL=HistoryStack.js
		</script>

		<span style="position:fixed">
			<button id="backButton" onclick="backButtonPressed()"><</button>
			<button id="fwdButton" onclick="fwdButtonPressed()">></button>
		</span>
		<br>
		`;

		// Call super
		html += super.addControls(htmls, enableScaleSlider);

		return html;
	}
}
