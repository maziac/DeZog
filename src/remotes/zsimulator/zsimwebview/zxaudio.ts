
class ZxAudio {


	// Start latency of the system.
	protected MIN_LATENCY = 0.1;

	// MAximum latency. If latency grows bigger audio frames are dropped.
	protected MAX_LATENCY = 0.2;

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
	constructor() {
		this.volume = 1.0;
		this.sampleRate = 0;
	}


	/**
	 * Returns the time since start (= first packet).
	 * @returns time in secs
	 */
	protected getAudioTime(): number {
		const time = this.ctx.currentTime - this.audioCtxStartTime;
		if (time < 0)
			return 0;
		return time;
	}


	/**
	 * Sets the sample rate and buffer size.
	 * If values are same as already set this function returns immediately.
	 * If values are different the ZxAudio is reconfigured.
	 * Usually this is set only once per session.
	 */
	public setFrameRateAndBuffer(sampleRate: number) {
		if (this.sampleRate == sampleRate)
			return;	// No change

		try {
			this.ctx = new AudioContext({sampleRate});
			this.sampleRate = this.ctx.sampleRate;
			this.lastBeeperSample = 1;
			this.z80TimeOffset = this.MIN_LATENCY;
			this.audioCtxStartTime = this.ctx.currentTime;
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

	public writeBeeperSamples(beeperBuffer: Array<{value: number, time: number}>, timeEnd: number) {
		// Determine buffer length
		const sampleRate = this.sampleRate;
		const startTime = this.lastZ80Time;
		const bufTime = (timeEnd - startTime);
		const bufLen = Math.floor(bufTime * sampleRate);  // TODO: +0.5 ???
		// Safety check
		if (bufLen <= 0)
			return;	// No samples

		// Create a buffer
		const buffer = this.ctx.createBuffer(2, bufLen, sampleRate);
		const channel0 = buffer.getChannelData(0);
		const channel1 = buffer.getChannelData(1);

		// Fill buffer
		const volume = this.volume;
		let value = this.lastBeeperSample;
		let i = 0;
		let sample = (2 * value - 1) * volume;;
		for (const beep of beeperBuffer) {
			const index = Math.floor((beep.time - startTime) * sampleRate);
			// Fill with previous value
			for (; i < index; i++) {
				channel0[i] = sample;
				channel1[i] = sample;
			}
			// New value
			value = beep.value;
			sample = (2 * value - 1) * volume;
			channel0[index] = sample;
			channel1[index] = sample;

		}
		// Fill rest of buffer
		for (; i < bufLen; i++) {
			channel0[i] = sample;
			channel1[i] = sample;
		}
		// Remember last value
		this.lastBeeperSample = value;

		// Create audio source
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(this.ctx.destination);

		// Add buffer time
		this.totalBufferedTime += bufTime;

		// Listen for end
		bufferSource.addEventListener('ended', () => {
			// Correct the currently buffered time
			this.totalBufferedTime -= bufTime;
		});

		// Play (in near future)
		const frameStartTime = this.audioCtxStartTime + startTime + this.z80TimeOffset;
		bufferSource.start(frameStartTime);

		// Remember end time
		this.lastZ80Time = timeEnd;
	}
}

let zxAudio = new ZxAudio();
//zxAudio.start();
