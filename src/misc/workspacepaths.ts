import {Settings} from '../settings/settings';
import {UnifiedPath} from './unifiedpath';
import {Utility} from './utility';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';


/**
 * Workspace related file paths: root/extension path, relative/absolute path conversion,
 * tmp/state files and reading of launch.json.
 */
export class WorkspacePaths {

	/// The root path to the project. Used in abs and relative filename functions.
	protected static rootPath: string;

	/// The extension's path.
	protected static extensionPath: string;


	/**
	 * If absFilePath starts with vscode.workspace.rootPath
	 * this part is removed.
	 * @param absFilePath An absolute path
	 * @returns A relative path
	 */
	public static getRelFilePath(absFilePath: string): string {
		// If window paths, then make sure both path start with lower case letters for comparison. rootPath does already.
		let filePath = UnifiedPath.getUnifiedPath(absFilePath);
		let rootPath = WorkspacePaths.rootPath;
		if (rootPath) {
			if (!rootPath.endsWith('/'))
				rootPath += '/';
			const rootArr = rootPath.split('/');
			const fileArr = filePath.split('/');
			let i = 0;
			const len = rootArr.length - 1;
			while (i < len) {
				if (rootArr[i] != fileArr[0])
					break;
				fileArr.shift();	// Remove similar path parts
				i++;
			}
			// Add unmatched dirs
			for (; i < len; i++) {
				fileArr.unshift('..');
			}

			// Reconstruct
			filePath = UnifiedPath.join(...fileArr);
		}
		return filePath;
	}


	/** If relFilePath is a relative path the vscode.workspace.rootPath
	 * path is added.
	 * @param relFilePath A relative path
	 * @returns An absolute path
	 */
	public static getAbsFilePathWoUnify(relFilePath: string, rootPath?: string): string {
		if (UnifiedPath.isAbsolute(relFilePath))
			return relFilePath;
		// Change from relative to absolute
		const usedRootPath = ((rootPath) ?? WorkspacePaths.rootPath) ?? '';
		const filePath = UnifiedPath.joinWounify(usedRootPath, relFilePath);
		return filePath;
	}


	/** If relFilePath is a relative path the vscode.workspace.rootPath
	 * path is added.
	 * @param relFilePath A relative path
	 * @returns An absolute path
	 */
	public static getAbsFilePath(relFilePath: string, rootPath?: string): string {
		if (UnifiedPath.isAbsolute(relFilePath))
			return relFilePath;
		// Change from relative to absolute
		const usedRootPath = ((rootPath) ?? WorkspacePaths.rootPath) ?? '';
		const filePath = UnifiedPath.join(usedRootPath, relFilePath);
		return filePath;
	}


	/**
	 * Looks for a file in the given directories.
	 * If found returns it's absolute file path.
	 * @param srcPath The file to search.
	 * @param srcDirs The (relative) directories to search in.
	 */
	public static getAbsSourceFilePath(srcPath: string, srcDirs: Array<string>) {
		if (UnifiedPath.isAbsolute(srcPath))
			return srcPath;
		// Check all sources directories and try to locate the srcPath file.
		for (let srcDir of srcDirs) {
			const fPath = UnifiedPath.join(srcDir, srcPath);
			const absFPath = WorkspacePaths.getAbsFilePath(fPath);
			if (fs.existsSync(absFPath))
				return absFPath;
		}
		// Not found, return given path
		return srcPath;
	}


	/**
	 * Returns the relative path srcPath is found in.
	 * I.e. searches for srcPath in all srcDirs and returns the path+the src dir.
	 * @param srcPath E.g. "src/main.asm"
	 * @param srcDirs E.g. [ "src", "includes" ]
	 */
	public static getRelSourceFilePath(srcPath: string, srcDirs: Array<string>): string {
		srcPath = UnifiedPath.getUnifiedPath(srcPath);
		if (UnifiedPath.isAbsolute(srcPath))
			return WorkspacePaths.getRelFilePath(srcPath);

		// Check all sources directories and try to locate the srcPath file.
		for (let srcDir of srcDirs) {
			const fPath = UnifiedPath.join(srcDir, srcPath);
			const absFPath = WorkspacePaths.getAbsFilePath(fPath);
			if (fs.existsSync(absFPath))
				return fPath;
		}
		// Not found, return given path
		return srcPath;
	}


	/**
	 * Returns the file path of a file in the tmp dir.
	 * @param fileName E.g. "state0.bin"
	 * @returns The relative file path, e.g. ".tmp/state0.bin".
	 */
	public static getRelTmpFilePath(fileName: string): string {
		const relFilePath = UnifiedPath.join(Settings.launch.tmpDir, fileName);
		return relFilePath;
	}


