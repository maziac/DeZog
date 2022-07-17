import {Disassembler} from "../disassembler/disasm";
import {NumberType} from '../disassembler/numbertype';
import {Opcode, Opcodes} from "../disassembler/opcode";
import {Labels} from "../labels/labels";
import {ReverseEngineeringLabelParser} from "../labels/reverseengineeringlabelparser";
import {Utility} from '../misc/utility';
import {Remote} from "../remotes/remotebase";
import {Z80Registers} from "../remotes/z80registers";
import {Settings} from '../settings/settings';
import {DisLabel} from './../disassembler/dislabel';
import {BankType, MemoryModel} from './../remotes/MemoryModel/memorymodel';

const renderGraphviz = require('@aduh95/viz.js/sync');	// I couldn't transfer this into an "import" statement


/**
 * This class is especially used to create call graphs and flow charts.
 */
export class AnalyzeDisassembler extends Disassembler {
	// Map with the long address to line number relationship and vice versa.
	protected addrLineMap = new Map<number, number>();
	protected lineAddrArray = new Array<number | undefined>();


	/**
	 * Constructor.
	 */
	constructor() {
		super();

		// Initialize for DeZog
		this.automaticAddresses = false;
		this.specialLabels = false;
		this.commentsInDisassembly = false;
		this.enableStatistics = false;
		this.equsInDisassembly = false;
		this.orgInDisassembly = false;
		this.numberOfLinesBetweenBlocks = 2;
		this.numberOfDefbBytes = 4;
		this.addDefbComments = true;
		this.ignoreIncompleteOpcodes = true;
		this.opcodesLowerCase = false;

		// Use internal labels.
		this.funcAssignLabels = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Check if label already known
			const labels = Labels.getLabelsForLongAddress(longAddr);
			if (labels && labels.length > 0) {
				return labels.join(' or ');
			}
			// Otherwise simple hex string, e.g. "C000"
			//return 'L' + Utility.getHexString(addr64k, 4);
			return undefined;
		};

		// No filtering for now.
		this.funcFilterAddresses = undefined as any;

