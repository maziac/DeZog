import {unchangedTextChangeRange} from "typescript";
import {AsmNode} from "./asmnode";
import {Format} from "./format";
import {RenderBase} from "./renderbase";
import {Subroutine} from "./subroutine";



/** Class to render a flow chart.
 */
export class RenderFlowChart extends RenderBase {

	/** ANCHOR Renders all flow charts.
	 * @param startNodes The nodes to print flow charts for.
	 * @returns The dot graphic for all flow charts as text. Together with a slider for scaling.
	 */
	public render(startNodes: AsmNode[]): string {
		// Color codes (not real colors) used to exchange the colors at the end.
		const mainColor = '#FEFE01';
		const fillColor = '#FEFE02';
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

			// Find label
			const address = startNode.start;
			const labelName = this.funcGetLabel(address) || startNode.label || Format.getHexFormattedString(address);

			// Start
			const startDotId = this.getDotId(startNode);
			const startHrefAddresses = this.getAllRefAddressesFor(startNode);	// TODO: just use start address
			const start = startDotId + 'start';

			lines.push(start + ' [label="' + labelName + '", fillcolor="' + fillColor + '", style=filled, shape=tab, href="#' + startHrefAddresses + '"];');
			lines.push(start + ' -> ' + startDotId + ';');
			const end = startDotId + 'end';
			let endUsed = false;

			// Print all nodes belonging to the subroutine
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
				if (node != startNode && node.callers.length > 0) {
					//TODO: verbinden mit obiger start dot Ausgabe. Ich bracuh nur die heir unten
					const nodeAddr = node.start;
					const nodeLabelName = this.funcGetLabel(nodeAddr) || node.label || Format.getHexFormattedString(nodeAddr);
					const callerDotId = 'caller' + dotId;
					lines.push(callerDotId + ' [label="' + nodeLabelName + '", fillcolor="' + fillColor + '", style=filled, shape=box];');
					lines.push(callerDotId + ' -> ' + dotId + ' [headport="n", tailport="s"];');
				}

				// Print connection to branches
				let i = 0;
				for (const branch of node.branchNodes) {
					const branchDotId = this.getDotId(branch);
					//const tailport = (i == 0) ? 's' : 'e';
					let tailport = 's';
					// Override if pointing to itself, e.g. JR $, or looping, and not poitint to itself
					if (branch != node && (i > 0 || node.start >= branch.start))
						tailport = '_'; // east or west (or center)
					lines.push(dotId + ' -> ' + branchDotId + ' [headport="n", tailport="' + tailport + '"];');
					// Next
					i++;
				}
				// Check for RET
				if (node.isRET()) {
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
		return this.renderLines(lines);
	}
}
