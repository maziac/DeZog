import {AsmNode} from "./core/asmnode";
import {SmartDisassembler} from "./smartdisassembler";
import {Subroutine} from "./core/subroutine";

// From: https://github.com/aduh95/viz.js
//const dot2svg = require("@aduh95/viz.js/async");
const dot2svg = require("@aduh95/viz.js/sync");


/** Base class with common functions for RenderFlowChart, RenderCallGraph and RenderText (RenderHtml)
 */
export class RenderBase {
	// The used disassembler. Is passed with the constructor.
	protected disasm: SmartDisassembler;


	/** Constructor.
	 */
	constructor(disasm: SmartDisassembler) {
		this.disasm = disasm;
	}


	/** Returns the css for the html, i.e. the custom colors
	 * dependent on theme.
	 * @returns The html style.
	 */
	public getHtmlHeader(): string {
		return `
    <style>
		body.vscode-light {
			--dezog-fg-color: var(--vscode-editor-foreground);
			--dezog-emphasize-color1: var(--vscode-editor-selectionBackground);
			--dezog-emphasize-color2: var(--vscode-editor-inactiveSelectionBackground);
			--dezog-emphasize-color3: #0000FF;
			--dezog-emphasize-color4: #001080;
		}

		body.vscode-dark {
			--dezog-fg-color: var(--vscode-editor-foreground);
			--dezog-emphasize-color1: var(--vscode-editor-selectionBackground);
			--dezog-emphasize-color2: var(--vscode-editor-inactiveSelectionBackground);
			--dezog-emphasize-color3: #569CD6;
			--dezog-emphasize-color4: #9CDCFE;
		}

		body.vscode-high-contrast {	/* Same as vscode-light */
			--dezog-fg-color: var(--vscode-editor-foreground);
			--dezog-emphasize-color1: var(--vscode-editor-selectionBackground);
			--dezog-emphasize-color2: var(--vscode-editor-inactiveSelectionBackground);
			--dezog-emphasize-color3: #0000FF;
			--dezog-emphasize-color4: #001080;
		}
    </style>

	`;
	}
	/*
	Note: Setting
		* {
			font-family: var(--vscode-editor-font-family);
			font-weight: var(--vscode-editor-font-weight);
			font-size: var(--vscode-editor-font-size);
		}
	for some reason overrides the SVG text settings. In that case
	the layout might screw up.
	Therefore it is not set.
	*/


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
		svg = svg.replace(/#00FEFE/gi, 'var(--dezog-fg-color)');
		svg = svg.replace(/#01FEFE/gi, 'var(--dezog-emphasize-color1)');
		svg = svg.replace(/#02FEFE/gi, 'var(--dezog-emphasize-color2)');
		svg = svg.replace(/#03FEFE/gi, 'var(--dezog-emphasize-color3)');
		svg = svg.replace(/#04FEFE/gi, 'var(--dezog-emphasize-color4)');
		// Strip tooltip (title)
		svg = svg.replace(/xlink:title="[^"]*"/g, 'xlink:title=""'); // E.g. remove 'xlink:title="main"'
		svg = svg.replace(/<title>[^<]*<\/title>/g, ''); 	// E.g. "<title>b8035</title>"
		return svg;
	}


	/** Adds a slider to scale the SVG and a slider to control the call depth.
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
				for (let i = 0; i < ${len}; i++) {
					const svg = document.getElementById("svg"+i);
					svg.style.width = slideValue + "%";
					svg.style.height = slideValue + "%";
				}
			}
			//# sourceURL=updateSliderScale.js
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
			const maxDepth = len - 1;
			html += `
		<script>
			// Called when the slider changes.
			// @param slideValue A string with the value.
			function updateSliderDepth(slideValue) {
				const sliderValue = document.getElementById("sliderDepthValue");
				sliderValue.value = slideValue;
				for (let i = 0; i <= ${maxDepth}; i++) {
					const svg = document.getElementById("svg"+i);
					svg.hidden = (i != slideValue);
				}
			}
			//# sourceURL=updateSliderDepth.js
		</script>
		<div id="sliderDepth">
			Depth:
			<input id="slide" type="range"
			min="0" max="${maxDepth}"
			step="1" value="${maxDepth}"
			oninput="updateSliderDepth(this.value)"
			/>
			<output id="sliderDepthValue">
				${maxDepth}
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
			const depth = i;
			const hidden = (depth == len - 1) ? '' : 'hidden';
			html += `
		<div id="svg${depth}" ${hidden}>
		${item}
		</div>
		`;
		}

		return html;
	}


	/** Renders the givens lines with graphviz.
	 * Renders synchronously because the worker thread in the vsix does not work, most probably because of esbuild.
	 * The sync api is about 30% slower than the asynchronous one.
	 * For both, asynchronous and synchronous, the first render takes longer.
	 * Please note that for pathological cases (e.g. all RST 10h in all memory
	 * the graph would become too large and duh95/viz.js generates an
	 * error because the callstack is used up.
	 * @param lines The string array to render.
	 * @return The adjusted SVG text.
	 */
	protected async renderLines(lines: string[]): Promise<string> {
		const text = lines.join('\n');

		// Render (the async api has a problem when using in a vsix, probably because of esbuild)
		//let rendered = await dot2svg(text);
		let rendered = dot2svg(text);

		// Adjust
		rendered = this.adjustSvg(rendered);

		// return
		return rendered;
	}
}
