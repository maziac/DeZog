import {Log} from "../../log";
import {Serializable, MemBuffer} from "../../misc/membuffer";

/**
 * The buffer exchanged with the zsim simulator webview.
 * It contains only the lengths for the stats changes of the beeper.
 */
export interface BeeperBuffer {
	totalLength: number,	// The length a "normal" audio frame buffer would occupy.
	startValue: boolean,	// Beeper value start value for the buffer.
	buffer: Uint16Array,	// Contains the length of the beeper values.
	bufferLen: number		// The length of buffer. For some reason buffer.length does not work in the webview.
}


/**
 * ZX beeper audio simulation.
 */
export class ZxBeeper implements Serializable {

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


	//protected logBuf = new Array<any>();

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
	 * Returns the last set beeper value.
	 * @returns 0 or 1.
	 */
	public getCurrentBeeperValue(): number {
		return (this.lastBeeperValue) ? 1 : 0;
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
	 * Length is put into the array in samples (at sampleRate).
	 * If index has not advanced far enough (1 sample) the previous value is corrected
	 * or the lastBeeperValue is corrected.
	 * @param passedTstates The current t-states count.
	 */
	protected setLastBeeperValue(passedTstates: number) {
		// Calculate
		//Log.log('setLastBeeperValue: value=' +(!this.lastBeeperValue)+ ', passedTstates=' + passedTstates + ',  lastBeeperTstates=' + this.lastBeeperTstates + ',  diff=' + (passedTstates - lastBTstates));
		const time = (passedTstates - this.lastBeeperTstates) / this.cpuFrequency;
		let timeIndex = Math.floor(time * this.sampleRate);
		if (timeIndex >= this.beeperLenBuffer.length) {
			// This would result in a "normal" audio frame buffer bigger than beeperLenBuffer.length
			// which is 2x the normal update frequency.
			// In this case the buffer is "full" and nothing is added.
			//Log.log('setLastBeeperValue: timeIndex >= this.beeperLenBuffer.length, return');
			return;
		}
		let length = timeIndex - this.lastBeeperTimeIndex;
		if (length == 0) {
			//Log.log('setLastBeeperValue: A length == 0');
			// Value has changed within a sample.
			// Adjust the old value
			if (this.lastBeeperIndex > 0) {
				//Log.log('setLastBeeperValue: A length == 0, lastBeeperIndex=' + this.lastBeeperIndex);
				this.lastBeeperIndex--;
				this.lastBeeperTimeIndex -= this.beeperLenBuffer[this.lastBeeperIndex];
			}
			// Start value
			if (this.lastBeeperTimeIndex == 0) {
				this.startBeeperValue = !this.lastBeeperValue;
				//Log.log('setLastBeeperValue: A this.lastBeeperTimeIndex == 0: startBeeperValue='+this.startBeeperValue);
			}
			//Log.log('setLastBeeperValue: A return');
			return;
		}

		//Log.log('setLastBeeperValue: length='+length+', lastBeeperIndex='+this.lastBeeperIndex);

		// Set buffer
		this.beeperLenBuffer[this.lastBeeperIndex++] = length;

		// Remember
		this.lastBeeperTimeIndex = timeIndex;
		Log.log('setLastBeeperValue: end');
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
		Log.log('getBeeperBuffer: start.');
		// Calculate time
		const time = (passedTstates - this.lastBeeperTstates) / this.cpuFrequency;
		let timeIndex = Math.floor(time * this.sampleRate);
		if (timeIndex >= this.beeperLenBuffer.length) {
			// This would result in a "normal" audio frame buffer bigger than beeperLenBuffer.length
			// which is 2x the normal update frequency.
			// In this case the buffer is "full" and nothing is added.
			timeIndex = this.beeperLenBuffer.length;
		}
		// Set length of last value.
		let length = timeIndex - this.lastBeeperTimeIndex;
		if (length > 0)
			this.beeperLenBuffer[this.lastBeeperIndex++] = length;

		// Copy buffer
		const buffer = new Uint16Array(this.lastBeeperIndex);
		buffer.set(this.beeperLenBuffer.slice(0, this.lastBeeperIndex), 0);

		// Calculate total length of packet
		let totalLength = 0;
		for (const len of buffer) {
			totalLength += len;
		}

		// Set values
		this.lastBeeperTstates = passedTstates;
		this.lastBeeperIndex = 0;
		this.lastBeeperTimeIndex = 0;

		//Log.log('getBeeperBuffer: value=' + this.startBeeperValue+ ', totalLength=' +totalLength+', lastBeeperTstates=' + this.lastBeeperTstates);

		/*
		this.logBuf.push({
			startValue: this.startBeeperValue,
			buffer: buffer,
			passedTstates: passedTstates,
			passedTime: passedTstates / this.cpuFrequency,
			totalLength: totalLength,
			totalLengthTime: totalLength / this.sampleRate
		});
		*/

		// Set next beeper value (this is for the case that no change happens until
		// next getBeeperBuffer)
		const resultStartValue = this.startBeeperValue;
		this.startBeeperValue = this.lastBeeperValue;

		// Return
		return {
			totalLength,
			startValue: resultStartValue,
			buffer,
			bufferLen: buffer.length
		};
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer = new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size = memBuffer.getSize();
		return size;
	}


	/**
	 * Serializes the object.
	 * Basically the last beeper value.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Write slot/bank mapping
		memBuffer.writeBoolean(this.lastBeeperValue);
		// Write last t-states
		memBuffer.writeNumber(this.lastBeeperTstates);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read beeper state
		this.lastBeeperValue = memBuffer.readBoolean();
		// Write last t-states
		this.lastBeeperTstates = memBuffer.readNumber();
		// Reset other values
		this.lastBeeperIndex = 0;
		this.lastBeeperTstates = 0;
	}
}
