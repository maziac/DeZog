
declare interface BeeperBuffer {
	totalLength: number,	// The length a "normal" audio frame buffer would occupy.
	startValue: boolean,	// Beeper value start value for the buffer.
	buffer: Uint16Array,		// Contains the length of the beeper values.
	bufferLen: number		// The length of buffer. For some reason buffer.length does not work in the webview.
}

export class ZxAudioBeeper {


	// Start latency of the system.
	protected MIN_LATENCY = 0.2; //0.05; //0.1;

	// Maximum latency. If latency grows bigger audio frames are dropped.
	protected MAX_LATENCY = 0.4; //0.1; //0.2;

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
	//protected logBuf = new Array<any>();

	//protected logPassedFrames = new Array<any>();


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

	// Contains the index inside the audio frame of the next to write.
	protected nextFrameIndex: number;

	// Value is used e.g. to fill gaps. The last audio sample written to the prepared buffer.
	protected lastEnqueuedAudioSampleValue: number;

	// true: Use values 0 and 1 for beeper 0 and 1. false: Use values -1 and 0 for beeper 0 and 1.
	protected samplesInTopHalf: boolean;

	// State: true if stopped, false if playing.
	protected stopped: boolean;


	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		//sampleRate = 22050;
		this.volume = 1.0;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.z80TimeOffset = (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.fixedFrameLength = Math.ceil(this.MIN_LATENCY/4 * this.sampleRate);
		this.fixedFrameTime = this.fixedFrameLength / this.sampleRate;
		this.lastEnqueuedAudioSampleValue = 0;
		this.samplesInTopHalf = true;
		this.stopped = true;

		this.prepareNextFrame();
	}


	/**
	 * For testing this function is overwritten to return a mocked AudioContext.
	 */
	protected createAudioContext(sampleRate: number): AudioContext {
		return new AudioContext({sampleRate});
	}


	/**
	 * Stops audio.
	 * Creates a fading audio frame.
	 */
	protected stop() {
		// Fade
		this.startFadeToZero();
		// Change state
		this.stopped = true;
	}


