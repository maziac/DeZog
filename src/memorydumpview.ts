'use strict';

import * as vscode from 'vscode';
import { Machine } from './machine';
import * as util from 'util';
import { Utility } from './utility';
import { Labels } from './labels';
import { CallSerializer } from './callserializer';
import { MetaBlock, MemoryDump } from './memorydump';
import { EventEmitter } from 'events';
import { Settings } from './settings';
import { Z80Registers } from './z80Registers';


/// The boundary at which the memory dumps should be shown.
const MEM_DUMP_BOUNDARY = 16;


/**
 * A Webview that shows a memory dump.
 * The memory dump can also be edited.
 * There is a rather complex messaging between the webview's html javascript (the webview
 * panel) and the extension (the typescript code):
 * - Display:
 * 		- Register coloring: If the address of a value is the same as a regiser value it is colored
 * differently. 'setColorsForRegisterPointers' calls 'setAddressColor' in the webview. This is done
 * when the panel is created or updated (each step) or when the webview becomes visible (e.g. if
 * it was hidden).
 * 		- The dump contents is updated on every step ('update').
 * 		- The hovering text (labels etc.).: When the mouse is over a value or address the webview asks for the hovering text ('getValueInfoText/getAddressInfoText'.
 * 		This way the calculation of all labels is delayed. A message with the info is sent to the webview ('valueInfoText/addressInfoText').
 * - Editing:
 * 		- On double click the webview turns the cell in editable mode.
 * 		- When the user presses enter the new value is sent from the webview('valueChanged').
 * 		- The value is then changed in zesarux and the real value (from zesarux) is sent to
 * 		to the webview. The webview will then update all cells with the same address. I.e. if there
 * 		are 2 same cells both are updated.
 * 		- If there are several memory views all are informed about the new value to update their display.
 *
 */
export class MemoryDumpView {

	protected static MemoryViews = Array<MemoryDumpView>();	///< Array that contains all of the created memory views.

	protected vscodePanel: vscode.WebviewPanel;	///< The panel to show the memory dump in vscode.

	protected memDump = new MemoryDump();	///< The memory dump to show.

	protected parent: EventEmitter;	///< We listen for 'update' on this emitter to update the html.

	protected serializer = new CallSerializer('MemoryDumpUpdate');


	/**
	 * Creates the basic panel.
	 */
	constructor(parent: EventEmitter) {
		this.parent = parent;
	 	var updateFunc = () => {
			 this.update();};
		this.parent.on('update', updateFunc);
		// create vscode panel view
		this.vscodePanel = vscode.window.createWebviewPanel('memDump', '', vscode.ViewColumn.Two, {enableScripts: true});
		MemoryDumpView.MemoryViews.push(this);

		// Handle closing of the view
		this.vscodePanel.onDidDispose(() => {
            // The panel is closed. Remove listening for updates.
			this.parent.removeListener('update', updateFunc);
			// Remove from list
			const arr = MemoryDumpView.MemoryViews;
			const index = arr.indexOf(this);
			var assert = require('assert');
			assert(index < 0 );
			arr.splice(index, 1);
		});

		// Handle hide/unhide -> update the register pointers.
        this.vscodePanel.onDidChangeViewState(e => {
			// Update register pointers (Note: the visible parameter that is passed is wrong, it is a 'focused' information.
			this.setColorsForRegisterPointers();
        });


		// Handle messages from the webview
		this.vscodePanel.webview.onDidReceiveMessage(message => {
			console.log("webView command '"+message.command+"':", message);
			switch (message.command) {
				case 'valueChanged':
					try {
						// Change memory
						const address = parseInt(message.address);
						const value = Utility.evalExpression(message.value);
						this.changeMemory(address, value);
						// Update hover text
						this.getValueInfoText(address, value);
					}
					catch(e) {
						vscode.window.showWarningMessage("Could not evaluate: '" + message.value + "'");
					}
					break;

				case 'getValueInfoText':
				{
					const address = parseInt(message.address);
					const value = parseInt(message.value, 16);
					this.getValueInfoText(address, value);
				}	break;

				case 'getAddressInfoText':
				{	const address = parseInt(message.address);
					this.getAddressInfoText(address);
				}	break;
			}
		});

	}


	/**
	 * Closes the view.
	 */
	public close() {
		this.vscodePanel.dispose();
	}


