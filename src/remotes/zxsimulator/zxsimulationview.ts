import * as assert from 'assert';
import * as vscode from 'vscode';
import {EventEmitter} from 'events';
//import {Utility} from '../../utility';
import {ZxMemory} from './zxmemory';
import {BaseView} from '../../views/baseview';
import {ZxPorts} from './zxports';
import {ZxSimulatorRemote} from './zxsimremote';


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

	// A pointer to the ports for the keyboards.
	protected zxPorts: ZxPorts;


	/**
	 * Factory method which creates a new view and handles it's lifecycle.
	 * I.e. the events.
	 * @param simulator The simulator Remote which emits the signals.
	 */
	public static SimulationViewFactory(simulator: ZxSimulatorRemote) {
		// Safe ty check
		if (!simulator)
			return;

		// Create new instance
		let zxview: ZxSimulationView|undefined = new ZxSimulationView(simulator.zxMemory, simulator.zxPorts);
		simulator.once('closed', () => {
			zxview?.close();
			zxview=undefined;
		});
		simulator.on('update', () => {
			zxview?.update();
		});
	}


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(memory: ZxMemory, ports: ZxPorts) {
		super(false);
		// Init
		this.zxMemory=memory;
		this.zxPorts=ports;

		// Set all ports
		ports.setPortValue(0xFEFE, 0xFF);
		ports.setPortValue(0xFDFE, 0xFF);
		ports.setPortValue(0xFBFE, 0xFF);
		ports.setPortValue(0xF7FE, 0xFF);
		ports.setPortValue(0xEFFE, 0xFF);
		ports.setPortValue(0xDFFE, 0xFF);
		ports.setPortValue(0xBFFE, 0xFF);
		ports.setPortValue(0x7FFE, 0xFF);

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
	 * @param message The message. message.command contains the command as a string. E.g. 'keyChanged'
	 */
	protected webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'keyChanged':
				this.keyChanged(message.key, message.value);
				break;
			default:
				assert(false);
		}
	}


	/**
	 * Called on key press or key release.
	 * Sets/clears the corresponding port bits.
	 * @param key E.g. "key_Digit2", "key_KeyQ", "key_Enter", "key_Space", "key_ShiftLeft" (CAPS) or "key_ShiftRight" (SYMBOL).
	 * @param on true=pressed, false=released
	 */
	protected keyChanged(key: string, on: boolean) {
		// Determine port
		let port;
		switch (key) {
			case 'key_Digit1':
			case 'key_Digit2':
			case 'key_Digit3':
			case 'key_Digit4':
			case 'key_Digit5':
				port=0xF7FE;
				break;
			case 'key_Digit6':
			case 'key_Digit7':
			case 'key_Digit8':
			case 'key_Digit9':
			case 'key_Digit0':
				port=0xEFFE;
				break;
			case 'key_KeyQ':
			case 'key_KeyW':
			case 'key_KeyE':
			case 'key_KeyR':
			case 'key_KeyT':
				port=0xFBFE;
				break;
			case 'key_KeyY':
			case 'key_KeyU':
			case 'key_KeyI':
			case 'key_KeyO':
			case 'key_KeyP':
				port=0xDFFE;
				break;
			case 'key_KeyA':
			case 'key_KeyS':
			case 'key_KeyD':
			case 'key_KeyF':
			case 'key_KeyG':
				port=0xFDFE;
				break;
			case 'key_KeyH':
			case 'key_KeyJ':
			case 'key_KeyK':
			case 'key_KeyL':
			case 'key_Enter':
				port=0xBFFE;
				break;
			case 'key_ShiftLeft':	// CAPS
			case 'key_KeyZ':
			case 'key_KeyX':
			case 'key_KeyC':
			case 'key_KeyV':
				port=0xFEFE;
				break;
			case 'key_KeyB':
			case 'key_KeyN':
			case 'key_KeyM':
			case 'key_ShiftRight':	// SYMBOL
			case 'key_Space':
				port=0x7FFE;
				break;
			default:
				assert(false);
		}
		assert(port);

		// Determine bit
		let bit;
		switch (key) {
			case 'key_ShiftLeft':	// CAPS
			case 'key_KeyA':
			case 'key_KeyQ':
			case 'key_Digit1':
			case 'key_Digit0':
			case 'key_KeyP':
			case 'key_Enter':
			case 'key_Space':
				bit=0b00001;
				break;
			case 'key_KeyZ':
			case 'key_KeyS':
			case 'key_KeyW':
			case 'key_Digit2':
			case 'key_Digit9':
			case 'key_KeyO':
			case 'key_KeyL':
			case 'key_ShiftRight':	// SYMBOL
				bit=0b00010;
				break;
			case 'key_KeyX':
			case 'key_KeyD':
			case 'key_KeyE':
			case 'key_Digit3':
			case 'key_Digit8':
			case 'key_KeyI':
			case 'key_KeyK':
			case 'key_KeyM':
				bit=0b00100;
				break;
			case 'key_KeyC':
			case 'key_KeyF':
			case 'key_KeyR':
			case 'key_Digit4':
			case 'key_Digit7':
			case 'key_KeyU':
			case 'key_KeyJ':
			case 'key_KeyN':
				bit=0b01000;
				break;
			case 'key_Keyv':
			case 'key_KeyG':
			case 'key_KeyT':
			case 'key_Digit5':
			case 'key_Digit6':
			case 'key_KeyY':
			case 'key_KeyH':
			case 'key_KeyB':
				bit=0b10000;
				break;
			default:
				assert(false);
		}
		assert(bit);

		// Get port value
		let value=this.zxPorts.getPortValue(port);
		if (on)
			value&=~bit;
		else
			value|=bit;
		// And set
		this.zxPorts.setPortValue(port, value);
	}


	/**
	 * Retrieves the screen memory content and returns it as base64 string.
	 */
	public createScreenString(): string {
		let screenGifString='';
		try {
			// Create gif
			const gif=this.zxMemory.getUlaScreen();
			const buf=Buffer.from(gif);
			screenGifString='data:image/gif;base64,'+buf.toString('base64');
		}
		catch {}
		return screenGifString;
	}


	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public update() {
		try {
			// Create gif
			const screenGifString=this.createScreenString();
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
		const screenGifString=this.createScreenString();
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

		// Send request to vscode
		vscode.postMessage({
			command: 'keyChanged',
			value: on,
			key: cell.id
		});
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
<img id="screen_img_id" width="100%" src="${screenGifString}">
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

