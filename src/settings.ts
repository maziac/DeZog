import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Utility } from './misc/utility';
import * as path from 'path';
import * as fs from 'fs';

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

	/// Used assembler: "z80asm", "z88dk" or "sjasmplus" (default).
	/// The list file is read differently. Especially the includes are handled differently.
	asm: string;

	/// To add an offset to each address in the .list file. Could be used if the addresses in the list file do not start at the ORG (as with z88dk).
	addOffset: number;
}


export interface Formatting {
	/// Format how the registers are displayed in the VARIABLES area.
	/// Is an array with 2 strings tuples. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerVar:  Array<string>;

	/// Format how the registers are displayed when hovering with the mouse.
	/// Is an array with 2 strings tuples. The first is an regex that checks the register.
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


/// Definitions for loading the object files.
export interface LoadObj {
	/// The path to one obj file.
	path: string;
	/// The memory address of that file. Can be a label.
	start: string;
}


/// Definitions for the 'zrcp' remote type.
export interface ZrcpType {
	/// The Zesarux ZRCP telnet host name/IP address
	hostname: string;

	/// The Zesarux ZRCP telnet port
	port: number;

	// The delay before loading the Z80 program via smartload.
	loadDelay: number;
}


/// Definitions for the 'zsim' remote type.
export interface ZxSimType {
	/// At the moment only "48k"
	machine: string;

	// The number of interrupts to calculate the average from.
	cpuLoadInterruptRange: number;
}


/// Definitions for the 'serial' remote type.
export interface SerialType {
	/// The baudrate to use.
	baudrate: number;

	/// The port, e.g.  "/dev/tty.usbserial-####" or "COM1"/"COM2"
	port: string;

	/// The load delay. Workaround for using ZEsarUx on Windows.
}


/**
 * See also package.json.
 * The configuration parameters for the zesarux debugger.
 */
export interface SettingsParameters extends DebugProtocol.LaunchRequestArguments {
	/// The remote type: zesarux or zxnext.
	remoteType: string;

	// The special settings for zrcp (ZEsarux).
	zrcp: ZrcpType;

	// The special settings for the onternal Z80 simulator.
	zsim: ZxSimType;

	// The special settings for the serial connection.
	serial: SerialType;

	/// true if the configuration is for unit tests.
	unitTests: false;

	/// The path of the root folder. All other paths are relative to this. Ususally = ${workspaceFolder}
	rootFolder: string;

	/// The paths to the .list files.
	listFiles: Array<ListFile>;

	/// The paths to the .labels files.
	//labelsFiles: Array<string>;

	/// Interprets labels as address if value is bigger. Typically this is e.g. 512. So all numbers below are not treated as addresses if shown. So most constant values are covered with this as they are usually smaller than 512. Influences the formatting.
	smallValuesMaximum: number;

	/// These arguments are passed to the disassembler (z80dismblr arguments).
	disassemblerArgs: {esxdosRst: boolean};

	/// A directory for temporary files created by this debug adapter. E.g. ".tmp"
	tmpDir: string;

	/// label or address which is above the topmost entry on the stack. It is used to determine the end of the call stack.
	topOfStack: string;

	/// label or address to use as start address for program execution if no .sna
	/// file is loaded.
	execAddress: string;

	/// If defined the path to a snapshot (or tap) file to load at startup
	load: string;

	/// If defined the path to a snapshot (or tap) file to load at startup
	loadObjs: Array<LoadObj>;

	/// Start automatically after launch.
	startAutomatically: boolean;

	/// Resets the cpu (on emulator) after starting the debugger.
	resetOnLaunch: boolean;

	/// An array with commands that are executed after the program-to-debug is loaded.
	commandsAfterLaunch: Array<string>;

	/// ZEsarUX setting. If enabled steps over the interrupt.
	skipInterrupt: boolean;

	/// If enabled code coverage information is analyzed and displayed.
	/// Useful especially for unit tests but can be enabled also in "normal" launch configurations.
	history: {
		reverseDebugInstructionCount: number;	// Sets the number of instructions for reverse debugging. If set to 0 then reverse debugging is turned off.
		spotCount: number;	// Sets the number of instructions to show in a spot. If you set this e.g. to 5 then the 5 previous and the 5 next instructions related to the current position are shown.
		codeCoverageEnabled: boolean;	// Enable/disable code coverage.
	}

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

	/// The timeout for any unit test in seconds.
	unitTestTimeout: number;


	// TODO: REMOVE
	debug_wait_before: number,
	debug_wait_after: number
}


/// Singleton:
/// A class through which the settings can be accessed.
/// I.e. the parameters in launch.json.
export class Settings {

