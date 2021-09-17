import * as vscode from 'vscode';
import {LabelsClass } from '../labels/labels';
import { Settings, SettingsParameters } from '../settings';
import * as jsonc from 'jsonc-parser';
import { readFileSync } from 'fs';
import { Utility } from '../misc/utility';
import * as path from 'path';
import {FileWatcher} from '../misc/filewatcher';
import {UnifiedPath} from '../misc/unifiedpath';


/**
 * An item that represents a unit test and connect the vscode TestItem,
 * the unit test and the file watcher.
 * There are 4 different types of test items:
 * - A test suite representing a launch.json file
 * - A test suite representing a sld/list file
 * - A test suite collecting several unit test (this base class here)
 * - A unit test itself (the UT label)
 * plus the rootSuite which is a suite without parent and testItem references.
 */
export class UnitTestCaseBase {

	// Pointer to the corresponding test item.
	public testItem: vscode.TestItem;

	// A weak map that associates vscode test cases with "real" UnitTestCases.
	public static tcMap = new Map<vscode.TestItem, UnitTestCaseBase>();


	/**
	 * Constructor.
	 * @param id The unique id. File name plus assembly label.
	 * @param label The human readable name of the unit test.
	 * @param filePath An optional file path.
	 */
	constructor(id: string, label: string, filePath?: string) {
		if (id) {
			let uri;
			if (filePath)
				uri = vscode.Uri.file(filePath);
			this.testItem = RootTestSuite.testController.createTestItem(id, label, uri);
			UnitTestCaseBase.tcMap.set(this.testItem, this);
		}
	}


	/**
	 * Returns the "real" UnitTestCase for a vscode test item.
	 */
	public static getUnitTestCase(item: vscode.TestItem): UnitTestCaseBase {
		const ut = UnitTestCaseBase.tcMap.get(item);
		Utility.assert(ut);
		return ut!;
	}


	/**
	 * Searches the parents until it finds the config (UnitTestSuiteConfig)
	 * from the launch.json.
	 * @returns The config test suite or undefined.
	 */
	public getConfigParent(): UnitTestSuiteConfig | undefined {
		let testItem = this.testItem.parent;
		let testConfig;
		while (testItem) {
			// Get "real" test
			testConfig = UnitTestCaseBase.getUnitTestCase(testItem) as UnitTestSuiteConfig;
			Utility.assert(testConfig);
			if (testConfig instanceof UnitTestSuiteConfig) {
				return testConfig;
			}
			// Next
			testItem = testItem.parent;
		}
		return undefined;
	}
}


/**
 * A test case.
 * Additionally contains information for executing the test case, e.g. the label.
 */
export class UnitTestCase extends UnitTestCaseBase {
	// The label for execution. E.g. "TestSuite.UT_clear_screen"
	public utLabel: string;


	/**
	 * Constructor.
	 * @param id The unique id. File name plus assembly label.
	 * @param label The human readable name of the unit test.
	 * @param utLabel The (assembly) label of the unit test.
	 * @param filePath An optional file path.
	 */

	constructor(id: string, label: string, utLabel: string, filePath: string) {
		super(id, label, filePath);
		this.utLabel = utLabel;
	}
}


/**
 * A test suite containing other test suites or test cases.
 */
export class UnitTestSuite extends UnitTestCase {
	// A map that contains children unit tests.
	protected children: Array<UnitTestSuite | UnitTestCaseBase>;

	/**
	 * Constructor.
	 * @param id The unique id. File name plus assembly label.
	 * @param label The human readable name of the unit test.
	 * @param utLabel The (assembly) label of the unit test.
	 * @param filePath An optional file path.
	 */

	constructor(id: string, label: string, utLabel: string, filePath: string) {
		super(id, label, utLabel, filePath);
		this.children = [];
	}


	/**
	 * Adds a child. If necessary removes the child from its old parent.
	 */
	public addChild(child: UnitTestCaseBase) {
	//	child.parent?.removeChild(child);
		this.children.push(child);
	//	child.parent = this;
		// Add vscode item
		this.testItem.children.add(child.testItem);
	}


	/**
	 * Removes a child from the list.
	 */
	public removeChild(child: UnitTestCaseBase) {
		const reducedList = this.children.filter(item => item != child);
		this.children = reducedList;
		// Delete vscode test item
		this.testItem.children.delete(child.testItem.id);
	}


	/**
	 * Delete a test suite and it's children.
	 */
	public delete() {
		this.deleteChildren();
	}

	/**
	 * Deletes all children.
	 * Calls delete on each child.
	 */
	public deleteChildren() {
		// Delete children
		for (const child of this.children) {
			//child.parent = undefined;
			this.testItem.children.delete(child.testItem.id);
		}
		this.children = [];
	}
}


