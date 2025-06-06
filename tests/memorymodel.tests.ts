
import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {BankType, MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {MemoryModelZx128k, MemoryModelZx16k, MemoryModelZx48k} from '../src/remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../src/remotes/MemoryModel/zxnextmemorymodels';
import {Z80Registers, Z80RegistersClass} from '../src/remotes/z80registers';
import {Settings} from '../src/settings/settings';
import {MemoryModelColecoVision} from '../src/remotes/MemoryModel/colecovisionmemorymodels';

suite('MemoryModel', () => {

	suite('createBankName', () => {
		test('normal usage', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.createBankName(undefined, 1), undefined);
			assert.equal(mm.createBankName('normal', 1), 'normal');
		});

		test('evaluate', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.createBankName('bank${index}', 2), 'bank2');
		});
	});

	suite('createBankShortName', () => {
		test('normal usage', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.createBankShortName(undefined, 1), undefined);
			assert.equal(mm.createBankShortName('normal', 1), 'normal');
		});

		test('evaluate', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.createBankShortName('bank${index}', 2), 'bank2');
		});
	});


	suite('slot ranges', () => {

		test('empty slot range', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.initialSlots.length, 1);
			assert.equal(mm.initialSlots[0], 0);
			assert.equal(mm.banks.length, 1);
		});

		test('1 slot range', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0xFFFF],
						banks: [
							{
								index: 7
							}
						]
					}
				]
			}) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.initialSlots.length, 1);
			assert.equal(mm.initialSlots[0], 7);
			assert.equal(mm.banks.length, 8);
		});

		test('3 slot ranges', () => {
			const mm = new MemoryModel({
				slots: [
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
				]
			}) as any;
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
			assert.equal(mm.initialSlots[0], 3);
			assert.equal(mm.initialSlots[1], 0);
			assert.equal(mm.initialSlots[2], 4);
			assert.equal(mm.initialSlots[3], 1);
			assert.equal(mm.initialSlots[4], 2);
			assert.equal(mm.initialSlots[5], 5);

			assert.equal(mm.banks.length, 6);
		});
	});



	suite('slot banks', () => {

		test('empty slot range', () => {
			const mm = new MemoryModel({slots: []}) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].banks.size, 1);
			assert.equal(mm.getBanksFor(0x1000).size, 1);
		});

		test('A few banks', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0xFFFF],
						banks: [
							{
								index: 0
							},
							{
								index: 1
							},
							{
								index: [2, 9]
							}
						]
					}
				]
			}) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].banks.size, 10);

			const banks = mm.getBanksFor(0xFFFF);
			assert.equal(banks.size, 10);
			for (let i = 0; i < banks.size; i++)
				assert.ok(banks.has(i));
		});


		test('Mixed', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x1000, 0x7FFF],
						banks: [
							{
								index: 0
							},
							{
								index: 5
							}
						]
					},
					{
						range: [0xA000, 0xBFFF],
						banks: [
							{
								index: [10, 20]
							}
						]
					}
				]
			}) as any;

			assert.equal(mm.slotRanges.length, 5);

			assert.equal(mm.slotRanges[0].banks.size, 1);
			assert.equal(mm.slotRanges[1].banks.size, 2);
			assert.equal(mm.slotRanges[2].banks.size, 1);
			assert.equal(mm.slotRanges[3].banks.size, 11);
			assert.equal(mm.slotRanges[4].banks.size, 1);

			assert.equal(mm.getBanksFor(0x0000).size, 1);
			assert.equal(mm.getBanksFor(0x0FFF).size, 1);
			assert.equal(mm.getBanksFor(0x1000).size, 2);
			assert.equal(mm.getBanksFor(0x7FFF).size, 2);
			assert.equal(mm.getBanksFor(0x8000).size, 1);
			assert.equal(mm.getBanksFor(0x9FFF).size, 1);
			assert.equal(mm.getBanksFor(0xA000).size, 11);
			assert.equal(mm.getBanksFor(0xBFFF).size, 11);
			assert.equal(mm.getBanksFor(0xC000).size, 1);
			assert.equal(mm.getBanksFor(0xFFFF).size, 1);
		});
	});



	suite('slot/address association', () => {

		test('assigned and unassigned', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x1000, 0x7F11],
						banks: [
							{
								index: 0
							}
						]
					},
					{
						range: [0xA123, 0xAF00],
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
				]
			}) as any;

			assert.equal(mm.slotRanges.length, 7);
			assert.equal(mm.slotAddress64kAssociation[0x0000], 0);	// Slot 0, bank 3, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0x0FFF], 0);	// Slot 0, bank 3, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0x1000], 1);	// Slot 1, bank 0
			assert.equal(mm.slotAddress64kAssociation[0x7F11], 1);	// Slot 1, bank 0
			assert.equal(mm.slotAddress64kAssociation[0x7F12], 2);	// Slot 2, bank 4, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0xA122], 2);	// Slot 2, bank 4, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0xA123], 3);	// Slot 3, bank 1
			assert.equal(mm.slotAddress64kAssociation[0xAF00], 3);	// Slot 3, bank 1
			assert.equal(mm.slotAddress64kAssociation[0xAF01], 4);	// Slot 4, bank 5, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0xAFFF], 4);	// Slot 4, bank 5, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0xB000], 5);	// Slot 5, bank 2
			assert.equal(mm.slotAddress64kAssociation[0xEFFF], 5);	// Slot 5, bank 2
			assert.equal(mm.slotAddress64kAssociation[0xF000], 6);	// Slot 6, bank 6, UNUSED
			assert.equal(mm.slotAddress64kAssociation[0xFFFF], 6);	// Slot 6, bank 6, UNUSED
		});
	});


	suite('banks', () => {

		test('2 banks', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0xFFFF],
						name: "slotROM",
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
						]
					}
				],
				ioMmu: "slotROM = 0;"
			}) as any;
			assert.equal(mm.slotRanges.length, 1);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0xFFFF);
			assert.equal(mm.initialSlots.length, 1);

			assert.equal(mm.initialSlots[0], 0);

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "ROM0");
			assert.equal(mm.banks[0].shortName, "R0");
			assert.equal(mm.banks[1].name, "ROM1");
			assert.equal(mm.banks[1].shortName, "R1");

			assert.notEqual(mm.ioMmu, undefined);
		});

		test('2 banks, default names', () => {
			const mm = new MemoryModel({
				slots: [
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
						initialBank: 1
					},
				],
				ioMmu: "slotROM = 0;"
			}) as any;

			assert.equal(mm.initialSlots[0], 1);
		});


		test('initialBank', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0xFFFF],
						banks: [
							{
								index: 0
							},
							{
								index: 1
							}
						]
					}
				],
				ioMmu: "slotROM = 0;"
			}) as any;

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[1].shortName, "1");
		});


		test('bank size', () => {
			const mm = new MemoryModel({
				slots: [
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
				]
			}) as any;

			assert.equal(mm.banks.length, 3);
			assert.equal(mm.banks[0].size, 0x4000);
			assert.equal(mm.banks[1].size, 0x8000);
			assert.equal(mm.banks[2].size, 0x4000);	// UNUSED
		});


		test('same bank, 2 sizes', () => {
			const mm = new MemoryModel({
				slots: [
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
				]
			}) as any;

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].size, 0x8000);
			assert.equal(mm.banks[1].size, 0x4000);	// UNUSED
		});


		test('same bank, 2 different names', () => {
			// First name is used, second name is ignored
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x3FFF],
						banks: [
							{
								index: 0,
								name: "MYBANK"
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: 0,
								name: "MYOTHERNAMEDBANK"
							}
						]
					}
				]
			}) as any;

			assert.equal(mm.banks.length, 2);
			assert.equal(mm.banks[0].name, "MYBANK");
		});


		test('same bank, 2 different short names', () => {
			// First name is used, second name is ignored
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x3FFF],
						banks: [
							{
								index: 0,
								shortName: "MYSHORTBANK"
							},
							{
								index: 1
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: 0,
								shortName: "MYSHORTOTHERNAMEDBANK"
							},
							{
								index: 1
							}
						]
					}
				]
			}) as any;

			assert.equal(mm.banks.length, 3);
			assert.equal(mm.banks[0].shortName, "MYSHORTBANK");
		});

		test('short names, unused', () => {
			// shortNames are unused if there is only one bank in one slot.
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x3FFF],
						banks: [
							{
								index: 0,
								shortName: "MYSHORTBANK"
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: [1, 2],
								shortName: "M${index}"
							}
						]
					}
				]
			}) as any;

			assert.equal(mm.banks.length, 4);
			assert.equal(mm.banks[0].shortName, "MYSHORTBANK");
			assert.equal(mm.banks[1].shortName, "M1");
			assert.equal(mm.banks[2].shortName, "M2");
		});

		test('different banks, same names', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x3FFF],
						banks: [
							{
								index: 0,
								name: "MYBANK"
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: 2,
								name: "MYBANK"
							}
						]
					}
				]
			}) as any;

			assert.equal(mm.banks.length, 4);
			assert.equal(mm.banks[0].name, "MYBANK");
			assert.equal(mm.banks[2].name, "MYBANK");	// Makes no sense but is allowed
		});


		test('different banks, same short names', () => {
			assert.throws(() => {
				new MemoryModel({	// NOSONAR
					slots: [
						{
							range: [0x0000, 0x3FFF],
							banks: [
								{
									index: 0,
									shortName: "MYSHORTBANK"
								},
								{
									index: 3
								}
							]
						},
						{
							range: [0x8000, 0xFFFF],
							banks: [
								{
									index: 2,
									shortName: "MYSHORTBANK"
								},
								{
									index: 4
								}
							]
						}
					]
				});
			}, Error);
		});


		test('bank range', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0xFFFF],
						banks: [
							{
								index: [0, 19]
							}
						]
					}
				],
				ioMmu: "slotROM = 0;"
			}) as any;

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
				new MemoryModel({
					slots: [
						{
							range: [0x0000, 0x7FFF],
							banks: [{index: 0}]
						},
						{
							range: [0x6000, 0xFFFF],
							banks: [{index: 1}]
						}
					]
				}) as any;
			});
		});

		test('Range-end lower than range-start.', () => {
			assert.throws(() => {
				new MemoryModel({
					slots: [
						{
							range: [0x8000, 0x7FFF],
							banks: [{index: 0}]
						}
					]
				}) as any;
			});
		});

		test('No banks specified for range.', () => {
			assert.throws(() => {
				new MemoryModel({
					slots: [
						{
							range: [0x0000, 0xFFFF],
							banks: []
						}
					]
				}) as any;
			},
				Error("No banks specified for range."));
		});

		test('Bank index < 0.', () => {
			assert.throws(() => {
				new MemoryModel({
					slots: [
						{
							range: [0x0000, 0xFFFF],
							banks: [{index: -1}]
						}
					]
				}) as any;
			},
				Error("Bank index < 0."));
		});

		test('Bank index too high.', () => {
			assert.throws(() => {
				new MemoryModel({
					slots: [
						{
							range: [0x0000, 0xFFFF],
							banks: [{index: 1000}]
						}
					]
				}) as any;
			},
				Error("Bank index too high."));
		});

		test('Bank range: first index bigger than last index.', () => {
			assert.throws(() => {
				new MemoryModel({
					slots: [
						{
							range: [0x0000, 0xFFFF],
							banks: [{
								index: [5, 3]
							}]
						}
					]
				}) as any;
			},
				Error("Bank range: first index bigger than last index."));
		});
	});



	suite('predefined memory models', () => {

		test('ZX16K', () => {
			const mm = new MemoryModelZx16k() as any;
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
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[2].shortName, "");
			assert.equal(mm.banks[0].bankType, BankType.ROM);
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
			const mm = new MemoryModelZx48k() as any;
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
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[0].bankType, BankType.ROM);
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
			const mm = new MemoryModelZx128k() as any;
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
			assert.equal(mm.banks[8].bankType, BankType.ROM);
			assert.equal(mm.banks[9].bankType, BankType.ROM);

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


		test('ZXNEXT (MemoryModelZxNextOneROM)', () => {
			const mm = new MemoryModelZxNextOneROM() as any;
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
			assert.equal(mm.initialSlots[0], 0xFE);
			assert.equal(mm.initialSlots[1], 0xFF);
			assert.equal(mm.initialSlots[2], 10);
			assert.equal(mm.initialSlots[3], 11);
			assert.equal(mm.initialSlots[4], 4);
			assert.equal(mm.initialSlots[5], 5);
			assert.equal(mm.initialSlots[6], 0);
			assert.equal(mm.initialSlots[7], 1);

			assert.equal(mm.banks.length, 256);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[223].name, "BANK223");
			assert.equal(mm.banks[254].name, "ROM");
			assert.equal(mm.banks[255].name, "ROM");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[223].shortName, "223");
			assert.equal(mm.banks[254].shortName, "R");
			assert.equal(mm.banks[255].shortName, "R");

			assert.equal(mm.banks[0].bankType, BankType.RAM);
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[223].bankType, BankType.RAM);
			assert.equal(mm.banks[255].bankType, BankType.ROM);
			assert.equal(mm.banks[254].bankType, BankType.ROM);

			const memBanks = mm.getMemoryBanks([254, 255, 6, 5, 3, 0, 251, 6]);
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


		test('ZXNEXT (MemoryModelZxNextTwoRom)', () => {
			const mm = new MemoryModelZxNextTwoRom() as any;
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
			assert.equal(mm.initialSlots[0], 0xFE);
			assert.equal(mm.initialSlots[1], 0xFF);
			assert.equal(mm.initialSlots[2], 10);
			assert.equal(mm.initialSlots[3], 11);
			assert.equal(mm.initialSlots[4], 4);
			assert.equal(mm.initialSlots[5], 5);
			assert.equal(mm.initialSlots[6], 0);
			assert.equal(mm.initialSlots[7], 1);

			assert.equal(mm.banks.length, 256);
			assert.equal(mm.banks[0].name, "BANK0");
			assert.equal(mm.banks[1].name, "BANK1");
			assert.equal(mm.banks[223].name, "BANK223");
			assert.equal(mm.banks[252].name, "ROM0");
			assert.equal(mm.banks[253].name, "ROM0");
			assert.equal(mm.banks[254].name, "ROM1");
			assert.equal(mm.banks[255].name, "ROM1");
			assert.equal(mm.banks[0].shortName, "0");
			assert.equal(mm.banks[1].shortName, "1");
			assert.equal(mm.banks[223].shortName, "223");
			assert.equal(mm.banks[252].shortName, "R0");
			assert.equal(mm.banks[253].shortName, "R0");
			assert.equal(mm.banks[254].shortName, "R1");
			assert.equal(mm.banks[255].shortName, "R1");

			assert.equal(mm.banks[0].bankType, BankType.RAM);
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[223].bankType, BankType.RAM);
			assert.equal(mm.banks[252].bankType, BankType.ROM);
			assert.equal(mm.banks[253].bankType, BankType.ROM);
			assert.equal(mm.banks[254].bankType, BankType.ROM);
			assert.equal(mm.banks[255].bankType, BankType.ROM);

			const memBanks = mm.getMemoryBanks([254, 255, 6, 5, 3, 0, 251, 6]);
			assert.equal(memBanks.length, 8);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x1FFF);
			assert.equal(memBanks[0].name, "ROM1");
			assert.equal(memBanks[1].start, 0x2000);
			assert.equal(memBanks[1].end, 0x3FFF);
			assert.equal(memBanks[1].name, "ROM1");
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


		test('COLECOVISION', () => {
			const mm = new MemoryModelColecoVision() as any;
			assert.equal(mm.slotRanges.length, 6);
			assert.equal(mm.slotRanges[0].start, 0x0000);
			assert.equal(mm.slotRanges[0].end, 0x1FFF);
			assert.equal(mm.slotRanges[0].ioMMu, undefined);
			assert.equal(mm.slotRanges[1].start, 0x2000);
			assert.equal(mm.slotRanges[1].end, 0x5FFF);
			assert.equal(mm.slotRanges[1].ioMMu, undefined);
			assert.equal(mm.slotRanges[2].start, 0x6000);
			assert.equal(mm.slotRanges[2].end, 0x6FFF);
			assert.equal(mm.slotRanges[2].ioMMu, undefined);
			assert.equal(mm.slotRanges[3].start, 0x7000);
			assert.equal(mm.slotRanges[3].end, 0x73FF);
			assert.equal(mm.slotRanges[3].ioMMu, undefined);
			assert.equal(mm.slotRanges[4].start, 0x7400);
			assert.equal(mm.slotRanges[4].end, 0x7FFF);
			assert.equal(mm.slotRanges[4].ioMMu, undefined);
			assert.equal(mm.slotRanges[5].start, 0x8000);
			assert.equal(mm.slotRanges[5].end, 0xFFFF);
			assert.equal(mm.slotRanges[5].ioMMu, undefined);

			assert.equal(mm.initialSlots.length, 6);
			assert.equal(mm.initialSlots[0], 0);
			assert.equal(mm.initialSlots[1], 1);
			assert.equal(mm.initialSlots[2], 4);	// UNUSED
			assert.equal(mm.initialSlots[3], 2);
			assert.equal(mm.initialSlots[4], 5);	// UNUSED
			assert.equal(mm.initialSlots[5], 3);

			assert.equal(mm.banks.length, 6);
			assert.equal(mm.banks[0].name, "BIOS");
			assert.equal(mm.banks[1].name, "Expansion port");
			assert.equal(mm.banks[2].name, "RAM (1k)");
			assert.equal(mm.banks[3].name, "Cartridge ROM");
			assert.equal(mm.banks[4].name, "UNUSED");
			assert.equal(mm.banks[5].name, "UNUSED");
			assert.equal(mm.banks[0].shortName, "BIOS");
			assert.equal(mm.banks[1].shortName, "EXP");
			assert.equal(mm.banks[2].shortName, "RAM");
			assert.equal(mm.banks[3].shortName, "CR");
			assert.equal(mm.banks[4].shortName, "");
			assert.equal(mm.banks[5].shortName, "");
			assert.equal(mm.banks[0].bankType, BankType.ROM);
			assert.equal(mm.banks[1].bankType, BankType.RAM);
			assert.equal(mm.banks[2].bankType, BankType.RAM);
			assert.equal(mm.banks[3].bankType, BankType.ROM);
			assert.equal(mm.banks[4].bankType, BankType.UNUSED);
			assert.equal(mm.banks[5].bankType, BankType.UNUSED);

			const memBanks = mm.getMemoryBanks([0, 1, 4, 2, 5, 3]);
			assert.equal(memBanks.length, 6);
			assert.equal(memBanks[0].start, 0x0000);
			assert.equal(memBanks[0].end, 0x1FFF);
			assert.equal(memBanks[0].name, "BIOS");
			assert.equal(memBanks[1].start, 0x2000);
			assert.equal(memBanks[1].end, 0x5FFF);
			assert.equal(memBanks[1].name, "Expansion port");
			assert.equal(memBanks[2].start, 0x6000);
			assert.equal(memBanks[2].end, 0x6FFF);
			assert.equal(memBanks[2].name, "UNUSED");
			assert.equal(memBanks[3].start, 0x7000);
			assert.equal(memBanks[3].end, 0x73FF);
			assert.equal(memBanks[3].name, "RAM (1k)");
			assert.equal(memBanks[4].start, 0x7400);
			assert.equal(memBanks[4].end, 0x7FFF);
			assert.equal(memBanks[4].name, "UNUSED");
			assert.equal(memBanks[5].start, 0x8000);
			assert.equal(memBanks[5].end, 0xFFFF);
			assert.equal(memBanks[5].name, "Cartridge ROM");
		});
	});


	suite('long address and slot calculations', () => {

		let launch;
		setup(() => {
			const cfgEmpty: any = {
			};
			launch = Settings.Init(cfgEmpty);
		});

		test('ZX16K', () => {
			const mm = new MemoryModelZx16k() as any;
			assert.equal(mm.slotRanges.length, 3);
			const slots = [0, 1, 2];	// 0 = ROM (0-0x3FFF), 1 = RAM (0x4000-0x7FFF), 2 = UNUSED (0x8000-0xFFFF)

			// Z80Registers
			Z80RegistersClass.createRegisters(launch);
			mm.init();

			// Long address
			assert.equal(Z80Registers.createLongAddress(0x0000, slots), 0x010000); // 0x01... = bank 0
			assert.equal(Z80Registers.createLongAddress(0x3FFF, slots), 0x013FFF); // 0x01... = bank 0
			assert.equal(Z80Registers.createLongAddress(0x4000, slots), 0x024000); // 0x02... = bank 1
			assert.equal(Z80Registers.createLongAddress(0x7FFF, slots), 0x027FFF); // 0x02... = bank 1
			assert.equal(Z80Registers.createLongAddress(0x8000, slots), 0x038000); // 0x03... = bank 2, UNUSED
			assert.equal(Z80Registers.createLongAddress(0xFFFF, slots), 0x03FFFF); // 0x03... = bank 2, UNUSED

			// Slots
			assert.equal(Z80Registers.getSlotFromAddress(0x0000), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x3FFF), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x4000), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0x7FFF), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0x8000), 2);
			assert.equal(Z80Registers.getSlotFromAddress(0xFFFF), 2);
		});

		test('ZX48K', () => {
			const mm = new MemoryModelZx48k() as any;
			assert.equal(mm.slotRanges.length, 2);
			const slots = [0, 1];	// 0 = ROM (0-0x3FFF), 1 = RAM (0x4000-0x7FFF)

			// Z80Registers
			Z80RegistersClass.createRegisters(launch);
			mm.init();

			// Long address
			assert.equal(Z80Registers.createLongAddress(0x0000, slots), 0x010000); // 0x01... = bank 0
			assert.equal(Z80Registers.createLongAddress(0x3FFF, slots), 0x013FFF); // 0x01... = bank 0
			assert.equal(Z80Registers.createLongAddress(0x4000, slots), 0x024000); // 0x02... = bank 1
			assert.equal(Z80Registers.createLongAddress(0xFFFF, slots), 0x02FFFF); // 0x02... = bank 1

			// Slots
			assert.equal(Z80Registers.getSlotFromAddress(0x0000), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x3FFF), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x4000), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0xFFFF), 1);
		});

		test('ZX128K', () => {
			const mm = new MemoryModelZx128k() as any;
			assert.equal(mm.slotRanges.length, 4);
			const slots = [0, 1, 2, 3];	// 4 slots a 16K

			// Z80Registers
			Z80RegistersClass.createRegisters(launch);
			mm.init();

			// Long address
			assert.equal(Z80Registers.createLongAddress(0x0000, slots), 0x010000);
			assert.equal(Z80Registers.createLongAddress(0x4000, slots), 0x024000);
			assert.equal(Z80Registers.createLongAddress(0x8000, slots), 0x038000);
			assert.equal(Z80Registers.createLongAddress(0xC000, slots), 0x04C000);

			// Slots
			assert.equal(Z80Registers.getSlotFromAddress(0x0000), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x4000), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0x8000), 2);
			assert.equal(Z80Registers.getSlotFromAddress(0xC000), 3);
		});

		test('ZXNEXT (MemoryModelZxNextOneROM)', () => {
			const mm = new MemoryModelZxNextOneROM() as any;
			assert.equal(mm.slotRanges.length, 8);
			const slots = [7, 6, 5, 4, 3, 2, 1, 0];	// 8 slots a 8K

			// Z80Registers
			Z80RegistersClass.createRegisters(launch);
			mm.init();

			// Long address
			assert.equal(Z80Registers.createLongAddress(0x0000, slots), 0x080000);
			assert.equal(Z80Registers.createLongAddress(0x2000, slots), 0x072000);
			assert.equal(Z80Registers.createLongAddress(0x4000, slots), 0x064000);
			assert.equal(Z80Registers.createLongAddress(0x6000, slots), 0x056000);
			assert.equal(Z80Registers.createLongAddress(0x8000, slots), 0x048000);
			assert.equal(Z80Registers.createLongAddress(0xA000, slots), 0x03A000);
			assert.equal(Z80Registers.createLongAddress(0xC000, slots), 0x02C000);
			assert.equal(Z80Registers.createLongAddress(0xE000, slots), 0x01E000);

			// Slots
			assert.equal(Z80Registers.getSlotFromAddress(0x0000), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x2000), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0x4000), 2);
			assert.equal(Z80Registers.getSlotFromAddress(0x6000), 3);
			assert.equal(Z80Registers.getSlotFromAddress(0x8000), 4);
			assert.equal(Z80Registers.getSlotFromAddress(0xA000), 5);
			assert.equal(Z80Registers.getSlotFromAddress(0xC000), 6);
			assert.equal(Z80Registers.getSlotFromAddress(0xE000), 7);
		});

		test('ZXNEXT (MemoryModelZxNextTwoRom)', () => {
			const mm = new MemoryModelZxNextTwoRom() as any;
			assert.equal(mm.slotRanges.length, 8);
			const slots = [7, 6, 5, 4, 3, 2, 1, 0];	// 8 slots a 8K

			// Z80Registers
			Z80RegistersClass.createRegisters(launch);
			mm.init();

			// Long address
			assert.equal(Z80Registers.createLongAddress(0x0000, slots), 0x080000);
			assert.equal(Z80Registers.createLongAddress(0x2000, slots), 0x072000);
			assert.equal(Z80Registers.createLongAddress(0x4000, slots), 0x064000);
			assert.equal(Z80Registers.createLongAddress(0x6000, slots), 0x056000);
			assert.equal(Z80Registers.createLongAddress(0x8000, slots), 0x048000);
			assert.equal(Z80Registers.createLongAddress(0xA000, slots), 0x03A000);
			assert.equal(Z80Registers.createLongAddress(0xC000, slots), 0x02C000);
			assert.equal(Z80Registers.createLongAddress(0xE000, slots), 0x01E000);

			// Slots
			assert.equal(Z80Registers.getSlotFromAddress(0x0000), 0);
			assert.equal(Z80Registers.getSlotFromAddress(0x2000), 1);
			assert.equal(Z80Registers.getSlotFromAddress(0x4000), 2);
			assert.equal(Z80Registers.getSlotFromAddress(0x6000), 3);
			assert.equal(Z80Registers.getSlotFromAddress(0x8000), 4);
			assert.equal(Z80Registers.getSlotFromAddress(0xA000), 5);
			assert.equal(Z80Registers.getSlotFromAddress(0xC000), 6);
			assert.equal(Z80Registers.getSlotFromAddress(0xE000), 7);
		});
	});



	suite('parse', () => {

		test('empty slot range', () => {
			const mm = new MemoryModel({slots: []}) as any;

			assert.throws(() => {
				mm.parseBank(0x0000, '0');
			}, Error);

			assert.throws(() => {
				mm.parseBank(0x0000, 'abcd');
			}, Error);
		});

		test('different banks', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x7FFF],
						banks: [
							{
								index: 0,
								shortName: 'R0'
							},
							{
								index: 1,
								shortName: 'R1',
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: 2,
								shortName: 'CUSTOMNAME${index}'
							},
							{
								index: 3,
								shortName: 'CUSTOMNAME_B'
							},
							{
								index: [10, 15],
								shortName: 'BANK${index}',
							}
						]
					},
				]
			}) as any;
			assert.equal(mm.slotRanges.length, 2);
			assert.equal(mm.slotRanges[0].banks.size, 2);
			assert.equal(mm.slotRanges[1].banks.size, 8);

			let banks = mm.getBanksFor(0x0000);
			assert.equal(banks.size, 2);
			assert.ok(banks.has(0));
			assert.ok(banks.has(1));

			banks = mm.getBanksFor(0xFFFF);
			assert.equal(banks.size, 8);
			for (let b = 2; b <= 3; b++) {
				assert.ok(banks.has(b), b.toString());
			}
			for (let b = 10; b <= 15; b++) {
				assert.ok(banks.has(b), b.toString());
			}

			assert.equal(mm.parseShortNameForBank('R0'), 0);
			assert.equal(mm.parseShortNameForBank('R1'), 1);
			assert.equal(mm.parseShortNameForBank('CUSTOMNAME2'), 2);
			assert.equal(mm.parseShortNameForBank('CUSTOMNAME_B'), 3);

			for (let b = 10; b <= 15; b++) {
				assert.equal(mm.parseShortNameForBank('BANK' + b), b);
			}
		});


		test('no switched banks', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x7FFF],
						banks: [
							{
								index: 0,
							}
						]
					},
				]
			});

			// No bank info required
			assert.equal(mm.parseBank(0x0000, ''), 0);
		});


		test('errors', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x3FFF],
						banks: [
							{
								index: 0,
								shortName: 'R0'
							},
							{
								index: 1,
								shortName: 'R1',
							}
						]
					},
					{
						range: [0x8000, 0xFFFF],
						banks: [
							{
								index: 2,
								shortName: 'CUSTOMNAME${index}'
							},
							{
								index: 3,
								shortName: 'CUSTOMNAME_B'
							},
							{
								index: [10, 15],
								shortName: 'BANK${index}',
							}
						]
					},
				]
			}) as any;

			assert.throws(() => {
				// "Bank with shortName does not exist ..."
				mm.parseShortNameForBank('R0xxx');
			}, Error);

			assert.throws(() => {
				// "Bank with shortName does not exist ..."
				mm.parseBank(0x0000, 'R0xxx');
			}, Error);

			assert.throws(() => {
				// "Bank is not reachable ..."
				mm.parseBank(0x8000, 'R0');
			}, Error);

			// Should not throw:
			mm.parseBank(0x4000, '');

			assert.throws(() => {
				// "... lacks bank info ..."
				mm.parseBank(0x8000, '');
			}, Error);

			assert.throws(() => {
				// "Bank with shortName does not exist ..."
				mm.parseBank(0x0000, 'R0xxx');
			}, Error);
		});
	});
});

