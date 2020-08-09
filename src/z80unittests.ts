import * as vscode from 'vscode';
import { DebugSessionClass } from './debugadapter';
import { RemoteFactory, Remote } from './remotes/remotefactory';
import { Labels } from './labels/labels';
import { RemoteBreakpoint } from './remotes/remotebase';
import { GenericWatchpoint } from './genericwatchpoint';
import { LabelsClass } from './labels/labels';
import { Settings } from './settings';
import * as jsonc from 'jsonc-parser';
import { readFileSync } from 'fs';
import { Utility } from './misc/utility';
import { Decoration } from './decoration';
import {StepHistory, CpuHistory, CpuHistoryClass} from './remotes/cpuhistory';
import {Z80RegistersClass, Z80Registers} from './remotes/z80registers';
import {StepHistoryClass} from './remotes/stephistory';



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
 * @param text The string to colorize.
 */
function colorize(color: string, text: string): string {
	//return color + text + '\x1b[0m';
	return text;	// No easy colorizing possible in output channel.
}


/**
 * Enumeration for the returned test case pass or failure.
 */
enum TestCaseResult {
	OK = 0,
	FAILED = 1,
	TIMEOUT = 2,
	CANCELLED = 3,	// Test cases have been cancelled, e.g. manually or the connection might have been lost or whatever.
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
	/// This array will contain the names of all UT test cases.
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

	/// The test case would end here if it just returns.
	/// The TC_END macro should be used instead as 'ret' at the end of a testcase.
	protected static addrTestReadyReturnFailure: number;

	/// At the end of the test this address is reached on failure.
	protected static addrTestReadyFailure: number;

	/// Is filled with the summary of tests and results.
	protected static outputSummary: string;

	/// Counts number of failed and total test cases.
	protected static countFailed: number;
	protected static countExecuted: number;

	/// Is set if the current  test case fails.
	protected static currentFail: boolean;

	/// The handle for the timeout.
	protected static timeoutHandle;

	/// Debug mode or run mode.
	protected static debug = false;

	/// Set to true if unit tests are cancelled.
	protected static cancelled=false;

	/// Stroes the covered accresses for all unit tests.
	protected static allCoveredAddresses: Set<number>;

	/// Caches the last received addresses (from Emulator)
	protected static lastCoveredAddresses: Set<number>;

	/// The output channel for the unit tests
	protected static unitTestOutput = vscode.window.createOutputChannel("DeZog Unit Tests");

	/**
	 * Execute all unit tests in debug mode.
	 */
	public static runAllUnitTests() {
		// All test cases
		Z80UnitTests.partialUtLabels = undefined;
		// Start
		Z80UnitTests.runTestsCheck();
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
		Z80UnitTests.runTestsCheck();
	}


	/**
	 * Checks if the debugger is active. If yes terminates it and
	 * executes the unit tests.
	 * @param debug false: unit tests are run without debugger,
	 * true: unit tests are run with debugger.
	 */
	protected static async terminateEmulatorAndStartTests(debug: boolean): Promise<void> {
		Z80UnitTests.debug=debug;
		return new Promise<void>(async resolve => {
			// Wait until vscode debugger has stopped.
			if (Remote) {
				// Terminate emulator
				await Remote.terminate();
				RemoteFactory.removeRemote();
			}
			// (Unfortunately there is no event for this, so we need to wait)
			Utility.delayedCall(time => {
				// After 5 secs give up
				if (time>=5.0) {
					// Give up
					vscode.window.showErrorMessage('Could not terminate active debug session. Please try manually.');
					resolve();
					return true;
				}
				// New coverage set
				this.allCoveredAddresses=new Set<number>();
				// Check for active debug session
				if (vscode.debug.activeDebugSession)
					return false;  // Try again
				// Debugger not active anymore, start tests
				if (debug)
					this.debugTests();
				else
					this.runTests();
				resolve();
				return true;  // Stop
			});
		});
	}


