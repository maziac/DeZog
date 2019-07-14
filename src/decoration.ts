import * as vscode from 'vscode';
import { Labels } from './labels';
import { Settings } from './settings';
import * as assert from 'assert';


/// Is a singleton. Initialize in 'activate'.
export let Decoration;


/**
 * A singleton that holds the editor decorations for code coverage
 * and reverse debugging.
 */
export class DecorationClass {
	/// The decoration type for covered lines.
	protected coverageDecoType: vscode.TextEditorDecorationType;

	/// The decoration type for elderly covered lines.
	protected coverageElderDecoType: vscode.TextEditorDecorationType;

	/// Holds a map with filenames associated with the addresses.
	protected coverageFileMap: Map<string, Set<number>>;
	/// The same but for the elder addresses.
	protected coverageFileMapElder: Map<string, Set<number>>;

	/// Holds a map with filenames associated with the addresses
	/// for reverse debugging.
	protected revDbgFileMap: Map<string, Set<number>>;


	/// Initialize. Call from 'activate' to set the icon paths.
	public static Initialize(context: vscode.ExtensionContext) {
		// Create new singleton
		Decoration = new DecorationClass();
		// Set the absoute paths.
		Decoration.coverageDecoType = vscode.window.createTextEditorDecorationType({
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
		Decoration.coverageElderDecoType = vscode.window.createTextEditorDecorationType({
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
		Decoration.revDbgDecoType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			gutterIconSize: 'auto',
			light: {
				// this color will be used in light color themes
				backgroundColor: '#A9E2F3',
			},
			dark: {
				// this color will be used in dark color themes
				backgroundColor: '#033563',
			}
		});
	}


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
			this.setCoverageDecoration(editor);
			this.setRevDbgDecoration(editor);
		});
	}


	/**
	 * Loops through all active editors and clear the coverage decorations.
	 */
	public clearLineCoverage() {
		this.coverageFileMap = new Map<string, Set<number>>();
		this.coverageFileMapElder = new Map<string, Set<number>>();
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			editor.setDecorations(Decoration.coverageDecoType, []);
			editor.setDecorations(Decoration.coverageElderDecoType, []);
		}
	}




	/**
	 * Loops through all active editors and clear the coverage decorations.
	 */
	public clearRevDbgHistory() {
		this.revDbgFileMap = new Map<string, Set<number>>();
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			editor.setDecorations(Decoration.revDbgDecoType, []);
		}
	}


	/**
	 * Enables the code coverage.
	 * If no emulator is running (no debug session) nothing happens.
	 * The next time the emulator is started this is overwritten by the
	 * launch settings for 'codeCoverage'.
	 */
	public enableCodeCoverage() {
		if(Settings && Settings.launch && (Settings.launch.codeCoverage.enabled != undefined))
			Settings.launch.codeCoverage.enabled = true;
	}


	/**
	 * Disables the code coverage.
	 * If the emulator is running (debug session) it is told to stop collecting
	 * the executed addresses.
	 * Anyhow all displayed covered lines are reset.
	 */
	public disableCodeCoverage() {
		if(Settings && Settings.launch && (Settings.launch.codeCoverage != undefined))
			Settings.launch.codeCoverage.enabled = false;
		this.clearLineCoverage();
	}


	/**
	 * Shows (adds) the code coverage of the passed addresses.
	 * The active editors are decorated.
	 * The set is added to the existing ones to decorate another editor when the focus changes.
	 * Is called when the event 'covered' has been emitted by the Emulator.
	 * @param coveredAddresses All addresses to add (all covered addresses)
	 */
	public showCodeCoverage(coveredAddresses: Array<Set<number>>) {
		assert(coveredAddresses.length == 2);
		// Loop over all immediate addresses
		this.coverageFileMap = new Map<string, Set<number>>();
		coveredAddresses[0].forEach(addr => {
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

		// Loop over all elder addresses
		this.coverageFileMapElder = new Map<string, Set<number>>();
		coveredAddresses[1].forEach(addr => {
			// Get file location for address
			const location = Labels.getFileAndLineForAddress(addr);
			const filename = location.fileName;
			if(filename.length == 0)
				return;
			// Get filename set
			let lines = this.coverageFileMapElder.get(filename);
			if(!lines) {
				// Create a new
				lines = new Set<number>();
				this.coverageFileMapElder.set(filename, lines);
			}
			// Add address to set
			lines.add(location.lineNr);
		});

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setCoverageDecoration(editor);
		}
	}


	/**
	 * Sets coverage decoration for the given editor.
	 * @param editor The editor to decorate.
	 */
	protected setCoverageDecoration(editor: vscode.TextEditor|undefined) {
		if(!editor)
			return;

		// Get filename
		const edFilename = editor.document.fileName;

		// Immediate lines
		// Get lines
		let lines = this.coverageFileMap.get(edFilename);
		if(lines) {
			// Decorate all immediate lines (coverage)
			const decorations = new Array<vscode.Range>();
			for(const line of lines) {
				const range = new vscode.Range(line,0, line,1000);
				decorations.push(range);
			}
			// Set all decorations
			editor.setDecorations(Decoration.coverageDecoType, decorations);
		}
		else {
			// Clear old decorations
			editor.setDecorations(Decoration.coverageDecoType, []);
		}

		// Elder lines
		// Get lines
		lines = this.coverageFileMapElder.get(edFilename);
		if(lines) {
			// Decorate all immediate lines (coverage)
			const decorations = new Array<vscode.Range>();
			for(const line of lines) {
				const range = new vscode.Range(line,0, line,1000);
				decorations.push(range);
			}
			// Set all decorations
			editor.setDecorations(Decoration.coverageElderDecoType, decorations);
		}
		else {
			// Clear old decorations
			editor.setDecorations(Decoration.coverageElderDecoType, []);
		}
	}

	/**
	 * Sets reverse debug decoration for the given editor.
	 * @param editor The editor to decorate.
	 */
	protected setRevDbgDecoration(editor: vscode.TextEditor|undefined) {
		if(!editor)
			return;

		// Get filename
		const edFilename = editor.document.fileName;

		// Reverse debugging lines
		let lines = this.revDbgFileMap.get(edFilename);
		if(lines) {
			// Decorate all immediate lines (coverage)
			const decorations = new Array<vscode.Range>();
			for(const line of lines) {
				const range = new vscode.Range(line,0, line,1000);
				decorations.push(range);
			}
			// Set all decorations
			editor.setDecorations(Decoration.revDbgDecoType, decorations);
		}
		else {
			// Clear old decorations
			editor.setDecorations(Decoration.revDbgDecoType, []);
		}
	}


	/**
	 * Is called whenever the reverse debug history changes.
	 * Will set the decoration.
	 * @param addresses The address to decorate.
	 */
	public showRevDbgHistory(addresses: Array<number>) {
		// Loop over all all addresses
		this.revDbgFileMap = new Map<string, Set<number>>();
		addresses.forEach(addr => {
			// Get file location for address
			const location = Labels.getFileAndLineForAddress(addr);
			const filename = location.fileName;
			if(filename.length == 0)
				return;
			// Get filename set
			let lines = this.revDbgFileMap.get(filename);
			if(!lines) {
				// Create a new
				lines = new Set<number>();
				this.revDbgFileMap.set(filename, lines);
			}
			// Add address to set
			lines.add(location.lineNr);
		});

		// Loop through all open editors.
		const editors = vscode.window.visibleTextEditors;
		for(const editor of editors) {
			this.setRevDbgDecoration(editor);
		}
	}

}

