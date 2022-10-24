import {MemoryDump} from '../misc/memorydump';
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

	// The values used for diffing:
	// undefined = not equal
	// any number = the diff must have exactly this value (e.g. 1)
	protected previousDiffCriteria: number | 'no check' | 'not equal';


	/** Creates the basic panel.
	 */
	constructor() {
		super();
		this.titlePrefix = 'Memory Diff View: ';
		this.previousDiffCriteria = 'no check';	// Do no check at the beginning
	}


	/**
	 * Change to 'withoutBoundary'.
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block.
	 */
	public addBlock(startAddress: number, size: number, title: string) {
		this.memDump.addBlockWithoutBoundary(startAddress, size, title);
	}


	/** The search widget is disabled.
	 */
	protected createInputHtml(): string {
		return `
<style>

body.vscode-dark {
}

body.vscode-light {
}

.inputWidget {
	user-select: none;
	font-family: Arial;
	position: fixed;
	right: 2em;
	background-color: var(--vscode-editorWidget-background);
    padding: 2px;
    padding-right: 2px;
	box-shadow: 1px 1px 1px 1px var(--vscode-widget-shadow);
}
.inputComboBox {
 	-webkit-appearance: none;
	font-family: Arial;
	width: 2em;
	text-align: center;
	color: var(--vscode-input-foreground);
	background-color: var(--vscode-input-background);
	border-color: transparent;
	vertical-align: middle;
}
.inputComboBox:focus {
    outline-color: var(--vscode-tab-activeModifiedBorder);
}
.storeButton {
	font-family: Arial;
	vertical-align: middle;
	text-align: center;
    color: var(--vscode-editor-foreground);
  	background-color: var(--vscode-editorWidget-background);
    border-radius: 1px;
	border: 0;
    outline-width: 1px;
    outline-style: solid;
    outline-color: transparent;
}
.storeButton:active {
    color: var(--vscode-button-foreground);
    background-color: var(--vscode-editorWidget-background);
}
.storeButton:focus {
    outline-color: var(--vscode-tab-activeModifiedBorder);
}
.storeButton:hover {
   	cursor: pointer;
  	background-color: var(--vscode-editorWidget-background);
}

</style>

<script>

function changeDiffCriteria(obj) {
	const criteria = obj.options[obj.selectedIndex].text;
	vscode.postMessage({
		command: "diffCriteriaChanged",
		criteria: criteria
	});
}

function store() {
	// Send store message
	vscode.postMessage({
		command: "storeDiff"
	});
	// Reset diff criteria to "==" (otherwise nothing would be shown anymore)
	const comboBox =  document.getElementById("comboBox");
	comboBox.selectedIndex = 0;	// Note: this will NOT generate a "diffCriteriaChanged" message.
}


//# sourceURL=memorydiffview-inputhtml.js
</script>

<div class="inputWidget">
	<select id="comboBox" class="inputComboBox" onchange="changeDiffCriteria(this)">
	<option title="No check. Shows the current values.">--</option>
	<option>==</option>
	<option>!=</option>
	<option>-1</option>
	<option>-2</option>
	<option>+1</option>
	<option>+2</option>
	</select>
	<button class="storeButton" title="Press to use the current result as new base for future comparison." onclick="store()">Store</button>
</div>

<br>
		`;
	}


	/**Returns the diffMemDump instead.
	 * @returns html in a string.
	 */
	protected getAllHtmlTables(): string {
		const tables = this.getAllHtmlTablesForDump(this.diffMemDump);
		return tables || "'Diff' is empty.";
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
			// For the first view it is enough to shallow copy the diffMemDump
			this.diffMemDump = this.memDump;
			// Create the first time
			this.setHtml();
			// Create title
			this.setPanelTitle();
		}
		else {
			// Calculate the diff
			this.diffMemDump = this.memDump.getDiffMemDump(this.baseMemDump, this.previousDiffCriteria);

			// Update the html table
			const tableHtml = this.getAllHtmlTables();
			const msg = {
				command: 'setAllTables',
				html: tableHtml
			};
			this.sendMessageToWebView(msg);
		}

		// Set colors for register pointers
		this.setColorsForRegisterPointers();
	}


	/** Handle the commands for changing the diff criteria and for storing.
	 * Otherwise the parent's function is called.
	 * @param message The message. message.command contains the command as a string.
	 */
	protected async webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'diffCriteriaChanged':
				console.log(message);
				// Convert criteria
				const criteria = message.criteria;
				let diff;
				switch (criteria) {
					case '--':
						diff = 'no check';
						break;
					case '!=':
						diff = 'not equal';
						break;
					case '==':
						diff = 0;
						break;
					default:
						diff = parseInt(criteria);
						break;
				}
				// Store
				this.previousDiffCriteria = diff;
				// Update
				this.updateWithoutRemote();
				break;

			case 'storeDiff':
				console.log(message);
				// Simply take the current diff map as new base map
				// Note: I don't need to clone here, diffMemMap contents is not changed.
				// There is also no need to update because this map is already shown
				// and the combo box has been changed to "==" already.
				this.baseMemDump = this.diffMemDump;
				// But I need to clone 'memDump' because the use might alter it
				// and in that case also the 'baseMemDump' would be updated.
				this.memDump = this.diffMemDump.clone();
				// Update title
				this.setPanelTitle();
				break;

			case 'getValueInfoText':
				{
					// For hover: This message now uses the 'diffMemDump' instead of 'memDump'.
					const address = parseInt(message.address);
					await this.getValueInfoText(address, this.diffMemDump);
				}
				break;

			default:
				await super.webViewMessageReceived(message);
				break;
		}
	}
}