	/**
	 * Checks first if a debug session is active, terminates it
	 * and then starts the unit tests.
	 */
	protected static runTestsCheck() {
		this.terminateEmulatorAndStartTests(false);
	}


	/**
	 * Start the unit tests, either partial or full, in debug mode.
	 * I unit test cases are run (opposed to debugged) the vscode UI is not used
	 * and communication takes place directly with the emulator.
	 */
	protected static runTests() {
		try {
			// Set root path
			Utility.setRootPath((vscode.workspace.workspaceFolders) ? vscode.workspace.workspaceFolders[0].uri.fsPath : ''); //vscode.workspace.rootPath

			// Mode
			this.debug=false;
			this.cancelled=false;

			// Get unit test launch config
			const configuration = Z80UnitTests.getUnitTestsLaunchConfig();
			//const configName: string = configuration.name;
			const listFiles = configuration.listFiles;

			// Setup settings
			const rootFolder = (vscode.workspace.workspaceFolders) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
			Settings.Init(configuration, rootFolder);
			Settings.CheckSettings();

			// Reset all decorations
			Decoration.clearAllDecorations();

			// Create the registers
			Z80RegistersClass.createRegisters();

			// Start emulator.
			RemoteFactory.createRemote(Settings.launch.remoteType);

			// Check if a cpu history object has been created. (Note: this is only required for debug but done for both)
			if (!(CpuHistory as any)) {
				// If not create a lite (step) history
				CpuHistoryClass.setCpuHistory(new StepHistoryClass());
				StepHistory.decoder=Z80Registers.decoder;
			}

			// Reads the list file and also retrieves all occurrences of WPMEM, ASSERT and LOGPOINT.
			Labels.init();
			Remote.readListFiles(listFiles);

			// Events
			Remote.once('initialized', async () => {
				try {
					// Initialize Cpu- or StepHistory.
					StepHistory.init();  // might call the socket

					// Enable unit test logpoints
					try {
						await Remote.enableLogpointGroup('UNITTEST', true);
					}
					catch {}	// Note: This group might be used by tee user. Most probably this group is undefined.

					await Z80UnitTests.initUnitTests();

					// Load the initial unit test routine (provided by the user)
					Z80UnitTests.execAddr(Z80UnitTests.addrStart);
				}
				catch(e) {
					// Some error occurred
					Z80UnitTests.stopUnitTests(undefined, e.message);
				}
			});

			Remote.on('coverage', coveredAddresses => {
				// Cache covered addresses (since last unit test)
			 	Z80UnitTests.lastCoveredAddresses = coveredAddresses;
			});

			Remote.on('warning', message => {
				// Some problem occurred
				vscode.window.showWarningMessage(message);
			});

			Remote.on('log', message => {
				// Show the log (from the socket/ZEsarUX) in the debug console
				vscode.debug.activeDebugConsole.appendLine("Log: " + message);

			});

			Remote.once('error', err => {
				// Some error occurred
				Z80UnitTests.stopUnitTests(undefined, err.message);
			});


			// Connect to debugger.
			Remote.init().catch(e => {
				// Some error occurred
				Z80UnitTests.stopUnitTests(undefined, e.message);
			});
		}
		catch(e) {
			// Some error occurred
			Z80UnitTests.stopUnitTests(undefined, e.message);
		}
	}


	/**
	 * Execute all unit tests in debug mode.
	 */
	public static debugAllUnitTests() {
		// All test cases
		Z80UnitTests.partialUtLabels = undefined;
		// Start
		Z80UnitTests.debugTestsCheck();
	}


	/**
	 * Execute some unit tests in debug mode.
	 */
	public static debugPartialUnitTests() {
		// Mode
		this.debug=true;
		this.cancelled=false;
		// Get list of test case labels
		Z80UnitTests.partialUtLabels = [];
		for(const [tcLabel,] of Z80UnitTests.testCaseMap)
			Z80UnitTests.partialUtLabels.push(tcLabel);
		// Start
		Z80UnitTests.debugTestsCheck();
	}


