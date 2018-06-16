import { DebugProtocol } from 'vscode-debugprotocol';
import { Utility } from './utility';


/**
 * together with a boolean variable to tell (true) if the referenced files should be used and a filter string to allow alternative list files. If 'useLabels' is true the labels are also taken from this file.
 */
export interface ListFile {
	/// The path to the file.
	path: string;
	// If true  the referenced files should be used for stepping (not the list file itself)
	useFiles: boolean;
	// An optional filter stringthat is applied to the list file when it is read. Used to support z88dk list files.
	filter:string|undefined;
	/// If true labels are also read from the list file.
	useLabels: boolean;

	/// To add an offset to each address in the .list file. Could be used if the addresses in the list file do not start at the ORG (as with z88dk).
	addOffset: number;
}


export interface Formatting {
	/// Format how the registers are displayed in the VARIABLES area.
	/// Is an array with 2 strings tupels. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerVar:  Array<string>;

	/// Format how the registers are displayed when hovering with the mouse.
	/// Is an array with 2 strings tupels. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerHover: Array<string>;

	/// The general formatting for address labels bigger than 'smallValuesMaximum'.
	bigValues: string;

	/// The general formatting for small values like constants smaller/equal than 'smallValuesMaximum'.
	smallValues: string;

	/// The 'byte' formatting for labels in the WATCHES area.
	arrayByte: string;

	/// The 'word' formatting for labels in the WATCHES area.
	arrayWord: string;

	/// Format for the pushed values in the STACK area.
	stackVar: string;


}

/**
 * See also package.json.
 * The configuration parameters for the zesarux debugger.
 */
export interface SettingsParameters extends DebugProtocol.LaunchRequestArguments  {
	zhostname: string;	/// The Zesarux ZRCP telnet host name
	zport: number;	/// The Zesarux ZRCP telnet port

	rootFolder: string;	/// The path of the root folder. All other paths are relative to this. Ususally = ${workspaceFolder}

	disassemblies: Array<Array<number>>;	/// Contains start/size tuples for all memory areas that should be disassembled

	listFiles: Array<ListFile>;	/// The paths to the .list files.
	labelsFiles: Array<string>;	/// The paths to the .labels files.

	smallValuesMaximum: number;	/// Interpretes labels as address if value is bigger. Typically this is e.g. 512. So all numbers below are not treated as addresses if shown. So most constant values are covered with this as they are usually smaller than 512. Influences the formatting.

	tmpDir: string;	/// A directory for temporary files created by this debug adapter. E.g. ".tmp"

	topOfStack: string;	/// label or address which is above the topmost entry on the stack. It is used to determine the end of the call stack.

	loadSnap: string;	/// If defined the path to a snapshot file to load at startup

	startAutomatically: boolean;	/// Start automatically after launch.

	skipInterrupt: boolean;		/// ZEsarUX setting. If enabled steps over the interrupt.

	/// Holds the formatting vor all values.
	formatting: Formatting;

