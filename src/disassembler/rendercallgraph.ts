import {Utility} from "../misc/utility";
import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {RenderBase} from "./renderbase";
import {Subroutine} from "./subroutine";



/** Class to render a call graph.
 */
export class RenderCallGraph extends RenderBase {

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
			const formatDirection = (called == node) ? ' [headport="n", tailport="s"]' : '';	// For self recursion
			lines.push('"' + dotId + '" -> "' + calledDotId + '"' + formatDirection + ';');
			// Dig deeper
			this.getCallGraphRecursively(called, allSubs, depth, lines, allUsedNodes);
		}
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
		if (size != undefined) {
			if (size == 1)
				result += "1 byte\\n";
			else
				result += size + " bytes\\n";
		}
		return result;
	}


	/** ANCHOR Renders all call graph depths.
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


	/** ANCHOR Renders one depth of the call graph.
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
			const labelName = this.funcGetLabel(address) || node.label || '';

			// Output
			const dotId = this.getDotId(node);
			const nodeName = this.nodeFormat(labelName, address, countBytes);
			const hrefAddresses = this.getAllRefAddressesFor(sub);
			lines.push('"' + dotId + '" [fontsize="' + Math.round(fontSize) + '", label="' + nodeName + '", href="#' + hrefAddresses + '"];');

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

		// Return
		return this.renderLines(lines);
	}
}
