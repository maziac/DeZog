import * as vscode from 'vscode';
import {Settings} from './settings/settings'; // Adjust the import path as necessary
import path = require('path');
import {Z80RegistersClass} from './remotes/z80registers';
import {ZSimRemote} from './remotes/zsimulator/zsimremote';
import {Utility} from './misc/utility';
import {BaseView} from './views/baseview';
import {ZSimulationView} from './remotes/zsimulator/zsimulationview';
import {DebugSessionClass} from './debugadapter';



/** Class to run a file.
 * .sna, .p and .p81 files are supported.
 */
export class Run {
	// Indicates if a 'Run' is currently active.
	public static isRunning: boolean = false;


	/** Executes a given file.
	 * @param fileUri The file to run.
	 * @param zsim The zsim settings. Can be undefined.
	 */
	public static async execute(fileUri: vscode.Uri, zsim: any /*ZSimType*/) {
		// Safety check
		if (!fileUri)
			return;

		// Check if debugger is running
		if (DebugSessionClass.isRunning()) {
			vscode.window.showErrorMessage('A DeZog debug session is active. Please close it first.');
			return;
		}

		// Check if already running
		if (Run.isRunning) {
			// Close the previous run.
			BaseView.staticClearAll();
		}
		Run.isRunning = true;

		try {
			// Determine the parameters
			const fsPath = fileUri.fsPath;
			if (zsim === undefined) {
				// Determine the parameters
				const ext = path.extname(fsPath).toLowerCase();
				if (ext == '.sna') {
					zsim = {
						preset: 'spectrum',
						memoryModel: 'ZX128K'
					};
				}
				else if (ext == '.p') {
					zsim = {preset: 'zx81'};
				}
				else {
					throw Error('Invalid file extension: ' + ext);
				}
			}

			// Set all unset settings.
			const rootFolder = path.dirname(fsPath);
			const launchPrev: any = {
				zsim,
				rootFolder,
				"history": {
					"reverseDebugInstructionCount": 0,
					"codeCoverageEnabled": false
				},
				"load": fsPath, // Run the file
			};
			const launch = Settings.Init(launchPrev);
			//console.log('Run: launch=' + JSON.stringify(launch));
			Settings.launch = {} as any;	// Workaround or the remaining cases that use Settings directly. TODO: Better make Settings a general parameter for all remotes.
			// Create zsim
			Z80RegistersClass.createRegisters(launch);
			const remote = new ZSimRemote(launch)
			Utility.setRootPath(rootFolder);
			remote.configureMachine();
			await remote.loadBin(fsPath);
			// Adds a window that displays the ZX screen.
			BaseView.staticClearAll();
			const zsimView = new ZSimulationView(remote);
			await zsimView.waitOnInitView();

			// Run
			remote.on('terminated', () => {
				Run.isRunning = false;
			});
			remote.continue();
		}
		catch (e) {
			Run.isRunning = false;
			vscode.window.showErrorMessage('Error during run: ' + e.message);
			BaseView.staticClearAll();
		}
	}


	/** Terminates an active running program.
	 * If no program is active, nothing happens.
	 * Called when a debug session is started.
	 */
	public static terminate() {
		BaseView.staticClearAll();
	}
}
