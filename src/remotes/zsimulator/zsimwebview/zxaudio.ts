
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

	// Contains the index insde the audio frame of the next to write.
	protected nextFrameIndex: number;

	// Value is used e.g. to fill gaps.
	protected lastEnqueuedAudioSampleValue: number;


	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		//sampleRate = 22050;
		this.volume = 0.5;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.z80TimeOffset = (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.fixedFrameLength = Math.ceil(this.MIN_LATENCY * this.sampleRate);
		this.fixedFrameTime = this.fixedFrameLength / this.sampleRate;
		this.lastEnqueuedAudioSampleValue = 0;

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


	/**
	 * Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */

	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0) {
			// A buffer with length 0 means that there has been no time (t-states)
			// progress in the simulation. I.e. while stepping.
			// This shuts down audio i.e. audio frame generation.
			// A fading (to 0) frame is generated at last.
			const sample = this.getAudioValueForBeeper(beeperBuffer.startValue);
			this.startFadeToZero(sample);
			return;
		}

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
		let audioValue = this.getAudioValueForBeeper(beeperBuffer.startValue);
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
			if (this.nextFrameIndex + remainingLen < this.fixedFrameLength) {
				// Buffer not yet full.
				// Copy bytes to frame buffer
				this.nextFrame.set(tmpBuffer.slice(offset, offset + remainingLen), this.nextFrameIndex);
				this.nextFrameIndex += remainingLen;
				break;
			}

			// Buffer full
			// Copy as much as possible bytes.
			const fillLen = this.fixedFrameLength - this.nextFrameIndex;
			this.nextFrame.set(tmpBuffer.slice(offset, offset + fillLen), this.nextFrameIndex);
			offset += fillLen;
			remainingLen -= fillLen;

			// Mark
			//this.nextFrame[0] = 1.0;

			// Check next start frame time for upper limit.
			// This happens if simulation is too fast.
			// In this case the start time is reduced ba a few frames is reduced.
			if (this.bufferedTime < this.MAX_LATENCY+2*this.fixedFrameTime) {
				// Latency still OK: Play audio frame
				const nextFrameStartTime = this.nextFrameStartTime;
				this.playNextFrame();

				// Log
				this.logBuf.push({
					bufferedTime: this.bufferedTime,
					nextFrameStartTime,
					descr: "new frame",
				});
			}
			else {
				// Latency too high, too many buffers, drop frame.
				// Re-use buffer for next frame
				this.nextFrameIndex = 0;
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
		this.nextFrameIndex = 0;
	}


	/**
	 * Returns an audio sample value [-1;1] from the boolean beeper value.
	 * @param beeperValue true/false. 1/0
	 * @returns [-1;1]
	 */
	protected getAudioValueForBeeper(beeperValue: boolean) {
		const audioValue = (2 * (beeperValue ? 1 : 0) - 1) * this.volume;
		return audioValue;
	}


	/**
	 * Creates a gap filler frame with all samples containing value
	 * and starts it at the next starting time.
	 * @param value The audio value to use.
	 */
	protected startGapFiller(value: number) {
		// Create the (remaining) samples
		const frame = this.nextFrame;
		if (this.nextFrameIndex > 0)
			value = frame[this.nextFrameIndex - 1];	// Use the last known value instead
		for (let i = this.nextFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// For logging
		const nextFrameStartTime = this.nextFrameStartTime;

		// Start gap filler
		this.playNextFrame();

		// Log
		this.logBuf.push({
			bufferedTime: this.bufferedTime,
			nextFrameStartTime,
			descr: "gap filler frame",
		});
	}

	/**
	 * Creates a frame that fades to 0 if current value is 1 or -1.
	 * The frame is enqueued. It will be the last played frame until another
	 * writeBeeperSamples is received.
	 * This happens while stepping in the simulator.
	 * If current value is already 0 nothing happens, no fade required.
	 * @param value The audio value to use.
	 */
	protected startFadeToZero(value: number) {
		// Creates one or more audio frames, starts from the current (unfinished packet)
		return;

		// Create the (remaining) samples
		const frame = this.nextFrame;
		if (this.nextFrameIndex > 0)
			value = frame[this.nextFrameIndex - 1];	// Use the last known value instead
		for (let i = this.nextFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// For logging
		const nextFrameStartTime = this.nextFrameStartTime;

		// Start gap filler
		this.playNextFrame();

		// Log
		this.logBuf.push({
			bufferedTime: this.bufferedTime,
			nextFrameStartTime,
			descr: "gap filler frame",
		});
	}


	/**
	 * Assumes the audio frame (this.nextFrame) is filled and enqueues it for
	 * playing.
	 */
	protected playNextFrame() {
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
				// Start gap filler
				self.startGapFiller(self.lastEnqueuedAudioSampleValue);
			}
		});

		// Store last value
		this.lastEnqueuedAudioSampleValue = this.nextFrame[this.fixedFrameLength - 1];

		// Play (in near future)
		bufferSource.start(this.nextFrameStartTime);
		this.bufferedTime += this.fixedFrameTime;

		// Next frame
		this.nextFrameStartTime += this.fixedFrameTime;
		this.prepareNextFrame();
	}

}