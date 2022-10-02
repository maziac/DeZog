import * as util from 'util';
import {Utility} from '../misc/utility';
import {Labels} from '../labels/labels';
import {MetaBlock} from '../misc/metablock';
import {Settings} from '../settings/settings';
import {MemoryDumpView} from './memorydumpview';


/// The number of word columns shown in one line.
const MEM_COLUMNS = 8;


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
 * The search input is still done in bytes, not words. So the same
 * search algorithm can be used. I expect anyway that the search for
 * words is not really useful.
 *
 * See design.md for a sequence chart.
 */
export class MemoryDumpViewWord extends MemoryDumpView {

	/// true if little endian is used.
	protected littleEndian: boolean;


	/**
	 * Creates the basic panel.
	 */
	constructor(littleEndian: boolean) {
		super();
		this.littleEndian = littleEndian;
		// Title prefix depends on endianess
		if (!littleEndian)
			this.titlePrefix += "(big endian) ";
	}


	/**
	 * Adds a new memory block to display.
	 * Memory blocks are ordered, i.e. the 'memDumps' array is ordered from
	 * low to high (the start addresses).
	 * @param startAddress The address of the memory block in words.
	 * @param size The size of the memory block in words.
	 */
	public addBlock(startAddress: number, size: number, title: string) {
		this.memDump.addBlockWithoutBoundary(startAddress, 2*size, title);
	}


	/**
	 * Retrieves the value info text (that is the hover text).
	 * @param address The address for which the info should be shown.
	 */
	protected async getValueInfoText(address: number) {
		// Value
		const value = this.memDump.getWordValueFor(address, this.littleEndian);
		const valFormattedString = await Utility.numberFormatted('', value, 2, Settings.launch.memoryViewer.valueHoverFormat, undefined);
		let text = valFormattedString + '\n';

		// Address
		const addrFormattedString = await Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined);
		text += '@\n' + addrFormattedString;

