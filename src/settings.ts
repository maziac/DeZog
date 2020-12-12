import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Utility } from './misc/utility';
import * as fs from 'fs';
import {UnifiedPath} from './misc/unifiedpath';



/// Base for all assembler configurations.
export interface AsmConfigBase {

	/// The path to the list file.
	path: string;

	/// If defined the files referenced in the list file will be used for stepping otherwise the list file itself will be used.
	/// The path(s) here are relative to the 'rootFolder'.
	/// It is also possible to add several paths. Files are checked one after the other: first sources path, second sources path, ... last sources path.
	srcDirs: Array<string>;

	// An array of glob patterns with filenames to exclude. The filenames (from the 'include' statement) that do match will not be associated with executed addresses. I.e. those source files are not used shown during stepping.
	excludeFiles: Array<string>;
}


/// sjasmplus
export interface SjasmplusConfig extends AsmConfigBase {
	// Note: In sjasmplus the 'path' can be used either for a list file or for a sld file.

	// SLD files work with addresses+bank information. If this is set all addresses are turned into simple 64k addresses as with list files.
	disableBanking: boolean;
}


/// Z80Asm
export interface Z80asmConfig extends AsmConfigBase {
}


// Z88dk
export interface Z88dkConfig extends AsmConfigBase {
	/// Path to the main assembler source file that was used to produce the .list file.
	mainFile: string;

	/// The z88dk map file (option "-m").
	mapFile: string;
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

	/// If enabled zesarux does not break on manual break in interrupts.
	skipInterrupt: boolean;

	// The delay before loading the Z80 program via smartload.
	loadDelay: number;

	/// Resets the cpu (on ZEsarUX) after starting the debugger.
	resetOnLaunch: boolean;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Definitions for CSpect remote type.
export interface CSpectType {
	// The hostname/IP address of the CSpect socket.
	hostname: string;

	// The port of the CSpect socket.
	port: number;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Definitions for ZX Next remote type.
export interface ZxNextSocketType {
	// The hostname/IP address of the socket that connects the serial port.
	hostname: string;

	// The port of the socket that connects the serial port.
	port: number;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Subtype for the custom javascript code.
export interface CustomCodeType {
	// If true the zsim simulator view is put in debug mode which makes it easier to develop additional javascript code (see jsPath).
	debug: boolean;

	// A relative path to additional javascript code that is included into the Z80 simulator.
	jsPath: string;

	// A relative path to additional javascript code that is included into the Z80 simulator UI panel.
	uiPath: string;

	// You can set a time step (interval) to call the tick() function.
	timeStep: number;
}


/// Definitions for the 'zsim' remote type.
export interface ZSimType {
	// If enabled the simulator shows a keyboard to simulate keypresses.
	zxKeyboard: boolean,

	// If enabled the simulator shows the access to the memory (0-0xFFFF) visually while the program is running.
	visualMemory: boolean,

	// If enabled it shows the contents of the ZX Spectrum screen.
	ulaScreen: boolean,

	// If enabled the ZX 128K memory banks can be paged in. Use this to simulate a ZX 128K.

	// Memory model: ZX48k, ZX128K or ZXNext.
	// - "RAM": One memory area of 64K RAM, no banks.
	// - "ZX48": ROM and RAM as of the ZX Spectrum 48K.
	// - "ZX128": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	// - "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
	memoryModel: string;

	// The number of interrupts to calculate the average from. 0 to disable.
	cpuLoadInterruptRange: number,

	// If enabled the Z80N extended instructions are supported.
	Z80N: boolean,

	// If enabled an interrupt is generated after ca. 20ms (this assumes a CPU clock of 3.5MHz).
	vsyncInterrupt: boolean,

	// The CPU frequency is only used for output. I.e. when the t-states are printed
	// there is also a printout of the correspondent time. This is calculated via the CPU frequency here.
	cpuFrequency: number,