/**
 * The root test suite. Used to hold all other test suites.
 * Is associated with a test controller but not with a test item.
 */
export class RootTestSuite extends UnitTestSuite {
	// Pointer to the test controller.
	public static testController: vscode.TestController;

	// A map that remembers the workspaces/launch json associations
	protected wsTsMap: Map<string, UnitTestSuiteLaunchJson>;

	// A map that remembers the workspaces/file watcher associations
	protected wsFwMap: Map<string, FileWatcher>;


	/**
	 * Constructor.
	 */
	constructor(testController: vscode.TestController) {
		super(undefined as any, undefined as any, undefined as any, undefined as any);
		UnitTestCaseBase.tcMap.clear();
		// A map that remembers the workspaces
		this.wsTsMap = new Map<string, UnitTestSuiteLaunchJson>();
		this.wsFwMap = new Map<string, FileWatcher>();
		RootTestSuite.testController = testController;
		testController.resolveHandler = (testItem) => {
			this.resolveTests(testItem);
		}
	}


	/**
	 * Create the test items.
	 * Due to the nature how the test items are discovered they are all
	 * discovered at once when this function is called first with 'undefined'.
	 * Otherwise it should not be called anymore by vscode.
	 * 'resolveTests' should be called only once. Every test item is populated,
	 * so there is no need to call it anymore afterwards.
	 * If there are changes to the tet cases it will be handled by the file watchers.
	 * @param testItem If undefined create all test cases. Otherwise do nothing.
	 */
	protected resolveTests(testItem: vscode.TestItem|undefined) {
		if (testItem)
			return;
		if (!vscode.workspace.workspaceFolders)
			return;

		// Loop over all workspaces
		this.addWorkspaces(vscode.workspace.workspaceFolders);

		// And observe changes to the workspace
		vscode.workspace.onDidChangeWorkspaceFolders(e => {
			// Add workspaces
			this.addWorkspaces(e.added);
			// Remove workspaces
			for (const ws of e.removed) {
				const wsFolder = ws.uri.fsPath;
				// Delete test suite
				const tsSuite = this.wsTsMap.get(wsFolder)!;
				tsSuite.delete();	// And dispose
				this.wsTsMap.delete(wsFolder);
				// Delete file watcher
				const fw = this.wsFwMap.get(wsFolder)!;
				fw.dispose();
				this.wsFwMap.delete(wsFolder);
			}
		});
	}


	/**
	 * Add workspaces.
	 * A workspace exists in the test controller only if a launch.json exists for it.
	 * @param workspaces A list of workspaces to watch.
	 */
	protected addWorkspaces(workspaces: readonly vscode.WorkspaceFolder[], ) {
		for (const ws of workspaces) {
			// Retrieve all unit test configs
			const wsFolder = ws.uri.fsPath;

			// The test id is at the same time the file name (if test item is a file)
			const filePath = UnitTestSuiteLaunchJson.getlaunchJsonPath(wsFolder);
			const fileWatcher = new FileWatcher(filePath);
			this.wsFwMap.set(wsFolder, fileWatcher)!;
			let wsSuite: UnitTestSuiteLaunchJson;

			fileWatcher.onDidCreate(() => {
				wsSuite = new UnitTestSuiteLaunchJson(wsFolder, path.basename(wsFolder));
				// Add child
				this.addChild(wsSuite);
				// Remember test suite
				this.wsTsMap.set(wsFolder, wsSuite);
			});

			fileWatcher.onDidChange(() => {
				wsSuite.fileChanged();
			});


			fileWatcher.onDidDelete(() => {
				wsSuite.delete();
			});
		}
	}


	/**
	 * Adds a child. If necessary removes the child from its old parent.
	 */
	public addChild(child: UnitTestCaseBase) {
		this.children.push(child);
		// Add vscode item
		RootTestSuite.testController.items.add(child.testItem);
	}


	/**
	 * Removes a child from the list.
	 */
	public removeChild(child: UnitTestCaseBase) {
		const reducedList = this.children.filter(item => item != child);
		this.children = reducedList;
		// Delete vscode test item
		RootTestSuite.testController.items.delete(child.testItem.id);
	}
}


/**
 * Extends the base class with functionality for handling files (file watcher)
 * and especially the launch.json file.
 */
class UnitTestSuiteLaunchJson extends UnitTestSuite {

	/**
	 * Static function to get the launch.json path.
	 * @param wsFolder Path to the workspace folder.
	 * @returns The complete path, adding '.vscode/launch.json'.
	 */
	public static getlaunchJsonPath(wsFolder: string): string {
		return UnifiedPath.join(wsFolder, '.vscode', 'launch.json');
	}


