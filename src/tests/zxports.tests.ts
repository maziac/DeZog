
import * as assert from 'assert';
import {ZxPorts} from '../remotes/zxsimulator/zxports';
import {MemBuffer} from '../misc/membuffer';

suite('ZxPorts', () => {
	test('serialize/deserialize', () => {
		let memBuffer;
		let writeSize;
		{
			const ports=new ZxPorts();

			// Set ports
			ports.setPortValue(0x0000, 100);
			ports.setPortValue(0x0095, 101);
			ports.setPortValue(0x8000, 102);
			ports.setPortValue(0xFFFF, 103);

			// Get size
			writeSize=ports.getSerializedSize();

			// Serialize
			memBuffer=new MemBuffer(writeSize);
			ports.serialize(memBuffer);
		}

		{
			// Create a new object
			const rPorts=new ZxPorts();
			rPorts.deserialize(memBuffer);

			// Check size
			const readSize=(memBuffer as any).readOffset;
			assert.equal(writeSize, readSize);

			// Test the ports
			assert.equal(100, rPorts.read(0x0000));
			assert.equal(101, rPorts.read(0x0095));
			assert.equal(102, rPorts.read(0x8000));
			assert.equal(103, rPorts.read(0xFFFF));
		}

		{
			// Now create a new buffer and check that the result is the same
			const memBuffer2=MemBuffer.from(memBuffer.buffer);
			// Create a new object
			const rPorts=new ZxPorts();
			rPorts.deserialize(memBuffer2);

			// Check size
			const readSize=(memBuffer2 as any).readOffset;
			assert.equal(writeSize, readSize);

			// Test the ports
			assert.equal(100, rPorts.read(0x0000));
			assert.equal(101, rPorts.read(0x0095));
			assert.equal(102, rPorts.read(0x8000));
			assert.equal(103, rPorts.read(0xFFFF));
		}
	});

});

