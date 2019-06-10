import * as vscode from 'vscode';
import * as assert from 'assert';
import { EmulDebugAdapter } from './emuldebugadapter';
import { EmulatorFactory, EmulatorType, Emulator } from './emulatorfactory';
import { Z80Registers } from './z80registers';
import { Labels } from './labels';
import { EmulatorBreakpoint } from './emulator';
import { GenericWatchpoint } from './genericwatchpoint';
import { LabelsClass } from './labels';
import { Settings } from './settings';
import * as jsonc from 'jsonc-parser';
import { readFileSync } from 'fs';
import { Utility } from './utility';
import { CallSerializer } from './callserializer';
import { Coverage } from './coverage';



/// Some definitions for colors.
enum Color {
	Reset = "\x1b[0m",
	Bright = "\x1b[1m",
	Dim = "\x1b[2m",
	Underscore = "\x1b[4m",
	Blink = "\x1b[5m",
	Reverse = "\x1b[7m",
	Hidden = "\x1b[8m",

	FgBlack = "\x1b[30m",
	FgRed = "\x1b[31m",
	FgGreen = "\x1b[32m",
	FgYellow = "\x1b[33m",
	FgBlue = "\x1b[34m",
	FgMagenta = "\x1b[35m",
	FgCyan = "\x1b[36m",
	FgWhite = "\x1b[37m",

	BgBlack = "\x1b[40m",
	BgRed = "\x1b[41m",
	BgGreen = "\x1b[42m",
	BgYellow = "\x1b[43m",
	BgBlue = "\x1b[44m",
	BgMagenta = "\x1b[45m",
	BgCyan = "\x1b[46m",
	BgWhite = "\x1b[47m",
}

/**
 * Colorize a string
 * @param color The color, e.g. '\x1b[36m' for cyan, see https://coderwall.com/p/yphywg/printing-colorful-text-in-terminal-when-run-node-js-script.
 * @param text The strign to colorize.
 */
function colorize(color: string, text: string): string {
	//return color + text + '\x1b[0m';
	return text;	// No easy colrizibg possible in output channel.
}


/**
 * Enumeration for the returned test case pass or failure.
 */
enum TestCaseResult {
	OK = 0,
	FAILED = 1,
	TIMEOUT = 2,
	CANCELLED = 3,	// Testcases have been cancelled, e.g. manually or the connection might have been lost or whatever.
}


/**
 * This structure is returned by getAllUnitTests.
 */
export interface UnitTestCase {
	label: string;	// The full label of the test case, e.g. "test.UT_test1"
	file: string;	// The full path of the file
	line: number;	// The line number of the label
}


/**
 * This class takes care of executing the unit tests.
 * It basically
 * 1. Reads the list file to find the unit test labels.
 * 2. Loads the binary into the emulator.
 * 3. Manipulates memory and PC register to call a specific unit test.
 * 4. Loops over all found unit tests.
 */
export class Z80UnitTests {

	/// This array will contain the names of all UT testcases.
	protected static utLabels: Array<string>;

	/// This array will contain the names of the test cases that should be run.
	protected static partialUtLabels: Array<string>|undefined;

	/// A map for the test case labels and their resolve functions. The resolve
	/// function is called when the test cases has been executed.
	/// result:
	///   0 = passed
	///   1 = failed
	///   2 = timeout
	protected static testCaseMap = new Map<string, (result: number) => void>();

	/// The unit test initialization routine. The user has to provide
	/// it and the label.
	protected static addrStart: number;

	/// The start address of the unit test wrapper.
	/// This is called to start the unit test.
	protected static addrTestWrapper: number;

	/// Here is the address of the unit test written.
	protected static addrCall: number;

	/// At the end of the test this address is reached on success.
	protected static addrTestReadySuccess: number;

	/// At the end of the test this address is reached on failure.
	protected static addrTestReadyFailure: number;

	/// Is filled with the summary of tests and results.
	protected static outputSummary: string;

