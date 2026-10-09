
import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {LabelsClass} from '../src/labels/labels';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {MemoryModelZxNext} from '../src/remotes/MemoryModel/zxnextmemorymodels';
import {MemoryModelZx128k} from '../src/remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {WorkspacePaths} from '../src/misc/workspacepaths';
import {parseLineLocation, parseMapLine, stripDebugFileName} from '../src/labels/z88dkmapfile';
import {Z88dkLabelParserV2} from '../src/labels/z88dklabelparserv2';


suite('z88dk map file', () => {

	test('parseMapLine', () => {
		let sym = parseMapLine('_main                           = $14001A ; addr, public, , main_c, PAGE_20_CODE, main.c:5')!;
		assert.equal(sym.name, '_main');
		assert.equal(sym.value, 0x14001A);
		assert.equal(sym.type, 'addr');
		assert.equal(sym.scope, 'public');
		assert.equal(sym.module, 'main_c');
		assert.equal(sym.section, 'PAGE_20_CODE');
		assert.equal(sym.location, 'main.c:5');

		sym = parseMapLine('__head                          = $8000 ; const, public, def, , ,')!;
		assert.equal(sym.name, '__head');
		assert.equal(sym.value, 0x8000);
		assert.equal(sym.type, 'const');
		assert.equal(sym.module, '');
		assert.equal(sym.section, '');
		assert.equal(sym.location, '');

		// Windows line ending
		sym = parseMapLine('label = $1234 ; addr, local, , main, , main.asm:3\r')!;
		assert.equal(sym.location, 'main.asm:3');

		// Old format without type info
		sym = parseMapLine('label = $1234')!;
		assert.equal(sym.value, 0x1234);
		assert.equal(sym.type, 'addr');

		assert.equal(parseMapLine(''), undefined);
		assert.equal(parseMapLine('; comment'), undefined);
	});

	test('parseLineLocation', () => {
		// sdcc
		let info = parseLineLocation('factorial.c::x::10002::3:11')!;
		assert.deepEqual(info, {fileName: 'factorial.c', funcName: 'x', level: 10002, block: 3, lineNr: 11});

		// sccz80 classic
		info = parseLineLocation('adv_a.c::CHKAWAY:2206')!;
		assert.deepEqual(info, {fileName: 'adv_a.c', funcName: 'CHKAWAY', lineNr: 2206});

		// Simple
		info = parseLineLocation('src/main.asm:15')!;
		assert.deepEqual(info, {fileName: 'src/main.asm', lineNr: 15});

		// Windows paths
		info = parseLineLocation('C:\\src\\main.asm:15')!;
		assert.deepEqual(info, {fileName: 'C:\\src\\main.asm', lineNr: 15});
		info = parseLineLocation('C:\\src\\main.c::main::1::2:7')!;
		assert.deepEqual(info, {fileName: 'C:\\src\\main.c', funcName: 'main', level: 1, block: 2, lineNr: 7});

		// Tab before the line number (z88dk -debug map file)
		info = parseLineLocation('main.c::x::10000::212\t:11')!;
		assert.deepEqual(info, {fileName: 'main.c', funcName: 'x', level: 10000, block: 212, lineNr: 11});
		info = parseLineLocation('adv_a.c::CHKAWAY\t:2206')!;
		assert.deepEqual(info, {fileName: 'adv_a.c', funcName: 'CHKAWAY', lineNr: 2206});
		info = parseLineLocation('src/main.asm\t:15')!;
		assert.deepEqual(info, {fileName: 'src/main.asm', lineNr: 15});

		assert.equal(parseLineLocation(''), undefined);
		assert.equal(parseLineLocation('main.c'), undefined);
	});

	suite('banked address conversion (independent of the section name)', () => {
		const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
		let warnings: string[];

		/** Returns a function that converts the address of a map file line. */
		function converter(mm: MemoryModel, target: 'zx' | 'zxn' | undefined) {
			const parser = new Z88dkLabelParserV2(mm, new Map(), new Map(), [], new Map(), new Map(), new Map(), [], [], [], issue => warnings.push(issue.message)) as any;
			parser.config = {mapFile: 'main.map', target};
			parser.checkMappingToTargetMemoryModel();
			return (line: string) => parser.funcConvertAddress(parseMapLine(line)!.value);
		}

		setup(() => {
			warnings = [];
		});

		test('zxn (8k pages) to ZX Next', () => {
			const convert = converter(new MemoryModelZxNext(), 'zxn');
			assert.equal(convert('l = $60045F ; addr, local, , menu_controls_c, menu_code, menu.c:1142'), page(96, 0x045F));
			// Even page spanning 16k: upper 8k is the next page
			assert.equal(convert('l = $602462 ; addr, local, , menu_controls_c, menu_code, menu.c:1144'), page(97, 0x2462));
			assert.equal(convert('l = $0AE010 ; addr, local, , util, data_seg, util.asm:13'), page(11, 0xE010));
			// Odd page in the upper 8k
			assert.equal(convert('l = $5FD000 ; addr, local, , players_c, players_const, players.c:3'), page(95, 0xD000));
			// <= 0xFFFF (not banked or page 0): slot configuration, i.e. page 0 in slot 6
			assert.equal(convert('l = $C010 ; addr, local, , main_c, code_compiler, main.c:3'), page(0, 0xC010));
			// Not banked: page 4 in slot 4
			assert.equal(convert('l = $8010 ; addr, local, , main_c, code_compiler, main.c:3'), page(4, 0x8010));
			assert.deepEqual(warnings, []);
		});

		test('zx (16k banks) to ZX Next', () => {
			const convert = converter(new MemoryModelZxNext(), 'zx');
			// z88dk +zx classic BANK_5: pages 10 and 11
			assert.equal(convert('l = $05C000 ; addr, public, , p0asm_asm, BANK_5, p0asm.asm:17'), page(10, 0xC000));
			assert.equal(convert('l = $05E010 ; addr, public, , p0asm_asm, BANK_5, p0asm.asm:18'), page(11, 0xE010));
			assert.equal(convert('l = $038000 ; addr, local, , m, my_bank, m.c:1'), page(6, 0x8000));
			assert.equal(convert('l = $8010 ; addr, local, , main_c, code_compiler, main.c:3'), page(4, 0x8010));
			assert.deepEqual(warnings, []);
		});

		test('zx (16k banks) to ZX128K', () => {
			const convert = converter(new MemoryModelZx128k(), 'zx');
			assert.equal(convert('l = $03E000 ; addr, local, , m, my_bank, m.c:1'), page(3, 0xE000));
			assert.equal(convert('l = $8000 ; addr, local, , m, code_compiler, m.c:1'), page(2, 0x8000));
			assert.deepEqual(warnings, []);
		});

		test('zxn (8k pages) to ZX128K', () => {
			const convert = converter(new MemoryModelZx128k(), 'zxn');
			assert.equal(convert('l = $06C000 ; addr, local, , m, my_page, m.c:1'), page(3, 0xC000));
			// Even page spanning 16k
			assert.equal(convert('l = $06E000 ; addr, local, , m, my_page, m.c:1'), page(3, 0xE000));
			assert.equal(convert('l = $07E000 ; addr, local, , m, my_page, m.c:1'), page(3, 0xE000));
			assert.deepEqual(warnings, []);
			// Odd page in the lower 8k of a 16k bank: bank ignored
			assert.equal(convert('l = $07C000 ; addr, local, , m, my_page, m.c:1'), page(0, 0xC000));
			assert.equal(warnings.length, 1);
			assert.ok(warnings[0].includes('Bank 7'), warnings[0]);
		});

		test('Bank not available at the address', () => {
			// Bank 9 does not exist in ZX128K
			const convert = converter(new MemoryModelZx128k(), 'zx');
			assert.equal(convert('l = $09C000 ; addr, local, , m, my_bank, m.c:1'), page(0, 0xC000));
			// Warned only once
			assert.equal(convert('l = $09C010 ; addr, local, , m, my_bank, m.c:1'), page(0, 0xC010));
			assert.equal(warnings.length, 1);
			assert.ok(warnings[0].includes('Bank 9'), warnings[0]);
		});

		test('No target: bank ignored', () => {
			const convert = converter(new MemoryModelZxNext(), undefined);
			assert.equal(convert('l = $14C000 ; addr, local, , m, PAGE_20_CODE, m.c:1'), page(0, 0xC000));
			assert.equal(convert('l = $16C000 ; addr, local, , m, PAGE_22_CODE, m.c:1'), page(0, 0xC000));
			assert.equal(convert('l = $8010 ; addr, local, , main_c, code_compiler, main.c:3'), page(4, 0x8010));
			assert.equal(warnings.length, 1);
			assert.ok(warnings[0].includes("'target' is not set"), warnings[0]);
		});

		test('Memory model without banking: bank ignored', () => {
			const convert = converter(new MemoryModelAllRam(), 'zxn');
			assert.equal(convert('l = $60045F ; addr, local, , m, menu_code, m.c:1'), 0x1045F);
			assert.equal(warnings.length, 1);
			assert.ok(warnings[0].includes('ZX128K and ZX Next'), warnings[0]);
		});
	});

	test('stripDebugFileName', () => {
		assert.equal(stripDebugFileName('main.c::x::10000::1'), 'main.c');
		assert.equal(stripDebugFileName('main.c'), 'main.c');
		assert.equal(stripDebugFileName('main.c::x::10000::212\t'), 'main.c');
		assert.equal(stripDebugFileName('C:\\src\\main.c::x::0::0'), 'C:\\src\\main.c');
	});
});