	/**
	 * Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */

	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0)
			return;	// No frames


		/* TODO : REMOVE logging
		this.logBuf.push({
			descr: "writeBeeperSamples start",
			startValue: beeperBuffer.startValue,
			nextFrameIndex: this.nextFrameIndex,
			lastEnqueuedAudioSampleValue: this.lastEnqueuedAudioSampleValue,
			lengths: beeperBuffer.buffer
		});
		*/

		// Fill intermediate buffer
		const beeperLengths = beeperBuffer.buffer;
		let k = 0;
		let tmpBuffer = new Float32Array(beeperBuffer.totalLength);
		let beeperValue = beeperBuffer.startValue;
		let audioValue = this.getAudioValueForBeeper(beeperValue);
		for (let i = 0; i < bufLen; i++) {
			// Get length
			const length = beeperLengths[i];
			// Set all samples to the same value
			for (let j = length; j > 0; j--) {
				tmpBuffer[k++] = audioValue;
			}
			// Alternate for next length
			beeperValue = !beeperValue;
			audioValue = this.getAudioValueForBeeper(beeperValue);
		}

		// Check if audio frame can be played
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
				this.playNextFrame(true, "new frame");
			}
			else {
				// Latency too high, too many buffers, drop frame.
				// Re-use buffer for next frame
				this.nextFrameIndex = 0;
				/* TODO : REMOVE logging
				this.logBuf.push({
					descr: "frame skipped",
					volume: this.volume,
					bufferedTime: this.bufferedTime,
					nextFrameStartTime: this.nextFrameStartTime,
				});
				*/
			}
		}

		/* TODO : REMOVE logging
		this.logBuf.push({descr: "writeBeeperSamples end"});
		*/
	}


	/**
	 * Resets the ctx time.
	 */
	protected resetTime() {
		this.audioCtxStartTime = this.ctx.currentTime;
		this.nextFrameStartTime = this.audioCtxStartTime + (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.bufferedTime = 0;


		/* TODO : REMOVE logging
		this.logBuf.push({
			descr: "time reset",
			volume: this.volume,
			ctxTime: this.audioCtxStartTime,
			nextFrameStartTime: this.nextFrameStartTime
		});
		*/
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
		let audioValue = beeperValue ? 1 : 0;
		if (!this.samplesInTopHalf)
			audioValue -= 1;
		audioValue *= this.volume;
		return audioValue;
	}


	/**
	 * Creates a gap filler frame with all samples containing value
	 * and starts it at the next starting time.
	 * Skips creation if lastEnqueuedAudioSampleValue is 0 and there is no
	 * pending frame.
	 * I.e. it will immediately return after a fadeToZero frame(s).
	 */
	protected startGapFiller() {
		// Check if required
		if (this.nextFrameIndex == 0 && this.lastEnqueuedAudioSampleValue == 0)
			return;

		// Create the (remaining) samples
		const frame = this.nextFrame;
		//const value = 0.05; // TODO this.lastEnqueuedAudioSampleValue;
		const value = this.getLastAudioValue();
		for (let i = this.nextFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// Start gap filler
		this.playNextFrame(true, "gap filler frame");
	}


	/**
	 * Returns the last decoded audio value.
	 */
	protected getLastAudioValue(): number {
		if (this.nextFrameIndex == 0)
			return this.lastEnqueuedAudioSampleValue;
		return this.nextFrame[this.nextFrameIndex - 1];
	}


	/**
	 * Creates a frame that fades to 0 if current value is 1 or -1.
	 * The frame is enqueued. It will be the last played frame until another
	 * writeBeeperSamples is received.
	 * This happens while stepping in the simulator.
	 * If current value is already 0 nothing happens, no fade required.
	 * @param value The audio value to use.
	 */
	protected startFadeToZero() {
		// Check if no frame has been played yet since last stop.
		if (this.stopped) {
			// Reset time, so that this sample is played at the correct time.
			this.resetTime();
		}

		// Check if it is necessary to fade.
		const prevLastAudioSample = this.getLastAudioValue()
		if (prevLastAudioSample == 0) {
			// Fill recent frame with zeroes
			this.startGapFiller();
			// Next values will restart the context time
			this.audioCtxStartTime = undefined as any;
			return;
		}

		// Creates one or more audio frames, starts from the current (unfinished packet)
		const fadingTime = 0.05;	// 50ms = 20Hz
		const fadingLength = fadingTime * this.sampleRate;
		let k = this.nextFrameIndex;
		const frameLength = this.fixedFrameLength;
		let value = prevLastAudioSample;
		for (let i = 0; i < fadingLength-1; i++) {
			// Check for next frame
			if (k >= frameLength) {
				// Play
				this.playNextFrame(false, "fade frame");
				k = 0;
			}
			// Fill
			this.nextFrame[k++] = value * (fadingLength-1-i) / fadingLength;
		}
		// Fill remaining with 0
		if (k >= frameLength) {
			// Make sure last value is really 0
			this.nextFrame[frameLength - 1] = 0;
		}
		else {
			// Fill remaining with zeroes
			for (; k < frameLength; k++)
				this.nextFrame[k] = 0;
		}

		// Play last frame
		this.playNextFrame(false, "last fade frame");

		// Next values in upper or lower half
		this.samplesInTopHalf = (prevLastAudioSample < 0);

		// Next values will restart the context time
		this.audioCtxStartTime = undefined as any;
	}


	/**
	 * Assumes the audio frame (this.nextFrame) is filled and enqueues it for
	 * playing.
	 * @param useEndListener Use false to disable.
	 * Otherwise it is checked to start a gap filler frame with not enough buffers are present.
	 */
	//protected markerVolume = 0.5; TODO: REMOVE
	protected playNextFrame(useEndListener = true, logDescription: string) {
		// Change state
		this.stopped = false;

		// TODO: REMOVE mark
		/*
		// mark all points
		const frame = this.nextFrame;
		const mVol = this.markerVolume;
		for (let i = 0; i < frame.length; i++) {
			frame[i] *= mVol;
		}
		// cycle marker volume
		this.markerVolume += 0.05;
		if (this.markerVolume > 0.5001)
			this.markerVolume = 0.1;
		*/


		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = this.nextBuffer;
		bufferSource.connect(this.ctx.destination);

		// End listener
		if (useEndListener) {
			const self = this;
			bufferSource.addEventListener('ended', function () {
				self.bufferedTime -= self.fixedFrameTime;

				/* TODO : REMOVE logging
				self.logPassedFrames.push({bufferedTime: self.bufferedTime});
				*/

				if (self.bufferedTime <= self.fixedFrameTime) {
					// Start gap filler
					self.startGapFiller();
				}
			});
		}

		// Store last value
		this.lastEnqueuedAudioSampleValue = this.nextFrame[this.fixedFrameLength - 1];

		// TODO: REMOVE mark inverse
		//this.lastEnqueuedAudioSampleValue /= this.markerVolume;

		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined) {
			this.resetTime();
		}

		// Play (in near future)
		bufferSource.start(this.nextFrameStartTime);
		this.bufferedTime += this.fixedFrameTime;

		// Log
		/* TODO : REMOVE logging
		const bakFrameBuffer = new Float32Array(this.nextFrame);
		this.logBuf.push({
			descr: logDescription,
			firstSampleVolume: this.nextFrame[0],
			lastSampleVolume: this.nextFrame[this.fixedFrameLength-1],
			bufferedTime: this.bufferedTime,
			nextFrameStartTime: this.nextFrameStartTime,
			ctxTime: this.ctx.currentTime,
			frame: bakFrameBuffer
		});
		*/

		// Next frame
		this.nextFrameStartTime += this.fixedFrameTime;
		this.prepareNextFrame();
	}

}