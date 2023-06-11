import * as vscode from 'vscode';
import {Remote} from '../remotes/remotebase';
import * as util from 'util';
import {Utility} from '../misc/utility';
import {Labels} from '../labels/labels';
import {MemoryDump, FoundAddresses} from '../misc/memorydump';
import {Settings} from '../settings/settings';
import {Z80RegistersClass} from '../remotes/z80registers';
import {BaseView} from './baseview';
import {MetaBlock} from '../misc/metablock';


/// The boundary at which the memory dumps should be shown.
const MEM_DUMP_BOUNDARY = 16;


/**
 * A Webview that shows a memory dump.
 * The memory dump can also be edited.
 * There is a rather complex messaging between the webview's html javascript (the webview
 * panel) and the extension (the typescript code):
 * - Display:
 * 		- Register coloring: If the address of a value is the same as a register value it is colored
 * differently. 'setColorsForRegisterPointers' calls 'setAddressColor' in the webview. This is done
 * when the panel is created or updated (each step) or when the webview becomes visible (e.g. if
 * it was hidden).
 * 		- The dump contents is updated on every step ('update').
 * 		- The hovering text (labels etc.): When the mouse is over a value or address the webview asks for the hovering text ('getValueInfoText/getAddressInfoText'.
 * 		This way the calculation of all labels is delayed. A message with the info is sent to the webview ('valueInfoText/addressInfoText').
 * - Editing:
 * 		- On double click the webview turns the cell in editable mode.
 * 		- When the user presses enter the new value is sent from the webview('valueChanged').
 * 		- The value is then changed in the remote and the real value (from the remote) is sent to
 * 		to the webview. The webview will then update all cells with the same address. I.e. if there
 * 		are 2 same cells both are updated.
 * 		- If there are several memory views all are informed about the new value to update their display.
 *
 * With DeZog 3.0 the search functionality was added to the web view.
 *
 * See design.md for a sequence chart.
 */
export class MemoryDumpView extends BaseView {

	/// Array that contains all of the created memory views.
	protected static MemoryViews = Array<MemoryDumpView>();

	/// The memory dump to show.
	protected memDump = new MemoryDump();

	/// Used to store the previous register addresses, e.g. HL, DE etc.
	protected prevRegAddr = new Map<string, number>();

	// The windows title prefix, e.g. "Memory ".
	protected titlePrefix = "Memory ";

	// Search:
	// The addresses found in last search are stored here.
	// Used to check if display needs to be updated on a step.
	protected foundAddresses: FoundAddresses;
	// The last search in binary representation.
	protected searchDataInput: number[] = [];
	// Last search options:
	protected caseSensitive: boolean;
	protected zeroTerminated: boolean;
	protected delta: boolean;


	/**
	 * Creates the basic panel.
	 */
	constructor() {
		super(true, false);
		MemoryDumpView.MemoryViews.push(this);
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Removes it from the static list.
	 */
	public disposeView() {
		// Remove from base list
		super.disposeView();
		// Remove from list
		const arr = MemoryDumpView.MemoryViews;
		const index = arr.indexOf(this);
		Utility.assert(index >= 0);
		arr.splice(index, 1);
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 * This needs to be created inside the web view.
	 */
	protected async webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'valueChanged':
				try {
					// Change memory
					const address = parseInt(message.address);
					const value = Utility.evalExpression(message.value);
					if (value <= 255 && value >= -255) {
						await this.changeMemory(address, value);
					}
					else {
						// Error
						await vscode.window.showWarningMessage("Value (" + value + ") out of range.");
					}
				}
				catch (e) {
					await vscode.window.showWarningMessage("Could not evaluate: '" + message.value + "'");
				}
				break;

			case 'getValueInfoText':
				{
					const address = parseInt(message.address);
					await this.getValueInfoText(address, this.memDump);
				}
				break;

			case 'getAddressInfoText':
				{
					const address = parseInt(message.address);
					await this.getAddressInfoText(address);
				}
				break;

			case 'searchChanged':
				{
					// Search text or options changed.
					try {
						// Copy options
						this.caseSensitive = message.caseSensitive;
						this.zeroTerminated = message.zeroTerminated;
						this.delta = message.delta;
						// Parse input string
						this.searchDataInput = this.memDump.parseSearchInput(message.searchText);
						// Search all addresses
						this.foundAddresses = this.memDump.searchData(this.searchDataInput, this.caseSensitive, this.zeroTerminated, this.delta);
					}
					catch (e) {
						this.foundAddresses = {
							length: 0,
							addresses: undefined as any
						};
					}
					// Send found addresses to webview for display
					const msg = {command: 'foundAddresses', ...this.foundAddresses};
					this.sendMessageToWebView(msg);
				}
				break;

			default:
				await super.webViewMessageReceived(message);
				break;
		}
	}