suite('Labels (z88dk v2 format with -debug map file)', () => {
	const dir = 'tests/data/labels/projects/z88dk/debug_v2';
	const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
	let lbls: LabelsClass;

	setup(() => {
		lbls = new LabelsClass();
		// To work with simpler file names
		(WorkspacePaths as any).rootPath = undefined;
	});

	function config(mapFile: string, excludeFiles: string[] = [], lisGlob = '*.lis'): any {
		return {
			z88dkv2: [{
				path: './' + dir + '/' + lisGlob,
				mapFile: './' + dir + '/' + mapFile,
				srcDirs: [dir],
				excludeFiles,
				target: 'zxn'
			}]
		};
	}

	function checkEntry(address: number, file: string | undefined, lineNr?: number) {
		const entry = lbls.getSourceFileEntryForAddress(address);
		const msg = 'Address ' + address.toString(16);
		if (file === undefined) {
			assert.ok(entry === undefined || entry.fileName === '', msg);
			return;
		}
		assert.notEqual(entry, undefined, msg);
		assert.equal(entry!.fileName, dir + '/' + file, msg);
		assert.equal(entry!.lineNr, lineNr! - 1, msg);
	}


	suite('with __C_LINE_ (debug) info', () => {

		test('labels, banked', () => {
			lbls.readListFiles(config('main.map'), new MemoryModelZxNext());
			// Not banked: 0x8000 is page 4 in slot 4
			assert.equal(lbls.getNumberForLabel('_main'), page(4, 0x8000));
			assert.equal(lbls.getNumberForLabel('_util_add'), page(4, 0x8014));
			assert.equal(lbls.getNumberForLabel('util_local'), page(4, 0x8018));
			// PAGE_20 section
			assert.equal(lbls.getNumberForLabel('_factorial'), page(20, 0xC000));
			// BANK_5 section (16k) in upper 8k: page 11
			assert.equal(lbls.getNumberForLabel('bank5_data'), page(11, 0xE010));
			// Debug symbols are not labels
			assert.deepEqual(lbls.getLabelsForRegEx('__C_LINE_'), []);
			assert.deepEqual(lbls.getLabelsForRegEx('__CDBINFO__'), []);
		});

		test('C lines from map file', () => {
			lbls.readListFiles(config('main.map'), new MemoryModelZxNext());
			// file/line -> address
			// Line 4 has no code and shares the address with line 5
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 4 - 1), page(4, 0x8000));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 5 - 1), page(4, 0x8000));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 6 - 1), page(4, 0x8003));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 7 - 1), page(4, 0x800B));	// Not 0x8006 as in the .lis
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 8 - 1), page(4, 0x8011));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 4 - 1), page(20, 0xC004));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 6 - 1), page(20, 0xC00F));

			// address -> file/line
			checkEntry(page(4, 0x8000), 'main.c', 5);	// Not line 4 (no code, listed after line 5 in the map)
			checkEntry(page(4, 0x8002), 'main.c', 5);
			checkEntry(page(4, 0x8003), 'main.c', 6);
			checkEntry(page(4, 0x8007), 'main.c', 6);	// The .lis says line 7
			checkEntry(page(4, 0x800A), 'main.c', 6);
			checkEntry(page(4, 0x800B), 'main.c', 7);
			checkEntry(page(4, 0x8013), 'main.c', 8);
			checkEntry(page(20, 0xC000), 'factorial.c', 3);
			checkEntry(page(20, 0xC00A), 'factorial.c', 5);
			checkEntry(page(20, 0xC01F), 'factorial.c', 6);
			checkEntry(page(20, 0xC020), undefined);
		});

		test('asm lines from .lis file', () => {
			lbls.readListFiles(config('main.map'), new MemoryModelZxNext());
			assert.equal(lbls.getAddrForFileAndLine(dir + '/util.asm', 5 - 1), page(4, 0x8014));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/util.asm', 6 - 1), page(4, 0x8017));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/util.asm', 9 - 1), page(4, 0x8018));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/util.asm', 14 - 1), page(11, 0xE010));
			checkEntry(page(4, 0x8016), 'util.asm', 5);
			checkEntry(page(4, 0x8017), 'util.asm', 6);
			checkEntry(page(4, 0x8019), 'util.asm', 10);
			checkEntry(page(11, 0xE012), 'util.asm', 14);
		});

		test('WPMEM, LOGPOINT from .lis file', () => {
			lbls.readListFiles(config('main.map'), new MemoryModelZxNext());
			const wpLines = lbls.getWatchPointLines();
			assert.equal(wpLines.length, 1);
			assert.equal(wpLines[0].address, page(11, 0xE010));
			assert.equal(wpLines[0].line, 'WPMEM');
			const lpLines = lbls.getLogPointLines();
			assert.equal(lpLines.length, 1);
			assert.equal(lpLines[0].address, page(4, 0x8018));
			assert.equal(lpLines[0].line, 'LOGPOINT [UTIL] util_local reached');
		});

		test('excludeFiles', () => {
			lbls.readListFiles(config('main.map', ['**/factorial.c']), new MemoryModelZxNext());
			assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 4 - 1), -1);
			checkEntry(page(20, 0xC004), undefined);
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 6 - 1), page(4, 0x8003));
		});

		test('MemoryModelAllRam: banks ignored', () => {
			lbls.readListFiles(config('main.map'), new MemoryModelAllRam());
			assert.equal(lbls.getNumberForLabel('_main'), 0x18000);
			assert.equal(lbls.getNumberForLabel('_factorial'), 0x1C000);
			assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 4 - 1), 0x1C004);
			checkEntry(0x18007, 'main.c', 6);
		});

		test('map __C_LINE_ has priority over .lis C_LINE markers', () => {
			// In main_map_wins.map line 7 starts at $800E, the .lis C_LINE marker says $800B
			lbls.readListFiles(config('main_map_wins.map'), new MemoryModelZxNext());
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 7 - 1), page(4, 0x800E));
			checkEntry(page(4, 0x800B), 'main.c', 6);	// The .lis marker says line 7
			checkEntry(page(4, 0x800D), 'main.c', 6);
			checkEntry(page(4, 0x800E), 'main.c', 7);
			checkEntry(page(4, 0x8011), 'main.c', 8);
		});
	});


	suite('without __C_LINE_ info in map file: C_LINE markers of .lis file', () => {

		test('C lines from .lis C_LINE markers', () => {
			lbls.readListFiles(config('main_nodebug.map'), new MemoryModelZxNext());
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 6 - 1), page(4, 0x8003));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 7 - 1), page(4, 0x800B));	// Not 0x8006 as in the comment
			checkEntry(page(4, 0x8000), 'main.c', 5);
			checkEntry(page(4, 0x8003), 'main.c', 6);
			checkEntry(page(4, 0x8007), 'main.c', 6);	// The comment says line 7
			checkEntry(page(4, 0x800B), 'main.c', 7);
			checkEntry(page(4, 0x8011), 'main.c', 8);
			checkEntry(page(20, 0xC004), 'factorial.c', 4);
			checkEntry(page(20, 0xC01F), 'factorial.c', 6);
		});

		test('asm lines, labels, WPMEM unchanged', () => {
			lbls.readListFiles(config('main_nodebug.map'), new MemoryModelZxNext());
			assert.equal(lbls.getNumberForLabel('_factorial'), page(20, 0xC000));
			assert.equal(lbls.getAddrForFileAndLine(dir + '/util.asm', 9 - 1), page(4, 0x8018));
			checkEntry(page(11, 0xE012), 'util.asm', 14);
			assert.equal(lbls.getWatchPointLines().length, 1);
			assert.equal(lbls.getLogPointLines().length, 1);
		});
	});


	suite('without C_LINE markers: C line comments of .lis file', () => {

		test('C lines from .lis comments', () => {
			// main.c.lis without C_LINE directives (e.g. older z88dk), only --c-code-in-asm comments
			lbls.readListFiles(config('main_nodebug.map', [], 'no_cline/*.lis'), new MemoryModelZxNext());
			assert.equal(lbls.getAddrForFileAndLine(dir + '/main.c', 7 - 1), page(4, 0x8006));
			checkEntry(page(4, 0x8003), 'main.c', 6);
			checkEntry(page(4, 0x8007), 'main.c', 7);
			checkEntry(page(4, 0x8011), 'main.c', 8);
		});
	});
});