	/// Counts number of failed and total testcases.
	protected static countFailed: number;
	protected static countExecuted: number;

	/// Is set if the current  testcase fails.
	protected static currentFail: boolean;

	/// The handle for the timeout.
	protected static timeoutHandle;

	/// The call serializer to call the emulator.
	protected static serializer: CallSerializer;

	/// Debug mode or run mode.
	protected static debug = false;

	/// The output channel for the unit tests
	protected static unitTestOutput = vscode.window.createOutputChannel("Z80 Debugger Unit Tests");

	/**
	 * Execute all unit tests in debug mode.
	 */
	public static runAllUnitTests() {
		// All testcases
		Z80UnitTests.partialUtLabels = undefined;
		// Start
		Z80UnitTests.runTests();
	}


	/**
	 * Execute some unit tests in debug mode.
	 */
	public static runPartialUnitTests() {
		// Get list of test case labels
		Z80UnitTests.partialUtLabels = [];
		for(const [tcLabel,] of Z80UnitTests.testCaseMap)
			Z80UnitTests.partialUtLabels.push(tcLabel);
		// Start
		Z80UnitTests.runTests();
	}


	/**
	 * Start the unit tests, either partial or full, in debug mode.
	 * I unit test cases are run (opposed to debugged) the vscode UI is not used
	 * and communication takes place directly with the emulator.
	 */
	protected static runTests() {
		try {
			// Check first that nothing is running
			if(vscode.debug.activeDebugSession) {
				vscode.window.showErrorMessage("Couldn't start unit tests. A debug session is active. Stop it first.");
				return;
			}

			// Mode
			this.debug = false;

			// Get unit test launch config
			const configuration = Z80UnitTests.getUnitTestsLaunchConfig();
			//const configName: string = configuration.name;
			const listFiles = configuration.listFiles;

			// Setup settings
			//const rootFolder = (vscode.workspace.workspaceFolders) ? vscode.workspace.workspaceFolders[0].uri.path : '';
			const rootFolder = vscode.workspace.rootPath || '';
			Settings.Init(configuration, rootFolder);

			const f = () => {
				// Start emulator.
				//Z80UnitTests.serializer = new CallSerializer("Z80UnitTests", true);
				EmulatorFactory.createEmulator(EmulatorType.ZESARUX_EXT);

				// Events
				Emulator.once('initialized', () => {
					try {
						// Reads the list file and also retrieves all occurences of WPMEM, ASSERT and LOGPOINT.
						Labels.init();
						Emulator.readListFiles(listFiles);

						// Enable ASSERTs etc.
						Emulator.enableAssertBreakpoints(true);
						Emulator.enableWPMEM(true);
						try {
							Emulator.enableLogpoints('UNITTEST', true);
						}
						catch {}	// Just in case the group is undefined

						Z80UnitTests.initUnitTests();

						// Load the initial unit test routine (provided by the user)
						Z80UnitTests.execAddr(Z80UnitTests.addrStart);
					}
					catch(e) {
						// Some error occurred
						Z80UnitTests.stopUnitTests(undefined, e);
					}
				});

				Emulator.on('coverage', coveredAddresses => {
					// Covered addresses (since last break) have been sent
					Coverage.showCodeCoverage(coveredAddresses);
				});

				Emulator.on('warning', message => {
					// Some problem occurred
					vscode.window.showWarningMessage(message);
				});

				Emulator.on('log', message => {
					// Show the log (from the socket/ZEsarUX) in the debug console
					vscode.debug.activeDebugConsole.appendLine("Log: " + message);

				});

				Emulator.once('error', err => {
					// Some error occurred
					Z80UnitTests.stopUnitTests(undefined, err);
				});


				// Connect to debugger.
				Emulator.init();
			}

			// Stop any previous running emulator
			if(Emulator)
				Emulator.stop(f);
			else
				f();
		}
		catch(e) {
			// Some error occurred
			Z80UnitTests.stopUnitTests(undefined, e);
		}
	}


