import * as vscode from 'vscode';
import { Labels, SourceFileEntry } from './labels/labels';
//import {Log} from './log';
//import { Settings } from './settings';
import {Disassembly, DisassemblyClass} from './misc/disassembly';
import {Utility} from './misc/utility';



/// Is a singleton. Initialize in 'activate'.
export let Decoration;


/**
 * Each decoration type (coverage, reverse debug, break) gets its own
 * instance of DecorationFileMap.
 */
class DecorationFileMap {
	/// The decoration type for covered lines.
	public decoType: vscode.TextEditorDecorationType;

	/// Holds a map with filenames associated with the lines.
	public fileMap: Map<string, Array<vscode.Range>|Array<vscode.DecorationOptions>>;
}


/**
 * A singleton that holds the editor decorations for code coverage,
 * reverse debugging andother decorations, e.g. 'break'.
 *
 * Decorations are tedious to handle.
 * If an editor becomes inactive (hidden) it looses its decorations
 * therefore it is necessary
 * - to watch for changes of the active editor
 * - and to store the decorations for each document/editor
 * This means: decoration are added to the editor as soon as they occur and also
 * whenever the active editor changes.
 * What makes it even more complicated is the fact that the disasm.asm file may not even exist
 * when a decoration comes in. And, furthermore, the file may exist already but change
 * its contents.
 * The disasm.asm is created during the stackTraceRequest.
 * It requires decoration (like the other files) of
 * - coverage (green background)
 * - historySpot (the index numbers)
 * - revDbg history (gray background)
 * - break reason (text)
 * 'coverage' is a special case as here only the delta addresses are reported.
 * Therefore it is necessary to store all addresses that do not belong to any other
 * (ordinary) file (in unassignedCodeCoverageAddresses).
 * Also 'coverage' is not emitted in case of reverse debugging.
 * 'historySpot', 'revDbg' and 'break' always contain the complete decoration information.
 * All those calls are delayed in the debugAdapter until the disasm.asm file is created in the
 * stackTraceRequest. This is already done in the debugAdapter.
 */
export class DecorationClass {
	// Names to identify the decorations.
	protected COVERAGE = "Coverage";
	protected REVERSE_DEBUG = "RevDbg";
	protected BREAK = "Break";
	protected HISTORY_SPOT = "HistorySpot";

	// Holds the decorations for coverage, reverse debug and breakpoints.
	protected decorationFileMaps: Map<string, DecorationFileMap>;

	// Collects the coverage addresses that are not assigned yet to any file.
	protected unassignedCodeCoverageAddresses: Set<number>;


	/// Initialize. Call from 'activate' to set the icon paths.
	public static Initialize(context: vscode.ExtensionContext) {
		// Create new singleton
		Decoration = new DecorationClass();
	}


	/**
	 * Register for a change of the text editor to decorate it with the
	 * covered lines.
	 */
	constructor() {
		// Create the decoration types.
		const coverageDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				// this color will be used in light color themes
				backgroundColor: '#d5efc3',
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#093003',
			}
			/*
			light: {
				// this color will be used in light color themes
				backgroundColor: '#B0E090',
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#0C4004',
			}
			*/
		});

		// For the short history decoration type.
		const historySpotDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				// this color will be used in light color themes
