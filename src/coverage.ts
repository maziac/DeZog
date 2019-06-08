import * as vscode from 'vscode';
import { Labels } from './labels';


/// The decoration type for covered lines.
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
		gutterIconPath: '/Volumes/SDDPCIE2TB/Projects/zxspectrum/vscode/z80-debug-adapter/images/coverage/gutter-icon-light.svg',
	},
	dark: {
		// this color will be used in dark color themes
		backgroundColor: '#105005',
		gutterIconPath: '/Volumes/SDDPCIE2TB/Projects/zxspectrum/vscode/z80-debug-adapter/images/coverage/gutter-icon-dark.svg', // TODO: relative path
	}
});


/**
 * A singleton that holds the code coverage.
 */
export class CoverageClass {
	/// Holds a map with filenames associated with the addresses.
	protected coverageFileMap = new Map<string, Set<number>>();


	/**
	 * Register for a change of the text editor to decorate it with the
	 * covered lines.
	 */
	constructor() {
		// Watch the text editors to decorate them.
		vscode.window.onDidChangeActiveTextEditor(editor => {
			// This is called for the editor that is going to hide and for the editor
			// that is shown.
			// Unfortunately there is no way to differentiate so both are handled.
			if(this.coverageFileMap.size > 0 &&  editor)
				this.setCoveredLines(editor);
		});
	}

	/**
	 * Loops through all active editors and clear the coverage decorations.
	 */
	public clearLineCoverage() {
		this.coverageFileMap = new Map<string, Set<number>>();
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			editor.setDecorations(coverageDecoType, []);
		}
	}


	/**
	 * Shows (adds) the code coverage of the passed addresses.
	 * The active editors are decorator.
	 * The set is added to the existing ones to decorate another editor when the focus changes.
	 * Is called when the event 'covered' has been emitted by the Emulator.
	 * @param coveredAddresses All addresses to add (all covered addresses)
	 */
	public showCodeCoverage(coveredAddresses: Set<number>) {
		// Loop over all addresses
		coveredAddresses.forEach(addr => {
			// Get file location for address
			const location = Labels.getFileAndLineForAddress(addr);
			const filename = location.fileName;
			if(filename.length == 0)
				return;
			// Get filename set
			let lines = this.coverageFileMap.get(filename);
			if(!lines) {
				// Create a new
				lines = new Set<number>();
				this.coverageFileMap.set(filename, lines);
			}
			// Add address to set
			lines.add(location.lineNr);
		});


		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setCoveredLines(editor);
		}
	}


	/**
	 * Sets coverage decoration for the given editor.
	 * @param coverageFileMap Association of a filename to a map of addresses.
	 * @param editor The editor to decorate.
	 */
	protected setCoveredLines(editor: vscode.TextEditor) {
		// Get filename
		const edFilename = editor.document.fileName;
		// Get lines
		const lines = this.coverageFileMap.get(edFilename);
		if(!lines)
			return;
		// Decorate all lines (coverage)
		const decorations = new Array<vscode.Range>();
		for(const line of lines) {
			const range = new vscode.Range(line,0, line,1000);
			decorations.push(range);
		}
		// Set all decorations
		editor.setDecorations(coverageDecoType, decorations);
	}

}

/// Labels is the singleton object that should be accessed.
export const Coverage = new CoverageClass();
