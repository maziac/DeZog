import {MemoryDumpView} from './memorydumpview';


/**
 * A Webview that shows a memory dump and allows to compare it with
 * the same range at a different time.
 * It also allows filtering so that e.g. only the values that have been
 * decremented since last t ime are shown.
 *
 */
export class MemoryDiffView extends MemoryDumpView {

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
}

