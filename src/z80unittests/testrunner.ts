import * as vscode from 'vscode';
import {Utility} from '../misc/utility';
import {Remote, RemoteFactory} from '../remotes/remotefactory';
import {Settings} from '../settings';
import {readFileSync} from 'fs';
import * as jsonc from 'jsonc-parser';
import {Z80Registers, Z80RegistersClass} from '../remotes/z80registers';
import {CpuHistory, CpuHistoryClass, StepHistory} from '../remotes/cpuhistory';
import {StepHistoryClass} from '../remotes/stephistory';
import {Labels} from '../labels/labels';
import {DebugSessionClass} from '../debugadapter';
import {ZSimRemote} from '../remotes/zsimulator/zsimremote';


/**
 * Additional data for the test cases.
 */
interface TestCaseContext {
	// The 'require' context.
	requireContext: any;	// TODO: maybe I don't need this.

	// The test function (inside the user's test file)
	testFunc?: () => void;
}


/**
 * The test runner for the vscode testing api.
 * Watches for file changes an collects the tests.
 * Tests can be run from the vscode UI.
 */
export class TestRunner {

	// Pointer to the test controller.
	protected static controller: vscode.TestController;

	// Diagnostics collection (for errors found in test files)
	protected static diagnostics: vscode.DiagnosticCollection;

	// Contains additional data for the test cases, i.e. the require context.
	protected static tcContexts: WeakMap<vscode.TestItem, TestCaseContext>;


	/// Stores the covered addresses for the unit test.
	protected static allCoveredAddresses: Set<number>;


	/**
	 * Initialize the Tester.
	 */
	public static Initialize() {
		// Init
		this.tcContexts = new Map<vscode.TestItem, TestCaseContext>();

		// Create diagnostics (for errors in test files)
		this.diagnostics = vscode.languages.createDiagnosticCollection('Z80 Unit Test File errors');

		// Create dezog test controller
		this.controller = vscode.tests.createTestController(
			'maziac.dezog.z80unittest.controller',
			'Z80 Unit Tests'
		);

		// First, create the `resolveHandler`. This may initially be called with
		// "undefined" to ask for all tests in the workspace to be discovered, usually
		// when the user opens the Test Explorer for the first time.
		this.controller.resolveHandler = async test => {
			if (!test) {
				await this.discoverAllFilesInWorkspace();
			} else {
				await this.parseTestsInFileContents(test);
			}
		};

		// When text documents are open, parse tests in them.
		vscode.workspace.onDidOpenTextDocument(doc => this.parseTestsInDocument(doc));
		// We could also listen to document changes to re-parse unsaved changes:
		vscode.workspace.onDidChangeTextDocument(event => this.parseTestsInDocument(event.document));

		this.controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => {
			this.runHandler(request, token);
		});

