import { Utility } from './../src/misc/utility';
import * as assert from 'assert';
import {MemBuffer} from '../src/misc/membuffer';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import { CustomMemorySlot} from '../src/settings/settingscustommemory';

// Simply publicly expose protected members
class MemBufferInt extends MemBuffer {
	public getReadOffset() {
		return this.readOffset;
	}
}

// For testing
class PagedMemory extends SimulatedMemory {
	constructor(slotCount: number, bankCount: number) {
		const slotRanges: CustomMemorySlot[] = [];
		const slotSize = 0x10000 / slotCount;
		const banksPerSlot = bankCount / slotCount;
		let indexStart = 0;
		let rangeStart = 0;
		for (let i = 0; i < slotCount; i++) {
			slotRanges.push({
				range: [rangeStart, rangeStart + slotSize - 1],
				initialBank: indexStart,
				banks: [{
					index: [indexStart, indexStart + banksPerSlot - 1]
				}]
			});
			// Next
			indexStart += banksPerSlot;
			rangeStart += slotSize;
		}
		const memModel = new MemoryModel({
			slots: slotRanges,
		});
		const ports = new Z80Ports(0xFF);
		super(memModel, ports);
	}
}


suite('SimulatedMemory', () => {

	test('serialize/deserialize', () => {
		let memBuffer: MemBufferInt;
		let writeSize: number;
		{
			const mem = new PagedMemory(8, 256);

			// Set slots
			mem.setSlot(0, 253);
			mem.setSlot(1, 200);
			mem.setSlot(2, 150);
			mem.setSlot(3, 100);
			mem.setSlot(4, 80);
			mem.setSlot(5, 60);
			mem.setSlot(6, 30);
			mem.setSlot(7, 5);

			// Set some memory
			mem.write8(0x0000, 10);
			mem.write8(0x0010, 11);
			mem.write8(0x1FFF, 12);
			mem.write8(0x2000, 13);
			mem.write8(0x4000, 14);
			mem.write8(0x6000, 15);
			mem.write8(0x8000, 16);
			mem.write8(0xA000, 17);
			mem.write8(0xC000, 18);
			mem.write8(0xE000, 19);
			mem.write8(0xFFFF, 20);

			// Get size
			writeSize = mem.getSerializedSize();

			// Serialize
			memBuffer = new MemBufferInt(writeSize);
			mem.serialize(memBuffer);
		}

		// Create a new object
		const rMem = new PagedMemory(8, 256);
		rMem.deserialize(memBuffer);

		// Check size
		const readSize = memBuffer.getReadOffset();
		assert.equal(readSize, writeSize);

		// Test the slots/banks
		const slots = rMem.getSlots();
		assert.equal(slots[0], 253);
		assert.equal(slots[1], 200);
		assert.equal(slots[2], 150);
		assert.equal(slots[3], 100);
		assert.equal(slots[4], 80);
		assert.equal(slots[5], 60);
		assert.equal(slots[6], 30);
		assert.equal(slots[7], 5);

		// Test the memory
		assert.equal(rMem.read8(0x0000), 10);
		assert.equal(rMem.read8(0x0010), 11);
		assert.equal(rMem.read8(0x1FFF), 12);
		assert.equal(rMem.read8(0x2000), 13);
		assert.equal(rMem.read8(0x4000), 14);
		assert.equal(rMem.read8(0x6000), 15);
		assert.equal(rMem.read8(0x8000), 16);
		assert.equal(rMem.read8(0xA000), 17);
		assert.equal(rMem.read8(0xC000), 18);
		assert.equal(rMem.read8(0xE000), 19);
		assert.equal(rMem.read8(0xFFFF), 20);
	});


	test('writeBlock/readBlock', () => {
		const mem = new PagedMemory(8, 256);

		mem.writeBlock(0x0000, new Uint8Array([0xAB]));
		let result = mem.readBlock(0x0000, 2);
		assert.equal(result[0], 0xAB);
		assert.equal(result[1], 0);

		mem.writeBlock(0x1000, new Uint8Array([0xAB, 0x12, 0x13, 0x14, 0x15]));
		result = mem.readBlock(0x1000, 5);
		assert.equal(result[0], 0xAB);
		assert.equal(result[1], 0x12);
		assert.equal(result[2], 0x13);
		assert.equal(result[3], 0x14);
		assert.equal(result[4], 0x15);

		mem.writeBlock(0xFFFF, new Uint8Array([0xC0]));
		result = mem.readBlock(0xFFFF, 1);
		assert.equal(result[0], 0xC0);
		result = mem.readBlock(0x0000, 1);
		assert.equal(result[0], 0xAB);

		mem.writeBlock(0xFFFF, new Uint8Array([0xD1, 0xD2]));
		result = mem.readBlock(0xFFFF, 2);
		assert.equal(result[0], 0xD1);
		assert.equal(result[1], 0xD2);

		mem.writeBlock(0xFFFF, Buffer.from([0xE1, 0xE2]));
		result = mem.readBlock(0xFFFF, 2);
		assert.equal(result[0], 0xE1);
		assert.equal(result[1], 0xE2);

		mem.writeBlock(0x3FFE, Buffer.from([0xF1, 0xF2, 0xF3, 0xF4]));
		result = mem.readBlock(0x3FFE, 4);
		assert.equal(result[0], 0xF1);
		assert.equal(result[1], 0xF2);
		assert.equal(result[2], 0xF3);
		assert.equal(result[3], 0xF4);
	});


	test('getMemory', () => {
		const mem = new PagedMemory(8, 256) as any;

		mem.memoryBanks[0][0] = 0x34;
		mem.memoryBanks[0][1] = 0x12;
		let result = mem.getMemory16(0x0000);
		assert.equal(result, 0x1234);

		mem.memoryBanks[0][0] = 0x34;
		mem.memoryBanks[0][1] = 0x12;
		mem.memoryBanks[0][2] = 0x78;
		mem.memoryBanks[0][3] = 0x56;
		result = mem.getMemory32(0x0000);
		assert.equal(result, 0x56781234);

		mem.memoryBanks[7*32][0x1FFF] = 0x9A;	// 0xFFFF
		mem.memoryBanks[7*32][0x1FFE] = 0xBC;	// 0xFFFE
		mem.memoryBanks[7*32][0x1FFD] = 0xDE;	// 0xFFFD

		result = mem.getMemory16(0xFFFF);
		assert.equal(result, 0x349A);

		result = mem.getMemory32(0xFFFF);
		assert.equal(result, 0x7812349A);

		result = mem.getMemory32(0xFFFE);
		assert.equal(result, 0x12349ABC);

		result = mem.getMemory32(0xFFFD);
		assert.equal(result, 0x349ABCDE);

		const offs = 0x2000;
		mem.memoryBanks[0][offs - 1] = 0xC1;
		mem.memoryBanks[1*32][0] = 0xD2;
		result = mem.getMemory16(offs - 1);
		assert.equal(result, 0xD2C1);

		mem.memoryBanks[0][offs - 2] = 0xB0;
		mem.memoryBanks[1*32][1] = 0xE3;
		result = mem.getMemory32(offs - 2);
		assert.equal(result, 0xE3D2C1B0);
	});


	suite('rom file', () => {
		test('read raw ROM file', () => {
			const mm = new MemoryModel({slots: []});
			const ports = new Z80Ports(0xFF);
			const mem = new SimulatedMemory(mm, ports) as any;
			const path = './data/48.rom';
			const data = mem.readRomFile(path);
			assert.equal(data[0], 243);
			assert.equal(data[0x3FFF], 60);
		});


		test('readIntelHexFromFile', () => {
			const mm = new MemoryModel({slots: []});
			const ports = new Z80Ports(0xFF);
			const mem = new SimulatedMemory(mm, ports) as any;
			const path = './tests/data/intelhex/PLU10.HEX';
			const data = mem.readRomFile(path);
			assert.equal(data[16384], 243);
			assert.equal(data[31100], 205);
		});


		test('read bank from ROM file', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x0000, 0x1FFF],
						banks: [
							{
								index: 0,
								rom: "./data/48.rom"
							}
						]
					}
				]
			});
			const ports = new Z80Ports(0xFF);
			const mem = new SimulatedMemory(mm, ports) as any;
			const data = mem.memoryBanks[0];
			assert.equal(data[0], 243);
			assert.equal(data[0x0FFF], 24);
		});


		test('read bank from ROM file with offset', () => {
			const mm = new MemoryModel({
				slots: [
					{
						range: [0x2000, 0x3FFF],
						banks: [
							{
								index: 1,
								rom: "./data/48.rom",
								romOffset: 0x1000
							}
						]
					}
				]
			});
			const ports = new Z80Ports(0xFF);
			const mem = new SimulatedMemory(mm, ports) as any;
			const data = mem.memoryBanks[1];
			assert.equal(data[0], 109);
			assert.equal(data[0x0FFF], 32);
		});
	});



	suite('check ioMmu', () => {
		test('no ioMmu', () => {
			const mm = new MemoryModel({slots: []});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			new SimulatedMemory(mm, ports) as any;	// Should not throw anything
		});

		test('correct ioMmu', () => {
			const mm = new MemoryModel({
				slots: [],
				ioMmu: [
					"var disabled;",
					"if((portAddress | 0x7FFD) == 0x7FFD && !disabled) {",
					"  slotC000 = portValue & 0x07; // RAM block select",
					"  disabled = portValue & 0b0100000; // DIS",
					"  slotROM = ((portValue & 0b0010000) >>> 4) + 8;",
					"}"
				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			new SimulatedMemory(mm, ports) as any;	// Should not throw anything
		});


		test('wrong ioMmu (direct)', () => {
			const mm = new MemoryModel({
				slots: [],
				ioMmu: [
					"var disabled;",
					"if((portAddress | 0x7FFD) == 0x7FFD && !disabled) {",
					"  slotC000 = port Value & 0x07; // RAM block select",
					"  disabled = portValue & 0b0100000; // DIS",
					"  slotROM = ((portValue & 0b0010000) >>> 4) + 8;",
					"}"
				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			try {
				new SimulatedMemory(mm, ports) as any;	// Should throw
				// Should not reach here:
				assert.fail("Expected an exception.");
			}
			catch (e) {
				assert.ok(!e.message.includes("port address"));
			}
		});


		test('wrong ioMmu (inside)', () => {
			const mm = new MemoryModel({
				slots: [],
				ioMmu: [
					"if(portAddress == 0x7FFD) {",
					"  obj.vars = 5;	// Should create an error as obj is undefined",
					"}"
				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			try {
				new SimulatedMemory(mm, ports) as any;	// Should throw
				// Should not reach here:
				assert.fail("Expected an exception.");
			}
			catch (e) {
				assert.ok(e.message.includes("port address"));
			}
		});


		test('correct indexed slot', () => {
			const mm = new MemoryModel({
				slots: [
					{
						"range": [0x0000, 0x3FFF],
						"banks": [{"index": [0, 4]}]
					},
					{
						"range": [0x4000, 0xFFFF],
						"banks": [{"index": [5, 10]}]
					},


				],
				ioMmu: [
					"slots[0] = 3;",
					"slots[1] = 7;"
				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			const mem = new SimulatedMemory(mm, ports) as any;
			mem.checkIoMmu();	// Should not throw anything
		});
	});



	suite('checkSlots', () => {
		test('correct bank', () => {
			const mm = new MemoryModel({
				slots: [
					{
						"range": [0x0000, 0x3FFF],
						"banks": [{"index": [0, 4]}]
					},
					{
						"range": [0x4000, 0xFFFF],
						"banks": [{"index": [5, 10]}]
					},


				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			const mem = new SimulatedMemory(mm, ports) as any;

			// Set correct slots
			mem.slots[0] = 0;
			mem.slots[1] = 10;
			mem.checkSlots();	// Should not throw
		});


		test('wrong bank', () => {
			const mm = new MemoryModel({
				slots: [
					{
						"range": [0x0000, 0x3FFF],
						"banks": [{"index": [0, 4]}]
					},
					{
						"range": [0x4000, 0xFFFF],
						"banks": [{"index": [5, 10]}]
					},


				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			const mem = new SimulatedMemory(mm, ports) as any;

			// Set incorrect slot
			mem.slots[1] = 11;
			assert.throws(() => {
				mem.checkSlots();
			});
		});


		test('wrong bank for slot', () => {
			const mm = new MemoryModel({
				slots: [
					{
						"range": [0x0000, 0x3FFF],
						"banks": [{"index": [0, 4]}]
					},
					{
						"range": [0x4000, 0xFFFF],
						"banks": [{"index": [5, 10]}]
					},


				]
			});
			const ports = new Z80Ports(0xFF);
			Utility.setRootPath('/');	// Does not matter but must be set.
			const mem = new SimulatedMemory(mm, ports) as any;

			// Set incorrect slot
			mem.slots[1] = 4;
			assert.throws(() => {
				mem.checkSlots();
			});
		});
	})
});

