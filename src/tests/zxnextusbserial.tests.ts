import * as assert from 'assert';
import {ZxNextParser } from '../remotes/zxnext/zxnextusbserial';



suite('ZxNextParser', () => {

	suite('_transform', () => {

		let parser;
		let parserBuffer;

		setup(() => {
			parser=new ZxNextParser({timeout: 100});
			parserBuffer=parser._readableState.buffer;
		});

		// Returns a buffer with given length and buffer.
		// An possibly remaining space is filled with a specific byte.
		function createLengthBuffer(length: number, data: string): Buffer {
			const buffer=Buffer.alloc(4+length);
			// Encode length
			buffer[0]=length&0xFF;
			buffer[1]=(length>>8)&0xFF;
			buffer[2]=(length>>16)&0xFF;
			buffer[3]=(length>>24)&0xFF;
			// Copy data
			const inpLen=data.length;
			for (let i=0; i<inpLen; i++) {
				buffer[4+i]=data.charCodeAt(i);
			}
			// Fill rest
			for (let i=inpLen; i<length; i++) {
				buffer[4+i]=0xCC;
			}
			return buffer;
		}

		// Returns a buffer from a string. Inserts length.
		function createBuffer(data: string): Buffer {
			const length=data.length;
			return createLengthBuffer(length, data);
		}

		test('2 messages', () => {
			const buf1=createBuffer('abcd');

			// "Receive"
			parser._transform(buf1, undefined, error => {
				assert.equal(undefined, error);
			});

			// Read
			let recData=parserBuffer.shift();
			assert.equal('abcd', recData);

			// 2nd message
			const buf2=createBuffer('defghijkl');

			// "Receive"
			parser._transform(buf2, undefined, error => {
				assert.equal(undefined, error);
			});

			// Read
			recData=parserBuffer.shift();
			assert.equal('defghijkl', recData);
		});

		test('empty message', () => {
			const buf1=createBuffer('');

			// "Receive"
			parser._transform(buf1, undefined, error => {
				assert.equal(undefined, error);
			});

			// Read
			let recData=parserBuffer.shift();
			assert.equal(undefined, recData);
		});

		test('chunking byte by byte', () => {
			const buf1=createBuffer('abcd');

			// "Receive"
			const singleBuffer=Buffer.alloc(1);
			for (const b of buf1) {
				singleBuffer[0]=b;
				parser._transform(singleBuffer, undefined, error => {
					assert.equal(undefined, error);
				});
			}

			// Read
			const recData=parserBuffer.shift();
			assert.equal('abcd', recData);
		});


		test('chunking 2 messages', () => {
			const buf1=createBuffer('abcd');

			// "Receive"
			const singleBuffer=Buffer.alloc(1);
			for (const b of buf1) {
				singleBuffer[0]=b;
				parser._transform(singleBuffer, undefined, error => {
					assert.equal(undefined, error);
				});
			}

			// Read
			let recData=parserBuffer.shift();
			assert.equal('abcd', recData);

			// 2nd message
			const buf2=createBuffer('123456789012345678901');

			// "Receive"
			for (const b of buf2) {
				singleBuffer[0]=b;
				parser._transform(singleBuffer, undefined, error => {
					assert.equal(undefined, error);
				});
			}

			// Read
			recData=parserBuffer.shift();
			assert.equal('123456789012345678901', recData);
		});

		test('timeout: error occurred', done => {
			let buf=createLengthBuffer(4, '123');

			// "Receive" too less -> Should result in a timeout
			parser._transform(buf, undefined, error => {
				assert.equal(undefined, error);
				done();
			});
		});

		test('timeout: no error occurred', done => {
			let buf=createLengthBuffer(4, '1234');

			// "Receive" no error
			parser._transform(buf, undefined, error => {
				assert.equal(undefined, error);
			});

			// Wait a little time to make sure that no timeout occurs
			// after the data has been received.
			setTimeout(() => {
				done();	// Ready no error
			}, 400);	// 400ms: 4x 100ms, should be enough
		});

	});
});