	/**
	 * Execute all unit tests in debug mode.
	 */
	public static debugAllUnitTests() {
		// All testcases
		Z80UnitTests.partialUtLabels = undefined;
		// Start
		Z80UnitTests.debugTests();
	}


	/**
	 * Execute some unit tests in debug mode.
	 */
	public static debugPartialUnitTests() {
		// Mode
		this.debug = true;
		// Get list of test case labels
		Z80UnitTests.partialUtLabels = [];
		for(const [tcLabel,] of Z80UnitTests.testCaseMap)
			Z80UnitTests.partialUtLabels.push(tcLabel);
		// Start
		Z80UnitTests.debugTests();
	}


	/**
	 * Start the unit tests, either partial or full, in debug mode.
	 * Debug mode simulates the vscode UI to start debugging and to press continue
	 * after each unit test case.
	 */
	protected static debugTests() {
		try {
			// Get unit test launch config
			const configuration = Z80UnitTests.getUnitTestsLaunchConfig();
			const configName: string = configuration.name;

			// Start debugger
			const success = EmulDebugAdapter.unitTests(configName, this.handleDebugAdapter);
			if(!success) {
				vscode.window.showErrorMessage("Couldn't start unit tests. Is maybe a debug session active?");
			}
		}
		catch(e) {
			vscode.window.showErrorMessage(e.message);
		}
	}


	/**
	 * Clears the map of testcases.
	 * Is called at first when starting (partial) unit testcases.
	 */
	public static clearTestCaseList(){
		// Clear map
		Z80UnitTests.testCaseMap.clear();
	}


	/**
	 * "Executes" one unit test case.
	 * The test case is just remembered and executed later.
	 * Whenever the test case is executed the result is passed in the promise.
	 * @param tcLabels An array with the unit test case labels.
	 */
	public static execUnitTestCase(tcLabel: string): Promise<number> {
		// Create promise.
		const promise = new Promise<number>((resolve) => {
			// Remember its resolve function.
			Z80UnitTests.testCaseMap.set(tcLabel, resolve);
		});
		// Return promise.
		return promise;
	}


	/**
	 * Returns the unit tests launch configuration. I.e. the configuration
	 * from .vscode/launch.json with property unitTests set to true.
	 */
	protected static getUnitTestsLaunchConfig(): any {
		const launchJsonFile = ".vscode/launch.json";
		const launchPath = Utility.getAbsFilePath(launchJsonFile);
		const launchData = readFileSync(launchPath, 'utf8');
		const parseErrors: jsonc.ParseError[] = [];
		const launch = jsonc.parse(launchData, parseErrors, {allowTrailingComma: true});

		// Check for error
		if(parseErrors.length > 0) {
			// Error
			throw Error("Parse error while reading " + launchJsonFile + ".");
		}

		// Find the right configuration
		let configuration;
		for(const config of launch.configurations) {
			if (config.unitTests) {
				// Check if there is already unit test configuration:
				// Only one is allowed.
				if(configuration)
					throw Error("More than one unit test launch configuration found. Only one is allowed.");
				configuration = config;
			}
		}


		// Load user list and labels files
		if(!configuration) {
			// No configuration found, Error
			throw Error('No unit test configuration found in ' + launchJsonFile + '.');
		}

		// Load user list and labels files
		const listFiles = configuration.listFiles;
		if(!listFiles) {
			// No list file given
			// Error
			throw Error('no list file given in unit test configuration.');
		}

		return configuration;
	}



	/**
	 * Loads all labels from the launch.json unit test configuration and
	 * returns a new labels object.
	 * Reads in all labels files.
	 * @returns A labels object.
	 */
	protected static loadLabelsFromConfiguration(): LabelsClass {
		const configuration = Z80UnitTests.getUnitTestsLaunchConfig();

		const labels = new LabelsClass();
		const listFiles = configuration.listFiles;
		for(const listFile of listFiles) {
			const file = {
				path: Utility.getAbsFilePath(listFile.path),
				mainFile: listFile.mainFile,
				srcDirs: listFile.srcDirs || [""],
				filter: listFile.filter,
				asm: listFile.asm || "sjasmplus",
				addOffset: listFile.addOffset || 0
			};
			labels.loadAsmListFile(file.path, file.mainFile, file.srcDirs, file.filter, file.asm, file.addOffset);
		}
		return labels;
	}


