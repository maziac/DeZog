import {BeeperBuffer} from "../zxbeeper";

// Singleton for the audio beeper.
export let zxAudioBeeper: ZxAudioBeeper;


export class ZxAudioBeeper {

	// Create the singleton.
	public static createZxAudioBeeper(sampleRate: number, beeperOutput: HTMLElement) {
		zxAudioBeeper = new ZxAudioBeeper(sampleRate, beeperOutput);
	}

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
	public sampleRate: number;

	// To compare time with Z80 time the start time (after frame rate configuration)
	// is stored here.
	protected audioCtxStartTime: number;

	// The value shown to the user. Is here in order not to update to frequently.
	protected lastVisualBeeperState: boolean;

	// Used to display a value different from 1 and 0 when the speaker value is constantly changing.
	protected visualBeeperChanging: boolean;

	// Aggregation time for the changing value.
	protected BEEPER_DISPLAY_AGGREGATE_TIME = 100;	// 100 ms

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
	protected bufferedLength = 0;

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

	// The visual beeper element
	protected beeperOutput: HTMLElement;


	/** Constructor.
	 */
	constructor(sampleRate: number, beeperOutput: HTMLElement) {
		//sampleRate = 22050;
		this.volume = 0.75;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;
		this.fixedFrameLength = Math.ceil(this.MIN_LATENCY/4 * this.sampleRate);
		this.fixedFrameTime = this.fixedFrameLength / this.sampleRate;
		this.lastEnqueuedAudioSampleValue = 0;
		this.lastVisualBeeperState = (this.lastEnqueuedAudioSampleValue != 0);
		this.visualBeeperChanging = false;
		this.samplesInTopHalf = true;
		this.audioCtxStartTime = 0;	// Irrelevant while stopped
		this.stopped = true;

		// Create gain node
		this.gainNode = this.ctx.createGain();
		this.gainNode.gain.value = 1.0;
		//this.gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
		this.gainNode.connect(this.ctx.destination);
		this.prepareNextFrame();

		// Visual update
		this.beeperOutput = beeperOutput;
		setInterval(() => {
			this.updateVisualBeeper();
		}, this.BEEPER_DISPLAY_AGGREGATE_TIME);
	}


	/** For testing this function is overwritten to return a mocked AudioContext.
	 */
	protected createAudioContext(sampleRate: number): AudioContext {
		return new AudioContext({sampleRate});
	}


	/** Stops audio.
	 * Creates a fading audio frame.
	 */
	public stop() {
		if (!this.stopped) {
			// Fade
			this.startFadeToZero();
		}
	}


	/** Resume is called regularly to overcome a Chrome issue:
	 * https://developer.chrome.com/blog/autoplay/
	 * Chrome will disallow audio until the user interacts with the page.
	 * 'resume' should be called on every simulator 'update'.
	 * If it was suspended it will be activated if meanwhile the user has interacted.
	 * I.e. with no interaction no audio will be audible.
	 */
	public resume() {
		if (!this.stopped) {
			if (this.ctx.state === 'suspended') {
				(async () => {
					await this.ctx.resume();
				})();
			}
		}
	}


