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
			const startHrefAddresses = this.getAllRefAddressesFor(startNode);
			const start = startDotId + 'start';

			lines.push(start + ' [label="' + labelName + '", fillcolor="' + fillColor + '", style=filled, shape=tab, href="#' + startHrefAddresses + '"];');
			lines.push(start + ' -> ' + startDotId + ';');
			const end = startDotId + 'end';
			let endUsed = false;

			// Print all nodes belonging to the subroutine
			for (const node of sub.nodes) {
				// Get disassembly text of node.
				const instrTexts = node.getAllDisassemblyLines().join('\\l') + '\\l';
				// Print disassembly
				const dotId = this.getDotId(node);
				const hrefAddresses = this.getAllRefAddressesFor(node);
				lines.push(dotId + ' [label="' + instrTexts + '", href="#' + hrefAddresses + '"];');
				// Print connection to branches
				let i = 0;
				for (const branch of node.branchNodes) {
					const branchDotId = this.getDotId(branch);
					const tailport = (i == 0) ? 's' : 'e';
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

			// Check if end symbol i required
			if(endUsed)
				lines.push(end + ' [label="end", shape=doublecircle];');
		}

		// Ending
		lines.push('}');

		// Return
		return this.renderLines(lines);
	}
}