	/**
	 * Command execution: Cancel all unit tests.
	 */
	public static cmdCancelAllUnitTests() {
		Remote.emit('terminated');
		Z80UnitTests.cancelUnitTests();
	}


	/**
	 *  Command to cancel the unit tests. E.g. during debugging of one unit test.
	 */
	public static cancelUnitTests() {
		// Cancel the unit tests
		this.cancelled=true;
		const text="Unit tests cancelled.";
		Z80UnitTests.dbgOutput(text);
		Z80UnitTests.stopUnitTests(undefined);
	//	ds.customRequest("terminate");
		// Fail the current test
		/*
		Z80UnitTests.countFailed++;
		if (Z80UnitTests.countFailed>Z80UnitTests.countExecuted)
			Z80UnitTests.countFailed=Z80UnitTests.countExecuted;
		*/
		if (Z80UnitTests.countExecuted>0)
			Z80UnitTests.countExecuted--;
		Z80UnitTests.unitTestsFinished();
	}


	/**
	 * Start the unit tests but checks first if the debugger is active and
	 * terminates it.
	 */
	protected static debugTestsCheck() {
		this.terminateEmulatorAndStartTests(true);
	}


	/**
	 * Start the unit tests, either partial or full, in debug mode.
	 * Debug mode simulates the vscode UI to start debugging and to press continue
	 * after each unit test case.
	 */
	protected static debugTests() {
		try {
			// Set root path
			Utility.setRootPath((vscode.workspace.workspaceFolders) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '');  //vscode.workspace.rootPath

			// Get unit test launch config
			const configuration = Z80UnitTests.getUnitTestsLaunchConfig();
			const configName: string = configuration.name;

			// Start debugger
			const success = DebugSessionClass.unitTests(configName, this.handleDebugAdapter);
			if(!success) {
				vscode.window.showErrorMessage("Couldn't start unit tests. Is maybe a debug session active?");
			}
		}
		catch(e) {
			vscode.window.showErrorMessage(e.message);
		}
	}


	/**
	 * Clears the map of test cases.
	 * Is called at first when starting (partial) unit test cases.
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
	public static async execUnitTestCase(tcLabel: string): Promise<number> {
		return new Promise<number>((resolve) => {
			// Remember its resolve function.
			Z80UnitTests.testCaseMap.set(tcLabel, resolve);
		});
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
			throw Error('No unit test configuration found in ' + launchPath + '.');
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
		// Set root path
		Utility.setRootPath((vscode.workspace.workspaceFolders) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '');  //vscode.workspace.rootPath

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
	public static async getAllUnitTests(): Promise<UnitTestCase[]> {
		return new Promise<UnitTestCase[]>((resolve, reject) => {
			try {
				// Read all list files.
				const labels = Z80UnitTests.loadLabelsFromConfiguration();
				// Check if unit tests available
				if(!Z80UnitTests.AreUnitTestsAvailable(labels))
					return resolve([]);	// Return empty array
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
	 * Check for z80asm:
	 * In z80asm the labels will be visible in the list file for the macro definition.
	 * Even if no unit test has been defined.
	 * This can be checked. In that case the addresses for all labels are the same.	protected
	 */
	protected static AreUnitTestsAvailable(labels: LabelsClass): boolean {
		const firstLabel = labels.getNumberForLabel("UNITTEST_TEST_WRAPPER");
		const lastLabel = labels.getNumberForLabel("UNITTEST_MAX_STACK_GUARD");

		if(firstLabel == lastLabel) {
			// Note: this is also true if both labels are not defined (undefined == undefined)
			return false;
		}

		// Everything fine
		return true;
	}