	/** Sets the volume.
	 * @param volume [0;1]
	 */
	public setVolume(volume: number) {
	//	this.ctx.resume();
		this.volume = volume;
		// Use a "ramp" otherwise changing the volume will introduce some noise
		this.gainNode.gain.value = this.gainNode.gain.value;	// NOSONAR: required, but I don't know why anymore.
		this.gainNode.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.1)
	}


	/** Gets the volume.
	 * @returns volume [0;1]
	 */
	public getVolume() {
		return this.volume;
	}


	/** Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */

	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		const bufLen = beeperBuffer.bufferLen;
		const beeperLengths = beeperBuffer.buffer;

		// Update display
		this.setVisualBeeperState(beeperBuffer);

		// Check if it was stopped before
		if (this.stopped) {
			// Unstop
			this.stopped = false;
			this.gainNode.gain.value = this.volume;
			this.resetTime();
			// Fill with gaps to start with
			this.lastEnqueuedAudioSampleValue = 0;	// The value to use for filling
			// At least 2 buffers:
			while (this.bufferedLength < 2*this.fixedFrameLength) {
				this.startGapFiller();
			}
			// Now use the new value
			//this.lastEnqueuedAudioSampleValue = this.getAudioValueForBeeper(beeperBuffer.startValue);

			// Log
			/*
			this.logBuf.push({
				descr: "writeBeeperSamples START after stop",
				startValue: beeperBuffer.startValue,
				currentGain: this.gainNode.gain.value
			});
			*/
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
		let k = 0;
		let tmpBuffer = new Float32Array(beeperBuffer.totalLength);
		let beeperValue = beeperBuffer.startValue;
		let audioValue = this.getAudioValueForBeeper(beeperValue);
		this.lastEnqueuedAudioSampleValue = audioValue;
		for (let i = 0; i < bufLen; i++) {
			// Get length
			const length = beeperLengths[i];
			// Set all samples to the same value
			for (let j = length; j > 0; j--) {
				tmpBuffer[k++] = audioValue;
			}
			this.lastEnqueuedAudioSampleValue = audioValue;
			// Alternate for next length
			beeperValue = !beeperValue;
			audioValue = this.getAudioValueForBeeper(beeperValue);
		}

		// Check if audio frame can be played
		let remainingLen = beeperBuffer.totalLength;
		let offset = 0;
		while (remainingLen > 0) {
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

			// Check next start frame time for upper limit.
			// This happens if simulation is too fast.
			// In this case the start time is reduced ba a few frames is reduced.
			if (this.bufferedLength < this.MAX_LATENCY*this.sampleRate+2*this.fixedFrameLength) {
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
					bufferedLength: this.bufferedLength,
					nextFrameStartTime: this.nextFrameStartTime,
				});
				*/
			}
		}

		/*
		this.logBuf.push({descr: "writeBeeperSamples end"});
		*/
	}


	/** Resets the ctx time.
	 */
	protected resetTime() {
		this.audioCtxStartTime = this.ctx.currentTime;
		this.nextFrameStartTime = this.audioCtxStartTime + (this.MIN_LATENCY + this.MAX_LATENCY) / 2;
		this.bufferedLength = 0;

		/*
		this.logBuf.push({
			descr: "time reset",
			volume: this.volume,
			ctxTime: this.audioCtxStartTime,
			nextFrameStartTime: this.nextFrameStartTime
		});
		*/
	}


	/** Prepares an empty frame.
	 */
	protected prepareNextFrame() {
		this.nextBuffer = this.ctx.createBuffer(1, this.fixedFrameLength, this.sampleRate);
		this.nextFrame = this.nextBuffer.getChannelData(0);
		this.nextFrameIndex = 0;
	}


	/** Returns an audio sample value [-1;1] from the boolean beeper value.
	 * @param beeperValue true/false. 1/0
	 * @returns [-1;1]
	 */
	protected getAudioValueForBeeper(beeperValue: boolean) {
		let audioValue = beeperValue ? 1 : 0;
		if (!this.samplesInTopHalf)
			audioValue -= 1;
		return audioValue;
	}


	/** Creates a gap filler frame with all samples containing value
	 * and starts it at the next starting time.
	 * Skips creation if lastEnqueuedAudioSampleValue is 0 and there is no
	 * pending frame.
	 * I.e. it will immediately return after a fadeToZero frame(s).
	 */
	protected startGapFiller() {
		// Create the (remaining) samples
		const frame = this.nextFrame;
		const value = this.getLastAudioValue();
		for (let i = this.nextFrameIndex; i < this.fixedFrameLength; i++)
			frame[i] = value;

		// Start gap filler
		this.playNextFrame("gap filler frame");
	}


	/** Returns the last decoded audio value.
	 */
	protected getLastAudioValue(): number {
		if (this.nextFrameIndex == 0)
			return this.lastEnqueuedAudioSampleValue;
		return this.nextFrame[this.nextFrameIndex - 1];
	}


	/** Creates a frame that fades to 0 if current value is 1 or -1.
	 * The frame is enqueued. It will be the last played frame until another
	 * writeBeeperSamples is received.
	 * This happens while stepping in the simulator.
	 * If current value is already 0 nothing happens, no fade required.
	 * @param value The audio value to use.
	 */
	protected startFadeToZero() {
		let prevLastAudioSample = this.getLastAudioValue();

		// Get current index
		const prevIndex = this.nextFrameIndex;

		// Push out the current sample
		this.startGapFiller();
		this.stopped = true;

		// Fade out
		const currentGain = this.gainNode.gain.value;
		this.gainNode.gain.value = currentGain;	// Set start time
		const fadeStartTime = this.nextFrameStartTime + prevIndex / this.sampleRate;
		this.gainNode.gain.linearRampToValueAtTime(currentGain, fadeStartTime); // Stay at volume until end of last frame
		this.gainNode.gain.linearRampToValueAtTime(0.0, fadeStartTime + this.FADE_TO_ZERO_TIME); // Set end time

		/*
		this.logBuf.push({
			descr: "startFadeToZero",
			currentGain,
			nextFrameStartTime: this.nextFrameStartTime,
			linearRampToValueAtTime: this.nextFrameStartTime + this.FADE_TO_ZERO_TIME
		});
		*/

		// Next values in upper or lower half
		//this.samplesInTopHalf = (prevLastAudioSample < 0);
		if (prevLastAudioSample != 0) {
			this.samplesInTopHalf = (prevLastAudioSample < 0);
		}
	}


	/** Assumes the audio frame (this.nextFrame) is filled and enqueues it for
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
			self.bufferedLength -= self.fixedFrameLength;
			/*
			// Log
			self.logBuf.push({
				descr: "source ended",
				bufferedLength: self.bufferedLength,
				stopped: self.stopped,
				gainValue: self.gainNode.gain.value,
			});
			*/
			if (self.bufferedLength <= self.fixedFrameLength) {
				if (!self.stopped || self.gainNode.gain.value > 0) {	// If not stopped
					// Start gap filler
					self.startGapFiller();
					return;
				}
			}
		});

		// Play (in near future)
		bufferSource.start(this.nextFrameStartTime);
		this.bufferedLength += this.fixedFrameLength;

		/*
		// Log
		this.logBuf.push({
			descr: logDescription,
			firstSampleVolume: this.nextFrame[0],
			lastSampleVolume: this.nextFrame[this.fixedFrameLength-1],
			bufferedLength: this.bufferedLength,
			nextFrameStartTime: this.nextFrameStartTime,
			ctxTime: this.ctx.currentTime,
			frame: new Float32Array(this.nextFrame)
		});
		*/

		// Next frame
		this.nextFrameStartTime += this.fixedFrameTime;
		this.prepareNextFrame();
	}


	/** Sets the visual state of the beeper: 0 or 1.
	 */
	protected setVisualBeeperState(beeperBuffer: BeeperBuffer) {
		// Check if changing by the length
		if (beeperBuffer.bufferLen >= 2) {
			this.visualBeeperChanging = true;
			// Check if flipped
			if (beeperBuffer.bufferLen % 2 == 0) // Even
				this.lastVisualBeeperState = beeperBuffer.startValue;
			else
				this.lastVisualBeeperState = !beeperBuffer.startValue;
		}
		else {
			// Check if start Value changed
			if (this.lastVisualBeeperState != beeperBuffer.startValue) {
				// Yes, change detected
				this.visualBeeperChanging = true;
				// Remember value
				this.lastVisualBeeperState = beeperBuffer.startValue;
			}
		}
	}


	/** Called periodically to update the beeper displayed value.
	 */
	protected updateVisualBeeper() {
		if (this.visualBeeperChanging) {
			// Display symbol for changing
			this.beeperOutput.textContent = '*';
			this.visualBeeperChanging = false;
		}
		else {
			// Display 0 or 1
			this.beeperOutput.textContent = (this.lastVisualBeeperState) ? "1" : "0";
		}
	}
}

