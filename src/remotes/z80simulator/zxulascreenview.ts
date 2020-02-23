//import * as assert from 'assert';
import * as vscode from 'vscode';
import {EventEmitter} from 'events';
//import {Utility} from '../../utility';
import {ZxMemory} from './zxmemory';
import {BaseView} from '../../views/baseview';


/**
 * A Webview that shows the simulated ZX Spectrum screen.
 */
export class ZxSimulationView extends BaseView {

	// Holds the gif image a string.
	protected screenGifString;

	/// The panel to show the base view in vscode.
	protected vscodePanel: vscode.WebviewPanel;

	/// We listen for 'update' on this emitter to update the html.
	protected parent: EventEmitter;

	// A pointer to the memory which holds the screen.
	protected zxMemory: ZxMemory;


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(memory: ZxMemory) {
		super(false);
		// Init
		this.zxMemory=memory;

		// create vscode panel view
		this.vscodePanel=vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine}, {enableScripts: true});
		this.vscodePanel.title='Z80/ZX Spectrum Simulator';
		// Handle closing of the view
		this.vscodePanel.onDidDispose(() => {
			// Call overwritable function
			this.disposeView();
		});

		// Handle messages from the webview
		this.vscodePanel.webview.onDidReceiveMessage(message => {
			console.log("webView command '"+message.command+"':", message);
			this.webViewMessageReceived(message);
		});


		// Initial html page.
		this.setHtml();
	}


	/**
	 * Closes the view.
	 */
	public close() {
		this.vscodePanel.dispose();
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		// Can be overwritten
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 * This needs to be created inside the web view.
	 */
	protected webViewMessageReceived(message: any) {
		switch (message.command) {
		}
	}


	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public update() {
		try {
			// Create gif
			const gif=this.zxMemory.getUlaScreen();
			const buf=Buffer.from(gif);
			const screenGifString='data:image/gif;base64,'+buf.toString('base64');
			// Create message
			const message={
				command: 'updateScreen',
				value: screenGifString
			};
			this.sendMessageToWebView(message);
		}
		catch {}
	}


	/**
	 * Sets the html code to display the memory dump.
	 */
	protected setHtml() {
		const html=
`<html>

<style>
.td_on {border: 3px solid;
margin:0em;
padding:0em;
text-align:center;
border-color:black;
background:red;
width:70px;
}

.td_off {border: 3px solid;
margin:0em;
padding:0em;
text-align:center;
border-color:black;
width:70px;
}


.div_on {
color:white;
}

.div_off {
color:black;
}
</style>


  <script>

	const vscode = acquireVsCodeApi();

	//---- Handle Messages from vscode extension --------
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.command) {
			case 'updateScreen':
			{
				screenImg.src = message.value;
			}   break;
		}
	});


	// Set cell to selected or unselected.
    function cellSelect(cell, on) {
      cell.tag=on;
      if(on) {
        cell.className="td_on";
      }
      else {
        cell.className="td_off";
      }
    }


    // Toggle the cell.
    function cellClicked(cell) {
      	//log.textContent += "clicked ";
      	cell.tag=!cell.tag;
      	cellSelect(cell, cell.tag);
    }


    // Find right cell for keycode.
	function findCell(keyCode) {
    	// Find correspondent cell
        cell=document.getElementById("key_"+keyCode);
     	return cell;
    }


	// Handle key down presses.
	document.addEventListener('keydown', keydown);
	function keydown(e) {
       	// Find correspondent cell
        cell=findCell(e.code);
        cellSelect(cell, true);
       	//log.textContent += e.code + ", ";
    }


	// Handle key up presses.
	document.addEventListener('keyup', keyup);
	function keyup(e) {
    	// Find correspondent cell
        cell=findCell(e.code);
        cellSelect(cell, false);
    }


  </script>

<body>

<!-- Display the screen gif -->
<img id="screen_img_id" width="100%"">
<script>
	<!-- Store the screen image source -->
	var screenImg=document.getElementById("screen_img_id");
</script>

<!-- Keyboard -->
<table style="width:100%">

  <tr>
    <td id="key_Digit1" class="td_off" onClick="cellClicked(this)">1</td>
    <td id="key_Digit2" class="td_off" onClick="cellClicked(this)">2</td>
    <td id="key_Digit3" class="td_off" onClick="cellClicked(this)">3</td>
    <td id="key_Digit4" class="td_off" onClick="cellClicked(this)">4</td>
    <td id="key_Digit5" class="td_off" onClick="cellClicked(this)">5</td>
    <td id="key_Digit6" class="td_off" onClick="cellClicked(this)">6</td>
    <td id="key_Digit7" class="td_off" onClick="cellClicked(this)">7</td>
    <td id="key_Digit8" class="td_off" onClick="cellClicked(this)">8</td>
    <td id="key_Digit9" class="td_off" onClick="cellClicked(this)">9</td>
    <td id="key_Digit0" class="td_off" onClick="cellClicked(this)">0</td>
  </tr>


  <tr>
    <td id="key_KeyQ" class="td_off" onClick="cellClicked(this)">Q</td>
    <td id="key_KeyW" class="td_off" onClick="cellClicked(this)">W</td>
    <td id="key_KeyE" class="td_off" onClick="cellClicked(this)">E</td>
    <td id="key_KeyR" class="td_off" onClick="cellClicked(this)">R</td>
    <td id="key_KeyT" class="td_off" onClick="cellClicked(this)">T</td>
    <td id="key_KeyY" class="td_off" onClick="cellClicked(this)">Y</td>
    <td id="key_KeyU" class="td_off" onClick="cellClicked(this)">U</td>
    <td id="key_KeyI" class="td_off" onClick="cellClicked(this)">I</td>
    <td id="key_KeyO" class="td_off" onClick="cellClicked(this)">O</td>
    <td id="key_KeyP" class="td_off" onClick="cellClicked(this)">P</td>
  </tr>


  <tr>
    <td id="key_KeyA" class="td_off" onClick="cellClicked(this)">A</td>
    <td id="key_KeyS" class="td_off" onClick="cellClicked(this)">S</td>
    <td id="key_KeyD" class="td_off" onClick="cellClicked(this)">D</td>
    <td id="key_KeyF" class="td_off" onClick="cellClicked(this)">F</td>
    <td id="key_KeyG" class="td_off" onClick="cellClicked(this)">G</td>
    <td id="key_KeyH" class="td_off" onClick="cellClicked(this)">H</td>
    <td id="key_KeyJ" class="td_off" onClick="cellClicked(this)">J</td>
    <td id="key_KeyK" class="td_off" onClick="cellClicked(this)">K</td>
    <td id="key_KeyL" class="td_off" onClick="cellClicked(this)">L</td>
    <td id="key_Enter" class="td_off" onClick="cellClicked(this)">ENTER</td>
  </tr>


  <tr>
    <td id="key_ShiftLeft" class="td_off" onClick="cellClicked(this)">CAPS S.</td>
    <td id="key_KeyZ" class="td_off" onClick="cellClicked(this)">Z</td>
    <td id="key_KeyX" class="td_off" onClick="cellClicked(this)">X</td>
    <td id="key_KeyC" class="td_off" onClick="cellClicked(this)">C</td>
    <td id="key_KeyV" class="td_off" onClick="cellClicked(this)">V</td>
    <td id="key_KeyB" class="td_off" onClick="cellClicked(this)">B</td>
    <td id="key_KeyN" class="td_off" onClick="cellClicked(this)">N</td>
    <td id="key_KeyM" class="td_off" onClick="cellClicked(this)">M</td>
    <td id="key_ShiftRight" class="td_off" onClick="cellClicked(this)">SYMB. S.</td>
    <td id="key_Space" class="td_off" onClick="cellClicked(this)">SPACE</td>
  </tr>


</table>

<p id="log"></p>

</body>
</html>
`;

		this.vscodePanel.webview.html=html;
	}
}