	// The path to the workspace.
	protected wsFolder: string;


	/**
	 * Constructor.
	 * @param wsFolder Workspace folder
	 */

	constructor(wsFolder: string, label: string) {
		super(UnitTestSuiteLaunchJson.getlaunchJsonPath(wsFolder), label, undefined as any, UnitTestSuiteLaunchJson.getlaunchJsonPath(wsFolder));
		this.testItem.description = 'workspace';
		this.wsFolder = wsFolder;
		this.fileChanged();
	}


	/**
	 * Call if launch.json file has been changed.
	 */
	public fileChanged() {
		// Delete all children
		this.deleteChildren();

		// Read launch.json
		try {
			// Get launch configs
			const launchJsonPath = this.testItem.id;
			const configs = this.getUnitTestsLaunchConfigs(launchJsonPath);

			// Loop over all unit test launch configs (usually 1)
			for (const config of configs) {
				// Create new test item
				const testConfig = new UnitTestSuiteConfig(this.wsFolder, config);
				this.addChild(testConfig);
				// Add line number
				const lineNr = config.__lineNr;
				if (lineNr != undefined) {
					const vsTest: vscode.TestItem = testConfig.testItem;
					vsTest.range = new vscode.Range(lineNr, 0, lineNr, 0);
				}
			}
		}
		catch (e) {
			// Ignore, e.g. errors in launch.json
		}
	}


	/**
	 * Returns the unit tests launch configurations. I.e. the configuration
	 * from .vscode/launch.json with property unitTests set to true.
	 * @param launchJsonPath The absolute path to the .vscode/launch.json file.
	 * @returns Array of unit test configs or empty array.
	 * Throws an exception if launch.json cannot be parsed. Or if file does not exist.
	 */
	protected getUnitTestsLaunchConfigs(launchJsonPath: string): any {
		const launchData = readFileSync(launchJsonPath, 'utf8');
		const parseErrors: jsonc.ParseError[] = [];
		const launch = jsonc.parse(launchData, parseErrors, {allowTrailingComma: true});

		// Check for error
		if (parseErrors.length > 0) {
			// Error
			throw Error("Parse error while reading " + launchJsonPath + ".");
		}

		// Find the right configurations
		const configurations = launch.configurations.filter(config => config.unitTests);

		// Find the right lines for the configs, i.e. search for "name": config.name
		for (const config of configurations) {
			const regStr = '"name"\\s*:\\s*"' + config.name + '"';
			const regex = new RegExp(regStr);
			const lineNr = Utility.getLineNumberInText(regex, launchData);
			// Add this additional info
			config.__lineNr = lineNr;
		}

		return configurations;
	}

}


/**
 * Extends the base class with functionality for handling launch.json configs.
 */
export class UnitTestSuiteConfig extends UnitTestSuite {
	// The workspace folder.
	public wsFolder: string;

	// Pointer to the launch.json config
	public config: SettingsParameters;

	// A file watcher for each sld/list file.
	protected fileWatchers: FileWatcher[];

	// Timer for "debouncing"
	protected timerId: NodeJS.Timeout;


	/**
	 * Constructor.
	 * @param wsFolder Workspace folder.
	 * @param config launch.json configuration.
	 */
	constructor(wsFolder: string, config: any) {
		super(wsFolder + '#' + config.name, config.name, undefined as any, UnitTestSuiteLaunchJson.getlaunchJsonPath(wsFolder));
		this.testItem.description = 'config';
		this.wsFolder = wsFolder;
		this.config = Settings.Init(config, wsFolder);
		this.fileWatchers = [];

		// Read launch.json
		try {
			// Get all list files
			const listFiles = Settings.GetAllAssemblerListFiles(this.config);

			// Loop over all list files
			for (const listFile of listFiles) {
				// Create a new file watcher
				const fw = new FileWatcher(listFile.path);
				this.fileWatchers.push(fw);
				fw.onDidCreate(() => {
					this.fileChanged();
				});
				fw.onDidChange(() => {
					this.fileChanged();
				});
				fw.onDidDelete(() => {
					// Note: it might be (if several list files are used) that
					// only one file was deleted.
					// On a build normally all files should be recreated, but
					// in a pathological case one might be removed.
					// In that case parsing would fail.
					this.fileChanged();
				});
			}
		}
		catch (e) {
			// Ignore, e.g. errors in launch.json
		}
	}


	/**
	 * Delete a test item and it's children.
	 * Removes the file watcher.
	 */
	public delete() {
		super.delete();
		// Delete file watchers
		this.fileWatchers.forEach(element => element.dispose());
	}


