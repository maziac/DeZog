import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {RenderText} from "./rendertext";



/** Class to render disassembly text.
 */
export class RenderHtml extends RenderText {

	// Used as prefix for all IDs of a certain depth.
	protected depth: number;

	// A map that stores the color used for arrows for each address.
	protected addressColor = new Map<number, string>();


	/** Returns the css for the html, define additional colors.
	 * @returns The html style.
	 */
	public getHtmlHeader(): string {
		// Create header
		let header = super.getHtmlHeader();
		header += `
	<style>
		* {
			font-family: var(--vscode-editor-font-family);
			font-weight: var(--vscode-editor-font-weight);
			font-size: var(--vscode-editor-font-size);
		}

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
	 * @param bytes The byte to add for the line. Can be empty.
	 * @param text A text to add. Usually the decoded instruction.
	 * @param comment An optional comment text.
	 * @returns A complete line, e.g. "<span id="L.c000">C000.B1 3E 05    LD A,5 ; Comment</span>"
	 */
	protected formatAddressPlusText(addr64k: number, bytes: Uint8Array, text: string, comment?: string): string {
		const id = this.getHtmlId(addr64k);	// Not every ID/label would be required. However, every line gets one. It's easier than to distinguish which line requires one.
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


	/** Returns the html ID of a html object, e.g. a <span>.
	 * @param addr64k The address of the label. Only labels have IDs.
	 * @return E.g. "D1_c0af" (i.e. includes also depth)
	 */
	protected getHtmlId(addr64k: number): string {
		return 'D' + this.depth + '_' + addr64k.toString(16);
	}


	/** Returns a random color as a string with some transparency.
	 * @param addr64k The source address for which the color should be created.
	 * Colors are random but each address will get the same color, to assure that
	 * all depths will have same colors at same addresses.
	 * @returns E.g. "hsla(131, 0.75, 0.8, 0.5)"
	 */
	protected getRndColor(addr64k: number) {
		let color = this.addressColor.get(addr64k);
		if (!color) {
			color = `hsla(${Math.floor(360 * Math.random())}, ${Math.floor(50 + 50 * Math.random())}%, ${Math.floor(50 + 50 * Math.random())}%, 0.5)`;
			this.addressColor.set(addr64k, color);
		}
		return color;
	}


	/** ANCHOR Renders the disassembly text for different depths.
	 * @param startNodes The nodes to disassemble.
	 * @param maxDepth All depths [0..maxDepth] are being rendered.
	 * @returns The html for display.
	 */

	public renderSync(startNodes: AsmNode[], maxDepth: number): string {
		// Prepare an array for each depth
		const htmls: string[] = [];

		// Loop all depths
		for (let depth = 0; depth <= maxDepth; depth++) {
			// Render and store
			const html = this.renderForDepth(startNodes, depth);
			htmls.push(html);
		}

		let html = this.addControls(htmls, false);
		html += `
			<script>
				// Fontsize
				const fontSizeString = window.getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-size');
				const fontSize = parseInt(fontSizeString);

				// Show the line with animation.
				function showLine(srcObj) {
					srcObj.line.position();
					srcObj.line.show('draw', {duration: 500, timing: 'ease-in'});
				}

				// Hide the line with animation.
				function hideLine(srcObj) {
					srcObj.line.hide('fade', {duration: 2000, timing: 'ease-out'});
				}

				// Is the first "mouseenter" handler.
				// Removes itself and install the "real" mouse click, enter and leave
				// event listeners to show/hide the arrow and to scroll
				// to the target.
				function firstMouseEnterHandler(event) {
					// Get object
					const srcObj = event.currentTarget;
					// Remove mouse event handler
					srcObj.removeEventListener('mouseenter', firstMouseEnterHandler);

					// Note: For global arrow the source can never be the same as the target because otherwise the arrow would be local.

					// Create line
					srcObj.line = new LeaderLine(srcObj, srcObj.lineTgtObj,
						{
							hide: true,
							path: 'grid',
							startSocket: 'right',
							endSocket: 'right',
							dash: true,
							color: srcObj.lineColor,
							startSocketGravity: [fontSize * srcObj.lineGravity, 0]
						}
					);

					// Show line
					showLine(srcObj);

					// Install real handlers
					srcObj.addEventListener('click', () => {
						historyStackAdd(srcObj);
						scrollTo(srcObj.lineTgtObj);
					});

					// Mouse enters the CALL object: show line
					srcObj.addEventListener('mouseenter', () => {
						// Show line
						showLine(srcObj);
					});

					// Mouse leaves the CALL object: hide line
					srcObj.addEventListener('mouseleave', () => {
						// Hide line
						hideLine(srcObj);
					});
				}


				// Creates "→" object inside the source object
				// and installs a first "mouseenter" handler.
				// This is intended to operate fast.
				// The more heavy other event handlers are installed later when the
				// first "mouseenter" handler is activated.
				// @param src E.g. 'S08fb'
				// @param tgt E.g. 'T80a2'
				// @param color E.g. 'hsla(131, 0.75, 0.8, 0.5)'
				// @param gravity E.g. 80
				function createGlobalBranchSource(src, tgt, color, gravity) {
					const tgtObj = document.getElementById(tgt);
					if(!tgtObj)
						return;	// No target object, e.g. other bank.
					const srcObj = document.getElementById(src).parentNode;
					gotoElement = document.createElement('span')
					gotoElement.innerHTML = "→";
					gotoElement.style.cursor = "pointer";
					srcObj.parentNode.insertBefore(gotoElement, srcObj.nextSibling);	// insertAfter
					// Append properties
					gotoElement.lineTgtObj = tgtObj;
					gotoElement.lineColor = color;
					gotoElement.lineGravity = gravity;
					// Install first "mouseenter" handler
					gotoElement.addEventListener('mouseenter', firstMouseEnterHandler);
				}

				// The map that holds all local arrows for all depths.
				const arrowsForDepth = new Map();
				// The map that holds all functions to initialize the arrow arrays for each depth.
				funcForDepth = new Map();

				// Enables or disables the lines for a certain depth.
				// If lines are created the first time they are created first.
				// @param depth Enable/disable for which depth. Starts at 0.
				// @param enable true/false. false to disable.
				function enableLocalArrows(depth, enable) {
					let arrows = arrowsForDepth.get(depth);
					if(!arrows) {	// Assumes that the first call is used to enable the lines.
						// Create new array
						arrows = [];
						arrowsForDepth.set(depth, arrows);
						// Create lines for the first time
						const func = funcForDepth.get(depth);
						func(arrows);
						return;
					}

					// Enable/disable
					if(enable) {
						for(const arrow of arrows) {
							arrow.position();
							arrow.show('none');
						}
					}
					else {
						for(const arrow of arrows)
							arrow.hide('none');
					}
				}


				// Create a local leader line.
				function createLocalLeaderLine(src, tgt, side, color, gravity) {
					const srcObj = document.getElementById(src);
					let tgtObj;
					let endSide
					// LeaderLine does not allow same source as target
					if(src == tgt) {
						// Create a new object just before the current one
						tgtObj = document.createElement('span');
						srcObj.parentNode.insertBefore(tgtObj, srcObj);
						gravity = -3;
						endSide = 'top';
					}
					else {
						endSide = side;
						tgtObj = document.getElementById(tgt);
					}
					const line = new LeaderLine(srcObj,	tgtObj,
						{
							startSocket: side,
							endSocket: endSide,
							color,
							startSocketGravity: [fontSize * gravity, 0],
							endSocketGravity: [fontSize * gravity, 0]
						}
					);
					return line;
				}


				// The currently displayed slider depth value
				let currentDepthValue=${maxDepth};

				// Function that will be called when the slider changes.
				function sliderDepthChanged(slideValue) {
					// Hide previous arrows
					enableLocalArrows(currentDepthValue, false);
					// Show current arrows
					enableLocalArrows(slideValue, true);
					// Use new value
					currentDepthValue = slideValue;
				}


				// Exchange function that is called by the slider with own function.
				const sliderObject = document.getElementById("slide");
				if(sliderObject) {
					sliderObject.addEventListener('input', () => {
						sliderDepthChanged(parseInt(sliderObject.value));
					});
				}


				// Show lines the first time when document is loaded
				window.addEventListener('load', () => {
					enableLocalArrows(${maxDepth}, true);
				});

   				//# sourceURL=renderhtmlInit.js
			</script>
			`;
		return html;
	}


	/** ANCHOR Renders for a particular depth.
	 * Just calls super, but stores depth before.
	 * @param startNodes The nodes to disassemble.
	 * @param depth The depth to render.
	 * @returns The disassembled text.
	 */
	public renderForDepth(startNodes: AsmNode[], depth: number): string {
		// Set depth as prefix for html id
		this.depth = depth;
		return super.renderForDepth(startNodes, depth);
	}


	/** ANCHOR Renders all given nodes to text.
	 * @param nodes An array with the sorted nodes (sorted by start address).
	 * @param startNodes The start node labels are rendered in a different color.
	 * @returns The disassembly text.
	 */
	public renderNodes(nodes: AsmNode[], startNodes: AsmNode[] = []): string {
		// Call super
		let rendered = '<pre>' + super.renderNodes(nodes, startNodes) + '</pre>';

		// Asymptotic function for gravity
		const asymptotic = (x) => x / (x + 20);

		// Loop all nodes and branches
		let localArrows = '';
		let callArrows = '';
		for (const node of nodes) {
			// Note: CALLs and branches are put together:
			// Everything that branches/calls outside the block will get an interactive
			// line that needs to be hovered before shown and can be clicked.
			// Everything in the block (i.e. local) will be shown directly.
			const allBranches = [...node.branchNodes];
			if (node.callee)
				allBranches.push(node.callee);

			// Check all branches
			const blockNode = this.disasm.getBlockNode(node.start);
			for (const branchNode of allBranches) {
				// Skip all branch nodes that are anyhow not seen
				if (!nodes.includes(branchNode))
					continue;

				// Check if local
				const isLocal = (blockNode == this.disasm.getBlockNode(branchNode.start));
				// Get start and end addresses
				const lastInstr = node.instructions.length - 1;	// Note: there must be at least one instruction otherwise there would be no branch.
				const nextAddr = node.start + node.length;
				const tgtAddr64k = branchNode.start;
				// Check if "natural" flow
				if (isLocal && nextAddr == tgtAddr64k)
					continue;
				const addr64k = nextAddr - node.instructions[lastInstr].length;
				const src = this.getHtmlId(addr64k);
				// Get target
				const tgt = this.getHtmlId(tgtAddr64k);
				const distance = Math.abs(addr64k - tgtAddr64k);

				// Check if same block
				if (isLocal) {
					// Same block (local):

					// Add arrow
					let gravity;	// gravity is multiplied by fontSize (e.g. 14)
					let side;
					if (addr64k < tgtAddr64k) {
						// Forward
						gravity = 200 / 14 * asymptotic(3 * distance);
						side = 'right';
					}
					else {
						// Backward
						gravity = - 60 / 14 * asymptotic(distance);
						side = 'left';
					}
					const color = this.getRndColor(addr64k);
					localArrows += `
						arrows.push(createLocalLeaderLine('${src}', '${tgt}', '${side}', '${color}', '${gravity}'));
						`;
				}
				else {
					// CALL or JP to non-local address:
					// Add arrow
					//const gravity = 1.5 + 15 * Math.random();
					const gravity = 1.5 + 200 / 14 * asymptotic(2 * distance);
					const color = this.getRndColor(addr64k);
					callArrows += `
					createGlobalBranchSource('${src}','${tgt}', '${color}', ${gravity});
`;
				}
			}
		}

		// Combine
		rendered += `
			<script>
				// Wait for HTML document to get ready
				window.addEventListener('load', () => {
					funcForDepth.set(${this.depth}, (arrows) => {
							${localArrows}
						}
					);

					${callArrows}
				});

   				//# sourceURL=Arrows${this.depth}.js
			</script>
		`;
	//	console.log(rendered);

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
				// Disable both buttons
				document.getElementById("backButton").disabled = true;
				document.getElementById("fwdButton").disabled = true;
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
				if(historyStackIndex < historyStack.length-1)
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

			// Wait for HTML document to get ready
			window.addEventListener('load', () => {
				// Init
				clearHistoryStack();
			});

			//# sourceURL=HistoryStack.js
		</script>

		<span style="position:fixed;right:20px">
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