	/**
	 * Returns the file path of a state filename. Used for
	 * saving/loading the state.
	 * @param stateName A state name that is appended, e.g. "0"
	 * @returns The abs file path, e.g. "/Volumes/.../.tmp/state_0.bin".
	 */
	public static getAbsStateFileName(stateName: string): string {
		const fPath = UnifiedPath.join('states', stateName)
		const relPath = WorkspacePaths.getRelTmpFilePath(fPath);
		return WorkspacePaths.getAbsFilePath(relPath);
	}


	/**
	 * Sets the root path for absolute and relative file functions.
	 * @param rootPath What e.g. vscode.workspace.rootPath would return
	 */
	public static setRootPath(rootPath: string) {
		Utility.assert(rootPath);
		(WorkspacePaths.rootPath as any) = UnifiedPath.getUnifiedPath(rootPath);
	}


	/**
	 * Returns the root path.
	 * @param rootPath Must be set beforehand via setRootPath.
	 */
	public static getRootPath(): string {
		return WorkspacePaths.rootPath;
	}


	/**
	 * Sets the extension's path.
	 * @param extPath Set this on activation.
	 */
	public static setExtensionPath(extPath: string) {
		WorkspacePaths.extensionPath = UnifiedPath.getUnifiedPath(extPath);
	}


	/**
	 * Returns the extension's path.
	 * @return The path.
	 */
	public static getExtensionPath() {
		return WorkspacePaths.extensionPath;
	}


	/** Escapes special characters in a file path for safe usage in glob patterns or regex.
	 * @param path The file path to escape.
	 * @returns The escaped file path.
	 */
	public static escapePathForGlob(path: string): string {
		return path.replace(/([*?[\]{}()!])/g, '\\$1');
	}


	/**
	 * Static function to get the launch.json path.
	 * @param wsFolder Path to the workspace folder.
	 * @returns The complete path, adding '.vscode/launch.json'.
	 */
	public static getLaunchJsonPath(wsFolder: string): string {
		return UnifiedPath.join(wsFolder, '.vscode', 'launch.json');
	}


	/**
	 * Reads a launch.json file and substitutes the variables in it.
	 * E.g. the ${workspaceFolder}.
	 * Note:
	 * These are the possible variable substitutions:
	 * ${workspaceFolder} - the path of the folder opened in VS Code
	 * ${workspaceFolderBasename} - the name of the folder opened in VS Code without any slashes (/)
	 * ${file} - the current opened file
	 * ${fileWorkspaceFolder} - the current opened file's workspace folder
	 * ${relativeFile} - the current opened file relative to workspaceFolder
	 * ${relativeFileDirname} - the current opened file's dirname relative to workspaceFolder
	 * ${fileBasename} - the current opened file's basename
	 * ${fileBasenameNoExtension} - the current opened file's basename with no file extension
	 * ${fileDirname} - the current opened file's dirname
	 * ${fileExtname} - the current opened file's extension
	 * ${cwd} - the task runner's current working directory on startup
	 * ${lineNumber} - the current selected line number in the active file
	 * ${selectedText} - the current selected text in the active file
	 * ${execPath} - the path to the running VS Code executable
	 * ${defaultBuildTask} - the name of the default build task
	 * ${pathSeparator} - the character used by the operating system to separate components in file paths
	 *
	 * Examples:
	 * ${workspaceFolder} - /home/your-username/your-project
	 * ${workspaceFolderBasename} - your-project
	 *
	 * For this here only ${workspaceFolder} and ${workspaceFolderBasename} are substituted.
	 * The others make no sense anyway (i.e. in the context of unit test
	 * where this is used.)
	 * @param launchJsonPath The path to '.vscode/launch.json' is in.
	 * @param launchData (Optional) if the file has been read already it
	 * can be passed here so that it will not be read again.
	 */
	public static readLaunchJson(launchJsonPath: string, launchData?: string): any {
		// Read file
		if (launchData == undefined) {
			launchData = fs.readFileSync(launchJsonPath, 'utf8');
		}

		// Substitute variables
		const dotVscodeFolder = UnifiedPath.dirname(launchJsonPath);
		const workspaceFolder = UnifiedPath.dirname(dotVscodeFolder);
		const workspaceFolderBasename = UnifiedPath.basename(workspaceFolder);

		const substData = launchData.replace(/\${.*}/g, variable => {
			switch (variable) {
				case '${workspaceFolder}':
					return workspaceFolder;
				case '${workspaceFolderBasename}':
					return workspaceFolderBasename;
				default:
					return variable;
			}
		});
		// Parse json
		const parseErrors: jsonc.ParseError[] = [];
		const launch = jsonc.parse(substData, parseErrors, {allowTrailingComma: true});

		// Check for error
		if (parseErrors.length > 0) {
			// Error
			throw Error("Parse error while reading " + launchJsonPath + ".");
		}

		// Return
		return launch;
	}
}
