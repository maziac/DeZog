
import * as assert from 'assert';
import {BankType, MemoryModel} from '../src/remotes/Paging/memorymodel';
import {Zx128kMemModel, Zx16kMemModel, Zx48kMemModel, ZxNextMemModel} from '../src/settingspredefinedmemory';

suite('MemoryModel', () => {

	suite('slot ranges', () => {

		test('empty slot range', () => {
			const mm = new MemoryModel([]) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.initialSlots.length, 1);
			assert.equal(mm.initialSlots[0], undefined);
			assert.equal(mm.banks.length, 0);
		});

		test('1 slot range', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 7
						}
					]
				}
			]) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.initialSlots.length, 1);
			assert.equal(mm.initialSlots[0], 7);
			assert.equal(mm.banks.length, 8);
		});

		test('3 slot ranges', () => {
			const mm = new MemoryModel([
				{
					range: [0x1000, 0x7FFF],
					banks: [
						{
							index: 0
						}
					]
				},
				{
					range: [0xA000, 0xAFFF],
					banks: [
						{
							index: 1
						}
					]
				},
				{
					range: [0xB000, 0xEFFF],
					banks: [
						{
							index: 2
						}
					]
				}
			]) as any;
			assert.equal(mm.slotRanges.length, 6);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x0FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.slotRanges[1].start, 0x1000);
			assert.equal(mm.slotRanges[1].end, 0x7FFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);
			assert.equal(mm.slotRanges[2].start, 0x8000);
			assert.equal(mm.slotRanges[2].end, 0x9FFF);
			assert.equal(mm.slotRanges[2].ioMMu, undefined);
			assert.equal(mm.slotRanges[3].start, 0xA000);
			assert.equal(mm.slotRanges[3].end, 0xAFFF);
			assert.equal(mm.slotRanges[3].ioMMu, undefined);
			assert.equal(mm.slotRanges[4].start, 0xB000);
			assert.equal(mm.slotRanges[4].end, 0xEFFF);
			assert.equal(mm.slotRanges[4].ioMMu, undefined);
			assert.equal(mm.slotRanges[5].start, 0xF000);
			assert.equal(mm.slotRanges[5].end, 0xFFFF);
			assert.equal(mm.slotRanges[5].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 6);
			assert.equal(mm.initialSlots[0], undefined);
			assert.equal(mm.initialSlots[1], 0);
			assert.equal(mm.initialSlots[2], undefined);
			assert.equal(mm.initialSlots[3], 1);
			assert.equal(mm.initialSlots[4], 2);
			assert.equal(mm.initialSlots[5], undefined);

			assert.equal(mm.banks.length, 3);
		});
	});

	suite('banks', () => {

		test('2 banks', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0,
							name: 'ROM0',
							shortName: 'R0'
						},
						{
							index: 1,
							name: 'ROM1',
							shortName: 'R1',
						}
					],
					ioMmu: {
						port: 1234,
						dataBits: [0]
					}
				},
			]) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.notEqual(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.initialSlots.length, 1);

			assert.equal(mm.initialSlots[0], 0);

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "ROM0");
			assert.equal(mm.banks[0].shortName, "R0");
			assert.equal(mm.banks[1].name, "ROM1");
			assert.equal(mm.banks[1].shortName, "R1");
		});

		test('2 banks, default names', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0
						},
						{
							index: 1
						}
					],
					ioMmu: {
						port: 1234,
						dataBits: [0]
					},
					initialBank: 1
				},
			]) as any;

			assert.equal(mm.initialSlots[0], 1);
		});


		test('initialBank', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0
						},
						{
							index: 1
						}
					],
					ioMmu: {
						port: 1234,
						dataBits: [0]
					}
				},
			]) as any;

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[1].shortName, "1");
		});


		test('bank size', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0
						}
					]
				},
				{
					range: [0x8000, 0xFFFF],
					banks: [
						{
							index: 1
						}
					]
				}
			]) as any;

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].size, 0x4000);
			assert.equal(mm.banks[1].size, 0x8000);
		});


		test('same bank, 2 sizes', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0x3FFF],
					banks: [
						{
							index: 0
						}
					]
				},
				{
					range: [0x8000, 0xFFFF],
					banks: [
						{
							index: 0
						}
					]
				}
			]) as any;

			assert.equal(mm.banks.length, 1);
			assert.equal(mm.banks[0].size, 0x8000);
		});


		test('bank range', () => {
			const mm = new MemoryModel([
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: [0, 19]
						}
					],
					ioMmu: {
						port: 1234,
						dataBits: [0]
					}
				},
			]) as any;

			assert.equal(mm.banks.length, 20);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[19].name, "BANK19");
			assert.equal(mm.banks[19].shortName, "19");
		});

	});



	suite('errors', () => {

		test('Range-start lower or equal than last range-end', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0x7FFF],
						banks: [{index: 0}]
					},
					{
						range: [0x6000, 0xFFFF],
						banks: [{index: 1}]
					}
				]) as any;
			},
				Error("Range-start lower or equal than last range-end."));
		});

		test('Range-end lower than range-start.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x8000, 0x7FFF],
						banks: [{index: 0}]
					}
				]) as any;
			},
				Error("Range-end lower than range-start."));
		});

		test('No banks specified for range.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0xFFFF],
						banks: []
					}
				]) as any;
			},
				Error("No banks specified for range."));
		});

		test('Different names given for same the bank.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0x7FFF],
						banks: [{
							index: 0,
							name: "BANK0"
						}]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [{
							index: 0,
							name: "ROM0"
						}]
					}
				]) as any;
			},
				Error("Different names given for same the bank."));
		});

		test('Different short names given for the same bank.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0x7FFF],
						banks: [{
							index: 0,
							shortName: "B0"
						}]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [{
							index: 0,
							shortName: "R0"
						}]
					}
				]) as any;
			},
				Error("Different short names given for the same bank."));
		});

		test('Bank index < 0.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0xFFFF],
						banks: [{index: -1}]
					}
				]) as any;
			},
				Error("Bank index < 0."));
		});

		test('Bank index too high.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0xFFFF],
						banks: [{index: 1000}]
					}
				]) as any;
			},
				Error("Bank index too high."));
		});

		test('Bank range: first index bigger than last index.', () => {
			assert.throws(() => {
				new MemoryModel([
					{
						range: [0x0000, 0xFFFF],
						banks: [{
							index: [5, 3]
						}]
					}
				]) as any;
			},
				Error("Bank range: first index bigger than last index."));
		});
	});



	suite('predefined memory models', () => {

		test('ZX16K', () => {
			const mm = new MemoryModel(Zx16kMemModel) as any;
			assert.equal(mm.slotRanges.length, 3);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x3FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.slotRanges[1].start, 0x4000);
			assert.equal(mm.slotRanges[1].end, 0x7FFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);
			assert.equal(mm.slotRanges[2].start, 0x8000);
			assert.equal(mm.slotRanges[2].end, 0xFFFF);
			assert.equal(mm.slotRanges[2].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 3);
			assert.equal(mm.initialSlots[0], 0);
			assert.equal(mm.initialSlots[1], 1);
			assert.equal(mm.initialSlots[2], 2);	// UNUSED

			assert.equal(mm.banks.length, 3);
			assert.equal(mm.banks[0].name, "ROM");
			assert.equal(mm.banks[1].name, "RAM");
			assert.equal(mm.banks[2].name, "UNUSED");
			assert.equal(mm.banks[0].shortName, "");
			assert.equal(mm.banks[1].shortName, "");
			assert.equal(mm.banks[2].shortName, "");
			assert.equal(mm.banks[0].bankType, BankType.RAM);	// TODO: needs to be ROM
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[2].bankType, BankType.UNUSED);

			const memBanks = mm.getMemoryBanks([0, 1, undefined]);
			assert.equal(memBanks.length, 3);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x3FFF);
			assert.equal(memBanks[0].name, "ROM");
			assert.equal(memBanks[1].start, 0x4000);
			assert.equal(memBanks[1].end, 0x7FFF);
			assert.equal(memBanks[1].name, "RAM");
			assert.equal(memBanks[2].start, 0x8000);
			assert.equal(memBanks[2].end, 0xFFFF);
			assert.equal(memBanks[2].name, "UNASSIGNED");
		});


		test('ZX48K', () => {
			const mm = new MemoryModel(Zx48kMemModel) as any;
			assert.equal(mm.slotRanges.length, 2);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x3FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.slotRanges[1].start, 0x4000);
			assert.equal(mm.slotRanges[1].end, 0xFFFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 2);
			assert.equal(mm.initialSlots[0], 0);
			assert.equal(mm.initialSlots[1], 1);

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "ROM");
			assert.equal(mm.banks[1].name, "RAM");

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "ROM");
			assert.equal(mm.banks[1].name, "RAM");
			assert.equal(mm.banks[0].shortName, "");
			assert.equal(mm.banks[1].shortName, "");
			assert.equal(mm.banks[0].bankType, BankType.RAM);	// TODO: needs to be ROM
			assert.equal(mm.banks[1].bankType, BankType.RAM);

			const memBanks = mm.getMemoryBanks([0, 1, undefined]);
			assert.equal(memBanks.length, 2);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x3FFF);
			assert.equal(memBanks[0].name, "ROM");
			assert.equal(memBanks[1].start, 0x4000);
			assert.equal(memBanks[1].end, 0xFFFF);
			assert.equal(memBanks[1].name, "RAM");
		});


		test('ZX128K', () => {
			const mm = new MemoryModel(Zx128kMemModel) as any;
			assert.equal(mm.slotRanges.length, 4);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x3FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.slotRanges[1].start, 0x4000);
			assert.equal(mm.slotRanges[1].end, 0x7FFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);
			assert.equal(mm.slotRanges[2].start, 0x8000);
			assert.equal(mm.slotRanges[2].end, 0xBFFF);
			assert.equal(mm.slotRanges[2].ioMMu, undefined);
			assert.equal(mm.slotRanges[3].start, 0xC000);
			assert.equal(mm.slotRanges[3].end, 0xFFFF);
			assert.equal(mm.slotRanges[3].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 4);
			assert.equal(mm.initialSlots[0], 8);
			assert.equal(mm.initialSlots[1], 5);
			assert.equal(mm.initialSlots[2], 2);
			assert.equal(mm.initialSlots[3], 0);

			assert.equal(mm.banks.length, 10);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[2].name, "BANK2");
			assert.equal(mm.banks[3].name, "BANK3");
			assert.equal(mm.banks[4].name, "BANK4");
			assert.equal(mm.banks[5].name, "BANK5");
			assert.equal(mm.banks[6].name, "BANK6");
			assert.equal(mm.banks[7].name, "BANK7");
			assert.equal(mm.banks[8].name, "ROM0");
			assert.equal(mm.banks[9].name, "ROM1");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[2].shortName, "2");
			assert.equal(mm.banks[3].shortName, "3");
			assert.equal(mm.banks[4].shortName, "4");
			assert.equal(mm.banks[5].shortName, "5");
			assert.equal(mm.banks[6].shortName, "6");
			assert.equal(mm.banks[7].shortName, "7");
			assert.equal(mm.banks[8].shortName, "R0");
			assert.equal(mm.banks[9].shortName, "R1");

			assert.equal(mm.banks.length, 10);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[2].name, "BANK2");
			assert.equal(mm.banks[3].name, "BANK3");
			assert.equal(mm.banks[4].name, "BANK4");
			assert.equal(mm.banks[5].name, "BANK5");
			assert.equal(mm.banks[6].name, "BANK6");
			assert.equal(mm.banks[7].name, "BANK7");
			assert.equal(mm.banks[8].name, "ROM0");
			assert.equal(mm.banks[9].name, "ROM1");

			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[2].shortName, "2");
			assert.equal(mm.banks[3].shortName, "3");
			assert.equal(mm.banks[4].shortName, "4");
			assert.equal(mm.banks[5].shortName, "5");
			assert.equal(mm.banks[6].shortName, "6");
			assert.equal(mm.banks[7].shortName, "7");
			assert.equal(mm.banks[8].shortName, "R0");
			assert.equal(mm.banks[9].shortName, "R1");

			assert.equal(mm.banks[0].bankType, BankType.RAM);
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[2].bankType, BankType.RAM);
			assert.equal(mm.banks[3].bankType, BankType.RAM);
			assert.equal(mm.banks[4].bankType, BankType.RAM);
			assert.equal(mm.banks[5].bankType, BankType.RAM);
			assert.equal(mm.banks[6].bankType, BankType.RAM);
			assert.equal(mm.banks[7].bankType, BankType.RAM);
			assert.equal(mm.banks[8].bankType, BankType.RAM);	// TODO: needs to be ROM
			assert.equal(mm.banks[9].bankType, BankType.RAM);	// TODO: needs to be ROM

			const memBanks = mm.getMemoryBanks([9, 7, 6, 5] );
			assert.equal(memBanks.length, 4);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x3FFF);
			assert.equal(memBanks[0].name, "ROM1");
			assert.equal(memBanks[1].start, 0x4000);
			assert.equal(memBanks[1].end, 0x7FFF);
			assert.equal(memBanks[1].name, "BANK7");
			assert.equal(memBanks[2].start, 0x8000);
			assert.equal(memBanks[2].end, 0xBFFF);
			assert.equal(memBanks[2].name, "BANK6");
			assert.equal(memBanks[3].start, 0xC000);
			assert.equal(memBanks[3].end, 0xFFFF);
			assert.equal(memBanks[3].name, "BANK5");
		});


		test('ZXNEXT', () => {
			const mm = new MemoryModel(ZxNextMemModel) as any;
			assert.equal(mm.slotRanges.length, 8);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x1FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined)
			assert.equal(mm.slotRanges[1].start, 0x2000);
			assert.equal(mm.slotRanges[1].end, 0x3FFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);
			assert.equal(mm.slotRanges[2].start, 0x4000);
			assert.equal(mm.slotRanges[2].end, 0x5FFF);
			assert.equal(mm.slotRanges[2].ioMMu, undefined);
			assert.equal(mm.slotRanges[3].start, 0x6000);
			assert.equal(mm.slotRanges[3].end, 0x7FFF);
			assert.equal(mm.slotRanges[3].ioMMu, undefined);
			assert.equal(mm.slotRanges[4].start, 0x8000);
			assert.equal(mm.slotRanges[4].end, 0x9FFF);
			assert.equal(mm.slotRanges[4].ioMMu, undefined);
			assert.equal(mm.slotRanges[5].start, 0xA000);
			assert.equal(mm.slotRanges[5].end, 0xBFFF);
			assert.equal(mm.slotRanges[5].ioMMu, undefined);
			assert.equal(mm.slotRanges[6].start, 0xC000);
			assert.equal(mm.slotRanges[6].end, 0xDFFF);
			assert.equal(mm.slotRanges[6].ioMMu, undefined);
			assert.equal(mm.slotRanges[7].start, 0xE000);
			assert.equal(mm.slotRanges[7].end, 0xFFFF);
			assert.equal(mm.slotRanges[7].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 8);
			assert.equal(mm.initialSlots[0], 0);
			assert.equal(mm.initialSlots[1], 1);
			assert.equal(mm.initialSlots[2], 2);
			assert.equal(mm.initialSlots[3], 3);
			assert.equal(mm.initialSlots[4], 4);
			assert.equal(mm.initialSlots[5], 5);
			assert.equal(mm.initialSlots[6], 6);
			assert.equal(mm.initialSlots[7], 7);

			assert.equal(mm.banks.length, 256);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[253].name, "BANK253");
			assert.equal(mm.banks[254].name, "ROM");
			assert.equal(mm.banks[255].name, "ROM");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[253].shortName, "253");
			assert.equal(mm.banks[254].shortName, "R");
			assert.equal(mm.banks[255].shortName, "R");

			assert.equal(mm.banks[0].bankType, BankType.RAM);
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[253].bankType, BankType.RAM);
			assert.equal(mm.banks[254].bankType, BankType.RAM);	// TODO: needs to be ROM
			assert.equal(mm.banks[255].bankType, BankType.RAM);	// TODO: needs to be ROM

			const memBanks = mm.getMemoryBanks([254, 255, 6, 5, 3, 0, 251, 6 ]);
			assert.equal(memBanks.length, 8);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x1FFF);
			assert.equal(memBanks[0].name, "ROM");
			assert.equal(memBanks[1].start, 0x2000);
			assert.equal(memBanks[1].end, 0x3FFF);
			assert.equal(memBanks[1].name, "ROM");
			assert.equal(memBanks[2].start, 0x4000);
			assert.equal(memBanks[2].end, 0x5FFF);
			assert.equal(memBanks[2].name, "BANK6");
			assert.equal(memBanks[3].start, 0x6000);
			assert.equal(memBanks[3].end, 0x7FFF);
			assert.equal(memBanks[3].name, "BANK5");
			assert.equal(memBanks[4].start, 0x8000);
			assert.equal(memBanks[4].end, 0x9FFF);
			assert.equal(memBanks[4].name, "BANK3");
			assert.equal(memBanks[5].start, 0xA000);
			assert.equal(memBanks[5].end, 0xBFFF);
			assert.equal(memBanks[5].name, "BANK0");
			assert.equal(memBanks[6].start, 0xC000);
			assert.equal(memBanks[6].end, 0xDFFF);
			assert.equal(memBanks[6].name, "BANK251");
			assert.equal(memBanks[7].start, 0xE000);
			assert.equal(memBanks[7].end, 0xFFFF);
			assert.equal(memBanks[7].name, "BANK6");
		});
	});


	suite('long address calculations', () => {

		test('ZX16K', () => {
			// TODO:
		});
	});
});

