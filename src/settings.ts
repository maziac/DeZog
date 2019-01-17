import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Utility } from './utility';
import * as path from 'path';

/**
 * together with a boolean variable to tell (true) if the referenced files should be used and a filter string to allow
 * list files from not supported assemblers.
 */
export interface ListFile {
	/// The path to the file.
	path: string;

	/// Path to the main assembler source file that was used to produce the .list file.
	/// For 'z80asm' the name can be extracted automatically, for 'sjasmplus' and 'z88dk'
	/// you can provide the source file here.
	mainFile: string;

	/// If defined the files referenced in the list file will be used for stepping otherwise the list file itself will be used.
	/// The path(s) here are relative to the 'rootFolder'.
	/// It is also possible to add several paths. Files are checked one after the other: first sources path, second sources path, ... last sources path.
	srcDirs: Array<string>;

	/// An optional filter string that is applied to the list file when it is read. Used to support z88dk list files.
	filter:string|undefined;

	/// Used assembler: "z80asm" (default), "z88dk" or "sjasmplus".
	/// The list file is read differently. Especially the includes are handled differently.
	asm: string;

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


/// Used to configure the logging.
export interface LogDestinations {
	/// Determines if the output should go to vscode.
	channelOutputEnabled: boolean;

	/// If given, the log is additionally put to the givn file.
	filePath: string|undefined;
}


/**
 * See also package.json.
 * The configuration parameters for the zesarux debugger.
 */
export interface SettingsParameters extends DebugProtocol.LaunchRequestArguments  {
	/// The Zesarux ZRCP telnet host name
	zhostname: string;

	/// The Zesarux ZRCP telnet port
	zport: number;

	/// The path of the root folder. All other paths are relative to this. Ususally = ${workspaceFolder}
	rootFolder: string;

	/// The paths to the .list files.
	listFiles: Array<ListFile>;

	/// The paths to the .labels files.
	labelsFiles: Array<string>;

	/// Interpretes labels as address if value is bigger. Typically this is e.g. 512. So all numbers below are not treated as addresses if shown. So most constant values are covered with this as they are usually smaller than 512. Influences the formatting.
	smallValuesMaximum: number;

	/// These arguments are passed to the disassembler (z80dismblr arguments).
	disassemblerArgs: {esxdosRst: boolean};

	/// A directory for temporary files created by this debug adapter. E.g. ".tmp"
	tmpDir: string;

	/// label or address which is above the topmost entry on the stack. It is used to determine the end of the call stack.
	topOfStack: string;

	/// If defined the path to a snapshot (or tap) file to load at startup
	load: string;

	/// Start automatically after launch.
	startAutomatically: boolean;

	/// Resets the cpu (on emulator) after starting the debugger.
	resetOnLaunch: boolean;

	/// An array with commands that are executed after the program-to-debug is loaded.
	commandsAfterLaunch: Array<string>;

	/// ZEsarUX setting. If enabled steps over the interrupt.
	skipInterrupt: boolean;

	/// Holds the formatting vor all values.
	formatting: Formatting;

	/// Values for the memory viewer.
	memoryViewer: {
		addressColor: string;	// The text color of the address field.
		bytesColor: string;	// The color of the bytes (hex values).
		asciiColor: string;	// The text color of the ascii field.
		addressHoverFormat: string;	// Format for the address when hovering.
		valueHoverFormat: string;	// Format for the value when hovering.
		registerPointerColors: Array<string>;	// The register/colors to show as colors in the memory view.

		registersMemoryView: Array<string>;	// An array of register to show in the register memory view.
	}

	/// Tab size used in formatting.
	tabSize: number;

	/// The socket timeout in seconds.
	socketTimeout: number;

	/// General logs.
	log: LogDestinations;

