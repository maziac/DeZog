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
		const emphasizeColor = '#FEFE02';
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

			// Print all nodes belonging to the subroutine
			let endUsed = false;
			let end;
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
				if (node == startNode || node.callers.length > 0) {
					let shape = 'box';
					let href = '';
					const nodeAddr = node.start;
					if (node == startNode) {
						// Shape start node differently
						shape = 'tab';
						// Add href to start
						href = 'href="#' + this.funcFormatLongAddress(nodeAddr) + '"';
						// Define end
						end = 'end' + dotId;
					}
					const nodeLabelName = this.funcGetLabel(nodeAddr) || node.label || Format.getHexFormattedString(nodeAddr);
					const callerDotId = 'caller' + dotId;
					lines.push(callerDotId + ' [label="' + nodeLabelName + '", fillcolor="' + emphasizeColor + '", style=filled, shape="' + shape + '", ' + href + '];');
					lines.push(callerDotId + ' -> ' + dotId + ' [headport="n", tailport="s"];');
				}

				// Print connection to branches
				let i = 0;
				for (const branch of node.branchNodes) {
					const branchDotId = this.getDotId(branch);
					// Color 2nd branch differently
					let dotBranchLabel = '';
					if (i > 0) {
						// TODO: Test if labelling arrows is senseful or overloaded
						const branchLabel = this.funcGetLabel(branch.start) || branch.label || Format.getHexFormattedString(branch.start);
						if (branchLabel)
							dotBranchLabel = 'label="' + branchLabel + '", fontcolor="' + mainColor + '" ';
					}
					// Override if pointing to itself, e.g. JR $, or looping, and not poitint to itself
					let tailport = 's';
					if (branch != node && (i > 0 || node.start >= branch.start))
						tailport = '_'; // east or west (or center)
					lines.push(dotId + ' -> ' + branchDotId + ' [' + dotBranchLabel + 'headport="n", tailport="' + tailport + '"];');
					// Next
					i++;
				}
				// Check for RET
				if (node.isRET() && (end != undefined)) {
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
