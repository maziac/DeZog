import {Utility} from "../misc/utility";
import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {Subroutine} from "./subroutine";

// From: https://github.com/aduh95/viz.js
const renderGraphviz = require('@aduh95/viz.js/sync');	// I couldn't transfer this into an "import" statement



export class RenderCallGraph {

	/// A function to assign other than the standard
	/// label names.
	protected funcGetLabel: (addr64k: number) => string | undefined;

	/// A function that formats the long address printed at first in the disassembly.
	/// Used to add bank information after the address. Using the current slot.
	protected funcFormatLongAddress: (addr64k: number) => string;


	/** Constructor.
	 */
	constructor(funcGetLabel: (addr64k: number) => string | undefined, funcFormatLongAddress: (addr64k: number) => string) {
		this.funcGetLabel = funcGetLabel;
		this.funcFormatLongAddress = funcFormatLongAddress;
	}


	/**
	 * Renders the call graph.
	 * Every main label represents a bubble.
	 * Arrows from one bubble to the other represents
	 * calling the function.
	 * @param startNodes The nodes to print call graphs for.
	 * @param nodeSubs A map with all potentially used node/subroutine associations.
	 * @param depth The depth of the call graph. 1 = just the start address.
	 * @returns The dot graphic as text.
	 */
	public renderForDepth(startNodes: AsmNode[], nodeSubs: Map<AsmNode, Subroutine>, depth: number): string {
		// Color codes (not real colors) used to exchange the colors at the end.
		const mainColor = '#FEFE01';
		const fillColor = '#FEFE02';
		const otherBankColor = '#FEFE03';
		// Graph direction
		const callGraphFormatString = "rankdir=TB;";

		// Header
		const lines: string[] = [];
		lines.push('digraph Callgraph {');
		lines.push('bgcolor="transparent"');
		lines.push(`node [color="${mainColor}", fontcolor="${mainColor}"];`);
		lines.push(`edge [color="${mainColor}"];`);
		lines.push(callGraphFormatString);

		// Create text recursively until depth is reached
		const allUsedNodes: AsmNode[] = [];
		for (const node of startNodes) {
			this.getCallGraphRecursively(node, nodeSubs, depth, lines, allUsedNodes);
		}

		// Now calculate statistics (for the bubble sizes mainly)
		const stats = {
			maxSizeInBytes: 0,
			minSizeInBytes: Number.MAX_SAFE_INTEGER
		};
		for (const node of allUsedNodes) {
			const sub = nodeSubs.get(node)!;
			Utility.assert(sub);
			// Count max/min
			const sizeInBytes = sub.sizeInBytes;
			if (sizeInBytes > stats.maxSizeInBytes)
				stats.maxSizeInBytes = sizeInBytes;
			if (sizeInBytes < stats.minSizeInBytes)
				stats.minSizeInBytes = sizeInBytes;
		}

		// Calculate size (font size) max and min
		const fontSizeMin = 13;
		const fontSizeMax = 40;
		let min = stats.minSizeInBytes;
		const diff = stats.maxSizeInBytes - min;
		const fontSizeFactor = (diff > 0) ? (fontSizeMax - fontSizeMin) / diff : 0;


		// Now create all the bubble definitions
		for (const node of allUsedNodes) {
			const sub = nodeSubs.get(node)!;
			// Calculate font size dependent on count of bytes
			let fontSize;
			let color;
			let countBytes;
			if (node.bankBorder) {
				// A bank border address
				fontSize = fontSizeMin;
				color = otherBankColor;
			}
			else {
				// Normal case
				countBytes = sub.sizeInBytes;
				fontSize = fontSizeMin + fontSizeFactor * (countBytes - min);
			}

			// Find label
			const address = node.start;
			let labelName = this.funcGetLabel(address) || node.label || '';

			// Output
			const dotId = this.getDotId(node);
			const nodeName = this.nodeFormat(labelName, address, countBytes);
			const hrefAddress = this.funcFormatLongAddress ? this.funcFormatLongAddress(address) : Format.getHexString(address, 4);
			lines.push('"' + dotId + '" [fontsize="' + Math.round(fontSize) + '", label="' + nodeName + '", href="#' + hrefAddress + '"];');

			// Output all main labels in different color
			if (startNodes.indexOf(node) >= 0) {
				color = fillColor;
			}
			if (color) {
				lines.push('"' + dotId + '" [fillcolor="' + color + '", style=filled];');
			}
		}

		// Ending
		lines.push('}');
		const text = lines.join('\n');

		// Render
		let rendered = renderGraphviz(text);
		// Adjust
		rendered = this.adjustSvg(rendered);

		// return
		return rendered;
	}


	/** Dives into each node's callees recursively.
	 * It pushes text to 'lines' for each call.
	 * @param node The node to get the call graph for.
	 * @param allSubs A map containing the node -> subroutine relationships.
	 * @param depth The calling depth to check. 1 = just node, 2 = node + node callees, etc.
	 * @param lines A passed array where lines are added to. I.e. the output for the dot graphics.
	 * @param allUsedNodes All used nodes are added here. This can be used afterwards to
	 * print node information.
	 */
	protected getCallGraphRecursively(node: AsmNode, allSubs: Map<AsmNode, Subroutine>, depth: number, lines: string[], allUsedNodes: AsmNode[]) {
		// Check if this need to be processed
		if (allUsedNodes.includes(node))
			return;
		allUsedNodes.push(node);

		// Check depth
		if (depth <= 0)
			return;
		depth--;

		// Get subroutine
		const sub = allSubs.get(node)!;
		Utility.assert(sub);

		// Get all callees for current node/subroutine
		const calledNodes = sub.callees;
		// Get id for dot graphics
		const dotId = this.getDotId(node);
		// Loop over all callees
		for (const called of calledNodes) {
			const calledDotId = this.getDotId(called);
			lines.push('"' + dotId + '" -> "' + calledDotId + '";');
			// Dig deeper
			this.getCallGraphRecursively(called, allSubs, depth, lines, allUsedNodes);
		}
	}