suite('Labels (z88dk v2 format, sccz80)', () => {
	// Real output of "zcc +zxn -compiler=sccz80 -clib=new" (trimmed).
	// factorial.c is in page 20, fibonacci.c in page 22. Both have a local label "i_2".
	const dir = 'tests/data/labels/projects/z88dk/debug_sccz80';
	const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
	let lbls: LabelsClass;

	setup(() => {
		lbls = new LabelsClass();
		// To work with simpler file names
		(WorkspacePaths as any).rootPath = undefined;
	});

	function config(subDir: string): any {
		return {
			z88dkv2: [{
				path: './' + dir + '/' + subDir + '*.lis',
				mapFile: './' + dir + '/' + subDir + 'main.map',
				srcDirs: [dir],
				excludeFiles: [],
				target: 'zxn'
			}]
		};
	}

	function checkEntry(address: number, file: string | undefined, lineNr?: number) {
		const entry = lbls.getSourceFileEntryForAddress(address);
		const msg = 'Address ' + address.toString(16);
		if (file === undefined) {
			assert.ok(entry === undefined || entry.fileName === '', msg);
			return;
		}
		assert.notEqual(entry, undefined, msg);
		assert.equal(entry!.fileName, dir + '/' + file, msg);
		assert.equal(entry!.lineNr, lineNr! - 1, msg);
	}


	test('with -debug: C lines from map file', () => {
		lbls.readListFiles(config(''), new MemoryModelZxNext());
		// Labels in ".label" syntax
		assert.equal(lbls.getNumberForLabel('_factorial'), page(20, 0x0000));
		assert.equal(lbls.getNumberForLabel('_fibonacci'), page(22, 0x0000));
		// Line -> address
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 6 - 1), page(20, 0x0000));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 7 - 1), page(20, 0x0003));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 9 - 1), page(20, 0x0010));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 11 - 1), page(20, 0x0017));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/fibonacci.c', 11 - 1), page(22, 0x0017));
		// Lines without code (sccz80 symbols at $0000 without section) have no address
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 1 - 1), -1);
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 5 - 1), -1);
		// Address -> line
		checkEntry(page(20, 0x0003), 'factorial.c', 7);
		checkEntry(page(20, 0x0010), 'factorial.c', 9);	// Line 8 has no code
		checkEntry(page(20, 0x0017), 'factorial.c', 11);	// Line 10 has no code
		checkEntry(page(22, 0x0017), 'fibonacci.c', 11);
		// No association of the ROM at 0x0000
		checkEntry((0xFF + 1) << 16, undefined);
	});

	test('without -debug: C lines from .lis C_LINE markers', () => {
		lbls.readListFiles(config('nodebug/'), new MemoryModelZxNext());
		assert.equal(lbls.getNumberForLabel('_factorial'), page(20, 0x0000));
		assert.equal(lbls.getNumberForLabel('_fibonacci'), page(22, 0x0000));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 7 - 1), page(20, 0x0000));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 9 - 1), page(20, 0x000D));
		// The local label "i_2" exists in both modules
		assert.equal(lbls.getAddrForFileAndLine(dir + '/factorial.c', 11 - 1), page(20, 0x0011));
		assert.equal(lbls.getAddrForFileAndLine(dir + '/fibonacci.c', 11 - 1), page(22, 0x0012));
		checkEntry(page(20, 0x000D), 'factorial.c', 9);
		checkEntry(page(20, 0x0011), 'factorial.c', 11);
		checkEntry(page(22, 0x0012), 'fibonacci.c', 11);
	});
});