		// Check for last value
		const prevValue = this.memDump.getPrevWordValueFor(address, this.littleEndian);
		if (!isNaN(prevValue)) {
			if (prevValue != value) {
				// has changed so add the last value to the hover text
				text += '\nPrevious value: ' + Utility.getHexString(prevValue, 4) + 'h';
			}
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
	 * Creates one html table out of a meta block.
	 * @param index The number of the memory block, starting at 0.
	 * Used for the id.
	 * @param metaBlock The block to convert.
	 */
	protected createHtmlTable(metaBlock: MetaBlock): string {
		if (!metaBlock.data)
			return '';

		const addressColor = Settings.launch.memoryViewer.addressColor;
		const bytesColor = Settings.launch.memoryViewer.bytesColor;
		const changedColor = "red";

		const format=
			`
			<style>
			td {
				color: ${bytesColor};
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

			<table style="">
				<colgroup>
					<col>
					<col width="10em">
					<col span="%d" width="20em">
				</colgroup>

			%s
			</table>
		`;

		// Create a string with the table itself.
		let table = '';
		let address=metaBlock.address;
		let i = 0;
		const data = metaBlock.data;
		const len=data.length;


		// Table column headers
		table += '<tr>\n<th>Address:</th> <th></th>';
		for(let k=0; k<MEM_COLUMNS; k++) {
			table += '<th>+' + (2*k).toString(16).toUpperCase() + '</th>';
		}
		table += '\n</tr>';

		// Table contents
		const littleEndian = this.littleEndian;
		let firstAddress;
		let secondAddress;
		for (let k = 0; k < len - 1; k += 2) {
			// Address but bound to 64k to forecome wrap arounds
			const addr64k=address&0xFFFF;
			// Check start of line
			if(i == 0) {
				// start of a new line
				let addrText=Utility.getHexString(addr64k,4) + ':';
				table +='<tr>\n<td class="addressClmn" addressLine="'+addr64k + '" onmouseover="mouseOverAddress(this)">' + addrText + '</td>\n';
				table += '<td> </td>\n';
			}

			// Print value
			const value = Utility.getUintFromMemory(data, k, 2, this.littleEndian);
			let valueText = Utility.getHexString(value, 4);

			// Split the text in 2 parts
			const addr64k2 = (addr64k + 1) & 0xFFFF;
			if (littleEndian) {
				firstAddress = addr64k;
				secondAddress = addr64k2;
			}
			else {
				firstAddress = addr64k2;
				secondAddress = addr64k;
			}
			valueText = '<span address="' + secondAddress + '" ondblclick="makeEditable(this)">' + valueText.substring(0, 2) + '</span><span address="' + firstAddress + '" ondblclick="makeEditable(this)">' + valueText.substring(2, 2+2) + '</span>';

			// Check if in address range
			if(metaBlock.isInRange(address))
				valueText = this.addEmphasizeInRange(valueText);
			else
				valueText = this.addDeemphasizeNotInRange(valueText);

			// Check if label points directly to this address
			if (Labels.getLabelsForNumber64k(addr64k).length > 0)
				valueText = this.addEmphasizeLabelled(valueText);

			// Create html cell
			table += '<td address="' + addr64k + '" onmouseover="mouseOverValue(this)">' + valueText +'</td>\n';

			// Check end of line
			if (i == MEM_COLUMNS-1) {
				// end of a new line
				table += '</tr>\n';
			}

			// Next column
			address += 2;
			i++;
			if(i >= MEM_COLUMNS)
				i = 0;
		}

		const html = util.format(format, MEM_COLUMNS, table);
		return html;
	}



	/**
	 * Creates the script (i.e. functions) for all blocks (html tables).
	 */
	protected createHtmlScript(): string {
		// The html script
		const html = `
		<script>
		const vscode = acquireVsCodeApi();

		// For highlighting the found addresses
		let foundAddressesHexObjs = [];

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

		function getHexObjsForAddressSingleByte(address) {
			return document.querySelectorAll("span[address='"+address+"']");
		}

		//---- Handle Messages from vscode extension --------
		window.addEventListener('message', event => {
			const message = event.data;

            switch (message.command) {
				case 'valueInfoText':
				{
					const objs = getHexObjsForAddress(message.address);
					for(const obj of objs) {
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

					// Remove old
					if(message.prevAddress) {
						const objs = getHexObjsForAddressSingleByte(message.prevAddress);
						for(const obj of objs) {
							obj.classList.remove(className);
						}
					}

					// HEX
					const objs = getHexObjsForAddressSingleByte(message.address);
					for(const obj of objs) {
						obj.classList.add(className);
					}
				 }  break;


				case 'memoryChanged':
				{
					// Note: This is called on every step, even if no memory has changed.
					// Because it is also required to de-highlight the previous values.

					// De-emphasize previously changed values
					for(const addrVal of changedAddressValues) {
						const address = addrVal[0];
						// Get HEX for address
						const objs = getHexObjsForAddressSingleByte(address);
						for(const obj of objs) {
							obj.classList.remove("valueChanged");
						}
					}
					// The memory has changed.
					// Loop through all changed addresses and update.
					changedAddressValues = message.addressValues;
					for(const addrVal of changedAddressValues) {
						const address = addrVal[0];
						// Get HEX for address
						const objs = getHexObjsForAddressSingleByte(address);
						for(const obj of objs) {
							// Change only the text, no other style attributes:
							obj.firstChild.textContent = addrVal[1];
							obj.classList.add("valueChanged");
						}
					}
 				}   break;

				case 'foundAddresses':
				{
					// De-highlight the previous found addresses
					for(const obj of foundAddressesHexObjs) {
						obj.classList.remove("foundAddress");
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
					foundAddressesHexObjs = [];
					for(const address of foundAddresses) {
						for(let i=0; i<selectedLength; i++) {
							const objs = getHexObjsForAddressSingleByte(address+i);
							for(const obj of objs) {
								foundAddressesHexObjs.push(obj);
								obj.classList.add("foundAddress");
							}
						}
					}

					// Select first
					selectedAddress = 0;
					selectAddress();
 				}   break;

           }
        });

		// Change the tooltip for the search box to explain search for the word view.
		window.addEventListener('load', () => {
			const searchObj = document.getElementById("searchInput");
			searchObj.title += ". Please note that although the view shows words you have to input the search as a (little endian) byte sequence.";
		});

		//# sourceURL=memorydumpviewword.js
		</script>
`;
		return html;
	}

}