		this.controller.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, (request, token) => {
			this.runDebugHandler(request, token);
		});
	}


	/**
	 * Initially discover all files/tests.
	 */
	protected static discoverAllFilesInWorkspace(): Promise<vscode.FileSystemWatcher[]> {
		if (!vscode.workspace.workspaceFolders) {
			const emptyArray: vscode.FileSystemWatcher[] = []; // handle the case of no open folders
			return new Promise<vscode.FileSystemWatcher[]>(resolve => emptyArray);
		}

		return Promise.all(
			vscode.workspace.workspaceFolders.map(async workspaceFolder => {
				const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.ut.js');
				const watcher = vscode.workspace.createFileSystemWatcher(pattern);

				// When files are created, make sure there's a corresponding "file" node in the tree
				watcher.onDidCreate(uri => this.getOrCreateFile(uri));
				// When files change, re-parse them. Note that you could optimize this so
				// that you only re-parse children that have been resolved in the past.
				watcher.onDidChange(uri => this.parseTestsInFileContents(this.getOrCreateFile(uri)));
				// And, finally, delete TestItems from removed files. This is simple, since
				// we use the URI as the TestItem's ID.
				watcher.onDidDelete(uri => this.controller.items.delete(uri.toString()));

				for (const file of await vscode.workspace.findFiles(pattern)) {
					this.getOrCreateFile(file);
				}

				return watcher;
			})
		);
	}


	/**
	 *  In this function, we'll get the file TestItem if we've already found it,
	 *  otherwise we'll create it with `canResolveChildren = true` to indicate it
	 *  can be passed to the `controller.resolveHandler` to gets its children.
	 */
	protected static getOrCreateFile(uri: vscode.Uri): vscode.TestItem {
		// Check if existing
		const existing = this.controller.items.get(uri.toString());
		if (existing) {
			return existing;
		}

		// Otherwise create.
		const file = this.controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
		this.controller.items.add(file);
		file.canResolveChildren = true;
		return file;
	}


	/**
	 * Checks for the right file extension.
	 */
	protected static parseTestsInDocument(doc: vscode.TextDocument) {
		if (doc.uri.scheme === 'file' && doc.uri.path.endsWith('.ut.js')) {
			const testItem = this.getOrCreateFile(doc.uri);
			const text = doc.getText();
			this.parseTestsInFileContents(testItem, text);
		}
	}

	/**
	 * Parses (compiles) a test file.
	 * If a document is open, VS Code already knows its contents.
	 * If this is being called from the resolveHandler when a
	 * document isn't open, we'll need to read them from disk ourselves.
	 * @param file The TestItem.
	 * @param contents (Optional) The file contents. If given, contents is
	 * not read from the file but directly used.
	 */
	protected static async parseTestsInFileContents(file: vscode.TestItem, contents?: string) {
		// Is contents already known?
		if (contents === undefined) {
			const rawContent = await vscode.workspace.fs.readFile(file.uri!);
			contents = new TextDecoder().decode(rawContent);
		}

		// Clear diagnostics
		this.diagnostics.delete(file.uri!);
		// Run the js file to find the tests in the array suiteStack.
		try {
			const testSuite = Utility.requireFromString(contents);
			testSuite.setDezogExecAddr(this.execAddr);
			//testSuite.setDezogExecAddr(this.testCall);
			this.tcContexts.set(file, {requireContext: testSuite});
			const suites = testSuite.suiteStack[0].children;
			for(const suite of suites)
				this.createTestHierarchy(file, suite);
		}
		catch (e) {
			//console.log(e);
			// Add to diagnostics
			const pos = e.position;
			if (pos) {
				const diag = new vscode.Diagnostic(new vscode.Range(pos.line, pos.column, pos.line, pos.column), e.message);
				this.diagnostics.set(file.uri!, [diag]);
			}
		}
	}


	/**
	 * Create the test hierarchy from the given structure in suite.
	 * @param parentTestItem The parent.
	 * @param suite A structure that is created inside the test file.
	 */
	protected static createTestHierarchy(parentTestItem: vscode.TestItem, suite) {
		// Add suite
		const suiteId = parentTestItem.id + '.' + suite.name;
		const tcContext = this.tcContexts.get(parentTestItem)!;
		const suiteItem = this.createTestItem(suiteId, suite.name, parentTestItem.uri, tcContext);
		parentTestItem.children.add(suiteItem);
		// Add location
		const pos = suite.position;
		if(pos)
			suiteItem.range = new vscode.Range(pos.line, pos.column, pos.line, pos.column);

		// Add children
		for (const child of suite.children) {
			// Suite or test case
			if (child.children) {
				// Suite
				this.createTestHierarchy(suiteItem, child);
			}
			else {
				// Test case
				const item = this.createTestItem(suiteId + '.' + child.name, child.name, suiteItem.uri, tcContext);
				this.tcContexts.set(item, {requireContext: tcContext.requireContext, testFunc: child.func});
				// Add location
				const pos = child.position;
				if (pos)
					item.range = new vscode.Range(pos.line, pos.column, pos.line, pos.column);
				// Add
				suiteItem.children.add(item);
			}
		}
	}


	/**
	 * Creates a test item and creates a reference to the context weak map.
	 * @param testId The unique id.
	 * @param label The human readable name.
	 * @param uri The file reference.
	 * @param tcContext The 'require' context inherited from the parent.
	 */
	protected static createTestItem(testId: string, label: string, uri: vscode.Uri|undefined, tcContext: TestCaseContext): vscode.TestItem {
		// Create normal test item
		const item = this.controller.createTestItem(testId, label, uri);
		// Add additional data
		this.tcContexts.set(item, tcContext);
		// Return
		return item;
	}



	/**
	 * Runs a test case. (debug)
	 */
	protected static async runDebugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		// TODO
	}


	/**
	 * Runs a test case. (Not debug)
	 */
	protected static async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		const run = this.controller.createTestRun(request);
		const queue: vscode.TestItem[] = [];

		// Loop through all included tests, or all known tests, and add them to our queue
		if (request.include) {
			request.include.forEach(test => queue.push(test));
		} else {
			this.controller.items.forEach(test => queue.push(test));
		}

		// For every test that was queued, try to run it. Call run.passed() or run.failed().
		// The `TestMessage` can contain extra information, like a failing location or
		// a diff output. But here we'll just give it a textual message.
		while (queue.length > 0 && !token.isCancellationRequested) {
			const test = queue.shift()!;

			// Skip tests the user asked to exclude
			if (request.exclude?.includes(test)) {
				continue;
			}

			/* Not sure if I need this:
			switch (getType(test)) {
				case ItemType.File:
					// If we're running a file and don't know what it contains yet, parse it now
					if (test.children.size === 0) {
						await this.parseTestsInFileContents(test);
					}
					break;
				case ItemType.TestCase:
					// Otherwise, just run the test case. Note that we don't need to manually
					// set the state of parent tests; they'll be set automatically.
					const start = Date.now();
					try {
						await this.assertTestPasses(test);
						run.passed(test, Date.now() - start);
					} catch (e) {
						run.failed(test, new vscode.TestMessage(e.message), Date.now() - start);
					}
					break;
			}
			*/

			// Run the test case
			const start = Date.now();
			try {
				run.started(test);
				await this.runTestCase(test);
				run.passed(test, Date.now() - start);
			}
			catch (e) {
				// Test failure
				const testMsg = new vscode.TestMessage(e.message);
				let range = test.range;
				if (e.position) {
					const line = e.position.line;
					const col = e.position.column;
					range = new vscode.Range(line, col, line, col);
				}
				if (range) {
					testMsg.location = new vscode.Location(test.uri!, range);
				}
				run.failed(test, testMsg, Date.now() - start);
			}

			// Run child tests
			for (let k = test.children.size - 1; k >= 0; k--) {
				const childTest = test.children[k];
				queue.unshift(childTest);
			}
		}

		// Make sure to end the run after all tests have been executed:
		run.end();
	}


	/**
	 * Runs a single test case.
	 * Throws an exception on failure.
	 * Np exception if passed correctly.
	 * @param test The TestItem.
	 */
	protected static async runTestCase(test: vscode.TestItem) {
		console.log(test);
		// Get 'required' context
		const tcContext = this.tcContexts.get(test)!;

		this.allCoveredAddresses = new Set<number>();
		await this.terminateEmulator();

		// Debugger not active anymore, start tests
		//this.cancelled = false;
		//if (debug)
		//	this.debugTests();
		//else
		await this.runTests();	// TODO rename to preareTest

		// Execute
		//tcContext.requireContext.dezogExecAddr = this.execAddr;
		await tcContext.testFunc!();	// TODO: also async functions


		await Utility.timeout(2000);
	}


	public static async testCall(address) {
		console.log("iiii", address);
		await Utility.timeout(2000);
	}

	/**
	 * Returns the unit tests launch configuration. I.e. the configuration
	 * from .vscode/launch.json with property unitTests set to true.
	 */
	protected static getUnitTestsLaunchConfig(): any {
		// TODO: need to be changed to be multiroot capable.
		const launchJsonFile = ".vscode/launch.json";
		const rootFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
		Utility.setRootPath(rootFolder);	// TODO: maybe I find a better place to set it.
		const launchPath = Utility.getAbsFilePath(launchJsonFile);
		const launchData = readFileSync(launchPath, 'utf8');
		const parseErrors: jsonc.ParseError[] = [];
		const launch = jsonc.parse(launchData, parseErrors, {allowTrailingComma: true});

		// Check for error
		if (parseErrors.length > 0) {
			// Error
			throw Error("Parse error while reading " + launchJsonFile + ".");
		}

		// Find the right configuration
		let configuration;
		for (const config of launch.configurations) {
			if (config.unitTests) {
				// Check if there is already unit test configuration:
				// Only one is allowed.
				if (configuration)
					throw Error("More than one unit test launch configuration found. Only one is allowed.");
				configuration = config;
			}
		}


		// Load user list and labels files
		if (!configuration) {
			// No configuration found, Error
			throw Error('No unit test configuration found in ' + launchPath + '.');
		}

		// Change path to absolute path
		const listFiles = Settings.GetAllAssemblerListFiles(configuration);
		if (!listFiles) {
			// No list file given: Error
			throw Error('No list file given in unit test configuration.');
		}
		for (let listFile of listFiles) {
			const path = listFile.path;
			listFile.path = Utility.getAbsFilePath(path);
		}

		return configuration;
	}


	/**
	 * Checks if the debugger is active. If yes terminates it ..
	 */
	protected static async terminateEmulator(): Promise<void> {
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
				if (time >= 5.0) {
					// Give up
					vscode.window.showErrorMessage('Could not terminate active debug session. Please try manually.');
					resolve();
					return true;
				}
				// Check for active debug session
				if (vscode.debug.activeDebugSession)
					return false;  // Try again
				resolve();
				return true;  // Stop
			});
		});
	}


	/**
 	* Start the unit tests, either partial or full.
 	* If unit test cases are run (opposed to debugged) the vscode UI is not used
 	* and communication takes place directly with the emulator.
 	*/
	protected static async runTests(): Promise<void> {
		try {
			// Mode
			//this.debug = false;
			//this.cancelled = false;

			// Get unit test launch config
			const configuration = this.getUnitTestsLaunchConfig();

			// Setup settings
			const rootFolder = Utility.getRootPath();
			Settings.Init(configuration, rootFolder);
			Settings.CheckSettings();

			// Reset all decorations
			//Decoration.clearAllDecorations();

			// Create the registers
			Z80RegistersClass.createRegisters();

			// Start emulator.
			RemoteFactory.createRemote(configuration.remoteType);

			// Check if a cpu history object has been created. (Note: this is only required for debug but done for both)
			if (!(CpuHistory as any)) {
				// If not create a lite (step) history
				CpuHistoryClass.setCpuHistory(new StepHistoryClass());
				StepHistory.decoder = Z80Registers.decoder;
			}

			// Reads the list file and also retrieves all occurrences of WPMEM, ASSERTION and LOGPOINT.
			Labels.init(configuration.smallValuesMaximum);
			Remote.readListFiles(configuration);

			return new Promise<void>((resolve, reject) => {
				// Events
				Remote.once('initialized', async () => {
					try {
						// Initialize Cpu- or StepHistory.
						StepHistory.init();  // might call the socket

						// Execute command to enable wpmem, logpoints, assertions.
						await Remote.enableLogpointGroup(undefined, true);
						try {
							await Remote.enableWPMEM(true);
						}
						catch (e) {
							// It's not essential anymore to have watchpoints running.
							// So catch this error from CSpect and show a warning instead
							vscode.window.showWarningMessage(e.message);
						}
						await Remote.enableAssertionBreakpoints(true);

						//await Z80UnitTests.initUnitTests();

						// Load the initial unit test routine (provided by the user)
						//await this.execAddr(Z80UnitTests.addrStart);

						// End
						resolve();
					}
					catch (e) {
						// Some error occurred
						//Z80UnitTests.stopUnitTests(undefined, e.message);// TODO
						reject(e);
					}
				});

				Remote.on('coverage', coveredAddresses => {
					// Cache covered addresses (since last unit test)
					//Z80UnitTests.lastCoveredAddresses = coveredAddresses;
					/*
					if (!Z80UnitTests.lastCoveredAddresses)
						Z80UnitTests.lastCoveredAddresses = new Set<number>();
					coveredAddresses.forEach(Z80UnitTests.lastCoveredAddresses.add, Z80UnitTests.lastCoveredAddresses);
					*/
				});

				Remote.on('warning', message => {
					// Some problem occurred
					vscode.window.showWarningMessage(message);
				});

				Remote.on('debug_console', message => {
					// Show the message in the debug console
					vscode.debug.activeDebugConsole.appendLine(message);

				});

				Remote.once('error', e => {
					// Some error occurred
					//Z80UnitTests.stopUnitTests(undefined, err.message); // TODO
					reject(e);
				});


				// Connect to debugger.
				Remote.init().catch(e => {
					// Some error occurred
					//Z80UnitTests.stopUnitTests(undefined, e.message);// TODO
					reject(e);
				});
			});
		}
		catch (e) {
			// Some error occurred
			//Z80UnitTests.stopUnitTests(undefined, e.message);// TODO
		}
	}



	/**
	 * Executes the sub routine (to test) at 'address'.
	 * Gets all registers and set them before hand.
	 * Writes "call addr" to the stack, puts a breakpoint at the return address,
	 * increments sp accordingly and starts the remote at address.
	 * Returns if a breakpoint is hit.
	 * Either the one at return address or any other (assertion) which would be a failed test case.
	 * @param address The (long) address of the unit test. // TODO: really long address?
	 * @param sp Stack pointer. Needs to give room for "call addr".
	 * @param a Register A
	 * @param a Register F
	 * @param a Register BC
	 * @param a Register DE
	 * @param a Register HL
	 */
	protected static async execAddr(address: number, sp: number, a: number, f: number, bc: number, de: number, hl: number): Promise<void> {
		const da: DebugSessionClass = undefined as any;
		// Create machine code to call the tested subroutine at SP address
		// Use 4 bytes
		const call = new Uint8Array([0xCD /*CALL*/, address & 0xFF, address >>> 8, 0x00 /*NOP*/]);	// "CALL address : NOP"
		sp -= 4;

		await Remote.writeMemoryDump(sp, call);
		// Set slot/bank to Unit test address
		const bank = Z80Registers.getBankFromAddress(address);
		if (bank >= 0) {
			const slot = Z80Registers.getSlotFromAddress(address)
			await Remote.setSlot(slot, bank);
		}
		// Set PC
		await Remote.setRegisterValue("PC", sp);	// Start at "CALL addr"
		// Set other registers
		await Remote.setRegisterValue("A", a);
		await Remote.setRegisterValue("F", f);
		await Remote.setRegisterValue("BC", bc);
		await Remote.setRegisterValue("DE", de);
		await Remote.setRegisterValue("HL", hl);

		// Remember end address as success address (if bp is reached here the test case succeeds)
		const successAddr = sp + 3;


		// Init
		StepHistory.clear();
		await Remote.getRegistersFromEmulator();
		await Remote.getCallStackFromEmulator();

		// Special handling for zsim: Re-init custom code.
		if (Remote instanceof ZSimRemote) {
			const zsim = Remote as ZSimRemote;
			zsim.customCode?.reload();
		}

		// Run or Debug
		await TestRunner.RemoteContinue(da);

		// Check pc
		await Remote.getRegistersFromEmulator();
		const pc = Remote.getPC();
		if (pc != successAddr) {
			// Some failure
			throw Error("Test case did not finish. Maybe some error occurred.");	// TODO: Get better info from Remote.
		}
	}


	/**
	 * Starts Continue directly or through the debug adapter.
	 */
	protected static async RemoteContinue(da: DebugSessionClass | undefined): Promise<void> {
		// Check if cancelled
		//if (Z80UnitTests.cancelled) // TODO: ?
		//	return;
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
			return new Promise<void>((resolve, reject) => {
				// Start timeout
				const timerId: NodeJS.Timeout = setTimeout(() => {
					const error = new Error('Timeout');
					reject(error);
				}, 3000);	// 3 secs timeout
				// Run: Continue
				Remote.continue().then(() => {
					clearTimeout(timerId);
					Remote.stopProcessing();
					resolve();
				});
			});
		}
	}


	/**
	 * A break occurred. E.g. the test case stopped because it is finished
	 * or because of an error (ASSERTION).
	 * @param debugAdapter The debugAdapter (in debug mode) or undefined for the run mode.
	 */
	// TODO: remove