suite('Labels (z88dk v2 format, source in sub directory)', () => {
	// The .lis file refers to "game/loop.c", the C_LINE information contains only "loop.c".
	const dir = 'tests/data/labels/projects/z88dk/subdir_v2';
	const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
	let lbls: LabelsClass;

	setup(() => {
		lbls = new LabelsClass();
		// To work with simpler file names
		(WorkspacePaths as any).rootPath = undefined;
	});

	function config(mapFile: string): any {
		return {
			z88dkv2: [{
				path: './' + dir + '/game/*.lis',
				mapFile: './' + dir + '/' + mapFile,
				srcDirs: [dir],
				excludeFiles: []
			}]
		};
	}

	function checkEntry(address: number, lineNr: number) {
		const entry = lbls.getSourceFileEntryForAddress(address);
		const msg = 'Address ' + address.toString(16);
		assert.notEqual(entry, undefined, msg);
		assert.equal(entry!.fileName, dir + '/game/loop.c', msg);
		assert.equal(entry!.lineNr, lineNr - 1, msg);
	}

	for (const mapFile of ['main_nodebug.map', 'main.map']) {
		test(mapFile, () => {
			lbls.readListFiles(config(mapFile), new MemoryModelZxNext());
			const file = dir + '/game/loop.c';
			assert.equal(lbls.getAddrForFileAndLine(file, 5 - 1), page(4, 0x8000));
			assert.equal(lbls.getAddrForFileAndLine(file, 10 - 1), page(4, 0x8007));
			checkEntry(page(4, 0x8000), 5);
			checkEntry(page(4, 0x8007), 10);
			checkEntry(page(4, 0x800F), 10);
		});
	}

	test('.lis: C_LINE before the label of a function', () => {
		// The C_LINE of line 8 is located after the bss section, before the label "_loop".
		lbls.readListFiles(config('main_nodebug.map'), new MemoryModelZxNext());
		const file = dir + '/game/loop.c';
		assert.equal(lbls.getAddrForFileAndLine(file, 8 - 1), page(4, 0x8005));	// Not the bss address
		checkEntry(page(4, 0x8005), 8);
		// Line without code
		assert.equal(lbls.getAddrForFileAndLine(file, 3 - 1), -1);
	});
});