	/**
	 * Retrieves a list of strings with the labels of all unit tests.
	 * @returns A list of strings with the label names of the unit tests or a single string with the error text.
	 */
	public static getAllUnitTests(): Promise<UnitTestCase[]> {
		return new Promise<UnitTestCase[]>((resolve, reject) => {
			try {
				// Read all listfiles.
				const labels = Z80UnitTests.loadLabelsFromConfiguration();
				// Get the unit test labels
				const utLabels = Z80UnitTests.getAllUtLabels(labels);
				resolve(utLabels);
			}
			catch(e) {
				// Error
				reject(e.message || "Unknown error.");
			}
		});
	}


	/**
	 * Initializes the unit tests. Is called after the emulator has been setup.
	 */
	protected static initUnitTests() {
		// The Z80 binary has been loaded.
		// The debugger stopped before starting the program.
		// Now read all the unit tests.
		Z80UnitTests.outputSummary = '';
		Z80UnitTests.countFailed = 0;
		Z80UnitTests.countExecuted = 0;
		Z80UnitTests.timeoutHandle = undefined;

		// Get the unit test code
		Z80UnitTests.addrStart = Z80UnitTests.getNumberForLabel("UNITTEST_START");
		Z80UnitTests.addrTestWrapper = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_WRAPPER");
		Z80UnitTests.addrCall = Z80UnitTests.getNumberForLabel("UNITTEST_CALL_ADDR");
		Z80UnitTests.addrCall ++;
		Z80UnitTests.addrTestReadySuccess = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_SUCCESS");
		Z80UnitTests.addrTestReadyFailure = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_FAILURE_BREAKPOINT");
		const stackMinWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MIN_STACK_GUARD");
		const stackMaxWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MAX_STACK_GUARD");

		// Labels not yet known.
		Z80UnitTests.utLabels = undefined as unknown as Array<string>;

		// Success and failure breakpoints
		const successBp: EmulatorBreakpoint = { bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTests.addrTestReadySuccess, condition: '',	log: undefined };
		Emulator.setBreakpoint(successBp);
		const failureBp: EmulatorBreakpoint = { bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTests.addrTestReadyFailure, condition: '',	log: undefined };
		Emulator.setBreakpoint(failureBp);

		// Stack watchpoints
		const stackMinWp: GenericWatchpoint = { address: stackMinWatchpoint, size: 2, access: 'rw', conditions: '' };
		const stackMaxWp: GenericWatchpoint = { address: stackMaxWatchpoint, size: 2, access: 'rw', conditions: '' };
		Emulator.setWatchpoints([stackMinWp, stackMaxWp]);
	}


	/**
	 * Handles the states of the debug adapter. Will be called after setup
	 * @param debugAdapter The debug adpater.
	 */
	protected static handleDebugAdapter(debugAdapter: EmulDebugAdapter) {
		debugAdapter.on('initialized', () => {
			try {
				Z80UnitTests.initUnitTests();
				// Start unit tests after a short while
				Z80UnitTests.startUnitTestsWhenQuiet(debugAdapter);
			}
			catch(e) {
				Z80UnitTests.stopUnitTests(debugAdapter, e.message);
			}
		});

		debugAdapter.on('break', () => {
			Z80UnitTests.onBreak(debugAdapter);
		});
	}


	/**
	 * A break occured. E.g. the test case stopped because it is finished
	 * or because of an error (ASSERT).
	 * @param debugAdapter The debugAdapter (in debug mode) or undefined for the run mode.
	 */
	protected static onBreak(debugAdapter?: EmulDebugAdapter) {
		// The program was run and a break occured.
		// Get current pc
		Emulator.getRegisters(data => {
			// Parse the PC value
			const pc = Z80Registers.parsePC(data);
			//const sp = Z80Registers.parseSP(data);
			// Check if testcase was successfull
			Z80UnitTests.checkUnitTest(pc, debugAdapter);
			// Otherwise another break- or watchpoint was hit or the user stepped manually.
		});
	}