/*
	protected static onBreak(debugAdapter?: DebugSessionClass) {
		// The program was run and a break occurred.
		// Get current pc
		//Remote.getRegisters().then(() => {
		// Parse the PC value
		const pc = Remote.getPCLong();
		//const sp = Z80Registers.parseSP(data);
		// Check if test case was successful
		Z80UnitTests.checkUnitTest(pc, debugAdapter);
		// Otherwise another break- or watchpoint was hit or the user stepped manually.
		//});
	}
*/


	/**
	 * Checks if the test case was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 * @param pc The program counter to check.
	 */
	/*
	protected static async checkUnitTest(pc: number, da?: DebugSessionClass): Promise<void> {
		// Check if it was a timeout
		let timeoutFailure = !Z80UnitTests.debug;
		if (Z80UnitTests.timeoutHandle) {
			// Clear timeout
			clearTimeout(Z80UnitTests.timeoutHandle);
			Z80UnitTests.timeoutHandle = undefined;
			timeoutFailure = false;
		}

		// Check if test case ended successfully or not
		if (pc != this.addrTestReadySuccess) {
			// Undetermined. Test case not ended yet.
			// Check if in debug or run mode.
			if (da) {
				// In debug mode: Send break to give vscode control
				await da.sendEventBreakAndUpdate();  // No need for 'await'
				return;
			}
			// Count failure
			if (!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed++;
			}
		}

		// Check if this was the init routine that is started
		// before any test case:
		if (!Z80UnitTests.utLabels) {
			// Use the test case list
			Z80UnitTests.utLabels = Z80UnitTests.partialUtLabels!;
			// Error check
			if (!Z80UnitTests.utLabels || Z80UnitTests.utLabels.length == 0) {
				// No unit tests found -> disconnect
				Z80UnitTests.stopUnitTests(da, "Couldn't start unit tests. No unit tests found. Unit test labels should start with 'UT_'.");
				return;
			}
			// Check if we break on the first unit test.
			if (Z80UnitTests.debug && !Settings.launch.startAutomatically) {
				const firstLabel = Z80UnitTests.utLabels[0];
				const firstAddr = Labels.getNumberForLabel(firstLabel) as number;
				if (firstAddr == undefined) {
					// Error
					Z80UnitTests.stopUnitTests(da, "Couldn't find address for first unit test label '" + firstLabel + "'.");
					return;
				}
				const firstUtBp: RemoteBreakpoint = {bpId: 0, filePath: '', lineNr: -1, address: firstAddr, condition: '', log: undefined};
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
		if (!tcSuccess) {
			if (!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed++;
			}
		}

		// Get the test case label.
		const label = Z80UnitTests.utLabels[0];

		// In debug mode do break after one step. The step is required to put the PC at the right place.
		if (da && !tcSuccess) {
			// Do some additional output.
			if (Z80UnitTests.utLabels) {
				if (pc == this.addrTestReadySuccess)
					Z80UnitTests.dbgOutput(label + ' PASSED.');
			}
			return;
		}

		// Determine test case result.
		let tcResult: TestCaseResult = TestCaseResult.TIMEOUT;
		if (!timeoutFailure) {
			// No timeout
			tcResult = (Z80UnitTests.currentFail) ? TestCaseResult.FAILED : TestCaseResult.OK;
		}

		// Send result to calling extension (i.e. test adapter)
		const resolveFunction = Z80UnitTests.testCaseMap.get(label);
		if (resolveFunction) {
			// Inform calling party
			resolveFunction(tcResult);
			// Delete from map
			Z80UnitTests.testCaseMap.delete(label);
		}

		// Print test case name, address and result.
		let tcResultStr;
		switch (tcResult) {
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
			const target = Z80UnitTests.allCoveredAddresses;
			Z80UnitTests.lastCoveredAddresses.forEach(target.add, target);
			Z80UnitTests.lastCoveredAddresses = undefined as any;
		}

		// Next unit test
		Z80UnitTests.utLabels.shift();
		if (Z80UnitTests.utLabels.length == 0) {
			// End the unit tests
			Z80UnitTests.dbgOutput("All tests ready.");
			Z80UnitTests.stopUnitTests(da);
			Z80UnitTests.unitTestsFinished();
			return;
		}
		Z80UnitTests.nextUnitTest(da);
	}
*/

}

