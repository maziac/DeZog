import * as assert from 'assert';
const{Transform}=require('stream')




/**
 * The DZP commands and responses.
 * The response contains the command with the bit 7 set.
 */
export enum DZP {
	CMD_GET_CONFIG=1,
};




/**
 * This parser reads the first 4 bytes and interpretes it as (little endian) length.
 * Then it collects 'length' further bytes.
 * When all bytes have been received the data is emitted.
 */
export class ZxNextParser extends Transform {
	/// State: Either waiting for length (false) or collecting data (true).
	protected collectingData: boolean;

	/// The number of remaining bytes to collect.
	protected remainingLength: number;

	/// Timeout. Max time between chunks.
	protected timeout=2000;	// ms

	/// The timer.
	protected timer;


	/// The constructor.
	constructor(options={}) {
		super(options);
		assert(options);

		// Timeout
		if ((options as any).timeout!=undefined)
			this.timeout=(options as any).timeout;

		// Alloc buffer
		this.collectingData=false;
		this.buffer=Buffer.alloc(0);
	}


	/**
	 *  Read chunks of data until a complete message has been received.
	 */
	_transform(chunk, encoding, cb) {
		// Concat data
		this.buffer=Buffer.concat([this.buffer, chunk])
		while (true) {
			// Check state
			if (!this.collectingData) {
				// Check if all 4 bytes have been received
				if (this.buffer.length<4)
					break;
				const data=this.buffer;
				this.remainingLength=data[0]+(data[1]<<8)+(data[2]<<16)+(data[3]<<24);
				this.buffer=this.buffer.subarray(4);
				this.collectingData=true;
			}

			// Collect until all remaining bytes received
			const count=this.buffer.length;
			if (count<this.remainingLength)
				break;;

			// Enough data
			this.collectingData=false;

			// Check if there was too many data received
			let data=this.buffer;
			if (count>this.remainingLength) {
				data=data.subarray(0, this.remainingLength);
			}
			// Enough data collected
			this.push(data);
			this.buffer=this.buffer.subarray(this.remainingLength);	// Normally clears the buffer
		}
		// Ready, no error
		cb();
		// Start timeout
		clearTimeout(this.timer);
		if (this.buffer.length==0)
			this.timer=undefined;
		else {
			this.timer=setTimeout(() => {
				cb('Timeout: too much time between too data chunks.');
			}, this.timeout);
		}
	}


	_flush(cb) {
		this.push(this.buffer)
		this.buffer=Buffer.alloc(0)
		cb()
	}
}

//module.exports=DelimiterParser