	/**
	 * Returns the address for a label. Checks it and throws an error if it does not exist.
	 * @param label The label eg. "UNITTEST_TEST_WRAPPER"
	 * @returns An address.
	 */
	protected static getNumberForLabel(label: string): number {
		const addr = Labels.getNumberForLabel(label) as number;
		if(!addr) {
			throw Error("Couldn't find the unit test wrapper (" + label + "). Did you forget to use the macro?");
		}
		return addr;
	}


	/**
	 * Waits a few 100ms until traffic is quiet on the zSocket interface.
	 * The problem that is solved here:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * If we don't wait we would miss a few and we wouldn't break.
	 * @param da The debug emulator.
	 */
	protected static startUnitTestsWhenQuiet(da: EmulDebugAdapter) {
		da.executeAfterBeingQuietFor(300, () => {
			// Load the initial unit test routine (provided by the user)
			Z80UnitTests.execAddr(Z80UnitTests.addrStart, da);
		});
	}


	/**
	 * Executes the sub routine at 'addr'.
	 * Used to call the unit test initialization subroutine and the unit
	 * tests.
	 * @param da The debug adapter.
	 */
	protected static execAddr(address: number, da?: EmulDebugAdapter) {
		// Set memory values to test case address.
		const callAddr = new Uint8Array([ address & 0xFF, address >> 8]);
		Emulator.writeMemoryDump(this.addrCall, callAddr, () => {
			// Set PC
			Emulator.setProgramCounter(this.addrTestWrapper, () => {
				// Run
				if(Z80UnitTests.utLabels)
					Z80UnitTests.dbgOutput('UnitTest: ' + Z80UnitTests.utLabels[0] + ' da.emulatorContinue()');
				// Run or Debug
				if(da) {
					// Debug: Continue
					da.emulatorContinue();
					// With vscode UI
					da.sendEventContinued();
				}
				else {
					// Run: Continue
					Emulator.continue((data, tStates, cpuFreq) => {
						Z80UnitTests.onBreak();
					});
				}
			});
		});
	}


	/**
	 * Executes the next test case.
	 * @param da The debug adapter.
	 */
	protected static nextUnitTest(da?: EmulDebugAdapter) {
		// Increase count
		Z80UnitTests.countExecuted ++;
		Z80UnitTests.currentFail = false;
		// Get Unit Test label
		const label = Z80UnitTests.utLabels[0];
		// Calculate address
		const address = Labels.getNumberForLabel(label) as number;
		assert(address);

		// Set timeout
		if(!Z80UnitTests.debug) {
			clearTimeout(Z80UnitTests.timeoutHandle);
			Z80UnitTests.timeoutHandle = setTimeout(() => {
				// Clear timeout
				clearTimeout(Z80UnitTests.timeoutHandle);
				Z80UnitTests.timeoutHandle = undefined;
				// Failure: Timeout. Send a break.
				Emulator.pause();
			}, 1000*Settings.launch.unitTestTimeOut);
		}

		// Start at test case address.
		Z80UnitTests.dbgOutput('TestCase ' + label + '(0x' + address.toString(16) + ') started.');
		Z80UnitTests.execAddr(address, da);
	}