		// Add bank info to the address.
		this.funcFormatAddress = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Formatting
			let addrString = Utility.getHexString(addr64k, 4);
			const shortName = Remote.memoryModel.getBankShortNameForAddress(longAddr);
			if (shortName)
				addrString += ReverseEngineeringLabelParser.bankSeparator + shortName;
			//addrString += '[' + shortName + ']';
			return addrString;
		};

		// Characters reserved for the address field
		this.clmnsAddress = 8;	// E.g. 0000.5

		// Do not find interrupt labels
		this.findInterrupts = false;

		// Restore 'rst 8' opcode
		Opcodes[0xCF] = new Opcode(0xCF, "RST %s");

		// Setup configuration.
		if (Settings.launch.disassemblerArgs.esxdosRst) {
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
		}
	}


	/**
	 * Sets the memory model.
	 * Used to check if certain eexecution flows should be followed or not.
	 * @param memModel The memory model obtained from the settings through the Remote.
	 */
	public setMemoryModel(memModel: MemoryModel) {
		const slotLen = memModel.slotRanges.length;
		for (let slot = 0; slot < slotLen; slot++) {
			const range = memModel.slotRanges[slot];
			// Now check if maybe unused
			const [bankNr] = range.banks;
			const bank = memModel.banks[bankNr];
			const singleBank = (bank.bankType != BankType.UNUSED) && (range.banks.size == 1);
			this.setSlotBankInfo(range.start, range.end, slot, singleBank);
		}
	}


	/**
	 * Initializes the memory with the data at the given addresses.
	 * Additionally puts the addresses in the address queue.
	 * All long addresses. Are converted to 64k.
	 */
	public initWithCodeAddresses(addresses: number[], mem: Array<{address: number, data: Uint8Array}>) {
		// Init
		this.initLabels();
		this.addrLineMap = new Map<number, number>();
		this.lineAddrArray = new Array<number | undefined>();
		// Write new memory
		this.memory.clearAttributes();	// Clear all memory
		for (const block of mem)
			this.setMemory(block.address & 0xFFFF, block.data);
		const addrs = addresses.map(addr => addr & 0xFFFF);
		this.setAddressQueue(addrs);
		this.setStartAddressesWithoutLabel(addrs);
	}


	/**
	 * Disassembles the memory.
	 * Additionally keeps the address/line locations.
	 * @param maxDepth The call stack size to disassemble. 1=don't dive into calls/jp. 2=dive one level deep. 3=etc.
	 * @returns The really used depth. To determine the used depth simply pass the max. 655356 as maxDepth.
	 * The return value is the real required depth.
	 */
	public disassemble(maxDepth: number): number {
		// Disassemble
		const depth = super.disassemble(maxDepth);
		// Get address/line relationship.
		let lineNr = 0;
		this.addrLineMap.clear();
		this.lineAddrArray.length = 0;
		const slots = Z80Registers.getSlots();
		for (const line of this.disassembledLines) {
			let address = parseInt(line, 16);
			if (!isNaN(address)) {
				// Convert to long address
				address = Z80Registers.createLongAddress(address, slots);
				// Add to arrays;
				while (this.lineAddrArray.length <= lineNr)
					this.lineAddrArray.push(address);
				// Add all bytes
				this.addrLineMap.set(address, lineNr);
				const match = /\S+\s*(( [a-f\d][a-f\d])+)/i.exec(line);
				if (match) {
					const bytesCount = match[1].length / 3;
					const addr = address & 0xFFFF;
					const upperAddr = address & (~0xFFFF);
					for (let i = 1; i < bytesCount; i++) {
						const longAddr = upperAddr | ((addr + i) & 0xFFFF);
						this.addrLineMap.set(longAddr, lineNr);
					}
				}
			}
			lineNr++;
		}
		return depth;
	}


	/**
	 * Returns the line number for a given address.
	 * @param longAddress The long address.
	 * @returns The corresponding line number (beginning at 0) or undefined if no such line exists.
	 */
	public getLineForAddress(longAddress: number): number | undefined {
		return this.addrLineMap.get(longAddress);
	}


	/**
	 * Returns the line number for a given address.
	 * @param addresses An array with addresses.
	 * @returns An array with corresponding lines.
	 */
	public getLinesForAddresses(addresses: Set<number>): number[] {
		const lines = new Array<number>();
		const map = this.addrLineMap;
		// Check whichever has lower number of elements
		if (addresses.size > map.size) {
			// Loop over map
			map.forEach((value, key) => {
				if (addresses.has(key))
					lines.push(value);
			});
		}
		else {
			// Loop over addresses
			for (const address of addresses) {
				const line = map.get(address);
				if (line)
					lines.push(line);
			}
		}
		return lines;
	}


	/**
	 * Returns the address for a given line number.
	 * @param lineNr The line number starting at 0.
	 * @returns The  long address or -1 if none exists for the line.
	 */
	public getAddressForLine(lineNr: number): number {
		if (lineNr >= this.lineAddrArray.length)
			return -1;
		const line = this.lineAddrArray[lineNr];
		if (line == undefined)
			return -1;
		return line;
	}


	/**
	 * Renders the flowchart to html/svg.
	 * @param startLongAddrs The start address (or many). Is a long address.
	 * @returns A string with the rendered flow chart. Can be used in a webview.
	 */
	public renderFlowChart(startLongAddrs: number[]): string {
		// A note on coloring:
		// For dark/light mode we need to use e.g. "var(--vscode-editor-foreground)" in the html/svg.
		// If this is passed to graphviz as a color it does not survive the processing.
		// Therefore a different approach is used:
		// Certain colors are used as magic numbers, passed to graphviz, are rendered hardcoded into the svg.
		// Then at the end these numbers are converted into vars like "var(--vscode-editor-foreground)".

		// Disassemble
		this.disassemble(1);

		// Get dot text output.
		const startAddrs64k = startLongAddrs.map(addr => addr & 0xFFFF);
		const dot = this.getFlowChart(startAddrs64k, '#FEFE01', '#FEFE02');
		// Render
		let rendered = renderGraphviz(dot);
		rendered = rendered.replace(/#FEFE01/gi, 'var(--vscode-editor-foreground)');
		rendered = rendered.replace(/#FEFE02/gi, 'var(--vscode-editor-selectionBackground)');

		return this.addControls([rendered]);
	}


	/**
	 * Renders the call graph to html/svg.
	 * Renders separately one html/svg for each depth.
	 * This might ot be the optimal way. Maybe it would be better to generate
	 * an intermediate format where it is possible to easily change the depth and
	 * generate an SVG from.
	 * However this would also require more communication between the webview and the webview client.
	 * Currently it does nto seem to be a performance bottleneck, so no reason
	 * to change anything...
	 * Main time consuming is the 'renderGraphviz' function. For real big and deep callgraphs
	 * (32) this might take a few seconds (sum over all conversions).
	 * But for normal size just about a second in total.
	 * @param startLongAddrs The start address (or many). Is a long address.
	 * @returns A string with the rendered flow chart. Can be used in a webview.
	 */
	public renderCallGraph(startLongAddrs: number[]): string {
		// Create label for start address if not existing.
		const startAddrs64k = startLongAddrs.map(addr => addr & 0xFFFF);
		for (const addr64k of startAddrs64k) {
			const name = this.createLabelName(addr64k);
			this.setFixedCodeLabel(addr64k, name);
			// Note: the name will be overridden by 'funcAssignLabels()' if it is already available in DeZog.
		}
		// Disassemble
		const depth = this.disassemble(65536);	// Try max depth and get real depth.
		// Create reverted map
		this.createRevertedLabelMap();

		// Prepare an array for each depth
		const svgs: string[] = [];

		// Create SVGs for each depth
		for (let i = 0; i <= depth; i++) {

			// In case not all start addresses have labels, invent labels, e.g. "0AF4h"
			const chosenLabels = new Map<number, DisLabel>();
			for (const addr64k of startAddrs64k) {
				// Check for existing label
				this.getGraphLabels(i, addr64k, chosenLabels);
			}

			// Assure that a start address is at least a CODE_LBL
			for (const addr64k of startAddrs64k) {
				const label = this.labels.get(addr64k)!;
				Utility.assert(label);
				const type = label.type;
				if (type != NumberType.CODE_SUB
					&& type != NumberType.CODE_LBL
					&& type != NumberType.CODE_RST) {
					label.type = NumberType.CODE_LBL;
				}
			}
			// Get dot text output.
			const dot = this.getCallGraph(chosenLabels, startAddrs64k, '#FEFE01', '#FEFE02');
			// Render
			let rendered = renderGraphviz(dot);
			rendered = rendered.replace(/#FEFE01/gi, 'var(--vscode-editor-foreground)');
			rendered = rendered.replace(/#FEFE02/gi, 'var(--vscode-editor-selectionBackground)');

			// Store
			svgs.push(rendered);
		}

		return this.addControls(svgs);
	}


	/**
	 * Adds a slider to scale the SVG and a slider to control the call depth.
	 * @param svgs The SVG html code of all depths
	 * @returns Html code with the added sliders. The depth slider is only added if svgs contains
	 * more than 1 items.
	 */
	protected addControls(svgs: string[]): string {
		const len = svgs.length;
		// Add slider for scaling and slider for depth
		let html = `
		<script>
			function updateSliderScale(slideValue) {
				const sliderValue = document.getElementById("sliderScaleValue");
				sliderValue.value = slideValue + " %";
				for (let i = 1; i <= ${len}; i++) {
					let svg = document.getElementById("svg"+i);
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
			const svg = svgs[i];
			const modSvg = svg.replace(/width=.+height=\S+/, '');
			// Add div: id = svg1/svg2/...svgN
			const depth = i + 1;
			const hidden = (depth == len) ? '' : 'hidden';
			html += `
		<div id="svg${depth}" ${hidden}>
		${modSvg}
		</div>
		`;
		}

		return html;
	}
}
