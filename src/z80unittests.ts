import * as vscode from 'vscode';
import * as assert from 'assert';
//import { EmulatorBreakpoint } from './emulator';
//import { GenericWatchpoint, GenericBreakpoint } from './genericwatchpoint';
import { ZesaruxEmulator } from './zesaruxemulator';
import { zSocket } from './zesaruxSocket';
//import { Labels } from './labels';
//import { Utility } from './utility';
import { EmulDebugAdapter} from './emuldebugadapter';
import { Emulator } from './emulatorfactory';
import { Z80Registers } from './z80registers';
import { Labels } from './labels';


/**
 * This class takes care of executing the unit tests.
 * It basically
 * 1. Reads the labels file to find the unit test labels.
 * 2. Loads the binary into the emulator.
 * 3. Manipulates memory and PC register to call a specific unit test.
 * 4. Loops over all found unit tests.
 */
export class Z80UnitTests {

	/// The PC value that is reached after a successfull test case.
	protected static successfullPC: number;

	/// The PC value that is reached after a unsuccessfull test case.
	protected static unsuccessfullPC: number;

	/// This array will containt the names of all UT testcases.
	protected static utLabels: Array<string>;


	/**
	 * Execute all unit tests.
	 */
	public static execute() {

		// Start
		const success = EmulDebugAdapter.startUnitTests(this.handleDebugAdapter);
		if(!success) {
			vscode.window.showErrorMessage("Couldn't start unit tests. Is maybe a debug session active?");
			return;
		}
	}


	/**
	 * Handles the states of the debug adapter. Will be called after setup
	 * @param debugAdapter The debug adpater.
	 */
	protected static handleDebugAdapter(debugAdapter: EmulDebugAdapter) {
		debugAdapter.on('stopped', event => {
			if(event.reason == 'stop on start') {
				// The Z80 binary has been loaded.
				// The debugger stopped before starting the program.
				// Now read all the unit tests.
				// Get all labels that look like: 'UT_xxx'
				this.utLabels = Labels.getLabelsForRegEx('/.*\\bUT_\\w*$/');
				// Error check
				if(this.utLabels.length == 0) {
					// No unit tests found -> disconnect
					this.stopUnitTests(debugAdapter, "Couldn't start unit tests. No unit tests found. Unit test labels should start with 'UT_'.");
				}
				// Loop all UT_ labels
				this.nextUnitTest(debugAdapter);
				return;
			}

			if(event.reason == 'break') {
				// The program was run and a break occured.
				// Now check the PC.
				Emulator.getRegistersFromEmulator

				// Get current pc
				Emulator.getRegisters(data => {
					// Parse the PC value
					const pc = Z80Registers.parsePC(data);
					//const sp = Z80Registers.parseSP(data);
					// Check if testcase was successfull
					this.checkUnitTest(debugAdapter, pc);


					// Otherwise another break- or watchpoint was hit or the user stepped manually.
				});
			}
		});
	}


	/**
	 * Executes the next test case.
	 * @param da The debug adapter.
	 */
	protected static nextUnitTest(da: EmulDebugAdapter) {
		// Get first unit test
		const next = this.utLabels[0];
		// Calculate address
		const address = Labels.getNumberForLabel(next);
		assert(address);

		// Set memory values.


		// Start the debugger
		da.emulatorContinue();
	}


	/**
	 * Checks if the testcase was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 * @param pc The program counter to check.
	 */
	protected static checkUnitTest(da: EmulDebugAdapter, pc: number) {
		// Check if test case ended successfully or not
		if(pc != this.successfullPC
			&& pc != this.unsuccessfullPC) {
			// Undetermined. Testcase not ended yet.
			return;
		}

		// Check if test case ended successfully
		if(pc == this.successfullPC) {

		}

		// Remove test case
		this.utLabels.unshift();
		// Next unit test
		this.nextUnitTest(da);
	}


	/**
	 * Stops the unit tests.
	 * @param errMessage If set an optional error message is shown.
	 */
	protected static stopUnitTests(debugAdapter: EmulDebugAdapter, errMessage?: string) {
		// Unsubscribe on events
		//debugAdapter.removeListener()
		// Exit
		debugAdapter.exit(errMessage);
	}


}


/*
       {
            "type": "z80-debug",
            "request": "launch",
            "name": "Z80 Debugger - Unit Tests Debug",
            "zhostname": "localhost",
            "zport": 10000,
            "topOfStack": "stack_top",
            "resetOnLaunch": true,
            "skipInterrupt": true,
            "startAutomatically": true,
            "rootFolder": "${workspaceFolder}",
            "commandsAfterLaunch": [
                "-wpmem enable",
                "-assert enable"
            ],
            "disassemblerArgs": {
                "esxdosRst": true
            },
            "listFiles": [
                {
                    "path": "out/ut_dbg.list",
                    "asm": "sjasmplus",
                    "mainFile": "unit_tests.asm",
                    "srcDirs": [ "src" ]
                    //"srcDirs": []  // Use list file
                }
            ],

            "load": "out/ut_dbg.sna",

            "log": {
                "channelOutputEnabled": true
            },
            "logSocket": {
                "channelOutputEnabled": true
            },
			"socketTimeout": 50,    // 50 secs for debugging
		}
		*/