	// Settings to execute custom javascript code inside the zsim simulator.
	customCode: CustomCodeType;
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

	// The special settings for CSpect.
	cspect: CSpectType;

	// The special settings for the internal Z80 simulator.
	zsim: ZSimType;

	// The special settings for the serial connection.
	zxnext: ZxNextSocketType;

	/// true if the configuration is for unit tests.
	unitTests: false;

	/// The path of the root folder. All other paths are relative to this. Usually = ${workspaceFolder}
	rootFolder: string;

	/// The paths to the .list files / assembler parameters.
	sjasmplus: Array<SjasmplusConfig>;
	z80asm: Array<Z80asmConfig>;
	z88dk: Array<Z88dkConfig>;


	/// The paths to the .labels files.
	//labelsFiles: Array<string>;

	/// Interprets labels as address if value is bigger. Typically this is e.g. 512. So all numbers below are not treated as addresses if shown. So most constant values are covered with this as they are usually smaller than 512. Influences the formatting.
	smallValuesMaximum: number;

	/// These arguments are passed to the disassembler (z80dismblr arguments).
	disassemblerArgs: {
		numberOfLines: number,	// Number of lines displayed in the disassembly
		esxdosRst: boolean	// If enabled the disassembler will disassemble "RST 8; defb N" correctly.
	};

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

	/// An array with commands that are executed after the program-to-debug is loaded.
	commandsAfterLaunch: Array<string>;

