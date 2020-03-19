//import * as assert from 'assert';
import {CpuHistoryClass} from '../cpuhistory';



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
			const release=await this.historyMutex.acquire();
			this.historyIndex=-1;
			this.revDbgHistory.length=0;
			this.reverseDbgStack=undefined as any;
			release();
		})();
	}

}

