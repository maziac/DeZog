
declare var beeperOutput: HTMLElement;


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

	// When playing is stopped a fade to 0 volume is done to avoid crackling.
	// This is the time for fading.
	protected FADE_TO_ZERO_TIME = 0.1;	// 100 ms

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

	// The node used to change the volume.
	protected gainNode: GainNode;


	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		//sampleRate = 22050;
		this.volume = 0.75;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.z80TimeOffset = (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.fixedFrameLength = Math.ceil(this.MIN_LATENCY/4 * this.sampleRate);
		this.fixedFrameTime = this.fixedFrameLength / this.sampleRate;
		this.lastEnqueuedAudioSampleValue = 0;
		this.samplesInTopHalf = true;
		this.stopped = true;

		// Create gain node
		this.gainNode = this.ctx.createGain();
		this.gainNode.gain.value = 1.0;
		//this.gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
		this.gainNode.connect(this.ctx.destination);
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
	public stop() {
		// Fade
		this.startFadeToZero();
		// Change state
		this.stopped = true;
	}


	/**
	 * Sets the volume.
	 * @param volume [0;1]
	 */
	public setVolume(volume: number) {
		this.volume = volume;
		this.gainNode.gain.value = volume;
	}


	/**
	 * Gets the volume.
	 * @returns volume [0;1]
	 */
	public getVolume() {
		return this.volume;
	}


	/**
	 * Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */

	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		// Start if stopped
		if (this.stopped) {
			/*
			// Log
			this.logBuf.push({
				descr: "writeBeeperSamples START after stop",
				startValue: beeperBuffer.startValue,
			});
			*/

			// Cancel "in progress"-stop
			this.gainNode.gain.cancelScheduledValues(0);
			this.gainNode.gain.value = this.volume;
			// Change state
			this.stopped = false;
			// Restart time on next frame
			this.audioCtxStartTime = undefined as any;
		}

		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0) {
			// Set the visual state
			this.setVisualBeeperState(beeperBuffer.startValue);
			// But no frames
			return;
		}

		/*
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

		// Set the visual state
		this.setVisualBeeperState(!beeperValue);	// beeper value is the inverse

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
				this.playNextFrame("new frame");
			}
			else {
				// Latency too high, too many buffers, drop frame.
				// Re-use buffer for next frame
				this.nextFrameIndex = 0;
				/*
				this.logBuf.push({
					descr: "frame skipped",
					volume: this.volume,
					bufferedTime: this.bufferedTime,
					nextFrameStartTime: this.nextFrameStartTime,
				});
				*/
			}
		}

		/*
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

		/*
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
		return audioValue;
	}


	/**
	 * Creates a gap filler frame with all samples containing value
	 * and starts it at the next starting time.
	 * Skips creation if lastEnqueuedAudioSampleValue is 0 and there is no
	 * pending frame.
	 * I.e. it will immediately return after a fadeToZero frame(s).
	 * @param lastFrame Set to true if last frame before stop. Will stop listening to end events.
	 */
	protected startGapFiller(lastFrame = false) {
		// Check if required
		if (this.nextFrameIndex == 0 && this.lastEnqueuedAudioSampleValue == 0)
			return;

		// Create the (remaining) samples
		const frame = this.nextFrame;
		const value = this.getLastAudioValue();
		for (let i = this.nextFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// Start gap filler
		this.playNextFrame("gap filler frame");
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
		// Check if it is necessary to fade.
		const prevLastAudioSample = this.getLastAudioValue();

		this.startGapFiller(false);
		this.stopped = true;
		this.gainNode.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + this.FADE_TO_ZERO_TIME);

		// Next values in upper or lower half
		this.samplesInTopHalf = (prevLastAudioSample < 0);
	}


	/**
	 * Assumes the audio frame (this.nextFrame) is filled and enqueues it for
	 * playing.
	 */
	protected playNextFrame(logDescription: string) {
		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = this.nextBuffer;
		bufferSource.connect(this.gainNode);

		// End listener
		const self = this;
		bufferSource.addEventListener('ended', function () {
			self.bufferedTime -= self.fixedFrameTime;
			/*
			// Log
			self.logBuf.push({
				descr: "source ended",
				bufferedTime: self.bufferedTime,
				stopped: self.stopped,
				gainValue: self.gainNode.gain.value,
			});
			*/
			if (self.bufferedTime <= self.fixedFrameTime) {
				if (!self.stopped || self.gainNode.gain.value > 0) {	// If not stopped
					// Start gap filler
					self.startGapFiller();
				}
			}
		});

		// Store last value
		this.lastEnqueuedAudioSampleValue = this.nextFrame[this.fixedFrameLength - 1];

		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined) {
			this.resetTime();
		}

		// Play (in near future)
		bufferSource.start(this.nextFrameStartTime);
		this.bufferedTime += this.fixedFrameTime;

		/*
		// Log
		this.logBuf.push({
			descr: logDescription,
			firstSampleVolume: this.nextFrame[0],
			lastSampleVolume: this.nextFrame[this.fixedFrameLength-1],
			bufferedTime: this.bufferedTime,
			nextFrameStartTime: this.nextFrameStartTime,
			ctxTime: this.ctx.currentTime,
			frame: new Float32Array(this.nextFrame)
		});
		*/

		// Next frame
		this.nextFrameStartTime += this.fixedFrameTime;
		this.prepareNextFrame();
	}


	/**
	 * Sets the visual state of the beeper: 0 or 1.
	 */
	protected setVisualBeeperState(beeperValue: boolean) {
		beeperOutput.textContent = (beeperValue) ? "1" : "0";
	}
}