suite('Labels (z88dk v2 format, C lines of sources in sub directories)', () => {
	// The map file contains the C lines of all modules. They are assigned to
	// their files after all .lis files have been read.
	const base = 'tests/data/labels/projects/z88dk/';
	const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
	let lbls: LabelsClass;
	let warnings: string[];

	setup(() => {
		lbls = new LabelsClass();
		(WorkspacePaths as any).rootPath = undefined;
		warnings = [];
		LabelsClass.addDiagnosticsErrorFunc = (message: string) => warnings.push(message);
	});

	teardown(() => {
		LabelsClass.addDiagnosticsErrorFunc = undefined;
	});

	function load(dir: string) {
		lbls.readListFiles({
			z88dkv2: [{
				path: './' + dir + '/**/*.lis',
				mapFile: './' + dir + '/main.map',
				srcDirs: [dir],
				excludeFiles: []
			}]
		} as any, new MemoryModelZxNext());
	}

	function check(dir: string, file: string, lineNr: number, addr64k: number) {
		const msg = file + ':' + lineNr;
		assert.equal(lbls.getAddrForFileAndLine(dir + '/' + file, lineNr - 1), page(4, addr64k), msg);
		const entry = lbls.getSourceFileEntryForAddress(page(4, addr64k));
		assert.equal(entry?.fileName, dir + '/' + file, msg);
		assert.equal(entry?.lineNr, lineNr - 1, msg);
	}

	test('file names without directory (current z88dk): several sub directories', () => {
		// game/loop.c.lis is read before menu/menu.c.lis; util/extra.c has no .lis file
		const dir = base + 'subdirs_v2';
		load(dir);
		check(dir, 'game/loop.c', 5, 0x8000);
		check(dir, 'game/loop.c', 10, 0x8007);
		check(dir, 'menu/menu.c', 5, 0x8010);
		check(dir, 'util/extra.c', 3, 0x8020);
		assert.equal(lbls.getAddrForFileAndLine('loop.c', 10 - 1), -1);	// Not at the root
		assert.deepEqual(warnings, []);
	});

	test('file names with directory (future z88dk)', () => {
		const dir = base + 'folders_v2';
		load(dir);
		check(dir, 'game/loop.c', 5, 0x8000);
		check(dir, 'game/loop.c', 10, 0x8007);
		check(dir, 'menu/menu.c', 5, 0x8010);
		check(dir, 'util/extra.c', 3, 0x8020);
		assert.deepEqual(warnings, []);
	});

	test('same file name in two directories, with directory (future z88dk)', () => {
		// "test.c" and "menu/test.c": z88dk names both modules "test_c"
		const dir = base + 'samename_v2';
		load(dir);
		check(dir, 'test.c', 5, 0x8000);
		check(dir, 'test.c', 6, 0x8003);
		check(dir, 'menu/test.c', 5, 0x8010);
		check(dir, 'menu/test.c', 6, 0x8013);
		assert.deepEqual(warnings, []);
	});

	test('same file name in two directories, without directory (current z88dk)', () => {
		// The C line symbols of both files have the same names, the linker kept
		// only one set (here those of menu/test.c). They are assigned by
		// address to the file whose code contains them; the lines of the other
		// file are missing: no breakpoints there (rather than wrong ones), and
		// a warning.
		const dir = base + 'samename_nofolder_v2';
		load(dir);
		check(dir, 'menu/test.c', 5, 0x8010);
		check(dir, 'menu/test.c', 6, 0x8013);
		assert.equal(lbls.getAddrForFileAndLine(dir + '/test.c', 5 - 1), -1);
		assert.equal(lbls.getAddrForFileAndLine(dir + '/test.c', 6 - 1), -1);
		assert.equal(warnings.length, 1);
		assert.ok(warnings[0].includes("'test.c'") && warnings[0].includes(dir + '/test.c') && warnings[0].includes(dir + '/menu/test.c'), warnings[0]);
	});
});
