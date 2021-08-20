import * as vscode from 'vscode';
import {Utility} from '../misc/utility';



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


	/**
	 * Initialize the Tester.
	 */
	public static Initialize() {
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

		// Run the js file to find the tests in the array suiteStack.
		try {
			const testSuite = Utility.require(file.uri!.fsPath);
			const suites = testSuite.suiteStack[0].children;
			for(const suite of suites)
				this.createTestHierarchy(file, suite);
			// Clear diagnostics
			this.diagnostics.delete(file.uri!);
		}
		catch (e) {
			console.log(e);
			// Append to debug console
			let errorText = "Error parsing file '" + file.uri!.fsPath + "'";
			if (e.line != undefined)
				errorText += " at " + e.line + ":" + e.column;
			errorText += ": " + e.message;

			// Add to diagnostics
			const diag = new vscode.Diagnostic(new vscode.Range(e.line-1, e.column, e.line-1, e.column), e.message);
			this.diagnostics.set(file.uri!, [diag]);
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
		const suiteItem = this.controller.createTestItem(suiteId, suite.name, parentTestItem.uri);
		parentTestItem.children.add(suiteItem);

		// Add children
		for (const child of suite.children) {
			// Suite or test case
			if (child.children) {
				// Suite
				this.createTestHierarchy(suiteItem, child);
			}
			else {
				// Test case
				const item = this.controller.createTestItem(suiteId + '.' + child.name, child.name, suiteItem.uri);
				// Add
				suiteItem.children.add(item);
			}
		}
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
				run.failed(test, new vscode.TestMessage(e.message), Date.now() - start);
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
		await Utility.timeout(2000);
	}


	/**
	 * Runs a test case. (Not debug)
	 */
	protected static async runDebugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		// TODO
	}
}

