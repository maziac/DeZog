//import * as assert from 'assert';
import {CpuHistoryClass} from '../cpuhistory';
import {HistoryInstructionInfo} from '../decodehistinfo';



/**
 * This class takes care of theinternal simulator history.
 */
export class ZxSimCpuHistory extends CpuHistoryClass {

	/**
	 * The internal simulator (because it's internal) has a special way to store the history.
	 * So, clearing would be counter productive.
	 */
	public clear() {
		(async () => {
			this.historyIndex=-1;
			this.revDbgHistory.length=0;
			this.reverseDbgStack=undefined as any;
		})();
	}


	/**
	 * Retrieves the registers at the previous instruction from the Remote's cpu history.
	 * Is async.
	 * @returns Data with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		// Check if item available
		let index=this.historyIndex+1;
		if (index>=this.history.length)
			return undefined;

		// Return an item
		const currentLine=this.history[index];
		this.historyIndex=index;
		return currentLine;
	}
}

