//import * as vscode from 'vscode';
import {Remote} from '../remotes/remotefactory';
import * as util from 'util';
import {Utility} from '../misc/utility';
import {Labels} from '../labels/labels';
import {MetaBlock} from '../misc/memorydump';
import {Settings} from '../settings';
import {MemoryDumpView} from './memorydumpview';
import {BaseView} from './baseview';


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
	}


	/**
	 * The user just changed a cell in the dump view table.
	 * The value is written to memory. Either little or big endian.
	 * @param address The address to change.
	 * @param value The new word value.
	 */
	protected async changeMemory(address: number, value: number) {
		// Get bytes dependent on endianness
		let lowByte = value & 0xFF;
		let highByte = value >> 8;
		if (!this.littleEndian) {
			const tmp = lowByte;
			lowByte = highByte;
			highByte = tmp;
		}
		// Prepare data
		const data = new Uint8Array([lowByte, highByte]);
		await Remote.writeMemoryDump(address, data);
		const realData = await Remote.readMemoryDump(address, 2);
		const realValue = (this.littleEndian) ? realData[0] + 256 * realData[1] : realData[1] + 256 * realData[0];
		for (const mdvb of MemoryDumpView.MemoryViews) {
			const mdv = mdvb as MemoryDumpViewWord;	// To gain access
			// Check first if address included at all
			if (!isNaN(mdv.memDump.getWordValueFor(address, this.littleEndian))) {
				// Update value
				mdv.memDump.setValueFor(address, realValue);
				// Create message
				const message = {
					command: 'changeValue',
					address: address.toString(),
					value: Utility.getHexString(realValue, 2),
					asciiValue: Utility.getASCIIChar(realValue)
				};
				this.sendMessageToWebView(message, mdv);
				await mdv.getValueInfoText(address);
			}
		};
		// Inform vscode
		BaseView.sendChangeEvent();
	}


	/**
	 * Retrieves the value info text (that is the hover text).
	 * @param address The address for which the info should be shown.
	 */
	protected async getValueInfoText(address: number) {
		// Value
		const value = this.memDump.getWordValueFor(address, this.littleEndian);
		const valFormattedString = await Utility.numberFormatted('', value, 1, Settings.launch.memoryViewer.valueHoverFormat, undefined);
		let text = valFormattedString + '\n';

		// Address
		const addrFormattedString = await Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined);
		text += addrFormattedString;

		// Check for last value
		const prevValue = this.memDump.getPrevWordValueFor(address, this.littleEndian);
		if (!isNaN(prevValue)) {
			if (prevValue != value) {
				// has changed so add the last value to the hover text
				text += '\nPrevious value: ' + Utility.getHexString(prevValue, 2) + 'h';
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
	 * Creates the script (i.e. functions) for all blocks (html tables).
	 */
	protected createHtmlScript(): string {
		const html=`
		<script>
		const vscode = acquireVsCodeApi();


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
		let curObj = null;	// The currently used object (the tabe cell)

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
			if(prevValue.length > 0)
				curObj.innerText = prevValue;
			curObj.contentEditable = false;
			curObj.removeEventListener("blur", focusLost);
			curObj.removeEventListener("keypress", keyPress);
			curObj = null;
		}

		function makeEditable(obj) {
			// makes the object editable on double click.
			curObj = obj;	// store object for use in other functions
			prevValue = curObj.innerText;	// store for undo
			if(!curObj.innerText.endsWith('h'))
				curObj.innerText += 'h';
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


		//---- Handle Messages from vscode extension --------
		window.addEventListener('message', event => {
				const message = event.data;

            switch (message.command) {
				case 'changeValue':
				{
					prevValue = '';
					curObj = null;
					// HEX numbers
					const tdObjs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of tdObjs) {
						obj.innerText = message.value;
					}
					// ASCII
					const spanObjs = document.querySelectorAll("span[address='"+message.address+"']");
					for(let obj of spanObjs) {
						obj.innerText = message.asciiValue;
					}
				}   break;

				case 'valueInfoText':
				{
					// HEX numbers
					const objs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of objs) {
						obj.title = message.text;
					}
					// ASCII
					const spanObjs = document.querySelectorAll("span[address='"+message.address+"']");
					for(let obj of spanObjs) {
						obj.title = message.text;
					}
                }   break;

				case 'addressInfoText':
				{
					const objs = document.querySelectorAll("td[addressLine='"+message.address+"']");
					for(let obj of objs) {
						obj.title = message.text;
					}
				}   break;

				case 'setAddressColor':
				{
					// HEX
					const objs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of objs) {
						obj.style.backgroundColor = message.color;
						obj.style.borderRadius = '3px';
					}
					// ASCII
					const spanObjs = document.querySelectorAll("span[address='"+message.address+"']");
					for(let obj of spanObjs) {
						obj.style.color = "white";
						obj.style.backgroundColor = message.color;
						obj.style.borderRadius = '3px';
					}
				 }   break;

				case 'setMemoryTable':
				{
					// Set table as html string
			        const tableDiv=document.getElementById("mem_table_"+message.index);
					tableDiv.innerHTML=message.html;
 				}   break;

           }
        });

		</script>
`;
		return html;
	}


	/**
	 * Creates one html table out of a meta block.
	 * @param index The number of the memory block, starting at 0.
	 * Used for the id.
	 * @param metaBlock The block to convert. The templtae takes only the name from it.
	 */
	protected createHtmlTableTemplate(index: number, metaBlock: MetaBlock): string {
		// Add html body
		let caption=metaBlock.title||'...';

		const table=this.createHtmlTable(metaBlock);	// Is necessary, otherwise nothing might be shown the first time

		const html=`
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

		const format=
`			<table style="">
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
		let address=metaBlock.address;
		let i = 0;
		const clmns = MEM_DUMP_BOUNDARY;
		const data = metaBlock.data;
		const len=data.length;

		const addressColor = Settings.launch.memoryViewer.addressColor;
		const asciiColor = Settings.launch.memoryViewer.asciiColor;
		const bytesColor = Settings.launch.memoryViewer.bytesColor;

		// Table column headers
		let clmStart = address % clmns;	// Usually 0
		table += '<tr>\n<th>Address:</th> <th></th>';
		for(let k=0; k<clmns; k++) {
			const c = clmStart+k;
			table += '<th>' + c.toString(16).toUpperCase() + '</th>';
		}
		table += '\n</tr>';

		// Table contents
		let ascii = '';
		for (let k=0; k<len; k++) {
			// Address but bound to 64k to forecome wrap arounds
			const addr64k=address&0xFFFF;
			// Check start of line
			if(i == 0) {
				// start of a new line
				let addrText=Utility.getHexString(addr64k,4) + ':';
				table+='<tr>\n<td addressLine="'+addr64k + '" style="color:' + addressColor + '; border-radius:3px; cursor: pointer" onmouseover="mouseOverAddress(this)">' + addrText + '</td>\n';
				table += '<td> </td>\n';
				ascii = '';
			}

			// Print value
			const value = data[k];
			let valueText = Utility.getHexString(value, 2);

			// Check if in address range
			if(metaBlock.isInRange(address))
				valueText = this.addEmphasizeInRange(valueText);
			else
				valueText = this.addDeemphasizeNotInRange(valueText);

			// Check if label points directly to this address
			if (Labels.getLabelsForNumber64k(addr64k).length > 0)
				valueText = this.addEmphasizeLabelled(valueText);

			// Compare with prev value.
			const prevData=metaBlock.prevData;
			if (prevData) {
				if (prevData.length>0) {
					const prevValue=prevData[k];
					if (value!=prevValue) {
						// Change html emphasizes
						valueText=this.addEmphasizeChanged(valueText);
					}
				}
			}

			// Create html cell
			table+='<td address="'+addr64k + '" ondblclick="makeEditable(this)" onmouseover="mouseOverValue(this)" style="color:' + bytesColor + '">' + valueText +'</td>\n';


			// Convert to ASCII (->html)
			ascii+='<span address="'+addr64k + '" onmouseover="mouseOverValue(this)">' + Utility.getHTMLChar(value) + '</span>';

			// Check end of line
			if(i == clmns-1) {
				// print ASCII characters.
				table += '<td> </td>\n';
				table += '<td style="color:' + asciiColor + '">' + ascii +'</td>\n';
				// end of a new line
				table += '</tr>\n';
			}

			// Next column
			address++;
			i++;
			if(i >= clmns)
				i = 0;
		}

		const html = util.format(format, clmns, table);
		return html;
	}


	/**
	 * Sets the html code to display the memory dump.
	 * Is called only once at creation time as it does not hold the actual data.
	 */
	protected setHtml() {
		const format= `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<body style="font-family: Courier">

		%s

		%s

		</body>
		</html>`;


		// Add a legend to the table with registers and colors.
		let legend = `
		<br>
		Legend:<br>
		`;
		const regColors = Settings.launch.memoryViewer.registerPointerColors;
		const regColorsLen = regColors.length;
		for(let k=0; k<regColorsLen; k+=2) {
			const color = regColors[k+1];
			//legend += '<span style="background-color: ' + color + ';borderRadius: 3px">' + regColors[k] + ' = ' + color + '</span><br>';
			legend += '<span style="background-color: ' + color + ';border-radius: 3px">&nbsp; ' + regColors[k] + ' &nbsp;</span> &nbsp;&nbsp; ';
		}

		// Loop through all metablocks
		let tables;
		const vertBreak=this.getHtmlVertBreak();
		let i=0;
		for(let mb of this.memDump.metaBlocks) {
			const table = this.createHtmlTableTemplate(i, mb);
			tables=(tables)? tables+vertBreak+table:table;
			// Next
			i++;
		}

		// Add functions
		const scripts=this.createHtmlScript();

		// Add html body
		const html = util.format(format, scripts+tables, legend);
		this.vscodePanel.webview.html = html;
	}

}
