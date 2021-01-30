
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
		sampleRate = 22050;
		this.volume = 1.0;
		this.sampleRate = sampleRate;
		this.ctx = this.createAudioContext(sampleRate);
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.lastBeeperSample = 1;
		this.z80TimeOffset = (this.MIN_LATENCY + this.MAX_LATENCY) / 2;

		this.writeBeeperSamples(undefined as any);
		this.writeBeeperSamples(undefined as any);
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

	protected nextBuffer: AudioBuffer;
	protected fixedFrameLength: number = 22050 * 0.1;	// 100ms
	protected nextFrame: Float32Array;
	protected frameStartTime: number;

	/**
	 * Creates an audio frame from the beeperBuffer.
	 * @param beeperBuffer The beeper changes.
	 */
	protected markIndex = true;
	public writeBeeperSamples(beeperBuffer: BeeperBuffer) {
		/*
		const bufLen = beeperBuffer.bufferLen;
		if (bufLen == 0)
			return; 	// No samples
*/
		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined) {
			this.audioCtxStartTime = this.ctx.currentTime;
			this.frameStartTime = this.audioCtxStartTime + this.z80TimeOffset;
		}

		// Check if new packet
		if (!this.nextBuffer) {
			this.nextBuffer = this.ctx.createBuffer(1, this.fixedFrameLength, this.sampleRate);
			this.nextFrame = this.nextBuffer.getChannelData(0);
		}

		// Fill buffer
		for (let i = 0; i < this.fixedFrameLength; i++) {
			this.nextFrame[i] = -1;
		}

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = this.nextBuffer;
		bufferSource.connect(this.ctx.destination);


		// LOG REMOVE
		bufferSource.addEventListener('ended', () => {
			this.writeBeeperSamples(undefined as any);
			/*
			this.bufferedCount--;
			this.logPassedFrames.push({
				endedTime: this.ctx.currentTime - this.audioCtxStartTime,
				bufferedCount: this.bufferedCount
			});
			*/
		});


		// Play (in near future)
		const diffTime = this.fixedFrameLength / this.sampleRate;
		this.frameStartTime += diffTime;
		bufferSource.start(this.frameStartTime);

		/*
		// REMOVE
		this.bufferedCount++;
		this.logBuf.push({
			bufferedCount: this.bufferedCount,
			startTime: beeperBuffer.time,
			bufLen: bufLen,
			//totalLength: totalLength,
			//totalLengthTime: totalLength / this.sampleRate,
		});


		// Check
		const currentCtxTime = this.ctx.currentTime;
		if (frameStartTime < currentCtxTime)
			console.log("framsStartTime lower than current time: " + (frameStartTime - currentCtxTime));
			*/
	}
}
