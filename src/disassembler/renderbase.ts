import {AsmNode} from "./asmnode";
import {DisassemblerNextGen} from "./disasmnextgen";
import {Subroutine} from "./subroutine";

// From: https://github.com/aduh95/viz.js
//const renderGraphviz = require('@aduh95/viz.js/sync');	// I couldn't transfer this into an "import" statement
const dot2svg = require("@aduh95/viz.js/async");


/** Base class with common functions for RenderFlowChart and RenderCallGraph.
 */
export class RenderBase {
	// The used disassembler. Is passed with the constructor.
	protected disasm: DisassemblerNextGen;


	/** Constructor.
	 */
	constructor(disasm: DisassemblerNextGen) {
		this.disasm = disasm;
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


	/** Returns all addresses for a sub as string.
	 * And concatenated with a ';'
	 * @param subOrNode The subroutine or a node.
	 * @returns E.g.  "#800A.4" or "8010.4;8012.4;8013.4;"
	 */
	protected getAllRefAddressesFor(subOrNode: AsmNode | Subroutine): string {
		let s = '';
		// Get addresses
		const allAddresses = subOrNode.getAllAddresses();
		// Convert addresses to string
		for (const addr of allAddresses) {
			const hrefAddress = this.disasm.funcFormatLongAddress(addr);
			s += hrefAddress + ';';
		}
		// Return
		return s;
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
		svg = svg.replace(/xlink:title="[^"]*"/g, 'xlink:title=""'); // E.g. remove 'xlink:title="main"'
		svg = svg.replace(/<title>[^<]*<\/title>/g, ''); 	// E.g. "<title>b8035</title>"
		return svg;
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
			min="5" max="500"
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


	/** Renders the givens lines with graphviz.
	 * Renders synchronously.
	 * @param lines The string array to render.
	 * @return The adjusted SVG text.
	 */
	/*
	protected renderLinesSync(lines: string[]): string {
		const text = lines.join('\n');

		// Render
		let rendered = renderGraphviz(text);
		// Adjust
		rendered = this.adjustSvg(rendered);

		// return
		return rendered;
	}
	*/


	/** Renders the givens lines with graphviz.
	 * Renders asynchronously.
	 * This is faster: about 70% of the synchronous version.
	 * For both, asynchronous and synchronous, the first rendertakes longer.
	 * @param lines The string array to render.
	 * @return The adjusted SVG text.
	 */
	protected async renderLines(lines: string[]): Promise<string> {
		const text = lines.join('\n');

		// Render
		let rendered = await dot2svg(text);
		// Adjust
		rendered = this.adjustSvg(rendered);

		// return
		return rendered;
	}
}