	/**
	 * Initializes the unit tests. Is called after the emulator has been setup.
	 */
	protected static async initUnitTests(): Promise<void> {
		// The Z80 binary has been loaded.
		// The debugger stopped before starting the program.
		// Now read all the unit tests.
		Z80UnitTests.outputSummary = '';
		Z80UnitTests.countFailed = 0;
		Z80UnitTests.countExecuted = 0;
		Z80UnitTests.timeoutHandle = undefined;
		Z80UnitTests.currentFail = true;

		if (!Z80UnitTests.AreUnitTestsAvailable(Labels))
			throw Error("Unit tests not enabled in assembler sources.");

		// Get the unit test code
		Z80UnitTests.addrStart = Z80UnitTests.getNumberForLabel("UNITTEST_START");
		Z80UnitTests.addrTestWrapper = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_WRAPPER");
		Z80UnitTests.addrCall = Z80UnitTests.getNumberForLabel("UNITTEST_CALL_ADDR");
		Z80UnitTests.addrCall ++;
		Z80UnitTests.addrTestReadySuccess = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_SUCCESS");
		Z80UnitTests.addrTestReadyReturnFailure=Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_RETURN_FAILURE");
		Z80UnitTests.addrTestReadyFailure=Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_FAILURE_BREAKPOINT");
		const stackMinWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MIN_STACK_GUARD");
		const stackMaxWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MAX_STACK_GUARD");

		// Check if code for unit tests is really present
		// (In case labels are present but the actual code has not been loaded.)
		const opcode=await Remote.readMemory(Z80UnitTests.addrTestWrapper);
		// Should start with DI (=0xF3)
		if (opcode != 0xF3)
			throw Error("Code for unit tests is not present.");

		// Labels not yet known.
		Z80UnitTests.utLabels = undefined as unknown as Array<string>;

		// Success and failure breakpoints
		const successBp: RemoteBreakpoint = { bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTests.addrTestReadySuccess, condition: '',	log: undefined };
		await Remote.setBreakpoint(successBp);
		const failureBp1: RemoteBreakpoint={bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTests.addrTestReadyFailure, condition: '', log: undefined};
		await Remote.setBreakpoint(failureBp1);
		const failureBp2: RemoteBreakpoint={bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTests.addrTestReadyReturnFailure, condition: '', log: undefined};
		await Remote.setBreakpoint(failureBp2);

		// Stack watchpoints
		const stackMinWp: GenericWatchpoint = { address: stackMinWatchpoint, size: 2, access: 'rw', condition: '' };
		const stackMaxWp: GenericWatchpoint = { address: stackMaxWatchpoint, size: 2, access: 'rw', condition: '' };
		await Remote.setWatchpoint(stackMinWp);
		await Remote.setWatchpoint(stackMaxWp);
	}


