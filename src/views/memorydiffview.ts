import {MemoryDump} from '../misc/memorydump';
import {MemoryDumpView} from './memorydumpview';


/**
 * A Webview that shows a memory dump and allows to compare it with
 * the same range at a different time.
 * It also allows filtering so that e.g. only the values that have been
 * decremented since last t ime are shown.
 *
 */
export class MemoryDiffView extends MemoryDumpView {

	/// The previous memory dump. I.e. the base to compare the current
	// memory to.
	protected baseMemDump: MemoryDump;


	/** Creates the basic panel.
	 */
	constructor() {
		super();
		this.vscodePanel.title = 'Diff View: ' + this.vscodePanel.title;
	}


	/** The search widget is disabled.
	 */
	protected createSearchHtml(): string {
		return '';
	}


	/** Additionally stores (copies) the base memory dump.
	 * @param reason Not used.
	 */
	public async update(reason?: any): Promise<void> {
		await super.update(reason);
		// Store memory
		if (!this.baseMemDump) {
			this.copyToBaseMemory();
		}
	}


	/** Copies this.memDump to the baseMemDump.
	 * Both structure and contents.
	 */
	protected copyToBaseMemory() {
		this.baseMemDump = this.memDump.clone();
	}
}