	/**
	 * Adds a new memory block to display.
	 * Memory blocks are ordered, i.e. the 'memDumps' array is ordered from
	 * low to high (the start addresses).
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block.
	 */
	public addBlock(startAddress: number, size: number, title: string|undefined = undefined) {
		this.memDump.addBlock(startAddress, size, title);
		// title
		if(this.vscodePanel.title.length > 0)
			this.vscodePanel.title += ', ';
		else
			this.vscodePanel.title = 'Memory Dump ';
		const usedTitle = title || '@' + Utility.getHexString(startAddress, 4) + 'h';
		this.vscodePanel.title += usedTitle;
	}


	/**
	 * Merges nearby blocks into one block.
	 */
	public mergeBlocks() {
		this.memDump.mergeBlocks();
	}


	/**
	 * Posts the given message to all webviews.
	 * @params The message to post.
	 */
	protected postToAllWebviews(message: any) {
		for(let mdv of MemoryDumpView.MemoryViews) {
			mdv.vscodePanel.webview.postMessage(message);
		};
	}


	/**
	 * The user just changed a cell in the dump view table.
	 * @param address The address  to change.
	 * @param value The new value.
	 */
	protected changeMemory(address: number, value: number) {
		Machine.writeMemory(address, value, (realValue) => {
			// Now send the read value to the webviews for display.
			this.postToAllWebviews({
				command: 'changeValue',
				address: address.toString(),
				value: Utility.getHexString(realValue, 2)
			});
		});
	}