	/** Returns an ID for the node that can be used inside the dot graphics.
	 * The dot ID is just made of the node's address.
	 * Note: Bank border passed nodes may return the same id/address.
	 * @param node The node.
	 * @returns E.g. "dot8ABF"
	 */
	protected getDotId(node: AsmNode): string {
		const dotId = 'dot' + node.start.toString(16);
		return dotId;
	}


	/**
	 * Does the formatting for the node in the dot file.
	 * @param labelName E.g. "SUB_F7A9"
	 * @param address E.g. 0xF7A9
	 * @param size Size in bytes.
	 * @returns E.g. "SUB_F7A9\n0xF7A9\nSize=34"
	 */
	protected nodeFormat(labelName: string, address: number, size: number): string {
		//const nodeFormatString = "${label}\\n0x${address}\\nSize=${size}\\n";
		let result = '';
		if (labelName)
			result += labelName + "\\n";
		result += Format.getHexFormattedString(address) + "\\n";
		if (size != undefined)
			result += "Size=" + size + "\\n";
		return result;
	}


	/**
	 * Adjusts the SVG to vscode color vars and removes the titles to remove
	 * the tooltips/hovering.
	 * @param svg The rendered SVG.
	 * @return The changed/stripped SVG.
	 */
	protected adjustSvg(svg: string): string {
		svg = svg.replace(/#FEFE01/gi, 'var(--vscode-editor-foreground)');
		svg = svg.replace(/#FEFE02/gi, 'var(--vscode-editor-selectionBackground)');
		svg = svg.replace(/#FEFE03/gi, 'var(--vscode-editor-inactiveSelectionBackground)');
		// Strip tooltip (title)
		svg = svg.replace(/xlink:title=".*"/g, 'xlink:title=""'); // E.g. remove 'xlink:title="main"'
		svg = svg.replace(/<title>.*<\/title>/g, ''); 	// E.g. "<title>b8035</title>"
		return svg;
	}


	/**
	 * Renders the call graph.
	 * Every main label represents a bubble.
	 * Arrows from one bubble to the other represents
	 * calling the function.
	 * @param startNodes The nodes to print call graphs for.
	 * @param nodeSubs A map with all potentially used node/subroutine associations.
	 * @returns The dot graphic for all depths as text. Together with the slider to switch depths.
	 */
	public render(startNodes: AsmNode[], nodeSubs: Map<AsmNode, Subroutine>, maxDepth: number): string {
		// Prepare an array for each depth
		const svgs: string[] = [];

		// Loop all depths
		for (let depth = 1; depth <= maxDepth; depth++) {
			// Render one call graph (for one deptH)
			const rendered = this.renderForDepth(startNodes, nodeSubs, depth);
			// Store
			svgs.push(rendered);
		}

		return this.addControls(svgs);
	}


	/**
	 * Adds a slider to scale the SVG and a slider to control the call depth.
	 * @param enableScaleSlider true to enable/false to disable the scale slider
	 * @param htmls The SVG/html code of all depths.
	 * @returns Html code with the added sliders. The depth slider is only added if htmls contains
	 * more than 1 items.
	 */
	protected addControls(htmls: string[], enableScaleSlider = true): string {
		const len = htmls.length;
		// Add slider for scaling and slider for depth
		let html = '';
		if (enableScaleSlider) {
			html += `
		<script>
			function updateSliderScale(slideValue) {
				const sliderValue = document.getElementById("sliderScaleValue");
				sliderValue.value = slideValue + " %";
				for (let i = 1; i <= ${len}; i++) {
					const svg = document.getElementById("svg"+i);
					svg.style.width = slideValue + "%";
					svg.style.height = slideValue + "%";
				}
			}
		</script>
		<div id="sliderScale">
			Scale:
			<input id="slide" type="range"
			min="5" max="200"
			step="5" value="100"
			oninput="updateSliderScale(this.value)"
			/>
			<output id="sliderScaleValue">
				100%
			</output>
		</div>
		<br>
		`;
		}

		// Add depth slider only if there is a choice
		if (len > 1) {
			html += `
		<script>
			function updateSliderDepth(slideValue) {
				const sliderValue = document.getElementById("sliderDepthValue");
				sliderValue.value = slideValue;
				for (let i = 1; i <= ${len}; i++) {
					const svg = document.getElementById("svg"+i);
					svg.hidden = (i != slideValue);
				}
			}
		</script>
		<div id="sliderDepth">
			Depth:
			<input id="slide" type="range"
			min="1" max="${len}"
			step="1" value="${len}"
			oninput="updateSliderDepth(this.value)"
			/>
			<output id="sliderDepthValue">
				${len}
			</output>
		</div>
		<br>
		`;
		}

		// Add a div for each svg
		for (let i = 0; i < len; i++) {
			// To scale remove height and width
			let item = htmls[i];
			if (enableScaleSlider)
				item = item.replace(/width=.+height=\S+/, '');
			// Add div: id = svg1/svg2/...svgN
			const depth = i + 1;
			const hidden = (depth == len) ? '' : 'hidden';
			html += `
		<div id="svg${depth}" ${hidden}>
		${item}
		</div>
		`;
		}

		return html;
	}
}