	/// Values for the memory viewer.
	memoryViewer: {
		addressColor: string;	// The text color of the address field.
		asciiColor: string;	// The text color of the ascii field.
		addressHoverFormat: string;	// Format for the address when hovering.
		valueHoverFormat: string;	// Format for the value when hovering.
		registerPointerColors: Array<string>;	// The register/colors to show as colors in the memory view.

		registersMemoryView: Array<string>;	// An array of register to show in the register memory view.
	}

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
	/// All relative paths are expanded with the 'rootFolder' path.
	static Init(launchCfg: SettingsParameters, rootFolder: string) {
		Settings.launch = launchCfg;
		if(!Settings.launch) {
			Settings.launch = {
				zhostname: <any>undefined,
				zport: <any>undefined,
				rootFolder: <any>undefined,
				disassemblies: <any>undefined,
				listFiles: <any>undefined,
				labelsFiles: <any>undefined,
				smallValuesMaximum: <any>undefined,
				tmpDir: <any>undefined,
				topOfStack: <any>undefined,
				loadSnap: <any>undefined,
				startAutomatically: <any>undefined,
				skipInterrupt: <any>undefined,
				formatting: <any>undefined,
				memoryViewer: <any>undefined,
				tabSize: <any>undefined,
				trace: <any>undefined
			}
		}

		// Check for default values (for some reasons the default values from the package.json are not used)
		if(!Settings.launch.zhostname)
			Settings.launch.zhostname = 'localhost';
		if(!Settings.launch.zport)
			Settings.launch.zport = 10000;
		if(!Settings.launch.rootFolder)
			Settings.launch.rootFolder = rootFolder;
		if(!Settings.launch.disassemblies)
			Settings.launch.disassemblies = [];
		if(Settings.launch.listFiles)
			Settings.launch.listFiles = Settings.launch.listFiles.map(fp => {
				let file: ListFile;
				if(typeof fp === 'string') {
					// simple string
					file = {path: Utility.getAbsFilePath(fp), useFiles: false, filter: undefined, useLabels: true, addOffset: 0};
				}
				else {
					// ListFile structure
					file = {
						path: Utility.getAbsFilePath(fp.path),
						useFiles: (fp.useFiles) ? fp.useFiles : false,
						filter: fp.filter,
						useLabels: (fp.useLabels) ? fp.useLabels : true,
						addOffset: (fp.addOffset) ? fp.addOffset : 0
					};
				}
				return file;
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
		if(isNaN(Settings.launch.smallValuesMaximum))
			Settings.launch.smallValuesMaximum = 512;
		if(Settings.launch.startAutomatically == undefined)
			Settings.launch.startAutomatically = true;
		if(Settings.launch.skipInterrupt == undefined)
			Settings.launch.skipInterrupt = false;
		if(Settings.launch.trace == undefined)
			Settings.launch.trace = false;
		if(!Settings.launch.formatting)
			Settings.launch.formatting = {
				registerVar: <any>undefined,
				registerHover: <any>undefined,
				bigValues: <any>undefined,
				smallValues: <any>undefined,
				arrayByte: <any>undefined,
				arrayWord: <any>undefined,
				stackVar: <any>undefined,
			};
		if(!Settings.launch.formatting.registerVar)
			Settings.launch.formatting.registerVar = [
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
		if(!Settings.launch.formatting.registerHover)
			Settings.launch.formatting.registerHover = [
				"AF", "A: ${hex}h, F: ${flags}",
				"AF'", "A': ${hex}h, F': ${flags}",
				"PC", "${name}: ${hex}h${\n:labelsplus|\n}",
				"SP", "${name}: ${hex}h${\n:labelsplus|\n}",
				"..", "${hex}h, ${unsigned}u, ${signed}i\n${\n:labelsplus|\n}\n(${hex}h)b=${b@:unsigned}, (${hex}h)w=${w@:unsigned}",
				"R", "${name}: ${unsigned}u",
				"I", "${name}: ${hex}h",
				".", "${name}: ${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
			];
		if(!Settings.launch.formatting.bigValues)
			Settings.launch.formatting.bigValues = "(${hex}h)b=${b@:unsigned}/'${b@:char}', (${hex}h)w=${w@:unsigned}";
		if(!Settings.launch.formatting.smallValues)
			Settings.launch.formatting.smallValues = "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}";
		if(!Settings.launch.formatting.arrayByte)
			Settings.launch.formatting.arrayByte = "${b@:hex}h\t${b@:unsigned}u\t${b@:signed}i\t'${char}'\t${b@:bits}b\t${{:labels|, |}}";
		if(!Settings.launch.formatting.arrayWord)
			Settings.launch.formatting.arrayWord = "${w@:hex}h\t${w@:unsigned}u\t${w@:signed}i\t${{:labels|, |}}";
		if(!Settings.launch.formatting.stackVar)
			Settings.launch.formatting.stackVar = "${hex}h\t${unsigned}u\t${signed}i\t${{{:labels|, |}}";
		if(!Settings.launch.tabSize)
			Settings.launch.tabSize = 6;

		// Memory viewer
		if(!Settings.launch.memoryViewer) {
			Settings.launch.memoryViewer = {
				addressColor: "CornflowerBlue",
				asciiColor: "OliveDrab",
				addressHoverFormat: "${hex}h${\n:labelsplus|\n}",
				valueHoverFormat: "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}",
				registerPointerColors: [
					"HL", "darkgreen",
					"DE", "blue",
					"IX", "green",
					"IY", "red"
				],
				registersMemoryView: [
					"HL", "DE", "IX", "IY"
				]
			};
		}

	}
}

