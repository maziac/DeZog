/**
 * Helper functions to parse the z88dk map file (option "-m").
 *
 * A map file line looks like:
 *   _main                           = $14001A ; addr, public, , main_c, PAGE_20_CODE, main.c:5
 * I.e. name = $value ; type, scope, def, module, section, location
 *
 * With "-debug" z80asm additionally adds these symbols
 * (see https://www.z88dk.org/forum/viewtopic.php?t=12139):
 * - __C_LINE_<nr>_<file>: One for each C source line (sccz80 and sdcc). E.g.
 *   __C_LINE_11_factorial_2ec... = $14001A ; addr, local, , factorial_c, PAGE_20_CODE, factorial.c::x::10000::3:11
 *   Location format: "file::function::level::block:line", "file::function:line" or "file:line".
 *   sdcc does not log the function name, it is always 'x'.
 * - __ASM_LINE_<nr>_<file>: One for each assembler line that contains a label.
 * - __CDBINFO__<encoded>: The encoded CDB records (types, symbols, functions).
 */


/** One symbol of the z88dk map file. */
export interface Z88dkMapSymbol {
	/// The symbol name, e.g. "_main" or "__C_LINE_11_factorial_2ec".
	name: string;
	/// The value. For banked addresses the bits above 0xFFFF contain the bank/page.
	value: number;
	/// 'const', 'addr' or 'comput'.
	type: string;
	/// 'local' or 'public'.
	scope: string;
	/// The module name, e.g. "factorial_c".
	module: string;
	/// The section name, e.g. "code_compiler" or "PAGE_20_CODE".
	section: string;
	/// The location, e.g. "main.asm:15" or "factorial.c::x::10000::3:11".
	location: string;
}


/** A source line <-> address association extracted from a __C_LINE_ or __ASM_LINE_ symbol. */
export interface Z88dkLineInfo {
	/// The source file name as given by z88dk.
	fileName: string;
	/// The function name (sccz80 only, sdcc uses 'x'). Undefined for simple file:line locations.
	funcName?: string;
	/// The level (sdcc: level*10000+sublevel). Undefined if not available.
	level?: number;
	/// The block (scope). Undefined if not available.
	block?: number;
	/// The line number, 1-based.
	lineNr: number;
}


export const C_LINE_PREFIX = '__C_LINE_';
export const ASM_LINE_PREFIX = '__ASM_LINE_';
export const CDBINFO_PREFIX = '__CDBINFO__';


// Regex to parse one map file line.
const mapLineRegEx = /^(\S+)\s*=\s*\$([0-9a-f]+)\s*(?:;(.*))?$/i;

// Location formats (see z88dk ticks/syms.c demangle_filename).
// The file name match allows for windows drive letters, e.g. "C:\src\main.c:12".
// z88dk (with -debug) may separate the line number with a tab, e.g. "main.c::x::10000::212\t:11".
const locationFullRegEx = /^(.+?)::([^:]*)::(-?\d+)::(-?\d+)\s*:(\d+)$/;
const locationFuncRegEx = /^(.+?)::([^:]*?)\s*:(\d+)$/;
const locationSimpleRegEx = /^(.+?)\s*:(\d+)$/;


/** Parses one line of the map file.
 * @param line E.g. "_main = $14001A ; addr, public, , main_c, PAGE_20_CODE, main.c:5"
 * @returns The symbol or undefined if the line could not be parsed.
 */
export function parseMapLine(line: string): Z88dkMapSymbol | undefined {
	const match = mapLineRegEx.exec(line.trimEnd());
	if (!match)
		return undefined;
	const fields = (match[3] ?? '').split(',');
	const trim = (index: number) => (fields[index] ?? '').trim();
	return {
		name: match[1],
		value: parseInt(match[2], 16),
		type: trim(0) || 'addr',	// Old map files without type info
		scope: trim(1),
		module: trim(3),
		section: trim(4),
		// The location is the last field. Join in case the file name contains a comma.
		location: fields.slice(5).join(',').trim()
	};
}


/** Parses the location of a __C_LINE_ or __ASM_LINE_ symbol.
 * @param location E.g. "factorial.c::x::10000::3:11", "adv_a.c::CHKAWAY:2206" or "main.asm:15".
 * @returns The line info or undefined if not parsable.
 */
export function parseLineLocation(location: string): Z88dkLineInfo | undefined {
	let match = locationFullRegEx.exec(location);
	if (match) {
		return {
			fileName: match[1],
			funcName: match[2],
			level: parseInt(match[3]),
			block: parseInt(match[4]),
			lineNr: parseInt(match[5])
		};
	}
	match = locationFuncRegEx.exec(location);
	if (match) {
		return {
			fileName: match[1],
			funcName: match[2],
			lineNr: parseInt(match[3])
		};
	}
	match = locationSimpleRegEx.exec(location);
	if (match) {
		return {
			fileName: match[1],
			lineNr: parseInt(match[2])
		};
	}
	return undefined;
}


/** Returns true for the debug symbols __C_LINE_, __ASM_LINE_ and __CDBINFO__. */
export function isDebugSymbol(name: string): boolean {
	return name.startsWith(C_LINE_PREFIX)
		|| name.startsWith(ASM_LINE_PREFIX)
		|| name.startsWith(CDBINFO_PREFIX);
}


/** Strips the debug info that z80asm's C_LINE directive appends to a file name.
 * E.g. "main.c::x::10000::1" -> "main.c".
 * Used for the file names in .lis files.
 */
export function stripDebugFileName(fileName: string): string {
	const k = fileName.indexOf('::');
	if (k < 0)
		return fileName;
	return fileName.substring(0, k);
}
