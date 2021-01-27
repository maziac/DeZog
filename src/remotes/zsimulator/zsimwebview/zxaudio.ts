
class ZxAudio {


	// Equivalent to the used circular buffer
	protected circBufferSizeInSecs: number;

	// Is calculated from the AUDIO_LATENCY_SEC and the sample rate.
	protected frameLength: number;

	// How often the frameLength fits into circBufferSizeInSecs.
	// Should be at least 2.
	protected BUFFER_FACTOR = 2;

	// The audio context.
	protected ctx: AudioContext;


	// The volume of all samples. [0;1.0]
	protected volume: number;

	// Stores the last beeper sample got from Z80.
	protected lastBeeperSample: number;

	// The assumed start time of the buffer. Is calculated on creation by adding bufferLengthTime.
	protected lastBufferStartTime: number;

	protected circularBuffer: Uint8Array;
	protected writeIndex: number;
	protected readIndex: number;

	protected sampleRate: number;
	protected frameLengthTime: number;

	protected lastWriteIndex: number;

	/**
	 * Constructor.
	 */
	constructor() {
		this.volume = 1.0;
		this.sampleRate = 0;
		this.circBufferSizeInSecs = 0;
		//this.setFrameRateAndBuffer(4096, 0.1);
	}


	/**
	 * Sets the sample rate and buffer size.
	 * If values are same as already set this function returns immediately.
	 * If values are different the ZxAudio is reconfigured.
	 * Usually this is set only once per session.
	 */
	public setFrameRateAndBuffer(sampleRate: number, bufferSizeInSecs: number) {
		if (bufferSizeInSecs < 0.01)
			bufferSizeInSecs = 0.01;	// Minimum 10ms
		if (this.sampleRate == sampleRate && this.circBufferSizeInSecs == bufferSizeInSecs)
			return;	// No change

		try {
			this.ctx = new AudioContext({sampleRate});
			this.sampleRate = this.ctx.sampleRate;
			this.frameLengthTime = bufferSizeInSecs / this.BUFFER_FACTOR;	// to allow for jitter
			this.frameLength = Math.ceil(this.frameLengthTime * this.sampleRate);
			this.circBufferSizeInSecs = bufferSizeInSecs;
			const circBufLen = Math.ceil(this.circBufferSizeInSecs * this.sampleRate);
			this.circularBuffer = new Uint8Array(circBufLen);
			this.writeIndex = 0;
			this.lastWriteIndex = 0;
			this.readIndex = 1;
			this.lastBeeperSample = 1;
			// Start to play
			this.start();
		}
		catch (e) {
			console.log(e);
		}
	}


	/**
	 * Pause audio time.
	 */
	protected pause() {
		this.ctx.suspend();
	}


	/**
	 * Resume audio time.
	 */
	protected resume() {
		this.ctx.resume();
	}


	public start() {
		// Start in 500ms
		this.nextTime = this.ctx.currentTime + 0.5;
		this.playNextBuffer();
		setInterval(() => {
			this.playNextBuffer();
		}, 95);	// Every 100 ms
	}


	/**
	 * Is called when one audio source ended to prepare the next audio source
	 * buffer and start it.
	 */

	protected lastOutput = 0.5;
	protected nextTime: number;
	protected playNextBuffer() {
		try {
			let volume = this.volume;
			const sampleRate = this.sampleRate;

			// Create a buffer
			const buffer = this.ctx.createBuffer(2, this.frameLength, sampleRate);
			const channel0 = buffer.getChannelData(0);
			const channel1 = buffer.getChannelData(1);

			// Copy samples

			//this.lastOutput *= -1;
			const len = this.frameLength;
			let sample = this.lastOutput * volume;
			let i;
			for (i = 0; i < len/2; i++) {
				channel0[i] = sample;
				channel1[i] = sample;
			}
			sample *= -1;
			for (; i < len; i++) {
				channel0[i] = sample;
				channel1[i] = sample;
			}
			/*
			volume = 1.0;
			for (let i = 0; i < len; i++) {
				const sample = volume * Math.sin(2 * Math.PI * i / len);
				channel0[i] = sample;
				channel1[i] = sample;
			}
			*/


			// Create audio source
			const bufferSource = this.ctx.createBufferSource();
			bufferSource.buffer = buffer;
			bufferSource.connect(this.ctx.destination);

			// Listen for end
			bufferSource.addEventListener('ended', () => {
				// Play next buffer
				this.playNextBuffer();
			});

			// Play
			bufferSource.start(this.nextTime);
			this.nextTime += 0.095;	// 100 ms
		}
		catch (e) {
			console.log(e);
			while (true);
		}
	}