	/**
	 * Checks if the testcase was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 * @param pc The program counter to check.
	 */
	protected static checkUnitTest(pc: number, da?: EmulDebugAdapter) {
		// Check if it was a timeout
		let timeoutFailure = !Z80UnitTests.debug;
		if(Z80UnitTests.timeoutHandle) {
			// Clear timeout
			clearTimeout(Z80UnitTests.timeoutHandle);
			Z80UnitTests.timeoutHandle = undefined;
			timeoutFailure = false;
		}

		// Check if test case ended successfully or not
		if(pc != this.addrTestReadySuccess
			&& pc != this.addrTestReadyFailure) {
			// Undetermined. Testcase not ended yet.
			// Check if in debug or run mode.
			if(da) {
				// In debug mode: Send break to give vscode control
				da.sendEventBreakAndUpdate();
				return;
			}
			// Count failure
			if(!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed ++;
			}
		}

		// Check if this was the init routine that is started
		// before any test case:
		if(!Z80UnitTests.utLabels) {
			// Choose list
			if(Z80UnitTests.partialUtLabels) {
				// Use the passed list
				Z80UnitTests.utLabels = Z80UnitTests.partialUtLabels;
			}
			else {
				// Get all labels that look like: 'UT_xxx'
				const lblFileLines = Z80UnitTests.getAllUtLabels(Labels);
				Z80UnitTests.utLabels = lblFileLines.map(lfl => lfl.label);
			}
			// Error check
			if(Z80UnitTests.utLabels.length == 0) {
				// No unit tests found -> disconnect
				Z80UnitTests.stopUnitTests(da, "Couldn't start unit tests. No unit tests found. Unit test labels should start with 'UT_'.");
				return;
			}
			// Start unit tests
			Z80UnitTests.nextUnitTest(da);
			return;
		}

		// Was a real test case.

		// OK or failure
		const tcSuccess = (pc == Z80UnitTests.addrTestReadySuccess);

		// Count failure
		if(!tcSuccess) {
			if(!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed ++;
			}
		}

		// Get the testcase label.
		const label = Z80UnitTests.utLabels[0];

		// In debug mode do break after one step. The step is required to put the PC at the right place.
		if(da && !tcSuccess) {
			// Do some additional output.
			if(Z80UnitTests.utLabels) {
				if(pc == this.addrTestReadySuccess)
					Z80UnitTests.dbgOutput(label + ' PASSED.');
				if(pc == this.addrTestReadyFailure)
					Z80UnitTests.dbgOutput(label + ' FAILED.');
			}
			// Do a step
			Z80UnitTests.dbgOutput(label + '  da.emulatorStepOver()');
			da.emulatorStepOver();
			return;
		}

		// Determine test case result.
		let tcResult: TestCaseResult = TestCaseResult.TIMEOUT;
		if(!timeoutFailure) {
			// No timeout
			tcResult = (Z80UnitTests.currentFail) ? TestCaseResult.FAILED : TestCaseResult.OK;
		}

		// Send result to calling extension (i.e. test adapter)
		const resolveFunction = Z80UnitTests.testCaseMap.get(label);
		if(resolveFunction) {
			// Inform calling party
			resolveFunction(tcResult);
			// Delete from map
			Z80UnitTests.testCaseMap.delete(label);
		}

		// Print test case name, address and result.
		let tcResultStr;
		switch(tcResult) {
			case TestCaseResult.OK: tcResultStr = colorize(Color.FgGreen, 'OK'); break;
			case TestCaseResult.FAILED: tcResultStr = colorize(Color.FgRed, 'Fail'); break;
			case TestCaseResult.TIMEOUT: tcResultStr = colorize(Color.FgRed, 'Fail (timeout, ' + Settings.launch.unitTestTimeOut + 's)'); break;
		}

		const addr = Labels.getNumberForLabel(label) || 0;
		const outTxt = label + ' (0x' + addr.toString(16) + '):\t' + tcResultStr;
		Z80UnitTests.dbgOutput(outTxt);
		Z80UnitTests.outputSummary += outTxt + '\n';

		// Next unit test
		Z80UnitTests.utLabels.shift();
		if(Z80UnitTests.utLabels.length == 0) {
			// End the unit tests
			Z80UnitTests.dbgOutput("All tests ready.");
			Z80UnitTests.stopUnitTests(da);
			Z80UnitTests.unitTestsFinished();
			return;
		}
		Z80UnitTests.nextUnitTest(da);
	}