	/** Checks if search results have changed.
	 * If yes: update the web view highlighting.
	 * If no: inform webview to use the last values for highlighting.
	 */
	protected updateSearchResults() {
		try {
			// Only if there is something to search
			if (this.searchDataInput.length > 0) {
				// Do a new search
				const currentFound = this.memDump.searchData(this.searchDataInput, this.caseSensitive, this.zeroTerminated, this.delta);
				// Checks if search results have changed
				const len = currentFound.addresses.length;
				let changed = (this.foundAddresses.addresses.length != len);
				if (!changed) {
					// Check also the addresses
					for (let i = 0; i < len; i++) {
						if (currentFound.addresses[i] != this.foundAddresses.addresses[i]) {
							changed = true;
							break;
						}
					}
				}

				// Update only on change.
				if (changed) {
					// Use found addresses
					this.foundAddresses = currentFound;
					// Send found addresses to webview for display
					const msg = {command: 'foundAddresses', ...this.foundAddresses};
					this.sendMessageToWebView(msg);
				}
			}
		}
		catch (e) {
			// Ignore (should not happen)
		}
	}


	/**
	 * Adds a new memory block to display.
	 * Memory blocks are ordered, i.e. the 'memDumps' array is ordered from
	 * low to high (the start addresses).
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block. (Can be 0x10000 max)
	 */
	public addBlock(startAddress: number, size: number, title: string) {
		this.memDump.addBlock(startAddress, size, title);
	}


	/**
	 * Merges nearby blocks into one block.
	 */
	public mergeBlocks() {
		this.memDump.mergeBlocks();
	}


	/**
	 * The user just changed a cell in the dump view table.
	 * @param address The address to change.
	 * @param value The new value.
	 */
	protected async changeMemory(address: number, value: number) {
		await Remote.writeMemory(address, value);
		// Also update the all webviews
		await BaseView.staticCallUpdateFunctionsAsync();
		// Inform vscode
		BaseView.sendChangeEvent();
	}


	/**
	 * Retrieves the value info text (that is the hover text).
	 * @param address The address for which the info should be shown.
	 * @param md The MemoryDump to convert.
	 */
	protected async getValueInfoText(address: number, md: MemoryDump) {
		// Value
		const value = md.getValueFor(address);
		const valFormattedString = await Utility.numberFormatted('', value, 1, Settings.launch.memoryViewer.valueHoverFormat, undefined);
		let text = valFormattedString + '\n';

		// Address
		const addrFormattedString = await Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined);
		text += '@\n' + addrFormattedString;