	/**
	 * Retrieves the value info text (that is the hover text).
	 * @param address The address for which the info should be shown.
	 * @param value The value.
	 */
	protected getValueInfoText(address: number, value: number) {
		// Value
		Utility.numberFormatted('', value, 1, Settings.launch.memoryViewer.valueHoverFormat, undefined, (formattedString) => {
			var text = formattedString + '\n';
			// Address
			Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined, (formattedString) => {
				text += formattedString;
				// Check for last value
				for(let mb of this.memDump.metaBlocks) {
					const index = address - mb.address;
					if(index < 0 || index >= mb.size)
						continue;
					// get previous value
					const prevValue = mb.prevData[index];
					if(prevValue != value) {
						// has changed so add the last value to the hover text
						text += '\nPrevious value: ' + prevValue.toString(16) + 'h';
						break;
					}
				}
				// Now send the formatted text to the web view for display.
				const msg = {
					command: 'valueInfoText',
					address: address.toString(),
					text: text
				};
				this.vscodePanel.webview.postMessage(msg);
			});
		});
	}


	/**
	 * Retrieves the info text for the address (that is the hover text).
	 * @param address The address for which the info should be shown.
	 */
	protected getAddressInfoText(address: number) {
		// Address
		Utility.numberFormatted('', address, 2, Settings.launch.memoryViewer.addressHoverFormat, undefined, (formattedString) => {
			// Now send the formatted text to the web view for display.
			const msg = {
				command: 'addressInfoText',
				address: address.toString(),
				text: formattedString
			};
			this.vscodePanel.webview.postMessage(msg);
		});
	}


	/**
	 * Retrieves the memory content and displays it.
	 */
	public update() {
		// Loop all memory blocks
		for(let metaBlock of this.memDump.metaBlocks) {
			this.serializer.exec(() => {
				// Updates the shown memory dump.
				Machine.getMemoryDump(metaBlock.address, metaBlock.size, (data) => {
					// Store data
					metaBlock.prevData = metaBlock.data;
					metaBlock.data = data;
					// end
					this.serializer.endExec();
				});
			});
		}

		this.serializer.exec(() => {
			// Now combine all data and create the html.
			this.setHtml();
			// end
			this.serializer.endExec();
		});
	}


	/**
	 * Creates one html table out of a meta block.
	 * @param metaBlock The block to convert.
	 * @param regsString The register string from zesarux.
	 */
	protected createHtmlTable(metaBlock: MetaBlock, regsString: string): string {
		const format = `
		<script>
		const vscode = acquireVsCodeApi();


		//---- Handle Mouse Over, Calculation of hover text -------
		function mouseOverValue(obj) {
			const value = obj.innerText;
			const address = obj.getAttribute("address");
			// Send request to vscode to calculate the hover text
			vscode.postMessage({
				command: 'getValueInfoText',
				address: address,
				value: value
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
		var prevValue = '';	// Used to restore the value if ESC is pressed.
		var curObj = null;	// The currently used object (the tabe cell)

		function keyPress(e) {
			var key = e.keyCode;

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
					const objs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of objs) {
						obj.innerText = message.value;
					}
				}   break;

				case 'valueInfoText':
				{
					const objs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of objs) {
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
					const objs = document.querySelectorAll("td[address='"+message.address+"']");
					for(let obj of objs) {
						obj.style.backgroundColor = message.color;
						obj.style.borderRadius = '3px';
					}
				}   break;

           }
        });


		</script>

		%s
		<table style="">
			<col>
			<col width="10em">
			<colgroup span="%d" width="20em">
		%s
		</table>
		`;


		// Create a string with the table itself.
		var table = '';
		var address = metaBlock.address;
		var i = 0;
		const clmns = MEM_DUMP_BOUNDARY;
		const data = metaBlock.data;
		const len = data.length;

		const addressBckgColor = Settings.launch.memoryViewer.addressBckgColor;

		for(var k=0; k<len; k++) {
			// Check start of line
			if(i == 0) {
				// start of a new line
				var addrText = Utility.getHexString(address,4) + ':';
			//	addrText = this.addHoverText(addrText, hoverText);
				table += '<tr>\n<td addressLine="' + address + '" style="background-color:' + addressBckgColor + '; border-radius:3px; cursor: pointer" onmouseover="mouseOverAddress(this)">' + addrText + '</td>\n';
				table += '<td> </td>\n';
			}

			// Print value
			const value = data[k];
			var valueText = Utility.getHexString(value, 2);

			// Check if in address range
			if(metaBlock.isInRange(address))
				valueText = this.addEmphasizeInRange(valueText);
			else
				valueText = this.addDeemphasizeNotInRange(valueText);

			// Check if label points directly to this address
			if(Labels.getLabelsForNumber(address).length > 0)
				valueText = this.addEmphasizeLabelled(valueText);

			// Compare with prev value.
			const prevData = metaBlock.prevData;
			if(prevData.length > 0) {
				const prevValue = prevData[k];
				if(value != prevValue) {
					// Change html emphasizes
					valueText = this.addEmphasizeChanged(valueText);
				}
			}

			// Create html cell
			table += '<td address="' + address + '" ondblclick="makeEditable(this)" onmouseover="mouseOverValue(this)">' + valueText +'</td>\n';
			// Check end of line
			if(i == clmns-1) {
				// end of a new line
				table += '</tr>\n';
			}

			// Next line
			address++;
			i++;
			if(i >= clmns)
				i = 0;
		}

		// Add html body
		var caption = metaBlock.title;
		if(caption)
			caption = '<div align="left">' + caption + ':<br></div>\n';
		else
			caption = '';
		const html = util.format(format, caption, clmns, table);
		return html;
	}


	/**
	 * Sets the html code to display the memory dump.
	 */
	protected setHtml() {
		const format = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<body style="font-family: Courier">

		%s

		</body>
		</html>`;

		// Get register values
		Machine.getRegisters((regsString) => {
			// Loop through all metablocks
			var tables;
			const vertBreak = this.getHtmlVertBreak();
			for(let mb of this.memDump.metaBlocks) {
				const table = this.createHtmlTable(mb, regsString);
				tables = (tables) ? tables + vertBreak + table : table;
			}

			// Add html body
			const html = util.format(format, tables);
			this.vscodePanel.webview.html = html;

			// Set colors for register pointers
			this.setColorsForRegisterPointers();
		});
	}

	/**
	 * Set colors for register pointers.
	 * Colors are only set if the wenview is visible.
	 */
	protected setColorsForRegisterPointers() {
		// Get register values
		Machine.getRegisters((regsString) => {
			// Set colors for register pointers
			const arr = Settings.launch.memoryViewer.registerPointerColors;
			for(let i=0; i<arr.length-1; i+=2) {
				const reg = arr[i];
				if(!Z80Registers.isRegister(reg))
					continue;
				// get address = value of reg
				const address = Z80Registers.getRegValueByName(reg, regsString);
				console.log( reg + ': ' + address.toString(16));
				// Send the address/color to the web view for display.
				const color = arr[i+1];
				const msg = {
					command: 'setAddressColor',
					address: address.toString(),
					color: color
				};
				this.vscodePanel.webview.postMessage(msg);
			}
		});
	}


	/**
	 * Can be overridden. Determines what is shown between the tables,
	 * e.g. "...".
	 */
	protected getHtmlVertBreak() {
		return '\n...<br>\n';
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
	 * Adds emphasizes for changed values.
	 * @param origText
	 * @returns html text that id emphasized.
	 */
	protected addEmphasizeChanged(origText: string,): string {
		const resText = '<font color="red">' + origText + '</font>';
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