	// Maximum number for history spot count.
	protected static MAX_HISTORY_SPOT_COUNT=20;

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
	/// @param utTopOfStackLabel Is set by the unit tests to use a different stack.
	static Init(launchCfg: SettingsParameters, rootFolder: string) {
		Settings.launch = launchCfg;
		if(!Settings.launch) {
			Settings.launch = {
				remoteType: <any>undefined,
				zrcp: <any>undefined,
				zsim: <any>undefined,
				serial: <any>undefined,
				unitTests: <any>undefined,
				rootFolder: <any>undefined,
				listFiles: <any>undefined,
//				labelsFiles: <any>undefined,
				smallValuesMaximum: <any>undefined,
				disassemblerArgs: <any>undefined,
				tmpDir: <any>undefined,
				topOfStack: <any>undefined,
				execAddress: <any>undefined,
				load: <any>undefined,
				loadObjs: <any>undefined,
				startAutomatically: <any>undefined,
				resetOnLaunch: <any>undefined,
				commandsAfterLaunch: <any>undefined,
				skipInterrupt: <any>undefined,
				history: <any>undefined,
				formatting: <any>undefined,
				memoryViewer: <any>undefined,
				tabSize: <any>undefined,
				socketTimeout: <any>undefined,
				unitTestTimeout: <any>undefined,

				// TODO: REMOVE
				debug_wait_before: <any>undefined,
				debug_wait_after: <any>undefined,
			}
		}

		// Check for default values (for some reasons the default values from the package.json are not used)
		if (Settings.launch.unitTests == undefined)
			Settings.launch.unitTests = false;
		const unitTests = Settings.launch.unitTests;

		// zrcp
		if (!Settings.launch.zrcp)
			Settings.launch.zrcp={} as ZrcpType;
		if (Settings.launch.zrcp.hostname==undefined)
			Settings.launch.zrcp.hostname = 'localhost';
		if (Settings.launch.zrcp.port==undefined)
			Settings.launch.zrcp.port=10000;
		if (Settings.launch.zrcp.loadDelay==undefined) {
			const platform=process.platform;
			let delay=0;
			if (platform=='win32')
				delay=500;
			Settings.launch.zrcp.loadDelay=delay;	// ms
		}

		// zsim
		if (!Settings.launch.zsim)
			Settings.launch.zsim={} as ZxSimType;
		if (!Settings.launch.zsim.machine)
			Settings.launch.zsim.machine='48k';
		if (!Settings.launch.zsim.cpuLoadInterruptRange)
			Settings.launch.zsim.cpuLoadInterruptRange=1;

		// serial
		if (!Settings.launch.serial)
			Settings.launch.serial={} as SerialType;
		if (Settings.launch.serial.baudrate==undefined)
			Settings.launch.serial.baudrate=230400;
		if (!Settings.launch.serial.port==undefined)
			Settings.launch.serial.port="/dev/tty.usbserial";

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
					asm: fp.asm || "sjasmplus",
					addOffset: fp.addOffset || 0
				};
				// Add the root folder path to each.
				const srcds = file.srcDirs.map(srcPath => path.join(Settings.launch.rootFolder, srcPath));
				file.srcDirs = srcds;
				return file;
			});
		else
			Settings.launch.listFiles = [];

		/*
		if(Settings.launch.labelsFiles)
			Settings.launch.labelsFiles = Settings.launch.labelsFiles.map((fp) => Utility.getAbsFilePath(fp));
		else
			Settings.launch.labelsFiles = [];
		*/

		if(!Settings.launch.topOfStack)
			Settings.launch.topOfStack = '0x10000';
		if(unitTests)
			Settings.launch.topOfStack = 'UNITTEST_STACK';

		if(Settings.launch.load)
			Settings.launch.load = Utility.getAbsFilePath(Settings.launch.load);
		else
			Settings.launch.load = '';

		if(!Settings.launch.loadObjs)
			Settings.launch.loadObjs = [];
		for(let loadObj of Settings.launch.loadObjs) {
			if(loadObj.path)
				loadObj.path = Utility.getAbsFilePath(loadObj.path);
			else
				loadObj.path = '';
		}

		if(Settings.launch.tmpDir == undefined)
			Settings.launch.tmpDir = '.tmp';
		Settings.launch.tmpDir = Utility.getAbsFilePath
		(Settings.launch.tmpDir);
		if(isNaN(Settings.launch.smallValuesMaximum))
			Settings.launch.smallValuesMaximum = 255;
		if(Settings.launch.disassemblerArgs == undefined)
			Settings.launch.disassemblerArgs = {esxdosRst: false};
		if(!Settings.launch.disassemblerArgs.hasOwnProperty("esxdosRst"))
			Settings.launch.disassemblerArgs.esxdosRst = false;
		if(Settings.launch.startAutomatically == undefined)
			Settings.launch.startAutomatically = (unitTests) ? false : false;
		if(Settings.launch.resetOnLaunch == undefined)
			Settings.launch.resetOnLaunch = true;
		if(Settings.launch.commandsAfterLaunch == undefined)
			Settings.launch.commandsAfterLaunch = [];
		if(Settings.launch.skipInterrupt == undefined)
			Settings.launch.skipInterrupt = false;

		// Reverse debugging
		if(Settings.launch.history == undefined)
			Settings.launch.history = {} as any;
		if(Settings.launch.history.reverseDebugInstructionCount == undefined)
			Settings.launch.history.reverseDebugInstructionCount = 10000;

		// Short history
		if(Settings.launch.history.spotCount == undefined)
			Settings.launch.history.spotCount=10;
		if (Settings.launch.history.spotCount>Settings.MAX_HISTORY_SPOT_COUNT)
			Settings.launch.history.spotCount=Settings.MAX_HISTORY_SPOT_COUNT;
		if(Settings.launch.history.spotCount > Settings.launch.history.reverseDebugInstructionCount)
			Settings.launch.history.spotCount = Settings.launch.history.reverseDebugInstructionCount;
		if(Settings.launch.history.spotCount < 0)
			Settings.launch.history.spotCount = 0;

		// Code coverage
		if(Settings.launch.history.codeCoverageEnabled == undefined)
			Settings.launch.history.codeCoverageEnabled = (unitTests) ? true : true;

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
				"AF", "AF: ${hex}h, F: ${flags}",
				"AF'", "AF': ${hex}h, F': ${flags}",
				"PC", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"SP", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"HL", "(${hex}h)b=${b@:unsigned}, ${unsigned}u, ${signed}i${, :labelsplus|, }",
				"IM", "${unsigned}u",
				"..", "${hex}h, ${unsigned}u, ${signed}i${, :labelsplus|, }",
				"F", "${flags}",
				"R", "${unsigned}u",
				"I", "${hex}h",
				".", "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}"
			];
		if(!Settings.launch.formatting.registerHover)
			Settings.launch.formatting.registerHover = [
				"AF", "AF: ${hex}h, F: ${flags}",
				"AF'", "AF': ${hex}h, F': ${flags}",
				"PC", "${name}: ${hex}h${\n:labelsplus|\n}",
				"SP", "${name}: ${hex}h${\n:labelsplus|\n}",
				"IM", "${unsigned}u",
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
			Settings.launch.formatting.stackVar = "${hex}h\t${unsigned}u\t${signed}i\t${{:labels|, |}}";
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

		if(!Settings.launch.unitTestTimeout)
			Settings.launch.unitTestTimeout=1;	///< 1000 ms


		// TODO: REMOVE
		if (Settings.launch.debug_wait_before==undefined)
			Settings.launch.debug_wait_before=0;
		if (Settings.launch.debug_wait_after==undefined)
			Settings.launch.debug_wait_after=0;
	}


	/**
	 * Checks the settings and throws an exception if something is wrong.
	 * E.g. it checks for the existence of file paths.
	 * Note: file paths are already expanded to absolute paths.
	 */
	public static CheckSettings() {
		// Check remote type
		const rType = Settings.launch.remoteType;
		const allowedTypes=['zrcp', 'serial', 'zsim'];
		const found = (allowedTypes.indexOf(rType) >= 0);
		if (!found) {
			throw Error("Remote type '" + rType + "' does not exist. Allowed are " + allowedTypes.join(', ') + ".");
		}

		// List files
		for(let listFile of Settings.launch.listFiles) {
			// Check that file exists
			const path = listFile.path;
			if(!fs.existsSync(path))
				throw Error("File '" + path + "' does not exist.");
		}

		// sna/tap
		if(Settings.launch.load) {
			// Check that file exists
			if(!fs.existsSync(Settings.launch.load))
				throw Error("File '" + Settings.launch.load + "' does not exist.");
			// If sna or tap is given it is not allowed to use an execAddress
			if(Settings.launch.execAddress)
				throw Error("You load a .sna or .tap file. In that case the execution address is already known from the file and you cannot set it explicitly via 'execAddress'.");
		}

		// Object files
		for(let loadObj of Settings.launch.loadObjs) {
			// Check that file exists
			const path = loadObj.path;
			if(!fs.existsSync(path))
				throw Error("File '" + path + "' does not exist.");
			// Check that start address is given
			if(loadObj.start == undefined)
				throw Error("You must specify a 'start' address for '" + path + "'.");
		}
	}
}