		// Check for last value
		const prevValue = md.getPrevValueFor(address);
		if (!isNaN(prevValue)) {
			text += '\nPrevious value: ' + Utility.getHexString(prevValue, 2) + 'h';
		}
		// Now send the formatted text to the web view for display.
		const msg = {
			command: 'valueInfoText',
			address: address.toString(),
			text: text
		};
		this.sendMessageToWebView(msg);
	}


	/**
	 * Retrieves the info text for the address (that is the hover text).
	 * @param address The address for which the info should be shown.
	 */
	protected async getAddressInfoText(address: number) {
		// Address
		const formattedString = await Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined);
		// Now send the formatted text to the web view for display.
		const msg = {
			command: 'addressInfoText',
			address: address.toString(),
			text: formattedString
		};
		this.sendMessageToWebView(msg);
	}


	/** View is informed that a register has changed (manually).
	 */
	public async updateRegisterChanged(): Promise<void> {
		// Set colors for register pointers
		this.setColorsForRegisterPointers();
	}


	/** Retrieves the memory content and displays it.
	 * @param reason Not used.
	 */
	public async update(reason?: any): Promise<void> {
		// Get data from Remote
		for (const metaBlock of this.memDump.metaBlocks) {
			// Updates the shown memory dump.
			const data = await Remote.readMemoryDump(metaBlock.address, metaBlock.size);
			// Store data
			metaBlock.prevData = metaBlock.data ?? new Uint8Array(data);	// For the first time the same data is copied also to prevData.
			metaBlock.data = data;
		}

		// Update the html
		this.updateWithoutRemote();
	}


	/**
	 * Updates the html. E.g. after the change of a value.
	 * Without getting the memory from the Remote.
	 */
	protected updateWithoutRemote() {
		// Create generic html if not yet done
		if (!this.vscodePanel.webview.html) {
			// Create the first time
			this.setHtml();
			// Create title
			this.setPanelTitle();
		}
		else {
			// Update only the changed values

			// Loop all blocks
			const allAddrValsText: any[] = [];
			for (const metaBlock of this.memDump.metaBlocks) {
				// Get changes
				const addrValues = metaBlock.getChangedValues();
				// Convert values to [address, hex-text , ascii-text]
				addrValues.forEach(addrVal => {
					allAddrValsText.push([
						addrVal[0],
						Utility.getHexString(addrVal[1], 2),
						Utility.getHTMLChar(addrVal[1])
					]);
				});
			}
			// Send to web view
			const msg = {
				command: 'memoryChanged',
				addressValues: allAddrValsText	// Is also sent if empty to reset the changed values.
			};
			this.sendMessageToWebView(msg);

			// Also update the search results
			if (allAddrValsText.length > 0) {
				this.updateSearchResults();
			}
		}

		// Set colors for register pointers
		this.setColorsForRegisterPointers();
	}


	/** Create and sets the panel title from the meta block address ranges.
	 */
	protected setPanelTitle() {
		if (this.vscodePanel) {
			// Create from all blocks
			let title = '';
			for (let metaBlock of this.memDump.metaBlocks) {
				if (title)
					title += ', ';
				title += metaBlock.title;
			}
			title = this.titlePrefix + title;
			this.vscodePanel.title = title;
		}
	}


	/** Creates the html to display the search widget.
	 */
	protected createInputHtml(): string {
		return `
<style>

body.vscode-dark {
	--foundAddressBgColor: #8C4E4E;
	--selectedAddressBgColor: #B73333;
	--searchOptionButtonChecked: var(--vscode-button-background);
}

body.vscode-light {
	--foundAddressBgColor: #FFCACA;
	--selectedAddressBgColor: #FD8C8C;
	--searchOptionButtonChecked: #81DFFF;
}

.searchWidget {
	user-select: none;
	font-family: Arial;
	position: fixed;
	right: 2em;
	background-color: var(--vscode-editorWidget-background);
    padding: 2px;
    padding-right: 2px;
	box-shadow: 1px 1px 1px 1px var(--vscode-widget-shadow);
}
.searchContainer {
	padding-right: 2px;
    display: inline-block;
	background-color: var(--vscode-input-background);
    vertical-align: middle;
    outline-width: 1px;
    outline-style: solid;
    outline-color: transparent;
}
.searchContainer:focus-within {
  outline-color: var(--vscode-tab-activeModifiedBorder);
}
.searchError:focus-within {
  outline-color: var(--vscode-inputValidation-errorBorder);
}
.searchInput {
	font-family: Arial;
    color: var(--vscode-editor-foreground);
	background-color: var(--vscode-input-background);
	border-color: transparent;
    vertical-align: middle;
  	outline-width: 0;
}
.searchInput:focus {
  	outline-width: 0;
}
.optionButton {
	padding: 1px;
	font-family: Arial;
	display: inline-block;
	width: 1.5em;
	vertical-align: middle;
	text-align: center;
    border-radius: 2px;
	margin: 0;
}
.optionButton:hover {
	cursor: pointer;
	background-color: var(--vscode-badge-background);
}
.optionButtonChecked {
  	background-color: var(--searchOptionButtonChecked);
}
.optionButtonChecked:hover {
  	background-color: var(--vscode-button-hoverBackground);
}
.searchNumberInfo {
	font-family: Arial;
	padding: 0.1em;
    vertical-align: middle;
    display: inline-block;
	min-width: 5em;
}
.navigationButton {
	font-family: Arial;
	width: 1.5em;
	vertical-align: middle;
	text-align: center;
    color: var(--vscode-editor-foreground);
  	background-color: var(--vscode-editorWidget-background);
    border-radius: 1px;
	border: 0;
    outline-width: 1px;
    outline-style: solid;
    outline-color: transparent;
	padding-bottom: 0.3em;	// Because arrows are not vertically centered
}
.navigationButton:active {
    color: var(--vscode-button-foreground);
    background-color: var(--vscode-editorWidget-background);
}
.navigationButton:focus {
    outline-color: var(--vscode-tab-activeModifiedBorder);
}
.navigationButton:hover {
   	cursor: pointer;
  	background-color: var(--vscode-editorWidget-background);
}

.foundAddress {
	border-radius: 3px;
  	background-color: var(--foundAddressBgColor);
}
.foundAddressAscii {
  	background-color: var(--foundAddressBgColor);
}
.selectedAddress {
	border-radius: 3px;
  	background-color: var(--selectedAddressBgColor);
}
.selectedAddressAscii {
  	background-color: var(--selectedAddressBgColor);
}
</style>

<script>
// The previously selected objects.
let prevSelectedHex = [];
let prevSelectedAscii = [];

// Values of option buttons
let caseSensitive = false;
let zeroTerminated = false;
let delta = false;


function sendSearchText(searchObj) {
	// Get string
	const searchText = searchObj.value;
	vscode.postMessage({
		command: "searchChanged",
		searchText,
		caseSensitive: caseSensitive,
		zeroTerminated: zeroTerminated,
		delta: delta
	});
}

function scrollTo(tgt) {
	if(tgt) {
		tgt.scrollIntoView({
			behavior: "smooth",
			block: "center",
			inline: "nearest"
		});
	}
}

function clearSelection() {
	// De-select previous selection
	for(const obj of prevSelectedHex)
		obj.classList.remove("selectedAddress");
	for(const obj of prevSelectedAscii)
		obj.classList.remove("selectedAddressAscii");
	prevSelectedHex = [];
	prevSelectedAscii = [];
}

function selectAddress() {
	// Clear previous
	clearSelection();

	// Any address found ?
	const numberInfo = document.getElementById("searchNumberInfo");
	const length = foundAddresses.length;
	if(length == 0) {
		numberInfo.innerText = "No results";
		return;
	}

	// Number info
	numberInfo.innerText = "" + (selectedAddress+1) + " of " + length;

	// Find first object with selected address
	const address = foundAddresses[selectedAddress];
	const obj = document.querySelector("td[address='"+address+"']");
	// Scroll to selected address
	scrollTo(obj);

	// Highlight all addresses
	for(let i=0; i<selectedLength; i++) {
		const objs = getHexObjsForAddress(address+i);
		if(objs) {
			for(const obj of objs) {
				obj.classList.add("selectedAddress");
				prevSelectedHex.push(obj);
			}
		}
		const spanObjs = getAsciiObjsForAddress(address+i);
		if(spanObjs) {
			for(const obj of spanObjs) {
				obj.classList.add("selectedAddressAscii");
				prevSelectedAscii.push(obj);
			}
		}
	}
}

function searchArrowUp(btn) {
	// Set focus (blue border)
	btn.focus();
	// Decrement
	if(foundAddresses.length > 0) {
		selectedAddress--;
		if(selectedAddress < 0)
			selectedAddress = foundAddresses.length-1;
		// Scroll to selected address
		selectAddress();
	}
}

function searchArrowDown(btn) {
	// Set focus (blue border)
	btn.focus();
	// Increment
	if(foundAddresses.length > 0) {
		selectedAddress++;
		if(selectedAddress >= foundAddresses.length)
			selectedAddress = 0;
		// Scroll to selected address
		selectAddress();
	}
}

function setCheckedState(obj, checked) {
	obj.checked = checked;
	if(checked)
		obj.classList.add("optionButtonChecked");
	else
		obj.classList.remove("optionButtonChecked");
}

function toggleButton(obj) {
	const checked = obj.checked || false;
	setCheckedState(obj, !checked)
}

function toggleButtonCaseSensitive(obj) {
	toggleButton(obj);
	caseSensitive = obj.checked;
	if(!caseSensitive) {
		// Not together with delta
		const deltaObj = document.getElementById("delta");
		setCheckedState(deltaObj, false);
		delta = false;
	}
	const searchObj = document.getElementById("searchInput");sendSearchText(searchObj);
}

function toggleButtonZeroTerminated(obj) {
	toggleButton(obj);
	zeroTerminated = obj.checked;
	if(zeroTerminated) {
		// Not together with delta
		const deltaObj = document.getElementById("delta");
		setCheckedState(deltaObj, false);
		delta = false;
	}
	const searchObj = document.getElementById("searchInput");
	sendSearchText(searchObj);
}

function toggleButtonDelta(obj) {
	toggleButton(obj);
	delta = obj.checked;
	if(delta) {
		// Not together with case and zero
	 	const caseObj = document.getElementById("caseSensitive");
		setCheckedState(caseObj, true);
		caseSensitive = true;
	 	const zeroObj = document.getElementById("zeroTerminated");
		setCheckedState(zeroObj, false);
		zeroTerminated = false;
	}
	const searchObj = document.getElementById("searchInput");
	sendSearchText(searchObj);
}


/** Function to test the vscode colors, e.g. --vscode-button-background.
 */
function vscodeColorChanged(obj) {
	const colorString = obj.value;
	const colorVar = "var(" + colorString + ")";
	const testVscodeColorObj = document.getElementById("testVscodeColor");
	testVscodeColorObj.style="background-color: " + colorVar;
}


// Init
window.addEventListener('load', () => {
	// Init
	selectAddress();
	// Set default to select case sensitive
	const caseObj = document.getElementById("caseSensitive");
	setCheckedState(caseObj, true);
	caseSensitive = true;
});

//# sourceURL=memorydumpview-searchhtml.js
</script>

<div class="searchWidget">
	<span id="searchContainer" class="searchContainer">
		<input id="searchInput" class="searchInput" type="text" placeholder="Find" title='Find. E.g. "abcde" or FFh CBh 1Eh' oninput="sendSearchText(this)"/>

		<span id="caseSensitive" class="optionButton" title="Match Case" onclick="toggleButtonCaseSensitive(this)">Aa</span>
		<span id="zeroTerminated" class="optionButton" title="Zero terminated" onclick="toggleButtonZeroTerminated(this)">0</span>
    	<span id="delta" class="optionButton" title="Search differences as in given sequence" onclick="toggleButtonDelta(this)" style="font-size: 0.9em;">ᐃ</span>
	</span>
	<span class="searchNumberInfo" id="searchNumberInfo">2 of 63</span>
	&nbsp;
	<button class="navigationButton" title="Previous Match" onclick="searchArrowUp(this)">↑</button>
	<button class="navigationButton" title="Next Match" onclick="searchArrowDown(this)">↓</button>
</div>

<br>
<!--For testing vscode colors uncomment this.
<div style="position:fixed; left:20px;" >
	<input width="200px" type="text" placeholder="--vscode-..." oninput="vscodeColorChanged(this)">
	<span id="testVscodeColor">&nbsp; A a &nbsp;</span>
</div>
<br>
-->
		`;
	}


	/** Creates the script (i.e. functions) for all blocks (html tables).
	 */
	protected createHtmlScript(): string {
		const html = `
		<script>
		const vscode = acquireVsCodeApi();

		// For highlighting the found addresses
		let foundAddressesHexObjs = [];
		let foundAddressesAsciiObjs = [];

		// The changed memory. Is an array of triples: [address, value, ASCII]
		let changedAddressValues = [];

		// The selected found address.
		let selectedAddress = 0;
		let foundAddresses = [];
		let selectedLength = 0;

		//---- Handle Mouse Over, Calculation of hover text -------
		function mouseOverValue(obj) {
			const address = obj.getAttribute("address");
			// Send request to vscode to calculate the hover text
			vscode.postMessage({
				command: 'getValueInfoText',
				address: address
			});
		}

		function mouseOverAddress(obj) {
			// Send request to vscode to calculate the hover text
			const address = obj.getAttribute("addressLine");
			vscode.postMessage({
				command: 'getAddressInfoText',
				address: address
			});
		}


		//---- Handle Editing Cells --------
		let prevValue = '';	// Used to restore the value if ESC is pressed.
		let curObj = null;	// The currently used object (the tabbed cell)

		function keyPress(e) {
			let key = e.keyCode;

			if(key == 13) {	// ENTER key
				const value = curObj.innerText;
				const address = curObj.getAttribute("address");
				e.preventDefault();
				curObj.blur();
				// Send new value for address to vscode
				vscode.postMessage({
					command: 'valueChanged',
					address: address,
					value: value
				});
			}
			else if(key == 27) {	// ESC key, does not work in vscode
				// Use previous value
				e.preventDefault();
				curObj.blur();
			}
		}

		function focusLost(e) {	// = "blur"
			// Undo: Use previous value
			if(prevValue.length > 0) {
				// Inner text object
				const textObj = curObj.firstChild;
				textObj.textContent = prevValue;
			}
			curObj.contentEditable = false;
			curObj.removeEventListener("blur", focusLost);
			curObj.removeEventListener("keypress", keyPress);
			curObj = null;
		}

		function makeEditable(obj) {
			// makes the object editable on double click.
			curObj = obj;	// store object for use in other functions
			// Inner text object
			const textObj = curObj.firstChild;
			prevValue = textObj.textContent;	// store for undo
			if(!textObj.textContent.endsWith('h'))
				textObj.textContent += 'h';
			curObj.contentEditable = true;
			curObj.focus();
			selection = window.getSelection();    // Save the selection.

			// Select the text
			range = document.createRange();
			range.selectNodeContents(curObj);
			selection.removeAllRanges();          // Remove all ranges from the selection.
			selection.addRange(range);

			// Add listeners
			curObj.addEventListener("blur", focusLost, true);
			curObj.addEventListener("keypress", keyPress, true);
		}

		function getHexObjsForAddress(address) {
			return document.querySelectorAll("td[address='"+address+"']");
		}

		function getAsciiObjsForAddress(address) {
			return document.querySelectorAll("span[address='"+address+"']");
		}


		//---- Handle Messages from vscode extension --------
		window.addEventListener('message', event => {
			const message = event.data;

            switch (message.command) {
				case 'valueInfoText':
				{
					// HEX numbers
					const objs = getHexObjsForAddress(message.address);
					for(const obj of objs) {
						obj.title = message.text;
					}
					// ASCII
					const spanObjs = getAsciiObjsForAddress(message.address);
					for(const obj of spanObjs) {
						obj.title = message.text;
					}
                }   break;

				case 'addressInfoText':
				{
					const objs = document.querySelectorAll("td[addressLine='"+message.address+"']");
					for(const obj of objs) {
						obj.title = message.text;
					}
				}   break;

				case 'setAddressColor':
				{
					const className = "registerPointer"+message.register;
					const classNameAscii = "registerPointerAscii"+message.register;

					// Remove old
					if(message.prevAddress) {
						const objs = getHexObjsForAddress(message.prevAddress);
						for(const obj of objs) {
							obj.classList.remove(className);
						}
						// ASCII
						const spanObjs = getAsciiObjsForAddress(message.prevAddress);
						for(const obj of spanObjs) {
							obj.classList.remove(classNameAscii);
						}
					}

					// HEX
					const objs = getHexObjsForAddress(message.address);
					for(const obj of objs) {
						obj.classList.add(className);
					}
					// ASCII
					const spanObjs = getAsciiObjsForAddress(message.address);
					for(const obj of spanObjs) {
						obj.classList.add(classNameAscii);
					}
				 }  break;

				case 'setMemoryTable':
				{	// Was used in the past instead of 'memoryChanged'. I.e.
					// this sets the whole memory as new data via a html string.
					// Problem here was that it created new objects which did not
					// work together with updating the  search results.
					// Now it is still used for the register memory view
					// which has no search and potentially may change
					// range each step.

					// Set table as html string
			        const tableDiv = document.getElementById("mem_table_"+message.index);
					tableDiv.innerHTML = message.html;
 				}   break;

				case 'setAllTables':
				{	// Is used by the MemoryDiffView to replace all tables at once.

					// Set table as html string
			        const allTables = document.getElementById("allTables");
					allTables.innerHTML = message.html;
 				}   break;

				case 'memoryChanged':
				{
					// Note: This is called on every step, even if no memory has changed.
					// Because it is also required to de-highlight the previous values.

					// De-emphasize previously changed values
					for(const addrVal of changedAddressValues) {
						const address = addrVal[0];
						// Get HEX for address
						const objs = getHexObjsForAddress(address);
						for(const obj of objs) {
							obj.classList.remove("valueChanged");
						}
						// Get Ascii for address
						const asciiObjs = getAsciiObjsForAddress(address);
						for(const obj of asciiObjs) {
							obj.classList.remove("valueChanged");
						}
					}
					// The memory has changed.
					// Loop through all changed addresses and update.
					changedAddressValues = message.addressValues;
					for(const addrVal of changedAddressValues) {
						const address = addrVal[0];
						// Get HEX for address
						const objs = getHexObjsForAddress(address);
						for(const obj of objs) {
							// Change only the text, no other style attributes:
							obj.firstChild.textContent = addrVal[1];
							obj.classList.add("valueChanged");
						}
						// Get Ascii for address
						const asciiObjs = getAsciiObjsForAddress(address);
						for(const obj of asciiObjs) {
							obj.firstChild.textContent = addrVal[2];
							obj.classList.add("valueChanged");
						}
					}
 				}   break;

				case 'foundAddresses':
				{
					// De-highlight the previous found addresses
					// HEX
					const hexObjs = document.querySelectorAll("td[address]");
					for(const obj of hexObjs) {
						obj.classList.remove("foundAddress");
					}
					// ASCII
					const asciiObjs = document.querySelectorAll("span[address]");
					for(const obj of asciiObjs) {
						obj.classList.remove("foundAddressAscii");
					}

					// Check for error (message.addresses == undefined)
					const searchContainer = document.getElementById("searchContainer");
					if(message.addresses == undefined) {
						selectedLength = 0;
						foundAddresses = [];
						// Note: adding the same class twice will actually only result in one item in the classList
						searchContainer.classList.add("searchError");
						return;
					}
					searchContainer.classList.remove("searchError");

					// Highlight the new  found addresses:
					selectedLength = message.length;
					foundAddresses = message.addresses;

					// HEX
					const hexMap = new Map();
					for(const elem of hexObjs) {
						const addr = elem.getAttribute('address');
						hexMap.set(parseInt(addr), elem);
					}
					for(let i=0; i<selectedLength; i++) {
						for(const address of foundAddresses) {
							const elem = hexMap.get(address+i);
							if(elem)
								elem.classList.add("foundAddress");
						}
					}

					// ASCII
					const asciiMap = new Map();
					for(const elem of asciiObjs) {
						const addr = elem.getAttribute('address');
						asciiMap.set(parseInt(addr), elem);
					}
					for(let i=0; i<selectedLength; i++) {
						for(const address of foundAddresses) {
							const elem = asciiMap.get(address+i);
							if(elem)
								elem.classList.add("foundAddressAscii");
						}
					}

					// Select first
					selectedAddress = 0;
					selectAddress();
 				}   break;

           }
        });

		//# sourceURL=memorydumpview-htmlscript.js
		</script>
`;
		return html;
	}


	/**
	 * Creates one html table out of a meta block.
	 * @param index The number of the memory block, starting at 0.
	 * Used for the id.
	 * @param metaBlock The block to convert. The template takes only the name from it.
	 */
	protected createHtmlTableTemplate(index: number, metaBlock: MetaBlock): string {
		// Add html body
		let caption = metaBlock.title || '...';	// NOSONAR

		const table = this.createHtmlTable(metaBlock);	// Is necessary, otherwise nothing might be shown the first time

		const html = `
		<details open="true">
			<summary>${caption}</summary>
			<div id="mem_table_${index}">
			${table}
			</div>
		</details>
		`;
		return html;
	}


	/**
	 * Creates one html table out of a meta block.
	 * @param index The number of the memory block, starting at 0.
	 * Used for the id.
	 * @param metaBlock The block to convert.
	 */
	protected createHtmlTable(metaBlock: MetaBlock): string {
		if (!metaBlock.data)
			return '';

		const addressColor = Settings.launch.memoryViewer.addressColor;
		const asciiColor = Settings.launch.memoryViewer.asciiColor;
		const bytesColor = Settings.launch.memoryViewer.bytesColor;
		const changedColor = "red";

		const format =
			`
			<style>
			td {
				color: ${bytesColor};
			}
			td span {
				color: ${asciiColor};
			}
			.addressClmn {
				color: ${addressColor};
				border-radius: 3px;
				cursor: pointer;
			}
			.valueChanged {
				background-color: ${changedColor};
			}
			</style>

			<table>
				<colgroup>
					<col>
					<col width="10em">
					<col span="%d" width="20em">
					<col width="10em">
				</colgroup>

			%s
			</table>
		`;

		// Create a string with the table itself.
		let table = '';
		let address = metaBlock.address;
		let i = metaBlock.address % MEM_DUMP_BOUNDARY;
		address -= i;
		const clmns = MEM_DUMP_BOUNDARY;
		const data = metaBlock.data;
		const len = data.length;

		// Table column headers
		let clmStart = address % clmns;	// Usually 0
		table += '<tr>\n<th>Address:</th> <th></th>';
		for (let k = 0; k < clmns; k++) {
			const c = clmStart + k;
			table += '<th>' + c.toString(16).toUpperCase() + '</th>';
		}
		table += '\n</tr>';

		// Table contents
		let ascii = '';
		let startOfLine = true;
		for (let k = 0; k < len; k++) {
			// Address but bound to 64k to forecome any wrap around
			const addr64k = address & 0xFFFF;
			// Check start of line
			if (startOfLine) {
				// start of a new line
				let addrText = Utility.getHexString(addr64k, 4) + ':';
				table += '<tr>\n<td class="addressClmn" addressLine="' + addr64k + '" onmouseover="mouseOverAddress(this)">' + addrText + '</td>\n';
				table += '<td> </td>\n';
				ascii = '';
				startOfLine = false;
				if (i != 0) {
					// Draw empty clmns
					table += '<td></td>\n'.repeat(i);
					ascii += '<span>&nbsp;</span>'.repeat(i);
					address += i;
				}
			}

			// Print value
			const value = data[k];
			let valueText = Utility.getHexString(value, 2);

			// Check if in address range
			if (metaBlock.isInRange(address))
				valueText = this.addEmphasizeInRange(valueText);
			else
				valueText = this.addDeemphasizeNotInRange(valueText);

			// Check if label points directly to this address
			if (Labels.getLabelsForNumber64k(addr64k).length > 0)
				valueText = this.addEmphasizeLabelled(valueText);

			// Create html cell
			table += '<td address="' + address + '" ondblclick="makeEditable(this)" onmouseover="mouseOverValue(this)">' + valueText + '</td>\n';


			// Convert to ASCII (->html)
			ascii += '<span address="' + address + '" onmouseover="mouseOverValue(this)">' + Utility.getHTMLChar(value) + '</span>';

			// Check end of line
			if (i == clmns - 1) {
				// print ASCII characters.
				table += '<td> </td>\n';
				table += '<td>' + ascii + '</td>\n';
				// end of a new line
				table += '</tr>\n';
			}

			// Next column
			address++;
			i++;
			if (i >= clmns) {
				i = 0;
				startOfLine = true;
			}
		}

		const html = util.format(format, clmns, table);
		return html;
	}


	/** Override if it should return a different memory dump.
	 * @returns html in a string.
	 */
	protected getAllHtmlTables(): string {
		return this.getAllHtmlTablesForDump(this.memDump);
	}


	/** Loops over all MetaBlocks and returns all tables as html string.
	 * @param md The MeMoryDump to convert.
	 * @returns html in a string.
	 */
	protected getAllHtmlTablesForDump(md: MemoryDump): string {
		const vertBreak = this.getHtmlVertBreak();
		let i = 0;
		let tables;
		for (let mb of md.metaBlocks) {
			const table = this.createHtmlTableTemplate(i, mb);
			tables = (tables) ? tables + vertBreak + table : table;
			// Next
			i++;
		}
		return tables || '';
	}


	/**
	 * Sets the html code to display the memory dump.
	 * Is called only once at creation time as it does not hold the actual data.
	 */
	protected setHtml() {
		const format = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<style>
		%s
		</style>

		<body style="font-family: Courier">

		%s

		%s

		%s

		</body>
		</html>
		`;


		// Add a legend to the table with registers and colors.
		let legend = `
		<br>
		Legend:<br>
		`;
		const regColors = Settings.launch.memoryViewer.registerPointerColors;
		const regColorsLen = regColors.length;
		for (let k = 0; k < regColorsLen; k += 2) {
			const color = regColors[k + 1];
			//legend += '<span style="background-color: ' + color + ';borderRadius: 3px">' + regColors[k] + ' = ' + color + '</span><br>';
			legend += '<span style="background-color: ' + color + ';border-radius: 3px">&nbsp; ' + regColors[k] + ' &nbsp;</span> &nbsp;&nbsp; ';
		}

		// Loop through all metablocks
		let tables = this.getAllHtmlTables();
		tables = '<div id="allTables">' + tables + '</div>';

		// Create style section
		const arr = Settings.launch.memoryViewer.registerPointerColors;
		let style = '';
		for (let i = 0; i < arr.length; i+=2) {
			style += `
			.registerPointer${arr[i]} {
				background-color: ${arr[i + 1]};
				border-radius: 3px;
			}
			.registerPointerAscii${arr[i]} {
				color: white;
				background-color: ${arr[i + 1]};
				border-radius: 3px;
			}
			`;
		}

		// Add search widget
		const searchHtml = this.createInputHtml();

		// Add functions
		const scripts = this.createHtmlScript();

		// Add html body
		const html = util.format(format, style, searchHtml, scripts + tables, legend);
		this.vscodePanel.webview.html = html;
	}


	/**
	 * Set colors for register pointers.
	 * Colors are only set if the webview is visible.
	 */
	protected setColorsForRegisterPointers() {
		// Set colors for register pointers
		const arr = Settings.launch.memoryViewer.registerPointerColors;
		for (let i = 0; i < arr.length - 1; i += 2) {
			const reg = arr[i];
			if (!Z80RegistersClass.isRegister(reg))
				continue;
			// Get address = value of reg
			const address = Remote.getRegisterValue(reg)
			//console.log( reg + ': ' + address.toString(16));
			// Clear old color
			const prevAddr = this.prevRegAddr.get(reg);
			// Send the address/color to the web view for display.
			const register = arr[i];
			const msg = {
				command: 'setAddressColor',
				address: address,
				prevAddress: prevAddr,
				register: register,
				select: true
			};
			this.sendMessageToWebView(msg);
			// Store
			this.prevRegAddr.set(reg, address);
		}
	}


	/**
	 * Determines what is shown between the tables,
	 * e.g. "...".
	 */
	protected getHtmlVertBreak() {
		return '\n';
	}


	/**
	 * Adds color to the html.
	 * @param origText
	 * @param colorText E.g. 'red'
	 * @returns html text that combines origText with hoverText
	 */
	protected addBckgColor(origText: string, colorText: string): string {
		const resText = '<div style="background-color:' + colorText + '">' + origText + '</div>';
		return resText;
	}


	/**
	 * Adds emphasizes for labelled values.
	 * @param origText
	 * @returns html text that id emphasized.
	 */
	protected addEmphasizeLabelled(origText: string,): string {
		const resText = '<u>' + origText + '</u>';
		return resText;
	}


	/**
	 * Adds emphasizes for addresses in range, i.e. the addresses that the user wanted to see.
	 * @param origText
	 * @returns html text that id emphasized.
	 */
	protected addEmphasizeInRange(origText: string,): string {
		const resText = '<b>' + origText + '</b>';
		return resText;
	}
	protected addDeemphasizeNotInRange(origText: string,): string {
		const resText = '<font color="gray">' + origText + '</font>';
		return resText;
	}
}
