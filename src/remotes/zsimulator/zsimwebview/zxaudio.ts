
declare interface BeeperBuffer {
	time: number,			// The time the buffer starts (Z80 simulator time).
	totalLength: number,	// The length a "normal" audio frame buffer would occupy.
	startValue: boolean,	// Beeper value start value for the buffer.
	buffer: Uint16Array,		// Contains the length of the beeper values.
	bufferLen: number		// The length of buffer. For some reason buffer.length does not work in the webview.
}

export class ZxAudio {


	// Start latency of the system.
	protected MIN_LATENCY = 0.05; //0.1;

	// Maximum latency. If latency grows bigger audio frames are dropped.
	protected MAX_LATENCY = 0.1; //0.2;

	// The audio context.
	protected ctx: AudioContext;

	// The volume of all samples. [0;1.0]
	protected volume: number;

	// Stores the last beeper sample got from Z80.
	protected lastBeeperSample: number;

	// Stores the sample rate.
	protected sampleRate: number;

	// To compare time with Z80 time the start time (after frame rate configuration)
	// is stored here.
	protected audioCtxStartTime: number;

	// The audio system and the Z80 are not fully synchronized.
	// The difference may also vary over time a little bit.
	// The offset here is use to calculate from one time system to the other.
	// z80TimeOffset starts with the latency of the system but is adjusted
	// the longer the audio is played.
	protected z80TimeOffset: number;

	// TODO REMOVE
	protected logBuf = new Array<any>();

	protected logPassedFrames = new Array<any>();
	protected bufferedCount = 0;



	// The next audio buffer. Samples are being prepared here.
	// When full it is played.
	protected nextBuffer: AudioBuffer;

	// The samples for nextBuffer.
	protected nextFrame: Float32Array;

	// The frame length is put here. Is sample rate * buffer size in secs.
	protected fixedFrameLength: number;

	// The buffer size in secs.
	protected fixedFrameTime: number;

	// The next frames start time.
	protected nextFrameStartTime: number;

	// The total length of unplayed samples. Used to limit the latency.
	protected bufferedTime = 0;

	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		//sampleRate = 22050;
		this.volume = 0.5;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.lastBeeperSample = 1;
		this.z80TimeOffset = (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.fixedFrameLength = Math.ceil(this.MIN_LATENCY * this.sampleRate);
		this.fixedFrameTime = this.fixedFrameLength / this.sampleRate;

		//this.writeBeeperSamples(undefined as any);
		//this.writeBeeperSamples(undefined as any);
		this.prepareNextFrame();
	}