	/**
	 * Is called when one audio source ended to prepare the next audio source
	 * buffer and start it.
	 */
	protected playNextBufferX() {
		try {
			const volume = this.volume;
			const sampleRate = this.sampleRate;

			// Create a buffer
			const buffer = this.ctx.createBuffer(2, this.frameLength, sampleRate);
			const channel0 = buffer.getChannelData(0);
			const channel1 = buffer.getChannelData(1);
			const bufLength = this.circularBuffer.length;

			// Check distance writeIndex-readIndex
			let distance = this.writeIndex - this.readIndex;
			if (distance <= 0)
				distance += bufLength;

			// Skip samples if distance too far
			if (distance > this.frameLength) {
				distance = this.frameLength;
			}

			// Copy samples
			let k = this.readIndex;
			console.log("playNextBuffer, currentTime: " + this.ctx.currentTime);
			console.log("playNextBuffer: readindex, start: " + k);
			let sample = (2 * this.circularBuffer[k] - 1) * volume;	// Required for 2nd for-loop
			for (let i = 0; i < distance; i++) {
				sample = (2 * this.circularBuffer[k] - 1) * volume;
				//sample = (sample > 0) ? -volume : volume;
				channel0[i] = sample;
				channel1[i] = sample;
				k++;
				if (k >= bufLength)
					k = 0;
			}

			// "Invent" samples if distance too low.
			for (let i = distance; i < this.frameLength; i++) {
				//sample = (sample > 0) ? -volume : volume;
				channel0[i] = sample;
				channel1[i] = sample;
			}

			// Store
			this.readIndex = k;
			console.log("playNextBuffer: readindex, end: " + k);

			// Create audio source
			const bufferSource = this.ctx.createBufferSource();
			bufferSource.buffer = buffer;
			bufferSource.connect(this.ctx.destination);

			// Listen for end
			bufferSource.addEventListener('ended', () => {
				// Play next buffer
				this.playNextBuffer();
			});

			// Play
			bufferSource.start();
		}
		catch (e) {
			console.log(e);
			while (true);
		}
	}


	/**
	 * Write a complete frame based on the beeper data.
	 * The created frames may vary ins size and depend on the 'timeEnd' and
	 * the stored 'timeEnd' of the last frame.
	 * @param beeperBuffer Beeper data contains of values with timestamps (Z80 time).
	 * @param timeEnd The end of the buffer as time. The frame is filled up
	 * until this time with the last beeper value.
	 */
	protected lastZ80Time = 0;
	public writeBeeperSamples(beeperBuffer: Array<number>, timeEnd: number) {
		// Determine buffer length
		const sampleRate = this.sampleRate;
		const bufLen = (timeEnd - this.lastZ80Time) * sampleRate;

		// Create a buffer
		const buffer = this.ctx.createBuffer(2, bufLen, sampleRate);
		const channel0 = buffer.getChannelData(0);
		const channel1 = buffer.getChannelData(1);

		// Fill buffer
		for (let i = 0; i < audioBuffer.length; i++) {
			const sample = audioBuffer[i];
			zxAudio.writeOneBeeperSample(sample.value, sample.time);
		}

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(this.ctx.destination);

		// Listen for end
		bufferSource.addEventListener('ended', () => {
			// Play next buffer
			this.playNextBuffer();
		});


	}


	/**
	 * Write sample.
	 * @param value The beep value. [0;1]
	 * @param time A timestamp calculated by the simulation from the "expired" t-states.
	 */
	public writeOneBeeperSample(value: number, time: number) {
		// Calculate index from time
		const bufLen = this.circularBuffer.length;
		const indexFloat = (time % this.circBufferSizeInSecs) / this.circBufferSizeInSecs * bufLen;
		let index = Math.floor(indexFloat);
		// Store value
		this.circularBuffer[index] = value;


		console.log("writeOneBeeperSample, currentTime: " + this.ctx.currentTime);
		console.log("writeOneBeeperSample: writeIndex, start: " + this.writeIndex + ", index: " + index);
		console.log("writeOneBeeperSample: readIndex, start: " + this.readIndex);
		// If index has not progressed simply return
		if (index != this.lastWriteIndex) {
			this.lastWriteIndex = index;

			// Fill since last position
			//console.log("index=" + index + ", value=" + value);
			let k = this.writeIndex;
			//let counter = 0;
			if (index != k) {
				while (true) {
					k++;
					if (k >= bufLen)
						k = 0;
					if (k == index)
						break;
					this.circularBuffer[k] = this.lastBeeperSample;
					//counter++;
				}
			}
			//console.log("counter=" + counter);

			// Next write position
			index++;
			if (index >= bufLen)
				index = 0;

			// Check if read index is in between writeIndex and index
			if (index > this.writeIndex) {
				// Simple case
				if (this.readIndex > this.writeIndex && this.readIndex < index) {
					// Move readIndex
					this.readIndex = index;
					//if (this.readIndex >= bufLen)
					//	this.readIndex -= bufLen;
				}
			}
			else {
				// More complicated case
				if (this.readIndex < index || this.readIndex > this.writeIndex) {
					// Move readIndex
					this.readIndex = index;
					//if (this.readIndex >= bufLen)
					//	this.readIndex -= bufLen;
				}
			}

			// Store position
			this.writeIndex = index;
		}

		console.log("writeOneBeeperSample: writeIndex, end: " + this.writeIndex);
		console.log("writeOneBeeperSample: readIndex, end: " + this.readIndex)

		// Remember last value
		this.lastBeeperSample = value;
	}
}

let zxAudio = new ZxAudio();
//zxAudio.start();
