const {Transform}=require('stream')

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


	/// The constructor.
	constructor() {
		super({encoding: 'binary'});

		this.collectingData=false;
		this.buffer=Buffer.alloc(0);
	}


	/**
	 *  Read chunks of data until a complete message has been received.
	 */
	_transform(chunk, encoding, cb) {
		// Concat data
		let data=Buffer.concat([this.buffer, chunk])
		while (true) {
			// Check state
			if (!this.collectingData) {
				// Check if all 4 bytes have been received
				const count=data.length;
				if (count<4)
					return;
				this.remainingLength=data[0]+(data[1]<<8)+(data[2]<<16)+(data[3]<<24);
				data=data.subarray(4);
				this.collectingData=true;
			}

			// Collect until all remaining bytes received
			const count=data.length;
			if (count<this.remainingLength)
				return;

			// Enough data
			this.collectingData=false;

			// Check if there was too many data received
			this.buffer=data.subarray(this.remainingLength);
			if (count>this.remainingLength) {
				data=data.subarray(0, this.remainingLength);
			}
			// Enough data collected
			this.push(data);
			cb();
			data=this.buffer;
		}
	}

	_flush(cb) {
		this.push(this.buffer)
		this.buffer=Buffer.alloc(0)
		cb()
	}
}

//module.exports=DelimiterParser
