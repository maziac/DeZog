import * as vscode from 'vscode';
import { Labels } from './labels';
//import { Settings } from './settings';
import * as assert from 'assert';



/// Is a singleton. Initialize in 'activate'.
export let Decoration;


/**
 * Each decoration type )coverage, reverse debug, break) gets its own
 * instance of DecorationFileMap.
 */
class DecorationFileMap {
	/// The decoration type for covered lines.
	public decoType: vscode.TextEditorDecorationType;

	/// Holds a map with filenames associated with the lines.
	public fileMap: Map<string, Array<number>>;
}


/**
 * A singleton that holds the editor decorations for code coverage,
 * reverse debugging andother decorations, e.g. 'break'.
 */
export class DecorationClass {
	// Names to identify the decorations.
	protected COVERAGE_IMMEDIATE = "CovImmediate";
	protected COVERAGE_ELDER = "CovElder";
	protected REVERSE_DEBUG = "RevDbg";
	protected BREAK = "Break";

	// Holds the decorations for coverage, reverse debug and breakpoints.
	protected decorationFileMaps: Map<string, DecorationFileMap>;


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
			/*
			borderWidth: '1px',
			borderStyle: 'solid',
			overviewRulerColor: 'blue',
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			light: {
				// this color will be used in light color themes
				borderColor: 'darkblue'
			},
			dark: {
				// this color will be used in dark color themes
				borderColor: 'lightblue'
			}
			*/
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				// this color will be used in light color themes
				backgroundColor: '#B0E090',
				//gutterIconPath: context.asAbsolutePath('./images/coverage/gutter-icon-light.svg'),
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#0C4004',
				//gutterIconPath: context.asAbsolutePath('./images/coverage/gutter-icon-dark.svg'),
			}
		});
		// For the elder lines a little lighter
		const coverageElderDecoType = vscode.window.createTextEditorDecorationType({
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
		});

		// Decoration for reverse debugging.
		const revDbgDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			borderWidth: '1px',
			borderStyle: 'dashed', //'solid',
			borderRadius: '5px',
			/*
			light: {
				// this color will be used in light color themes
				backgroundColor: '#A9E2F3',
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#033563',
			}
			*/
		});


		// Decoration for 'Breaks'
		const breakDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				// this color will be used in light color themes
				backgroundColor: '#ffff00',
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#ffff00',
			}
		});

		// Create the map
		this.decorationFileMaps = new Map<string, DecorationFileMap>();

		let decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = coverageDecoType;
		decoFileMap.fileMap = new Map<string, Array<number>>();
		this.decorationFileMaps.set(this.COVERAGE_IMMEDIATE, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = coverageElderDecoType;
		decoFileMap.fileMap = new Map<string, Array<number>>();
		this.decorationFileMaps.set(this.COVERAGE_ELDER, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = revDbgDecoType;
		decoFileMap.fileMap = new Map<string, Array<number>>();
		this.decorationFileMaps.set(this.REVERSE_DEBUG, decoFileMap);

		decoFileMap = new DecorationFileMap();
		decoFileMap.decoType = breakDecoType;
		decoFileMap.fileMap = new Map<string, Array<number>>();
		this.decorationFileMaps.set(this.BREAK, decoFileMap);

		// Watch the text editors to decorate them.
		vscode.window.onDidChangeActiveTextEditor(editor => {
			// This is called for the editor that is going to hide and for the editor
			// that is shown.
			// Unfortunately there is no way to differentiate so both are handled.
			this.setAllDecorations(editor);
		});
	}


	/**
	 * Loops through all active editors and clear the coverage decorations.
	 */
	public clearCodeCoverage() {
		this.clearDecorations(this.COVERAGE_IMMEDIATE);
		this.clearDecorations(this.COVERAGE_ELDER);
	}


	/**
	 * Loops through all active editors and clear the reverse debug decorations.
	 */
	public clearRevDbgHistory() {
		this.clearDecorations(this.REVERSE_DEBUG);
	}


	/**
	 * Loops through all active editors and clear the 'break' decorations.
	 */
	public clearBreak() {
		this.clearDecorations(this.BREAK);
	}


	/**
	 * Loops through all active editors and clear the decorations.
	 * @param mapName E.g. COVERAGE_IMMEDIATE, COVERAGE_ELDER, REVERSE_DEBUG
	 * or BREAK.
	 */
	protected clearDecorations(mapName: string) {
		const map = this.decorationFileMaps.get(mapName) as DecorationFileMap;
		map.fileMap.clear();
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			editor.setDecorations(map.decoType, []);
		}

	}


	/**
	 * Shows (adds) the code coverage of the passed addresses.
	 * The active editors are decorated.
	 * The set is added to the existing ones to decorate another editor when the focus changes.
	 * Is called when the event 'covered' has been emitted by the Emulator.
	 * @param coveredAddresses All addresses to add (all covered addresses)
	 */
	public showCodeCoverage(coveredAddresses: Array<Set<number>>) {
		//return;
		assert(coveredAddresses.length == 2);

		const covMaps = [ this.COVERAGE_IMMEDIATE, this.COVERAGE_ELDER];

		// Loop over both maps
		for(let i=0; i<2; i++) {
			// Get map name
			const mapName = covMaps[i];
			// Loop over all addresses
			const decoMap = this.decorationFileMaps.get(mapName) as DecorationFileMap;
			const fileMap = decoMap.fileMap;
			fileMap.clear();
			coveredAddresses[i].forEach(addr => {
				// Get file location for address
				const location = Labels.getFileAndLineForAddress(addr);
				const filename = location.fileName;
				if(filename.length == 0)
					return;
				// Get filename set
				let lines = fileMap.get(filename);
				if(!lines) {
					// Create a new
					lines = new Array<number>();
					fileMap.set(filename, lines);
				}
				// Add address to set
				lines.push(location.lineNr);
			});
		}

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setDecorations(editor, this.COVERAGE_IMMEDIATE);
			this.setDecorations(editor, this.COVERAGE_ELDER);
		}
	}


	/**
	 * Sets decorations for all types.
	 * Coverage, revers debug, breaks.
	 */
	protected setAllDecorations(editor: vscode.TextEditor|undefined) {
		if(!editor)
			return;

		// Get filename
		const edFilename = editor.document.fileName;

		// Go through all coverage maps
		for(const [,decoMap] of this.decorationFileMaps) {
			// Get lines
			const fileMap = decoMap.fileMap;
			let lines = fileMap.get(edFilename);
			const decorations = new Array<vscode.Range>();
			if(lines) {
				// Decorate all immediate lines (coverage)
				for(const line of lines) {
					const range = new vscode.Range(line,0, line,1000);
					decorations.push(range);
				}
			}
			// Set all decorations
			editor.setDecorations(decoMap.decoType, decorations);
		}
	}


	/**
	 * Sets decorations for a specific type.
	 * Coverage, revers debug, breaks.
	 * @param fileMapName E.g. COVERAGE_IMMEDIATE, COVERAGE_ELDER, REVERSE_DEBUG
	 * or BREAK.
	 */
	protected setDecorations(editor: vscode.TextEditor, fileMapName: string) {
		// Get filename
		const edFilename = editor.document.fileName;

		// Get file map
		const decoMap = this.decorationFileMaps.get(fileMapName) as DecorationFileMap;
		assert(decoMap);

		// Get lines
		const fileMap = decoMap.fileMap;
		let lines = fileMap.get(edFilename);
		const decorations = new Array<vscode.Range>();
		if(lines) {
			// Decorate all immediate lines (coverage)
			for(const line of lines) {
				const range = new vscode.Range(line,0, line,1000);
				decorations.push(range);
			}
		}
		// Set all decorations
		editor.setDecorations(decoMap.decoType, decorations);
	}


	/**
	 * Is called whenever the reverse debug history changes.
	 * Will set the decoration.
	 * @param addresses The address to decorate.
	 */
	public showRevDbgHistory(addresses: Array<number>) {
		// Get file map
		const decoMap = this.decorationFileMaps.get(this.REVERSE_DEBUG) as DecorationFileMap;
		const fileMap = decoMap.fileMap;
		fileMap.clear();

		// Loop over all all addresses
		addresses.forEach(addr => {
			// Get file location for address
			const location = Labels.getFileAndLineForAddress(addr);
			const filename = location.fileName;
			if(filename.length == 0)
				return;
			// Get filename set
			let lines = fileMap.get(filename);
			if(!lines) {
				// Create a new
				lines = new Array<number>();
				fileMap.set(filename, lines);
			}
			// Add address to set
			lines.push(location.lineNr);
		});

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setDecorations(editor, this.REVERSE_DEBUG);
		}
	}

}