	/**
	 * For testing this function is overwritten to return a mocked AudioContext.
	 */
	protected createAudioContext(sampleRate: number): AudioContext {
		return new AudioContext({sampleRate});
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

	protected lastFrameIndex: number;

	/**
	 * Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */
	protected markIndex = true;
	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0)
			return; 	// No samples

		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined) {
			this.audioCtxStartTime = this.ctx.currentTime;
			this.nextFrameStartTime = this.audioCtxStartTime + (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
			this.bufferedTime = 0;
		}

		// Fill intermediate buffer
		const beeperLengths = beeperBuffer.buffer;
		let k = 0;
		let tmpBuffer = new Float32Array(beeperBuffer.totalLength);
		let audioValue = (2 * (beeperBuffer.startValue ? 1 : 0) - 1) * this.volume;;
		for (let i = 0; i < bufLen; i++) {
			// Get length
			const length = beeperLengths[i];
			// Set all samples to the same value
			for (let j = length; j > 0; j--) {
				tmpBuffer[k++] = audioValue;
			}
			// Alternate for next length
			audioValue *= -1;
		}

		let remainingLen = beeperBuffer.totalLength;
		let offset = 0;
		while (true) {
			// Check if buffer full
			if (this.lastFrameIndex + remainingLen < this.fixedFrameLength) {
				// Buffer not yet full.
				// Copy bytes to frame buffer
				this.nextFrame.set(tmpBuffer.slice(offset, offset + remainingLen), this.lastFrameIndex);
				this.lastFrameIndex += remainingLen;
				break;
			}

			// Buffer full
			// Copy as much as possible bytes.
			const fillLen = this.fixedFrameLength - this.lastFrameIndex;
			if (this.lastFrameIndex + fillLen > this.fixedFrameLength)
				console.log("errorddd");
			this.nextFrame.set(tmpBuffer.slice(offset, offset + fillLen), this.lastFrameIndex);
			offset += fillLen;
			remainingLen -= fillLen;

			// Mark
			//this.nextFrame[0] = 1.0;


			// Check next start frame time for upper limit.
			// This happens if simulation is too fast.
			// In this case the start time is reduced ba a few frames is reduced.
			//this.bufferedTime = 0;	// TODO REMOVE
			if (this.bufferedTime < this.MAX_LATENCY+2*this.fixedFrameTime) {
				// Latency still OK:
				// Create audio source
				const bufferSource = this.ctx.createBufferSource();
				bufferSource.buffer = this.nextBuffer;
				bufferSource.connect(this.ctx.destination);

				// End listener
				const self = this;
				bufferSource.addEventListener('ended', function () {
					self.bufferedTime -= self.fixedFrameTime;
					self.logPassedFrames.push({bufferedTime: self.bufferedTime});
					if (self.bufferedTime <= self.fixedFrameTime) {
						// Get last value
						const audioBuffer = this.buffer!;
						const frame = audioBuffer.getChannelData(0);
						const lastSample = frame[frame.length - 1];
						// Start gap filler
						self.startGapFiller(lastSample);
						// Reset
					//	self.audioCtxStartTime = undefined as any;
					}

				});

				// Play (in near future)
				bufferSource.start(this.nextFrameStartTime);
				this.bufferedTime += this.fixedFrameTime;

				this.logBuf.push({
					bufferedTime: this.bufferedTime,
					nextFrameStartTime: this.nextFrameStartTime,
					descr: "new frame",
				});

				// Next frame
				this.nextFrameStartTime += this.fixedFrameTime;
				this.prepareNextFrame();
			}
			else {
				// Latency too high, too many buffers, drop frame.
				// Re-use buffer for next frame
				this.lastFrameIndex = 0;
				this.logBuf.push({
					bufferedTime: this.bufferedTime,
					nextFrameStartTime: this.nextFrameStartTime,
					descr: "frame skipped",
				});
			}
		}
	}


	/**
	 * Prepares an empty frame.
	 */
	protected prepareNextFrame() {
		this.nextBuffer = this.ctx.createBuffer(1, this.fixedFrameLength, this.sampleRate);
		this.nextFrame = this.nextBuffer.getChannelData(0);
		this.lastFrameIndex = 0;
	}


	/**
	 * Creates a gap filler frame with all samples containing value
	 * and starts it at the next starting time.
	 * @param value The audio value to use.
	 */
	protected startGapFiller(value: number) {
		// Create the (remaining) samples
		const frame = this.nextFrame;
		if (this.lastFrameIndex > 0)
			value = frame[this.lastFrameIndex - 1];	// Use the last known value instead
		for (let i = this.lastFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// Start

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = this.nextBuffer;
		bufferSource.connect(this.ctx.destination);

		// End listener
		const self = this;
		bufferSource.addEventListener('ended', function () {
			self.bufferedTime -= self.fixedFrameTime;
			self.logPassedFrames.push({bufferedTime: self.bufferedTime});
			if (self.bufferedTime <= self.fixedFrameTime) {
				// Get last value
				const audioBuffer = this.buffer!;
				const frame = audioBuffer.getChannelData(0);
				const lastSample = frame[frame.length - 1];
				// Start gap filler
				self.startGapFiller(lastSample);
				// Reset
			//	self.audioCtxStartTime = undefined as any;
			}

		});

		// Play (in near future)
		bufferSource.start(this.nextFrameStartTime);
		this.bufferedTime += this.fixedFrameTime;

		this.logBuf.push({
			bufferedTime: this.bufferedTime,
			nextFrameStartTime: this.nextFrameStartTime,
			descr: "gap filler frame",
		});

		// Next frame
		this.nextFrameStartTime += this.fixedFrameTime;
		this.prepareNextFrame();
	}
}