	/// If enabled code coverage information is analyzed and displayed.
	/// Useful especially for unit tests but can be enabled also in "normal" launch configurations.
	history: {
		reverseDebugInstructionCount: number;	// Sets the number of instructions for reverse debugging. If set to 0 then reverse debugging is turned off.
		spotCount: number;	// Sets the number of instructions to show in a spot. If you set this e.g. to 5 then the 5 previous and the 5 next instructions related to the current position are shown.
		spotShowRegisters: boolean;	// If true it shows additionally the changed registers. Default=true.
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

	/// The timeout for any unit test in seconds.
	unitTestTimeout: number;
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
				cspect: <any>undefined,
				zsim: <any>undefined,
				zxnext: <any>undefined,
				unitTests: <any>undefined,
				rootFolder: <any>undefined,
				sjasmplus: <any>undefined,
				z80asm: <any>undefined,
				z88dk: <any>undefined,
				smallValuesMaximum: <any>undefined,
				disassemblerArgs: <any>undefined,
				tmpDir: <any>undefined,
				topOfStack: <any>undefined,
				execAddress: <any>undefined,
				load: <any>undefined,
				loadObjs: <any>undefined,
				startAutomatically: <any>undefined,
				commandsAfterLaunch: <any>undefined,
				history: <any>undefined,
				formatting: <any>undefined,
				memoryViewer: <any>undefined,
				tabSize: <any>undefined,
				unitTestTimeout: <any>undefined,
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
			Settings.launch.zrcp.hostname='localhost';
		if (Settings.launch.zrcp.port==undefined)
			Settings.launch.zrcp.port=10000;
		if (Settings.launch.zrcp.loadDelay==undefined) {
			const platform=process.platform;
			let delay=0;
			if (platform=='win32')
				delay=100;
			Settings.launch.zrcp.loadDelay=delay;	// ms
		}
		if (Settings.launch.zrcp.resetOnLaunch == undefined)
			Settings.launch.zrcp.resetOnLaunch = true;
		if (!Settings.launch.zrcp.socketTimeout)
			Settings.launch.zrcp.socketTimeout=5;	// 5 secs

		// cspect
		if (!Settings.launch.cspect)
			Settings.launch.cspect={} as CSpectType;
		if (Settings.launch.cspect.hostname==undefined)
			Settings.launch.cspect.hostname='localhost';
		if (Settings.launch.cspect.port==undefined)
			Settings.launch.cspect.port=11000;
		if (!Settings.launch.cspect.socketTimeout)
			Settings.launch.cspect.socketTimeout=5;	// 5 secs

		// zsim
		if (!Settings.launch.zsim)
			Settings.launch.zsim={} as ZSimType;
		if (Settings.launch.zsim.zxKeyboard==undefined)
			Settings.launch.zsim.zxKeyboard=false;
		if (Settings.launch.zsim.ulaScreen==undefined)
			Settings.launch.zsim.ulaScreen=false;
		if (Settings.launch.zsim.cpuLoadInterruptRange==undefined)
			Settings.launch.zsim.cpuLoadInterruptRange=1;
		if (Settings.launch.zsim.visualMemory==undefined)
			Settings.launch.zsim.visualMemory=true;
		if (Settings.launch.zsim.memoryModel==undefined)
			Settings.launch.zsim.memoryModel="RAM";
		Settings.launch.zsim.memoryModel=Settings.launch.zsim.memoryModel.toUpperCase();
		if (Settings.launch.zsim.Z80N==undefined)
			Settings.launch.zsim.Z80N = false;
		if (Settings.launch.zsim.vsyncInterrupt == undefined)
			Settings.launch.zsim.vsyncInterrupt = false;
		if (Settings.launch.zsim.cpuFrequency == undefined)
			Settings.launch.zsim.cpuFrequency = 3500000.0;	// 3500000.0 for 3.5MHz.

		// zsim custom code
		if (Settings.launch.zsim.customCode==undefined) {
			Settings.launch.zsim.customCode={} as any;
		}
		if (Settings.launch.zsim.customCode.debug==undefined)
			Settings.launch.zsim.customCode.debug=false;
		if (Settings.launch.zsim.customCode.jsPath!=undefined) {
			const path=UnifiedPath.getUnifiedPath(Settings.launch.zsim.customCode.jsPath);
			Settings.launch.zsim.customCode.jsPath=Utility.getAbsFilePath(path);
		}
		if (Settings.launch.zsim.customCode.uiPath!=undefined) {
			const path=UnifiedPath.getUnifiedPath(Settings.launch.zsim.customCode.uiPath);
			Settings.launch.zsim.customCode.uiPath=Utility.getAbsFilePath(path);
		}
		if (Settings.launch.zsim.customCode.timeStep==undefined) {
			// In fact: never call tick()
			Settings.launch.zsim.customCode.timeStep=Number.MAX_SAFE_INTEGER;
		}

		// zxnext
		if (!Settings.launch.zxnext)
			Settings.launch.zxnext={} as ZxNextSocketType;
		if (Settings.launch.zxnext.hostname==undefined)
			Settings.launch.zxnext.hostname='localhost';
		if (Settings.launch.zxnext.port==undefined)
			Settings.launch.zxnext.port=12000;
		if (!Settings.launch.zxnext.socketTimeout)
			Settings.launch.zxnext.socketTimeout=0.8;	// 0.8 secs, needs to be short to show a warning fast if debugged program is running.

		if(!Settings.launch.rootFolder)
			Settings.launch.rootFolder=rootFolder;

		// sjasmplus
		if (Settings.launch.sjasmplus) {
			Settings.launch.sjasmplus=Settings.launch.sjasmplus.map(fp => {
				// ListFile structure
				const fpPath=UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs=UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpExclFiles=UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file={
					path: undefined as any,
					srcDirs: fpSrcDirs||[""],
					excludeFiles: fpExclFiles || [],
					disableBanking: fp.disableBanking || false
				};
				if (fpPath)
					file.path = Utility.getAbsFilePath(fpPath)
				return file;
			});
		}

		// z80asm
		if (Settings.launch.z80asm) {
			Settings.launch.z80asm=Settings.launch.z80asm.map(fp => {
				// ListFile structure
				const fpPath=UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs=UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpExclFiles=UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file={
					path: undefined as any,
					srcDirs: fpSrcDirs||[""],
					excludeFiles: fpExclFiles||[]
				};
				if (fpPath)
					file.path = Utility.getAbsFilePath(fpPath)
				return file;
			});
		}

		// z88dk
		if (Settings.launch.z88dk) {
			Settings.launch.z88dk=Settings.launch.z88dk.map(fp => {
				// ListFile structure
				const fpPath=UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs=UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpMapFile=UnifiedPath.getUnifiedPath(fp.mapFile);
				const fpExclFiles=UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const fpMainFile=UnifiedPath.getUnifiedPath(fp.mainFile);
				const file={
					path: undefined as any,
					srcDirs: fpSrcDirs||[""],
					excludeFiles: fpExclFiles||[],
					mainFile: fpMainFile||"",
					mapFile: undefined as any
				};
				if (fpPath)
					file.path = Utility.getAbsFilePath(fpPath)
				if (fpMapFile)
					file.mapFile = Utility.getAbsFilePath(fpMapFile);
				return file;
			});
		}


		if (!Settings.launch.topOfStack)
			Settings.launch.topOfStack = '0x10000';
		if(unitTests)
			Settings.launch.topOfStack = 'UNITTEST_STACK';

		if (Settings.launch.load) {
			const uload=UnifiedPath.getUnifiedPath(Settings.launch.load)
			Settings.launch.load=Utility.getAbsFilePath(uload);
		}
		else
			Settings.launch.load = '';

		if(!Settings.launch.loadObjs)
			Settings.launch.loadObjs = [];
		for(let loadObj of Settings.launch.loadObjs) {
			if (loadObj.path) {
				const loadObjPath=UnifiedPath.getUnifiedPath(loadObj.path)
				loadObj.path=Utility.getAbsFilePath(loadObjPath);
			}
			else
				loadObj.path = '';
		}

		if(Settings.launch.tmpDir == undefined)
			Settings.launch.tmpDir='.tmp';
		Settings.launch.tmpDir=UnifiedPath.getUnifiedPath(Settings.launch.tmpDir);
		Settings.launch.tmpDir=Utility.getAbsFilePath
			(Settings.launch.tmpDir);
		if(isNaN(Settings.launch.smallValuesMaximum))
			Settings.launch.smallValuesMaximum = 255;
		if(Settings.launch.disassemblerArgs == undefined)
			Settings.launch.disassemblerArgs={
				numberOfLines: 10,
				esxdosRst: false
			};
		if (!Settings.launch.disassemblerArgs.hasOwnProperty("numberOfLines"))
			Settings.launch.disassemblerArgs.numberOfLines=10;
		if (Settings.launch.disassemblerArgs.numberOfLines>100)
			Settings.launch.disassemblerArgs.numberOfLines=100;
		if (Settings.launch.disassemblerArgs.numberOfLines<1)
			Settings.launch.disassemblerArgs.numberOfLines=1;
		if (!Settings.launch.disassemblerArgs.hasOwnProperty("esxdosRst"))
			Settings.launch.disassemblerArgs.esxdosRst=false;
		if(Settings.launch.startAutomatically == undefined)
			Settings.launch.startAutomatically = (unitTests) ? false : false;
		if(Settings.launch.commandsAfterLaunch == undefined)
			Settings.launch.commandsAfterLaunch = [];
		if (Settings.launch.zrcp.skipInterrupt == undefined)
			Settings.launch.zrcp.skipInterrupt = false;

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
		if (Settings.launch.history.spotShowRegisters==undefined)
			Settings.launch.history.spotShowRegisters=true;

		// Code coverage
		if (Settings.launch.history.codeCoverageEnabled==undefined) {
			if (Settings.launch.remoteType=='cspect') {
				// not supported by cspect
				Settings.launch.history.codeCoverageEnabled=false;
			}
			else {
				// Otherwise allow, both for normal and unit tests
				Settings.launch.history.codeCoverageEnabled=true;
			}
		}

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
				"..", "${hex}h, ${unsigned}u, ${signed}i\n${\n:labelsplus|\n}\n(${hex}h)b=${b@:hex}h, (${hex}h)w=${w@:hex}h",
				"R", "${name}: ${unsigned}u",
				"I", "${name}: ${hex}h",
				".", "${name}: ${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
			];
		if(!Settings.launch.formatting.bigValues)
			Settings.launch.formatting.bigValues= "(${hex}h)=${b@:unsigned}/${b@:hex}h/'${b@:char}' or ${w@:hex}h/${w@:unsigned}";
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
					"SP", "goldenrod",
					"IX", "darkorange",
					"IY", "darkviolet"
				],
				registersMemoryView: [
					"HL", "DE", "BC", "SP", "IX", "IY"
				]
			};
		}

