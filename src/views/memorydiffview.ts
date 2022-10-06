import {MemoryDump} from '../misc/memorydump';
import {MetaBlock} from '../misc/metablock';
import {MemoryDumpView} from './memorydumpview';


/**
 * A Webview that shows a memory dump and allows to compare it with
 * the same range at a different time.
 * It also allows filtering so that e.g. only the values that have been
 * decremented since last time are shown.
 *
 * The MemoryDiffView, compared to the MemoryDumpView, works with 3 main
 * memory containers:
 * - memDump: The "normal" (already in MemoryDumpView) defined memory area.
 * - baseMemDump: The memory that the comparison is done with.
 * - diffMemDump: The result: diffMemDump = memDump - baseMemDump
 *
 * memDump and baseMemDump share the same ranges. Whereas the resulting
 * diffMemDump can have complete different ranges.
 * E.g. if memDump and baseMemDump would differ only in one value then
 * the diffMemDump would contain only the small range around this value.
 *
 * At start all memory areas are undefined.
 * When update() is called memDump is updated with the current memory values.
 * When updateWithoutRemote() is called (just afterwards) the baseMemDump
 * is copied from the memDump if it is previously undefined.
 *
 * I.e. when created both, memDump and baseMemDump get the same values.
 * On each step afterwards onl memDump is updated. baseMemDump remains the same.
 *
 * Several different diffs can be chosen by the user in the UI of the webview.
 * Compared is memDump - baseMemDump:
 * - equal: Default. All items that are equal are shown.
 * - not equal: All items that are not equal are shown.
 * - +1: All items that differ by 1 are shown.
 * - +2: All items that differ by 2 are shown.
 * - -1: All items that differ by -1 are shown.
 * - -2: All items that differ by -2 are shown.
 *
 * On each step (updateWithoutRemote) and on every user change the
 * diffMemDump is re-evaluated.
 * Because ranges may change there is no search bar and the html is always regenerated.
 * I.e. it uses 'setMemoryTable' instead of 'memoryChanged'.
 */
export class MemoryDiffView extends MemoryDumpView {

	/// The "old" memory dump. I.e. the base to compare the current
	// memory to.
	protected baseMemDump: MemoryDump;

	// The resulting diff memory dump: memDump - baseMemDump
	protected diffMemDump: MemoryDump;


	/** Creates the basic panel.
	 */
	constructor() {
		super();
		this.titlePrefix = 'Memory Diff View: ';
	}


	/** The search widget is disabled.
	 */
	protected createSearchHtml(): string {
		return '';
	}


	/**
	 * Compared to the original this does not create the table itself.
	 * @param index The number of the memory block, starting at 0.
	 * Used for the id.
	 * @param metaBlock The block to convert. The template takes only the name from it.
	 */
	protected createHtmlTableTemplate(index: number, metaBlock: MetaBlock): string {
		// Add html body
		let caption = metaBlock.title || '...';

		const html = `
		<details open="true">
			<summary>${caption}</summary>
			<div id="mem_table_${index}">

			</div>
		</details>
		`;
		return html;
	}


	/** Copies this.memDump to the baseMemDump (if undefined).
	 * Does the diffing and shows the new html.
	 */
	protected updateWithoutRemote() {
		// Store base memory (if not yet done)
		if (!this.baseMemDump)
			this.baseMemDump = this.memDump.clone();

		// Create generic html if not yet done (the first time)
		if (!this.vscodePanel.webview.html) {
			// Create the first time
			this.setHtml();
		}

		// Calculate the diff
		this.diffMemDump = this.memDump.getDiffMemDump(this.baseMemDump);

		// Update the html table
		let i = 0;
		for (let metaBlock of this.memDump.metaBlocks) {
			// Update the block in html
			const msg = {
				command: 'setMemoryTable',
				index: i,
				html: this.createHtmlTable(metaBlock)
			};
			this.sendMessageToWebView(msg);
			// Next
			i++;
		}
		// Set colors for register pointers
		this.setColorsForRegisterPointers();
	}
}