	// Logging of the socket.
	logSocket: LogDestinations;
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
				listFiles: <any>undefined,
				labelsFiles: <any>undefined,
				smallValuesMaximum: <any>undefined,
				disassemblerArgs: <any>undefined,
				tmpDir: <any>undefined,
				topOfStack: <any>undefined,
				load: <any>undefined,
				startAutomatically: <any>undefined,
				resetOnLaunch: <any>undefined,
				commandsAfterLaunch: <any>undefined,
				skipInterrupt: <any>undefined,
				formatting: <any>undefined,
				memoryViewer: <any>undefined,
				tabSize: <any>undefined,
				socketTimeout: <any>undefined,
				log: <any>undefined,
				logSocket: <any>undefined
			}
		}

		// Check for default values (for some reasons the default values from the package.json are not used)
		if(!Settings.launch.zhostname)
			Settings.launch.zhostname = 'localhost';
		if(!Settings.launch.zport)
			Settings.launch.zport = 10000;
		if(!Settings.launch.rootFolder)
			Settings.launch.rootFolder = rootFolder;
		if(Settings.launch.listFiles)
			Settings.launch.listFiles = Settings.launch.listFiles.map(fp => {
				// ListFile structure
				const file = {
					path: Utility.getAbsFilePath(fp.path),
					mainFile: fp.mainFile,
					srcDirs: fp.srcDirs || [""],
					filter: fp.filter,
					asm: fp.asm || "z80asm",
					addOffset: fp.addOffset || 0
				};
				// Add the root folder path to each.
				const srcds = file.srcDirs.map(srcPath => path.join(Settings.launch.rootFolder, srcPath));
				file.srcDirs = srcds;
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
		if(Settings.launch.load)
			Settings.launch.load = Utility.getAbsFilePath(Settings.launch.load);
		else
			Settings.launch.load = '';
		if(Settings.launch.tmpDir == undefined)
			Settings.launch.tmpDir = '.tmp';
		Settings.launch.tmpDir = Utility.getAbsFilePath
		(Settings.launch.tmpDir);
		if(isNaN(Settings.launch.smallValuesMaximum))
			Settings.launch.smallValuesMaximum = 512;
		if(Settings.launch.disassemblerArgs == undefined)
			Settings.launch.disassemblerArgs = {esxdosRst: false};
		if(!Settings.launch.disassemblerArgs.hasOwnProperty("esxdosRst"))
			Settings.launch.disassemblerArgs.esxdosRst = false;
		if(Settings.launch.startAutomatically == undefined)
			Settings.launch.startAutomatically = false;
		if(Settings.launch.resetOnLaunch == undefined)
			Settings.launch.resetOnLaunch = true;
		if(Settings.launch.commandsAfterLaunch == undefined)
			Settings.launch.commandsAfterLaunch = [];
		if(Settings.launch.skipInterrupt == undefined)
			Settings.launch.skipInterrupt = false;
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
			Settings.launch.formatting.arrayByte = "${b@:hex}h\t${b@:unsigned}u\t${b@:signed}i\t'${b@:char}'\t${b@:bits}b\t${{:labels|, |}}";
		if(!Settings.launch.formatting.arrayWord)
			Settings.launch.formatting.arrayWord = "${w@:hex}h\t${w@:unsigned}u\t${w@:signed}i\t${{:labels|, |}}";
		if(!Settings.launch.formatting.stackVar)
			Settings.launch.formatting.stackVar = "${hex}h\t${unsigned}u\t${signed}i\t${{{:labels|, |}}";
		if(!Settings.launch.tabSize)
			Settings.launch.tabSize = 6;
		if(!Settings.launch.socketTimeout)
			Settings.launch.socketTimeout = 5;	///< 5 secs

		// Memory viewer
		if(!Settings.launch.memoryViewer) {
			Settings.launch.memoryViewer = {
				addressColor: "CornflowerBlue",
				bytesColor: "white",
				asciiColor: "OliveDrab",
				addressHoverFormat: "${hex}h${\n:labelsplus|\n}",
				valueHoverFormat: "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}",
				registerPointerColors: [
					"HL", "darkgreen",
					"DE", "darkcyan",
					"BC", "dimgray",
					"IX", "darkorange",
					"IY", "darkviolet"
				],
				registersMemoryView: [
					"HL", "DE", "BC", "IX", "IY"
				]
			};
		}

		if(!Settings.launch.log)
			Settings.launch.log = {channelOutputEnabled: false, filePath: undefined};
		if(!Settings.launch.logSocket)
			Settings.launch.logSocket = {channelOutputEnabled: false, filePath: undefined};
	}
}