	/**
	 * Called when all unit tests have finished.
	 * Will print the summary and display the decorations for the line coverage.
	 */
	protected static unitTestsFinished() {
		// Summary
		Z80UnitTests.printSummary();
	}


	/**
	 * Returns all labels that start with "UT_".
	 * @returns An array with label names.
	 */
	protected static getAllUtLabels(labels: LabelsClass): UnitTestCase[] {
		const utLabels = labels.getLabelsForRegEx('.*\\bUT_\\w*$', '');	// case sensitive
		// Convert to filenames and line numbers.
		const labelFilesLines: UnitTestCase[] = utLabels.map(label => {
			const location = labels.getLocationOfLabel(label) as {file: string, lineNr: number};
			assert(location);
			return {label, file:Utility.getAbsFilePath(location.file), line:location.lineNr};
		});
		return labelFilesLines;
	}


	/**
	 * Sends a CANCELLED for all still open running testcases
	 * to the caller (i.e. the test case adapter).
	 */
	protected static CancelAllRemainingResults() {
		for(const [, resolveFunc] of Z80UnitTests.testCaseMap) {
			// Return an error code
			resolveFunc(TestCaseResult.CANCELLED);
		}
		Z80UnitTests.testCaseMap.clear();
	}


	/**
	 * Stops the unit tests.
	 * @param errMessage If set an optional error message is shown.
	 */
	protected static stopUnitTests(debugAdapter: EmulDebugAdapter|undefined, errMessage?: string) {
		// Clear timeout
		clearTimeout(Z80UnitTests.timeoutHandle);
		Z80UnitTests.timeoutHandle = undefined;
		// Clear remaining testcases
		Z80UnitTests.CancelAllRemainingResults();
		// Delay this:
		const f = () => {
			// Remove event handling for the emulator
			Emulator.removeAllListeners();
			// Exit
			if(debugAdapter)
				debugAdapter.exit(errMessage);
			else {
				// Stop emulator
				Emulator.stop();
			}
		};
		// Wait a little bit for pending messages (The vscode could hang on waiting on a response for getRegisters)
		if(debugAdapter)
			debugAdapter.executeAfterBeingQuietFor(300, f);
		else
			f();
	}


	/**
	 * Prints out text to the clients debug console.
	 * @param txt The text to print.
	 */
	protected static dbgOutput(txt: string) {
		// Savety check
		if(!vscode.debug.activeDebugConsole)
			return;

		// Only newline?
		if(!txt)
			txt = '';
		vscode.debug.activeDebugConsole.appendLine('UNITTEST: ' + txt);
		//zSocket.logSocket.log('UNITTEST: ' + txt);
	}


	/**
	 * Prints out a test case and result summary.
	 */
	protected static printSummary() {


		// Print summary
		const emphasize = '+-------------------------------------------------';
		this.unitTestOutput.show();
		this.unitTestOutput.appendLine('');
		this.unitTestOutput.appendLine(emphasize);
		this.unitTestOutput.appendLine('UNITTEST SUMMARY:');
		this.unitTestOutput.appendLine('Date: ' + new Date().toString() + '\n\n');
		this.unitTestOutput.appendLine(Z80UnitTests.outputSummary);

		const color = (Z80UnitTests.countFailed>0) ? Color.FgRed : Color.FgGreen;
		const countPassed = Z80UnitTests.countExecuted - Z80UnitTests.countFailed;
		this.unitTestOutput.appendLine('');
		this.unitTestOutput.appendLine('Total testcases: ' + Z80UnitTests.countExecuted);
		this.unitTestOutput.appendLine('Passed testcases: ' + countPassed);
		this.unitTestOutput.appendLine(colorize(color, 'Failed testcases: ' + Z80UnitTests.countFailed));
		this.unitTestOutput.appendLine(colorize(color, Math.round(100*countPassed/Z80UnitTests.countExecuted) + '% passed.'));
		this.unitTestOutput.appendLine('');

		this.unitTestOutput.appendLine(emphasize);
	}

}