	/**
	 * Called if a sld/list file changes.
	 * Start a timer to wait for other file changes (changes of other list files).
	 */
	protected fileChanged() {
		// "Debounce" with a timer in case several files are touched at the same time
		clearTimeout(this.timerId);
		this.timerId = setTimeout(() => {
			try {
				this.delayedFileChanged();
			}
			catch (e) {}
		}, 200);
	}


	/**
	 * Called if a sld/list file changed and no change happened for 1 second.
	 * Creates labels from the list files.
	 * From the UT-labels test suites and test cases are created.
	 */
	public delayedFileChanged() {
		// Remove old structures (+ children)
		this.deleteChildren();

		// Read labels from sld/list file
		const labels = new LabelsClass();
		Utility.setRootPath(this.wsFolder);
		try {
			labels.readListFiles(this.config);
		}
		catch (e) {
			console.log(e);
			throw e;
		}
		// Now parse for Unit test labels, i.e. starting with "UT_"
		const utLabels = this.getAllUtLabels(labels);

		// Convert labels into intermediate map
		const map = this.convertLabelsToMap(utLabels);

		// Convert into test suite/cases
		this.createTestSuite(labels, map, '');
	}


	/**
	 * Create a test suite object from the given map.
	 * Calls itself recursively.
	 * @param map A map of maps. An entry with a map of length 0 is a leaf,
	 * i.e. a test case. Others are test suites.
	 */
	protected createTestSuite(labels: LabelsClass, map: Map<string, any>, name: string, parent?: UnitTestSuite) {
		// Check if test suite or test case
		let testItem;
		if (parent) {
			const fullId = parent.testItem.id + '.' + name;
			let fullUtLabel = '';;
			if (parent.utLabel)
				fullUtLabel = parent.utLabel + '.';
			fullUtLabel += name;
			// Get file/line  location
			const location = labels.getLocationOfLabel(fullUtLabel)!;
			let file;
			if (location) {
				file = Utility.getAbsFilePath(location.file);
			}
			// Suite or test case
			if (map.size == 0) {
				// It has no children, it is a leaf, i.e. a test case
				Utility.assert(file);
				testItem = new UnitTestCase(fullId, name, fullUtLabel, file);
			}
			else {
				testItem = new UnitTestSuite(fullId, name, fullUtLabel, file);
			}
			parent.addChild(testItem);
			// Now the location inside the file
			if (location) {
				const vsTest: vscode.TestItem = testItem.testItem;
				vsTest.range = new vscode.Range(location.lineNr, 0, location.lineNr, 0);
			}
		}
		else {
			// Root
			testItem = this;
		}
		for (const [key, childMap] of map) {
			this.createTestSuite(labels, childMap, key, testItem);
		}
	}


	/**
	 * Returns all labels that start with "UT_".
	 * @returns An array with label names.
	 */
	protected getAllUtLabels(labels: LabelsClass): UtLabelFileLine[] {
		const utLabels = labels.getLabelsForRegEx('.*\\bUT_\\w*$', '');	// case sensitive
		// Convert to filenames and line numbers.
		const labelFilesLines: UtLabelFileLine[] = utLabels.map(label => {
			const location = labels.getLocationOfLabel(label)!
			Utility.assert(location, "'getAllUtLabels'");
			return {label, file: Utility.getAbsFilePath(location.file), line: location.lineNr};
		});
		return labelFilesLines;
	}


	/**
	 * Function that converts the string labels in a test suite map structure.
	 * @param lblLocations List of unit test labels.
	 */
	protected convertLabelsToMap(lblLocations: UtLabelFileLine[]): Map<string, any> {
		const labels = lblLocations.map(lblLoc => lblLoc.label);
		const labelMap = new Map<string, any>();
		for (const label of labels) {
			const parts = label.split('.');
			let map = labelMap;
			// E.g. "ut_string" "UTT_byte_to_string"
			for (const part of parts) {
				// Check if entry exists
				let nextMap = map.get(part);
				// Check if already existent
				if (!nextMap) {
					// Create entry
					nextMap = new Map<string, any>();
					map.set(part, nextMap);
				}
				// Next
				map = nextMap;
			}
		}
		/*
		// Note: an entry with a map of length 0 is a leaf, i.e. a testcase. Others are test suites.
		if (labelMap.size == 0) {
			// Return an empty suite
			return undefined;
		}
		*/
		return labelMap;
	}
}


/**
 * This structure is returned by getAllUnitTests.
 */
interface UtLabelFileLine {
	label: string;	// The full label of the test case, e.g. "test.UT_test1"
	file: string;	// The full path of the file
	line: number;	// The line number of the label
}

