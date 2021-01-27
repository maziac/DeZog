
class ZxAudio {


	// Start latency of the system.
	protected MIN_LATENCY = 0.1;

	// MAximum latency. If latency grows bigger audio frames are dropped.
	protected MAX_LATENCY = 0.2;	// TODO: not used yet

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


	/**
	 * Constructor.
	 */
	constructor(sampleRate: number) {
		this.volume = 1.0;
		this.sampleRate = sampleRate;
		this.ctx = new AudioContext({sampleRate});
		this.sampleRate = this.ctx.sampleRate;	// TODO: Error if wrong?
		this.lastBeeperSample = 1;
		this.z80TimeOffset = this.MIN_LATENCY;
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
	 * Write a complete frame based on the beeper data.
	 * The created frames may vary ins size and depend on the 'timeEnd' and
	 * the stored 'timeEnd' of the last frame.
	 * @param beeperBuffer Beeper data contains of values with timestamps (Z80 time).
	 * @param timeEnd The end of the buffer as time. The frame is filled up
	 * until this time with the last beeper value.
	 */
	protected lastZ80Time = 0;
	protected totalBufferedTime = 0;

	// The audio system and the Z80 are not fully synchronized.
	// The difference may also vary over time a little bit.
	// The offset here is use to calculate from one time system to the other.
	// z80TimeOffset starts with the latency of the system but is adjusted
	// the longer the audio is played.
	protected z80TimeOffset: number;


	/**
	 * Creates an audio frame from the beeperBuffer.
	 * The beeper buffer structure:
	 * 1rst word: beeper start value: 0 or 1
	 * An array of lengths, after each length the beeper value alternates.
	 * The beeper array size and length may vary.
	 * So does the resulting frame.
	 * The frame is set to start in the near future.
	 * The sample rate of the originating values is the same as the target sample rate.
	 */
	public writeBeeperSamples(beeperBuffer: Uint16Array) {
		const bufLen = beeperBuffer.length;
		if (bufLen <= 1)
			return; 	// No samples

		// Store the start time on the first packet
		if (this.audioCtxStartTime == undefined)
			this.audioCtxStartTime = this.ctx.currentTime;

		// Get start beeper value
		let audioValue = (2 * beeperBuffer[0] - 1) * this.volume;

		// Calculate size of required frame buffer
		let totalLength = -beeperBuffer[0];
		for (const len of beeperBuffer) {
			totalLength += len;
		}

		// Create a buffer
		const buffer = this.ctx.createBuffer(1, totalLength, this.sampleRate);
		const monoChannel = buffer.getChannelData(0);

		// Fill buffer
		let k = 0;
		for (let i = 1; i < bufLen; i++) {
			// Read length
			const length = beeperBuffer[i];
			// Set all samples to the same value
			for (let j = length; j > 0; j--) {
				monoChannel[k++] = audioValue;
			}
			// Alternate for next length
			audioValue *= -1;
		}

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(this.ctx.destination);

		// Add buffer time
		this.totalBufferedTime += totalLength;

		// Listen for end
		bufferSource.addEventListener('ended', () => {
			// Correct the currently buffered time
			this.totalBufferedTime -= totalLength;
		});

		// Play (in near future)
		const frameStartTime = this.audioCtxStartTime + this.z80TimeOffset;
		bufferSource.start(frameStartTime);
	}
}