//				backgroundColor: '#89C2D3',
				after: {
					color: "#808080",
				}
			},
			dark: {
				// this color will be used in dark color themes
//				backgroundColor: '#022031',
				after: {
					color: "#808080",
				}
			},
		});

		// Decoration for reverse debugging.
		const revDbgDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			/* This gives a bad performance, it's better to change just the color.
			borderWidth: '1px',
			borderStyle: 'dashed', //'solid',
			borderRadius: '5px',
			*/

			light: {
				// this color will be used in light color themes
				//backgroundColor: '#A9E2F3',
				backgroundColor: '#C7C7C7',
			},
			dark: {
				// this color will be used in dark color themes
				//backgroundColor: '#033563',
				backgroundColor: '#353535',
			}

		});

		// Decoration for 'Breaks'
		const breakDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				after: {
					color: "black",
				}
			},
			dark: {
				after: {
					color: "#808080",
				}

			}
		});

		// Create the map
		this.decorationFileMaps = new Map<string, DecorationFileMap>();

		let decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = coverageDecoType;
		decoFileMap.fileMap = new Map<string, Array<vscode.Range>>();
		this.decorationFileMaps.set(this.COVERAGE, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = revDbgDecoType;
		decoFileMap.fileMap = new Map<string, Array<vscode.Range>>();
		this.decorationFileMaps.set(this.REVERSE_DEBUG, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = breakDecoType;
		decoFileMap.fileMap = new Map<string, Array<vscode.DecorationOptions>>();
		this.decorationFileMaps.set(this.BREAK, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = historySpotDecoType;
		decoFileMap.fileMap = new Map<string, Array<vscode.DecorationOptions>>();
		this.decorationFileMaps.set(this.HISTORY_SPOT, decoFileMap);

		this.unassignedCodeCoverageAddresses=new Set<number>();

		// Watch the text editors to decorate them.
		vscode.window.onDidChangeActiveTextEditor(editor => {
			// This is called for the editor that is going to hide and for the editor
			// that is shown.
			// Unfortunately there is no way to differentiate so both are handled.
			// Note: Editors forget the decorations when they are hidden. I.e. decorations have to be re-applied here.
			this.setAllDecorations(editor);
		});
	}


	/**
	 * Loops through all active editors and clear the coverage decorations.
	 */
	public clearCodeCoverage() {
		this.clearDecorations(this.COVERAGE);
	}


	/**
	 * Loops through all active editors and clears the reverse debug decorations.
	 */
	public clearRevDbgHistory() {
		this.clearDecorations(this.REVERSE_DEBUG);
	}


	/**
	 * Loops through all active editors and clears the 'Break' decorations.
	 */
	public clearBreak() {
		this.clearDecorations(this.BREAK);
	}


	/**
	 * Loops through all active editors and clears the 'historySpot' decorations.
	 */
	public clearHistorySpot() {
		this.clearDecorations(this.HISTORY_SPOT);
	}


	/**
	 * Loops through all active editors and clear the decorations.
	 * @param mapName E.g. COVERAGE, REVERSE_DEBUG, SHORT_HISTORY or BREAK.
	 */
	protected clearDecorations(mapName: string) {
		const map=this.decorationFileMaps.get(mapName) as DecorationFileMap;
		map.fileMap.clear();
		const editors=vscode.window.visibleTextEditors;
		for (const editor of editors) {
			editor.setDecorations(map.decoType, []);
		}
		// Additionally clear array
		if (mapName==this.COVERAGE)
			this.unassignedCodeCoverageAddresses.clear();
	}


	/**
	 * Clears all decorations for all editors.
	 */
	protected clearAllDecorations() {
		for (const [, map] of this.decorationFileMaps) {
			map.fileMap.clear();
			const editors=vscode.window.visibleTextEditors;
			for (const editor of editors) {
				editor.setDecorations(map.decoType, []);
			}
		}
		// Additionally clear array
		this.unassignedCodeCoverageAddresses.clear();
	}


	/**
	 * Clears all decorations but the code coverage decorations for all editors.
	 */
	protected clearAllButCodeCoverageDecorations() {
		for (const [name, map] of this.decorationFileMaps) {
			if (name!=this.COVERAGE) {
				map.fileMap.clear();
				const editors=vscode.window.visibleTextEditors;
				for (const editor of editors) {
					editor.setDecorations(map.decoType, []);
				}
			}
		}
	}


	/**
	 * Sets decorations for all types.
	 * Coverage, revers debug, breaks, short history.
	 */
	protected setAllDecorations(editor: vscode.TextEditor|undefined) {
		if(!editor)
			return;

		// Go through all coverage maps
		for (const [fileMapName,] of this.decorationFileMaps) {
			this.setDecorations(editor, fileMapName);
		}
	}


	/**
	 * Sets decorations for a specific type.
	 * Coverage, revers debug, breaks.
	 * @param fileMapName E.g. COVERAGE, REVERSE_DEBUG, HISTORY_SPOT or BREAK.
	 */
	protected setDecorations(editor: vscode.TextEditor, fileMapName: string) {
		// Get filename
		const edFilename=editor.document.fileName;

		// Special case for disassembly file and coverage.
		if (fileMapName==this.COVERAGE) {
			if (edFilename==DisassemblyClass.getAbsFilePath()) {
				// Handle disassembly file
				this.setDisasmCoverageDecoration(editor);
				return;	// Skip normal case
			}
		}

		// Get file map
		const decoMap = this.decorationFileMaps.get(fileMapName) as DecorationFileMap;
		Utility.assert(decoMap);

		// Get lines
		const fileMap = decoMap.fileMap;
		const decorations=fileMap.get(edFilename);
		if(decorations) {
			// Set decorations
			editor.setDecorations(decoMap.decoType, decorations);
		}
	}


	/**
	 * Sets the decorations for the disassembler temp file.
	 */
	public setDisasmCoverageDecoration(editor: vscode.TextEditor) {
		// Coverage
		const lines=Disassembly.getLinesForAddresses(this.unassignedCodeCoverageAddresses);
		const decorations=lines.map(lineNr => new vscode.Range(lineNr, 0, lineNr, 1000));
		if (decorations) {
			// Set decorations
			const decoMap=this.decorationFileMaps.get(this.COVERAGE) as DecorationFileMap;
			editor.setDecorations(decoMap.decoType, decorations);
		}
	}


	/**
	 * Shows (adds) the code coverage of the passed addresses.
	 * The active editors are decorated.
	 * The set is added to the existing ones to decorate another editor when the focus changes.
	 * Is called when the event 'covered' has been emitted by the Emulator.
	 * @param coveredAddresses All addresses to add (all covered addresses)
	 */
	public showCodeCoverage(coveredAddresses: Set<number>) {
		// Get map name
		const mapName = this.COVERAGE;
		// Loop over all addresses
		const decoMap = this.decorationFileMaps.get(mapName) as DecorationFileMap;
		const fileMap = decoMap.fileMap;
		//fileMap.clear();
		coveredAddresses.forEach(addr => {
			// Get file location for address
			let location=Labels.getFileAndLineForAddress(addr);
			let filename = location.fileName;
			if (filename.length==0) {
				// No file found, so remember address
				this.unassignedCodeCoverageAddresses.add(addr);
				return;
			}
			// Get filename set
			let lines = fileMap.get(filename) as Array<vscode.Range>;
			if(!lines) {
				// Create a new
				lines = new Array<vscode.Range>();
				fileMap.set(filename, lines);
			}
			const lineNr=location.lineNr;
			// REMARK: Could be optimized. Here it is possible that coverage for that line already exists and would then be added 2 or more times.
			const range = new vscode.Range(lineNr,0, lineNr,1000);
			// Add address to set
			lines.push(range);
		});

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for (const editor of editors) {
			this.setDecorations(editor, this.COVERAGE);
		}
	}


	/**
	 * Is called whenever the reverse debug history changes.
	 * Will set the decoration.
	 * @param addresses The addresses to decorate.
	 */
	public showRevDbgHistory(addresses: Set<number>) {
		// Clear decorations
		this.clearRevDbgHistory();

		// Get file map
		const decoMap = this.decorationFileMaps.get(this.REVERSE_DEBUG) as DecorationFileMap;
		const fileMap = decoMap.fileMap;

		// Loop over all addresses
		addresses.forEach(addr => {
			// Get file location for address
			const location = this.getFileAndLineForAddress(addr);
			const filename = location.fileName;
			if(filename.length == 0)
				return;
			// Get filename set
			let lines = fileMap.get(filename) as Array<vscode.Range>;
			if(!lines) {
				// Create a new
				lines = new Array<vscode.Range>();
				fileMap.set(filename, lines);
			}
			// Add address to set
			const lineNr = location.lineNr;
			const range = new vscode.Range(lineNr,0, lineNr,1000);
			// Add address to set
			lines.push(range);
		});

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setDecorations(editor, this.REVERSE_DEBUG);
		}
	}


	/**
	 * Is called when a new 'break' should be shown.
	 * This happens during continue, continueReverse, stepOut, stepOver.
	 * The break decoration is cleared before all those actions.
	 * @param pc The address to decorate. Used to find the source line.
	 * @param text The text to show.
	 */
	public showBreak(pc: number, text: string) {
		// Get file map
		const decoMap = this.decorationFileMaps.get(this.BREAK) as DecorationFileMap;
		const fileMap = decoMap.fileMap;
		fileMap.clear();

		// Get file location for pc
		const location = this.getFileAndLineForAddress(pc);
		const filename = location.fileName;
		if(filename.length > 0) {
			// Get filename set
			let lines = fileMap.get(filename) as Array<vscode.DecorationOptions>;
			if(!lines) {
				// Create a new
				lines = new Array<vscode.DecorationOptions>();
				fileMap.set(filename, lines);
			}
			const lineNr = location.lineNr;
			const deco = {
				range: new vscode.Range(lineNr,0, lineNr,1000),
				hoverMessage: undefined,
				renderOptions: {
				  after: {
					  contentText: text,
					  margin: "1.5em"
				  },
				},
			};

			// Add address to set
			lines.push(deco);
		}

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setDecorations(editor, this.BREAK);
		}
	}


	/**
	 * Is called whenever the short history changes.
	 * Will set the decoration.
	 * @param startIndex
	 * @param addresses The addresses to decorate. Is an ordered list.
	 * The youngest address (instruction) is at index 0.
	 * @param registers An array that correspondents to 'addresses' and
	 * includes the values of the changed registers as text.
	 * It is shown together with the index in the decoration.
	 * Is undefined if 'spotShowRegisters' is false.
	 */
	public showHistorySpot(startIndex, addresses: Array<number>, registers: Array<string>) {
		// Clear decorations
		this.clearHistorySpot();

		// Get file map
		const decoMap = this.decorationFileMaps.get(this.HISTORY_SPOT) as DecorationFileMap;
		const fileMap = decoMap.fileMap;

		// Check if addresses are used more than once
		const addressMap = new Map<string, {regText: string, indexText: string}>();
		let index = -startIndex - 1;
		addresses.forEach((addr, k) => {
			const location = this.getFileAndLineForAddress(addr);
			const locString = location.lineNr + ';' + location.fileName;
			let entry = addressMap.get(locString);
			if (!entry) {
				// Show registers only for the first entry
				// Add changed registers
				entry = {regText: registers[k] || '', indexText: index.toString()};
				addressMap.set(locString, entry);
			}
			else {
				// But show all indices
				entry.indexText += ", " + index.toString();
			}
			// Next
			index--;
		});

		// Loop over all addresses
		for(const [locString, entry] of addressMap) {
			// Get file location for address
			//const location = Labels.getFileAndLineForAddress(addr);
			const k = locString.indexOf(';');
			const filename = locString.substr(k+1);
			if(filename.length == 0)
				break;
			// Get filename set
			let lines = fileMap.get(filename) as Array<vscode.DecorationOptions>;
			if(!lines) {
				// Create a new
				lines = new Array<vscode.DecorationOptions>();
				fileMap.set(filename, lines);
			}
			// Add address to set
			const lineNr = parseInt(locString);
			const deco = {
				range: new vscode.Range(lineNr, 0, lineNr, 1000),
				hoverMessage: undefined,
				renderOptions: {
					after: {
						contentText: "[" + entry.indexText + "] " + entry.regText,
						margin: "2.5em",
						//height: "5px",
						//fontWeight: "4em",
						//width: "4em",
						//fontStyle: "italic",
					},
				},
			};
			// If changes register is available:
			/*
			if (entry.regText) {
				deco.renderOptions.before = {
					contentText: "[" + entry.regText + "]",
					margin: "2.5em",
				};
			}
			*/

			// Add address to set
			lines.push(deco);
		}

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setDecorations(editor, this.HISTORY_SPOT);
		}
	}


	/**
	 * Returns the location of addr. Either from asm file(s) or from the disassembly file.
	 * @param addr The address to convert.
	 */
	protected getFileAndLineForAddress(addr: number): SourceFileEntry {
		const location=Labels.getFileAndLineForAddress(addr);
		if (location.fileName.length==0) {
			// Try disasm file
			const lineNr=Disassembly.getLineForAddress(addr);
			if (lineNr!=undefined) {
				// Use disassembly file
				location.fileName=DisassemblyClass.getAbsFilePath();
				location.lineNr=lineNr;
			}
		}
		return location;
	}
}

