
declare interface BeeperBuffer {
	time: number,			// The time the buffer starts (Z80 simulator time).
	totalLength: number,	// The length a "normal" audio frame buffer would occupy.
	startValue: boolean,	// Beeper value start value for the buffer.
	buffer: Uint16Array,		// Contains the length of the beeper values.
	bufferLen: number		// The length of buffer. For some reason buffer.length does not work in the webview.
}

export class ZxAudio {


	// Start latency of the system.
	protected MIN_LATENCY = 0.5; //0.1;

	// Maximum latency. If latency grows bigger audio frames are dropped.
	protected MAX_LATENCY = 1; //0.2;	// TODO: not used yet

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

	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		this.volume = 1.0;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.lastBeeperSample = 1;
		this.z80TimeOffset = (this.MIN_LATENCY+this.MAX_LATENCY)/2;
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
	protected markIndex = true;
	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0)
			return; 	// No samples

		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined)
			this.audioCtxStartTime = this.ctx.currentTime;

		// Get start beeper value
		const value = (beeperBuffer.startValue) ? 1 : -1;
		this.volume = 0.5;	// TODO: REMOVE
		let audioValue = value * this.volume;

		// Create a buffer
		const totalLength = beeperBuffer.totalLength;
		const buffer = this.ctx.createBuffer(1, totalLength, this.sampleRate);
		const monoChannel = buffer.getChannelData(0);

		// Fill buffer
		let k = 0;
		const tmpBuffer = beeperBuffer.buffer;
		for (let i = 0; i < bufLen; i++) {	// TODO: Change to 'of' loop ?
			// Get length
			const length = tmpBuffer[i];
			// Set all samples to the same value
			for (let j = length; j > 0; j--) {
				monoChannel[k++] = audioValue;
			}
			// Alternate for next length
			audioValue *= -1;
		}

		// "Mark" first sample
		if (false) {
			monoChannel[0] = 1;
			if (this.markIndex) {
				monoChannel[1] = 1;
				monoChannel[2] = 1;
				monoChannel[3] = 1;
			}
			this.markIndex = !this.markIndex;
		}

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(this.ctx.destination);


		// LOG REMOVE
		bufferSource.addEventListener('ended', () => {
			this.bufferedCount--;
			this.logPassedFrames.push({
				endedTime: this.ctx.currentTime - this.audioCtxStartTime,
				bufferedCount: this.bufferedCount
			});
		});

		// Play (in near future)
		const frameStartTime = this.audioCtxStartTime + this.z80TimeOffset + beeperBuffer.time;
		bufferSource.start(frameStartTime);

		// REMOVE
		this.bufferedCount++;
		this.logBuf.push({
			bufferedCount: this.bufferedCount,
			startTime: beeperBuffer.time,
			bufLen: bufLen,
			totalLength: totalLength,
			totalLengthTime: totalLength / this.sampleRate,
		});


		// Check
		const currentCtxTime = this.ctx.currentTime;
		if (frameStartTime < currentCtxTime)
			console.log("framsStartTime lower than current time: " + (frameStartTime - currentCtxTime));
	}
}
