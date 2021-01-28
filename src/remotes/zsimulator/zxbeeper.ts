
/**
 * The buffer exchanged with the zsim simulator webview.
 * It contains only the lengths for the stats changes of the beeper.
 */
export interface BeeperBuffer {
	time: number,			// The time the buffer starts (Z80 simulator time).
	totalLength: number,	// The length a "normal" audio frame buffer would occupy.
	startValue: boolean,	// Beeper value start value for the buffer.
	buffer: Uint16Array		// Contains the length of the beeper values.
}


/**
 * ZX beeper audio simulation.
 */
export class ZxBeeper {

	// Stores the last set beeper value.
	protected lastBeeperValue = true;

	// The t-states when the last beeper state was saved.
	protected lastBeeperTstates = 0;

	// Index into the beeper/len buffer.
	protected lastBeeperIndex = 0;

	// The time index that would correspondent to a fixed size audio frame buffer.
	// Used to decide when a new sample is written.
	protected lastBeeperTimeIndex = 0;


	// The beeper value the frame starts with.
	protected startBeeperValue = true;

	// The buffer with all the delta length to the previous beeper value.
	protected beeperLenBuffer: Uint16Array;

	// The used CPU frequency, e.g. 3500000 Hz.
	protected cpuFrequency: number;

	// The used sample rate.
	protected sampleRate: number;


	/**
	 * Constructor.
	 * @param cpuFrequency The used CPU frequency, e.g. 3500000 Hz.
	 * @param sampleRate The sample rate to use.
	 * @param updateFrequency The used update frequency. E.g. with 50 Hz
	 * the buffer should be prepared every 20ms.
	 * The buffer size is calculated from it. As updating may jitter the
	 * internally used buffer size is bigger.
	 * @param passedTstates Usually 0 as ZxBeeper is created before simulation starts.
	 * If it would be initialized later, the current t-States should be passed here.
	 */
	constructor(cpuFrequency: number, sampleRate: number, updateFrequency: number, passedTstates = 0) {
		// Create the buffer
		this.sampleRate = sampleRate;
		const bufferSize = 2 * Math.floor(sampleRate / updateFrequency);	// *2: Allow for jitter. The buffer is not fully used.
		this.beeperLenBuffer = new Uint16Array(bufferSize);
		this.lastBeeperIndex = 0;
		this.lastBeeperTstates = passedTstates;
		this.lastBeeperValue = true;
		this.cpuFrequency = cpuFrequency;
	}


	/**
	 * Sound output.
	 * Writes to the beeper (EAR).
	 * @param passedTstates The current t-states count.
	 * @param on true/false. On or off.
	 */
	public writeBeeper(passedTstates: number, on: boolean) {
		// Only if changed
		if (on != this.lastBeeperValue) {
			// Set length of last value
			this.setLastBeeperValue(passedTstates);
			// Remember value
			this.lastBeeperValue = on;
		}
	}


	/**
	 * Sets the length of the last beeper value.
	 * Length is calculated from current t-states to
	 * last (beeper) t-states.
	 * Length is put in array in samples (at sampleRate).
	 * If index has not advanced far enough (1 sample) nothing is stored.
	 * @param passedTstates The current t-states count.
	 */
	protected setLastBeeperValue(passedTstates: number) {
		// Calculate time
		const time = (passedTstates - this.lastBeeperTstates) / this.cpuFrequency;
		let timeIndex = Math.floor(time * this.sampleRate);
		if (timeIndex >= this.beeperLenBuffer.length) {
			// This would result in a "normal" audio frame buffer bigger than beeperLenBuffer.length
			// which is 2x the normal update frequency.
			// In this case the buffer is "full" and nothing is added.
			return;
		}
		let length = timeIndex - this.lastBeeperTimeIndex;
		if (length == 0) {
			// Value has changed within a sample.
			// Adjust the old value
			if (this.lastBeeperIndex > 0) {
				this.lastBeeperIndex--;
				this.lastBeeperTimeIndex -= this.beeperLenBuffer[this.lastBeeperIndex];
			}
			// Start value
			if (this.lastBeeperTimeIndex == 0)
				this.startBeeperValue = !this.lastBeeperValue;
			return;
		}

		// Start value
		if (this.lastBeeperTimeIndex == 0)
			this.startBeeperValue = this.lastBeeperValue;

		// Set buffer
		this.beeperLenBuffer[this.lastBeeperIndex++] = length;

		// Remember
		this.lastBeeperTimeIndex = timeIndex;
	}


	/**
	 * Returns the buffer with beeper values.
	 * Fills the remaining samples before returning.
	 * @param passedTstates The current t-states count.
	 * @returns Structure with:
	 * time: The start time of the buffer
	 * startValue: of the beeper (on/off)
	 * buffer: UInt16Array of beeper lengths, each indicating how long
	 * (in samples) the previous value lasted.
	 */
	public getBeeperBuffer(passedTstates: number): BeeperBuffer {
		// Set length of last value.
		this.setLastBeeperValue(passedTstates);

		// Copy buffer
		const buffer = new Uint16Array(this.lastBeeperIndex);
		buffer.set(this.beeperLenBuffer.slice(0, this.lastBeeperIndex), 0);

		// Caclulate total length of packet
		let totalLength = 0;
		for (const len of this.beeperLenBuffer) {
			totalLength += len;
		}

		// Calculate time, quantizize
		const timeIndex = Math.floor(passedTstates * this.sampleRate / this.cpuFrequency);
		const startTime = (timeIndex-totalLength) / this.sampleRate;

		// Caclulate total length of packet

		// Return
		return {
			time: startTime,
			totalLength,
			startValue: this.startBeeperValue,
			buffer
		};
	}


}