		if(!Settings.launch.unitTestTimeout)
			Settings.launch.unitTestTimeout=1;	///< 1000 ms
	}


	/**
	 * Returns all xxxListFiles parameters in an array.
	 * This is used to run checks on the common parameters.
	 * @param configuration The launch configuration, e.g. Settings.launch.
	 * @returns An array of list file parameters.
	 */
	public static GetAllAssemblerListFiles(configuration: any): Array<AsmConfigBase> {
		const listFiles=new Array<AsmConfigBase>();
		if (configuration.sjasmplus)
			listFiles.push(...configuration.sjasmplus);
		if (configuration.z80asm)
			listFiles.push(...configuration.z80asm);
		if (configuration.z88dk)
			listFiles.push(...configuration.z88dk);

		return listFiles;
	}


	/**
	 * Checks the settings and throws an exception if something is wrong.
	 * E.g. it checks for the existence of file paths.
	 * Note: file paths are already expanded to absolute paths.
	 */
	public static CheckSettings() {
		// Check remote type
		const rType=Settings.launch.remoteType;
		const allowedTypes=['zrcp', 'cspect', 'zxnext', 'zsim'];
		const found=(allowedTypes.indexOf(rType)>=0);
		if (!found) {
			throw Error("'remoteType': Remote type '"+rType+"' does not exist. Allowed are "+allowedTypes.join(', ')+".");
		}

		// List files (=Assembler configurations)
		const listFiles=this.GetAllAssemblerListFiles(Settings.launch);
		for (let listFile of listFiles) {
			const path = listFile.path;
			if (path == undefined)
				throw Error("'path': You need to define a path to your file.");
			// Check that file exists
			if(!fs.existsSync(path))
				throw Error("'path': File '" + path + "' does not exist.");
		}

		// Any special check
		if (Settings.launch.z88dk) {
			// Check for z88dk map file
			const listFiles=Settings.launch.z88dk;
			for (const listFile of listFiles) {
				const mapFile=listFile.mapFile;
				if (mapFile==undefined)
					throw Error("'z88dk.mapFile': For z88dk you have to define a map file.");
				// Check that file exists
				if (!fs.existsSync(mapFile))
					throw Error("'z88dk.mapFile': '"+mapFile+"' does not exist.");
			}
		}

		// sna/tap
		if(Settings.launch.load) {
			// Check that file exists
			if(!fs.existsSync(Settings.launch.load))
				throw Error("'load': File '" + Settings.launch.load + "' does not exist.");
			// If sna or tap is given it is not allowed to use an execAddress
			if(Settings.launch.execAddress)
				throw Error("'execAddress': You load a .sna or .tap file. In that case the execution address is already known from the file and you cannot set it explicitly via 'execAddress'.");
		}

		// Object files
		for(let loadObj of Settings.launch.loadObjs) {
			// Check that file exists
			const path = loadObj.path;
			if(!fs.existsSync(path))
				throw Error("'loadObj.path': File '" + path + "' does not exist.");
			// Check that start address is given
			if(loadObj.start == undefined)
				throw Error("'loadObj.start': You must specify a 'start' address for '" + path + "'.");
		}
	}
}

