import { DebugProtocol } from 'vscode-debugprotocol';
import { Utility } from './utility';


/**
 * See also package.json.
 * The configuration parameters for the zesarux debugger.
 */
export interface SettingsParameters extends DebugProtocol.LaunchRequestArguments  {
	zhostname: string;	/// The Zesarux ZRCP telnet host name
	zport: number;	/// The Zesarux ZRCP telnet port

	rootFolder: string;	/// The path of the root folder. All other paths are relative to this. Ususally = ${workspaceFolder}

	disassemblies: Array<Array<number>>;	/// Contains start/size tuples for all memory areas that should be disassembled

	listFiles: Array<{path: string, useFiles: boolean}>;	/// The paths to the .list files together with a boolean variable to tell (true) if the referenced files should be used.
	labelsFiles: Array<string>;	/// The paths to the .labels files.

	disableLabelResolutionBelow: number;	/// Disables the number to label conversion if number is below the given value. E.g. labels below 256 are not resolved.

	tmpDir: string;	/// A directory for temporary files created by this debug adapter. E.g. ".tmp"

	topOfStack: string;	/// label or address which is above the topmost entry on the stack. It is used to determine the end of the call stack.

	loadSnap: string;	/// If defined the path to a snapshot file to load at startup

	startAutomatically: boolean;	/// Start automatically after launch.

	skipInterrupt: boolean;		/// ZEsarUX setting. If enabled steps over the interrupt.

	/// Format how the registers are displayed in the VARIABLES area.
	/// Is an array with 2 strings tupels. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerVarFormat:  Array<string>;

	/// Format how the registers are displayed when hovering with the mouse.
	/// Is an array with 2 strings tupels. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerHoverFormat: Array<string>;

	/// The general formatting for labels in the WATCHES area.
	labelWatchesGeneralFormat: string;

	/// The 'byte' formatting for labels in the WATCHES area.
	labelWatchesByteFormat: string;

	/// The 'word' formatting for labels in the WATCHES area.
	labelWatchesWordFormat: string;

	/// Format for the pushed values in the STACK area.
	stackVarFormat: string;

	/// Tab size used in formatting.
	tabSize: number;

	trace: boolean;		/// Enable logging of the DAP
}


/// Singleton:
/// A class through which the settings can be accessed.
/// I.e. the paramters in launch.json.
export class Settings {
	/// the representation of the launch.json
	public static launch:  SettingsParameters;

	/*
	/// called from InitSingleton only.
	private constructor(launchCfg: SettingsParameters) {
		Settings.launch = launchCfg;
	}
	*/

	/// This has to be set in the launchRequest.
	/// Initializes all values (sets anything that is not set in the json).
	/// All realtive paths are expanded with the 'rootFolder' path.
	static Init(launchCfg: SettingsParameters) {
		Settings.launch = launchCfg;
		// Check for default values (for some reasons the default values from the package.json are not used)
		if(!Settings.launch.zhostname)
			Settings.launch.zhostname = 'localhost';
		if(!Settings.launch.zport)
			Settings.launch.zport = 10000;
		if(!Settings.launch.rootFolder)
			Settings.launch.rootFolder = '';
		if(!Settings.launch.disassemblies)
			Settings.launch.disassemblies = [];
		if(Settings.launch.listFiles)
			Settings.launch.listFiles = Settings.launch.listFiles.map((fp) => {
				return {path: Utility.getAbsFilePath(fp.path), useFiles: fp.useFiles};
			});
		else
			Settings.launch.listFiles = [];
		if(Settings.launch.labelsFiles)
			Settings.launch.labelsFiles = Settings.launch.labelsFiles.map((fp) => Utility.getAbsFilePath(fp));
		else
			Settings.launch.labelsFiles = [];
		if(!Settings.launch.topOfStack)
			Settings.launch.topOfStack = '0x10000';
		if(Settings.launch.loadSnap)
			Settings.launch.loadSnap = Utility.getAbsFilePath(Settings.launch.loadSnap);
		else
			Settings.launch.loadSnap = '';
		if(Settings.launch.tmpDir == undefined)
			Settings.launch.tmpDir = '.tmp';
		Settings.launch.tmpDir = Utility.getAbsFilePath
		(Settings.launch.tmpDir);
		if(isNaN(Settings.launch.disableLabelResolutionBelow))
			Settings.launch.disableLabelResolutionBelow = 256;
		if(Settings.launch.startAutomatically == undefined)
			Settings.launch.startAutomatically = true;
		if(Settings.launch.skipInterrupt == undefined)
			Settings.launch.skipInterrupt = false;
		if(Settings.launch.trace == undefined)
			Settings.launch.trace = false;
		if(!Settings.launch.registerVarFormat)
			Settings.launch.registerVarFormat = [
				"AF", "A: ${hex}h, F: ${flags}",
				"AF'", "A': ${hex}h, F': ${flags}",
				"PC", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"SP", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"HL", "(${hex}h)b=${b@:unsigned}, ${unsigned}u, ${signed}i${, :labelsplus|, }",
				"..", "${hex}h, ${unsigned}u, ${signed}i${, :labelsplus|, }",
				"F", "${flags}",
				"R", "${unsigned}u",
				"I", "${hex}h",
				".", "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}"
			];
		if(!Settings.launch.registerHoverFormat)
			Settings.launch.registerHoverFormat = [
				"AF", "A: ${hex}h, F: ${flags}",
				"AF'", "A': ${hex}h, F': ${flags}",
				"PC", "${name}: ${hex}h${\n:labelsplus|\n}",
				"SP", "${name}: ${hex}h${\n:labelsplus|\n}",
				"..", "${hex}h, ${unsigned}u, ${signed}i\n${\n:labelsplus|\n}\n(${hex}h)b=${b@:unsigned}, (${hex}h)w=${w@:unsigned}",
				"R", "${name}: ${unsigned}u",
				"I", "${name}: ${hex}h",
				".", "${name}: ${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
			];
		if(!Settings.launch.labelWatchesGeneralFormat)
			Settings.launch.labelWatchesGeneralFormat = "(${hex}h)b=${b@:unsigned}/'${b@:char}', (${hex}h)w=${w@:unsigned}";
		if(!Settings.launch.labelWatchesByteFormat)
			Settings.launch.labelWatchesByteFormat = "${b@:hex}h\t${b@:unsigned}u\t${b@:signed}i\t'${char}'\t${b@:bits}b\t${(:labels|, |)}";
		if(!Settings.launch.labelWatchesWordFormat)
			Settings.launch.labelWatchesWordFormat = "${w@:hex}h\t${w@:unsigned}u\t${w@:signed}i\t${(:labels|, |)}";
		if(!Settings.launch.stackVarFormat)
			Settings.launch.stackVarFormat = "${hex}h\t${unsigned}u\t${signed}i\t${(:labels|, |)}";
		if(!Settings.launch.tabSize)
			Settings.launch.tabSize = 6;

	}

}