	/**
	 * Handles the states of the debug adapter. Will be called after setup
	 * @param debugAdapter The debug adapter.
	 */
	protected static handleDebugAdapter(debugAdapter: DebugSessionClass) {
		debugAdapter.on('initialized', async () => {
			try {
				// Handle coverage
				Remote.on('coverage', coveredAddresses => {
					// Cache covered addresses (since last unit test)
					Z80UnitTests.lastCoveredAddresses = coveredAddresses;
				});

				// After initialization vscode might send breakpoint requests
				// to set the breakpoints.
				// Unfortunately this request is sent only if breakpoints exist.
				// I.e. there is no safe way to wait for something to
				// know when vscode is ready.
				// So just wait some time:
				if (Settings.launch.startAutomatically)
					await Utility.timeout(500);

				// Init unit tests
				await Z80UnitTests.initUnitTests();
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
	 * A break occurred. E.g. the test case stopped because it is finished
	 * or because of an error (ASSERT).
	 * @param debugAdapter The debugAdapter (in debug mode) or undefined for the run mode.
	 */
	protected static onBreak(debugAdapter?: DebugSessionClass) {
		// The program was run and a break occurred.
		// Get current pc
		Remote.getRegisters().then(() => {
			// Parse the PC value
			const pc = Remote.getPC();
			//const sp = Z80Registers.parseSP(data);
			// Check if test case was successful
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
		if(addr == undefined) {
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
	protected static startUnitTestsWhenQuiet(da: DebugSessionClass) {
		// Wait
		da.executeAfterBeingQuietFor(1000)
		.then(() => {
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
	protected static execAddr(address: number, da?: DebugSessionClass) {
		// Set memory values to test case address.
		const callAddr=new Uint8Array([address&0xFF, address>>>8]);
		Remote.writeMemoryDump(this.addrCall, callAddr).then(() => {
			// Set PC
			Remote.setRegisterValue("PC", this.addrTestWrapper)
				.then(() => {
					// Run
					if (Z80UnitTests.utLabels)
						Z80UnitTests.dbgOutput('UnitTest: '+Z80UnitTests.utLabels[0]+' da.emulatorContinue()');

					// Init
					StepHistory.clear();
					Z80Registers.clearCache();
					Remote.clearCallStack();

					// Run or Debug
					Z80UnitTests.RemoteContinue(da);
				});
		});
	}


	/**
	 * Starts Continue directly or through the debug adapter.
	 */
	protected static RemoteContinue(da: DebugSessionClass|undefined) {
		// Start asynchronously
		(async () => {
			// Check if cancelled
			if (Z80UnitTests.cancelled)
				return;
			// Init
			Remote.startProcessing();
			// Run or Debug
			if (da) {
				// With vscode UI
				da.sendEventContinued();
				// Debug: Continue
				await da.remoteContinue();
				Remote.stopProcessing();
			}
			else {
				// Run: Continue
				await Remote.continue();
				Remote.stopProcessing();
				Z80UnitTests.onBreak();
			}
		})();
	}


	/**
	 * Executes the next test case.
	 * @param da The debug adapter.
	 */
	protected static nextUnitTest(da?: DebugSessionClass) {
		// Increase count
		Z80UnitTests.countExecuted ++;
		Z80UnitTests.currentFail = false;
		// Get Unit Test label
		const label = Z80UnitTests.utLabels[0];
		// Calculate address
		const address = Labels.getNumberForLabel(label) as number;
		Utility.assert(address != undefined);

		// Set timeout
		if(!Z80UnitTests.debug) {
			clearTimeout(Z80UnitTests.timeoutHandle);
			const toMs=1000*Settings.launch.unitTestTimeout;
			Z80UnitTests.timeoutHandle = setTimeout(() => {
				// Clear timeout
				clearTimeout(Z80UnitTests.timeoutHandle);
				Z80UnitTests.timeoutHandle = undefined;
				// Failure: Timeout. Send a break.
				Remote.pause();
			}, toMs);
		}

		// Start at test case address.
		Z80UnitTests.dbgOutput('TestCase ' + label + '(0x' + address.toString(16) + ') started.');
		Z80UnitTests.execAddr(address, da);
	}


	/**
	 * Checks if the test case was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 * @param pc The program counter to check.
	 */
	protected static async checkUnitTest(pc: number, da?: DebugSessionClass): Promise<void> {
		// Check if it was a timeout
		let timeoutFailure = !Z80UnitTests.debug;
		if(Z80UnitTests.timeoutHandle) {
			// Clear timeout
			clearTimeout(Z80UnitTests.timeoutHandle);
			Z80UnitTests.timeoutHandle = undefined;
			timeoutFailure = false;
		}

		// Check if test case ended successfully or not
		if (pc!=this.addrTestReadySuccess
			&& pc!=this.addrTestReadyFailure
			&& pc!=this.addrTestReadyReturnFailure) {
			// Undetermined. Test case not ended yet.
			// Check if in debug or run mode.
			if(da) {
				// In debug mode: Send break to give vscode control
				da.sendEventBreakAndUpdate();  // No need for 'await'
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
			// Check if we break on the first unit test.
			if(Z80UnitTests.debug && !Settings.launch.startAutomatically ) {
				const firstLabel = Z80UnitTests.utLabels[0];
				const firstAddr = Labels.getNumberForLabel(firstLabel) as number;
				if(firstAddr == undefined) {
					// Error
					Z80UnitTests.stopUnitTests(da, "Couldn't find address for first unit test label '" + firstLabel + "'.");
					return;
				}
				const firstUtBp: RemoteBreakpoint = { bpId: 0, filePath: '', lineNr: -1, address: firstAddr, condition: '',	log: undefined };
				await Remote.setBreakpoint(firstUtBp);
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

		// Get the test case label.
		const label = Z80UnitTests.utLabels[0];

		// In debug mode do break after one step. The step is required to put the PC at the right place.
		if(da && !tcSuccess) {
			// Do some additional output.
			if(Z80UnitTests.utLabels) {
				if(pc == this.addrTestReadySuccess)
					Z80UnitTests.dbgOutput(label + ' PASSED.');
				if (pc==this.addrTestReadyFailure
					||pc==this.addrTestReadyReturnFailure)
					Z80UnitTests.dbgOutput(label + ' FAILED.');
			}
			// Do a step
			Z80UnitTests.dbgOutput(label + '  da.emulatorStepOver()');
			da.emulatorOneStepOver();	// await not needed
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
			case TestCaseResult.TIMEOUT: tcResultStr = colorize(Color.FgRed, 'Fail (timeout, ' + Settings.launch.unitTestTimeout + 's)'); break;
		}

		const addr = Labels.getNumberForLabel(label) || 0;
		const outTxt = label + ' (0x' + addr.toString(16) + '):\t' + tcResultStr;
		Z80UnitTests.dbgOutput(outTxt);
		Z80UnitTests.outputSummary += outTxt + '\n';

		// Collect coverage:
		// Get covered addresses (since last unit test) and add to collection.
		if (Z80UnitTests.lastCoveredAddresses) {
			const target=Z80UnitTests.allCoveredAddresses;
			Z80UnitTests.lastCoveredAddresses.forEach(target.add, target);
		}

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
			Utility.assert(location);
			return {label, file:Utility.getAbsFilePath(location.file), line:location.lineNr};
		});
		return labelFilesLines;
	}


	/**
	 * Sends a CANCELLED for all still open running test cases
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
	protected static stopUnitTests(debugAdapter: DebugSessionClass|undefined, errMessage?: string): Promise<void> {
		// Async
		return new Promise<void>(async resolve => {
			// Clear timeout
			clearTimeout(Z80UnitTests.timeoutHandle);
			Z80UnitTests.timeoutHandle=undefined;
			// Clear remaining test cases
			Z80UnitTests.CancelAllRemainingResults();
			// Show coverage
			Decoration.showCodeCoverage(Z80UnitTests.allCoveredAddresses);
			Z80UnitTests.lastCoveredAddresses=undefined as any;

			// Wait a little bit for pending messages (The vscode could hang on waiting on a response for getRegisters)
			if (debugAdapter)
				await debugAdapter.executeAfterBeingQuietFor(300);

			// Remove event handling for the emulator
			Remote.removeAllListeners();
			// For reverse debugging.
			StepHistory.clear();

			// Exit
			if (debugAdapter)
				debugAdapter.terminate(errMessage);
			else {
				// Stop emulator
				await Remote.disconnect();
				// Show error
				if (errMessage)
					vscode.window.showErrorMessage(errMessage);
			}
			resolve();
		});
	}


	/**
	 * Prints out text to the clients debug console.
	 * @param txt The text to print.
	 */
	protected static dbgOutput(txt: string) {
		// Safety check
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
		this.unitTestOutput.appendLine('Total test cases: ' + Z80UnitTests.countExecuted);
		this.unitTestOutput.appendLine('Passed test cases: ' + countPassed);
		this.unitTestOutput.appendLine(colorize(color, 'Failed test cases: '+Z80UnitTests.countFailed));
		if (Z80UnitTests.countExecuted>0)
			this.unitTestOutput.appendLine(colorize(color, Math.round(100*countPassed/Z80UnitTests.countExecuted) + '% passed.'));
		this.unitTestOutput.appendLine('');

		this.unitTestOutput.appendLine(emphasize);
	}

}

