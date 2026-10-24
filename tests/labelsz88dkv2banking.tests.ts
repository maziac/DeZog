import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {LabelsClass} from '../src/labels/labels';
import {MemoryModelZxNext} from '../src/remotes/MemoryModel/zxnextmemorymodels';
import {MemoryModelZx128k, MemoryModelZx48k} from '../src/remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {WorkspacePaths} from '../src/misc/workspacepaths';


/** The banking test projects (built with tests/data/labels/projects/z88dk/banking_v2/build.sh).
 * The map files contain the block of each section (z88dk/z88dk#3197).
 */
suite('Labels (z88dk v2 banking projects)', () => {
	const base = 'tests/data/labels/projects/z88dk/banking_v2/';
	const page = (p: number, addr64k: number) => addr64k + ((p + 1) << 16);
	let lbls: LabelsClass;
	let dir: string;

	setup(() => {
		lbls = new LabelsClass();
		// To work with simpler file names
		(WorkspacePaths as any).rootPath = undefined;
	});

	/** Reads the list and map files of a project. */
	function read(project: string, memModel: MemoryModel, target: 'zx' | 'zxn', lisGlob: string) {
		dir = base + project;
		lbls.readListFiles({
			z88dkv2: [{
				path: './' + dir + '/' + lisGlob,
				mapFile: './' + dir + '/main.map',
				srcDirs: [dir],
				excludeFiles: [],
				target
			}]
		} as any, memModel);
	}

	/** Returns the address of a (1-based) line. */
	function addrOfLine(file: string, lineNr: number): number {
		return lbls.getAddrForFileAndLine(dir + '/' + file, lineNr - 1);
	}


	suite('asm', () => {
		test('zx48', () => {
			const mm = new MemoryModelZx48k();
			read('asm_zx48', mm, 'zx', 'main.lis');
			// No banking: the bank of the slot
			const longMain = lbls.getNumberForLabel('_main')!;
			assert.equal(longMain & 0xFFFF, 0x8000);
			assert.equal(longMain >>> 16, mm.initialSlots[mm.slotAddress64kAssociation[0x8000]] + 1);
			assert.equal(lbls.getNumberForLabel('sub'), longMain + 4);
			assert.equal(addrOfLine('main.asm', 8), longMain);
			assert.equal(addrOfLine('main.asm', 11), longMain + 4);
		});

		test('zx128', () => {
			read('asm_zx128', new MemoryModelZx128k(), 'zx', 'main.lis');
			// CODE: no bank prefix, 16 bit: default (bank 2 at 0x8000)
			assert.equal(lbls.getNumberForLabel('_main'), page(2, 0x8000));
			// BANK_3 with 16 bit ORG
			assert.equal(lbls.getNumberForLabel('_bank3_fn'), page(3, 0xC000));
			assert.equal(addrOfLine('main.asm', 23), page(3, 0xC001));
			// 24 bit ORG $04C000
			assert.equal(lbls.getNumberForLabel('_far'), page(4, 0xC000));
			assert.equal(addrOfLine('main.asm', 29), page(4, 0xC001));
		});

		test('zxn', () => {
			read('asm_zxn', new MemoryModelZxNext(), 'zxn', 'main.lis');
			// CODE: default (page 11 at 0x6000)
			assert.equal(lbls.getNumberForLabel('_main'), page(11, 0x6000));
			// BANK_0 at 0x8000: page 0, not the default page 4
			assert.equal(lbls.getNumberForLabel('_banked'), page(0, 0x8000));
			assert.equal(addrOfLine('main.asm', 31), page(0, 0x8001));
			// BANK_3_H: upper 8k of bank 3
			assert.equal(lbls.getNumberForLabel('_bank3h_fn'), page(7, 0xE000));
			// PAGE_21, continued in page 22
			assert.equal(lbls.getNumberForLabel('_page21_fn'), page(21, 0xC100));
			assert.equal(lbls.getNumberForLabel('_page22_data'), page(22, 0xE102));
			assert.equal(addrOfLine('main.asm', 43), page(21, 0xC101));
			assert.equal(addrOfLine('main.asm', 47), page(22, 0xE103));
			// 24 bit ORG $14C000
			assert.equal(lbls.getNumberForLabel('_far'), page(20, 0xC000));
		});
	});


	suite('C', () => {
		test('zx48', () => {
			const mm = new MemoryModelZx48k();
			read('c_zx48', mm, 'zx', '*.c.lis');
			const bank = mm.initialSlots[mm.slotAddress64kAssociation[0x8000]];
			assert.equal(lbls.getNumberForLabel('_main'), page(bank, 0x8C48));
			assert.equal(lbls.getNumberForLabel('_banked_fn'), page(bank, 0x8C51));
			assert.equal(addrOfLine('banked.c', 3), page(bank, 0x8C59));
		});

		test('zx128', () => {
			read('c_zx128', new MemoryModelZx128k(), 'zx', '*.c.lis');
			assert.equal(lbls.getNumberForLabel('_main'), page(2, 0x8C48));
			// --codesegBANK_6, 16 bit address $C000
			assert.equal(lbls.getNumberForLabel('_banked_fn'), page(6, 0xC000));
			assert.equal(addrOfLine('banked.c', 1), page(6, 0xC000));
			assert.equal(addrOfLine('banked.c', 3), page(6, 0xC008));
			const entry = lbls.getSourceFileEntryForAddress(page(6, 0xC008))!;
			assert.equal(entry.fileName, dir + '/banked.c');
			assert.equal(entry.lineNr, 3 - 1);
		});

		test('zxn', () => {
			read('c_zxn', new MemoryModelZxNext(), 'zxn', '*.c.lis');
			assert.equal(lbls.getNumberForLabel('_main'), page(4, 0x8C48));
			// --codesegPAGE_20, 16 bit address $C000
			assert.equal(lbls.getNumberForLabel('_banked_fn'), page(20, 0xC000));
			assert.equal(addrOfLine('banked.c', 3), page(20, 0xC008));
			const entry = lbls.getSourceFileEntryForAddress(page(20, 0xC008))!;
			assert.equal(entry.fileName, dir + '/banked.c');
			assert.equal(entry.lineNr, 3 - 1);
		});
	});
});
