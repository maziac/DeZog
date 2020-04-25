import {EventEmitter} from 'events';
//import {Utility} from '../../utility';
import {BaseView} from '../../views/baseview';
import {ZxSimulatorRemote} from './zxsimremote';
import {WebviewPanel} from 'vscode';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';


/**
 * A Webview that shows the simulated ZX Spectrum screen.
 */
export class ZxSimulationView extends BaseView {

	// Holds the gif image a string.
	protected screenGifString;

	/// We listen for 'update' on this emitter to update the html.
	protected parent: EventEmitter;

	// A pointer to the simulator.
	protected simulator: ZxSimulatorRemote;


	/**
	 * Factory method which creates a new view and handles it's lifecycle.
	 * I.e. the events.
	 * @param simulator The simulator Remote which emits the signals.
	 */
	public static SimulationViewFactory(simulator: ZxSimulatorRemote) {
		// Safety check
		if (!simulator)
			return;

		// Create new instance
		let zxview: ZxSimulationView|undefined=new ZxSimulationView(simulator);
		simulator.once('closed', () => {
			zxview?.close();
			zxview=undefined;
		});
		simulator.on('update', async (reason) => {
			await zxview?.update();
		});
	}


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(simulator: ZxSimulatorRemote) {
		super(false);
		// Init
		this.simulator=simulator;

		// Set all ports
		const ports=simulator.zxPorts;
		ports.setPortValue(0xFEFE, 0xFF);
		ports.setPortValue(0xFDFE, 0xFF);
		ports.setPortValue(0xFBFE, 0xFF);
		ports.setPortValue(0xF7FE, 0xFF);
		ports.setPortValue(0xEFFE, 0xFF);
		ports.setPortValue(0xDFFE, 0xFF);
		ports.setPortValue(0xBFFE, 0xFF);
		ports.setPortValue(0x7FFE, 0xFF);

		// Add title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as WebviewPanel).title='Z80/ZX Spectrum Simulator';

		// Initial html page.
		this.setHtml();
		//this.update(); Is done by the webview
	}


	/**
	 * Closes the view.
	 */
	public close() {
		if(this.vscodePanel)
			this.vscodePanel.dispose();
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		// Do not use panel anymore
		this.vscodePanel=undefined;
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string. E.g. 'keyChanged'
	 */
	protected webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'updateRequest':
				// The webview requests an update, e.g. because it ha been
				// moved from background to foreground (vscode does not preserve the state)
				this.update();	// No need to call 'await'
				break;
			case 'keyChanged':
				this.keyChanged(message.key, message.value);
				break;
			default:
				Utility.assert(false);
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
				Utility.assert(false);
		}
		Utility.assert(port);

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
				Utility.assert(false);
		}
		Utility.assert(bit);

		// Get port value
		let value=this.simulator.zxPorts.getPortValue(port);
		if (on)
			value&=~bit;
		else
			value|=bit;
		// And set
		this.simulator.zxPorts.setPortValue(port, value);
	}


	/**
	 * Converts an image into a base64 string.
	 */
	public createBase64String(imgBuffer: number[]): string {
		let screenGifString='';
		try {
			// Create gif
			const buf=Buffer.from(imgBuffer);
			screenGifString='data:image/gif;base64,'+buf.toString('base64');
		}
		catch {}
		return screenGifString;
	}


	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public async update(): Promise<void> {
		try {
			let cpuLoad;
			let slots;
			let slotNames;
			let visualMemImg;
			let screenImg;
			// Update values
			if (Settings.launch.zsim.cpuLoadInterruptRange>0)
				cpuLoad=(this.simulator.z80Cpu.cpuLoad*100).toFixed(0).toString();

			if (Settings.launch.zsim.visualMemory=="ZX128") {
				slots=this.simulator.zxMemory.getSlots();
				// ZX128 has 16k slots/banks
				slotNames=new Array<string>();
				for (let i=0; i<8; i+=2) {
					const bankA=Math.floor(slots[i]/2);
					const bankB=Math.floor(slots[i+1]/2);
					let name;
					if (bankA==127||bankB==127) {
						// Use name "ROM"
						name="ROM";
						if (bankA<127)
							name+="/"+bankA;	// pathologic case.
						if (bankB<127)
							name+="/"+bankB;	// pathologic case.
					}
					else {
						// Use name "BANKx"
						name="BANK"+bankB
						if (bankA!=bankB)
							name+="/"+bankB;	// This only happens if e.g. ZXNext 8k slots banks are used.
					}
					slotNames.push(name);
				}
			}
			else if (Settings.launch.zsim.visualMemory=="ZXNEXT") {
				slots=this.simulator.zxMemory.getSlots();
				slotNames=slots.map(bank => (bank>=254)? "ROM":"BANK"+bank);
			}
			if (Settings.launch.zsim.visualMemory!="none") {
				// The same for all
				visualMemImg=this.createBase64String(this.simulator.zxMemory.getVisualMemoryImage());
			}

			if (Settings.launch.zsim.ulaScreen)
				screenImg=this.createBase64String(this.simulator.zxMemory.getUlaScreen());
			// Create message to update the webview
			let message={
				command: 'update',
				cpuLoad,
				slotNames,
				visualMemImg,
				screenImg

			};
			this.sendMessageToWebView(message);
			// Clear
			this.simulator.zxMemory.clearVisualMemory();
		}
		catch {}
	}


	/**
	 * Sets the html code to display the ula screen, visual memory etc.
	 * Depending on the Settings selection.
	 */
	protected setHtml() {
		if (!this.vscodePanel)
			return;

		let html=
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

	//---- On start send request to vscode to update itself. --------
	// Otherwise theimages are empty when switching from back- to foreground.
	vscode.postMessage({
		command: 'updateRequest'
	});


	//---- Handle Messages from vscode extension --------
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.command) {
			case 'update':
			{
				if(message.cpuLoad != undefined)
					cpuLoad.innerHTML = message.cpuLoad;

				if(message.slotNames) {
					let i=0;
					for(slotString of message.slotNames) {
						const slot=slots[i++];
						if(slot)
							slot.textContent = slotString;
					}
				}

				if(message.visualMemImg)
					visualMemImg.src = message.visualMemImg;

				if(message.screenImg)
					screenImg.src = message.screenImg;
			}
			break;
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


	// Toggles the visibility of an element.
	/*
	function toggleVisibility(id) {
		var x = document.getElementById(id);
		if (x.style.display === "none") {
			x.style.display = "block";
		} else {
			x.style.display = "none";
		}
	}
	*/

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

`;

		if (Settings.launch.zsim.cpuLoadInterruptRange>0) {
			html+=
				`<!-- Z80 CPU load -->
<p>
	<label>Z80 CPU load:</label>
	<label id="cpu_load_id">100</label>
	<label>%</label>
</p>
<script>
	<!-- Store the cpu_load_id -->
	var cpuLoad=document.getElementById("cpu_load_id");
</script>

`;
		}


		// Continuous 64K memory area
		if (Settings.launch.zsim.visualMemory=="64K") {
			html+=
				`<!-- Visual Memory (memory activity) -->
	<!-- Legend, Slots -->
	<div style="position:relative; width:100%; height:4.5em;">
    <style>
        .border {
            outline: 1px solid var(--vscode-foreground);
            outline-offset: 0;
            height:1em;
            position:absolute;
            text-align: center;
		}
		.slot {
			height:2em;
			background: gray
        }
		.transparent {
			height:2em;
			background: transparent
        }
    </style>

		<!-- Legend -->
    <span style="position:absolute; top: 0em; left:0%">
		<label style="background:blue">&ensp;&ensp;</label><label>&nbsp;PROG &ensp;&ensp;</label>
		<label style="background:yellow">&ensp;&ensp;</label><label>&nbsp;READ &ensp;&ensp;</label>
		<label style="background:red">&ensp;&ensp;</label><label>&nbsp;WRITE</label>
	</span>

	<!-- Address labels -->
	<label style="position:absolute; top:2em; left:0%">0x0000</label>
	<label style="position:absolute; top:2em; left:12.5%">0x2000</label>
	<label style="position:absolute; top:2em; left:25%">0x4000</label>
	<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
	<label style="position:absolute; top:2em; left:50%">0x8000</label>
	<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
	<label style="position:absolute; top:2em; left:75%">0xC000</label>
	<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

    <!-- Marker ticks -->
	<span class="border" style="top: 3em; left:0%; height: 1em"></span>
	<span class="border" style="top: 3em; left:12.5%; height: 1em"></span>
	<span class="border" style="top: 3em; left:25%; height:1em;"></span>
	<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:50%; height:1em;"></span>
	<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:75%; height:1em;"></span>
    <span class="border" style="top: 3em; left:87.5%; height:1em;"></span>

	<!-- Visual memory image, is mainly transparent and put on top -->
	<img class="slot" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; width:100%;">

    <!-- Slots  2nd -->
    <div class="border transparent" style="top:3.5em; left:0%; width:25%;"></div>
    <div class="border transparent" style="top:3.5em; left:25%; width:25%;"></div>
    <div class="border transparent" style="top:3.5em; left:50%; width:25%;"></div>
    <div class="border transparent" style="top:3.5em; left:75%; width:25%;"></div>

	<script>
        <!-- Store the visual mem image source -->
        var visualMemImg=document.getElementById("visual_mem_img_id");
	</script>

</div>
<br><br>
`;
		}

		// ZX Spectrum 48K: ROM + RAM
		else if (Settings.launch.zsim.visualMemory=="ZX48") {
			html+=
				`<!--Visual Memory(memory activity)-->
<!--Legend, Slots-->
<div style="position:relative; width:100%; height:4.5em;">
		<style>
        .border {
				outline: 1px solid var(--vscode-foreground);
				outline-offset: 0;
				height: 1em;
				position: absolute;
				text-align: center;
			}
		.slot {
				height: 2em;
				background: gray
			}
		.transparent {
				height: 2em;
				background: transparent
			}
		</style>
<!-- Legend -->
    <span style="position:absolute; top: 0em; left:0%">
		<label style="background:blue">&ensp;&ensp;</label><label>&nbsp;PROG &ensp;&ensp;</label>
		<label style="background:yellow">&ensp;&ensp;</label><label>&nbsp;READ &ensp;&ensp;</label>
		<label style="background:red">&ensp;&ensp;</label><label>&nbsp;WRITE</label>
	</span>

	<!-- Address labels -->
	<label style="position:absolute; top:2em; left:0%">0x0000</label>
	<label style="position:absolute; top:2em; left:12.5%">0x2000</label>
	<label style="position:absolute; top:1em; left:25%">0x4000</label>
	<label style="position:absolute; top:1em; left:35.5%">0x5B00</label>
	<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
	<label style="position:absolute; top:2em; left:50%">0x8000</label>
	<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
	<label style="position:absolute; top:2em; left:75%">0xC000</label>
	<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

    <!-- Marker ticks -->
	<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
	<span class="border" style="top: 3em; left:12.5%;"></span>
	<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
	<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
	<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->
	<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:50%; height:1em;"></span>
	<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:75%; height:1em;"></span>
    <span class="border" style="top: 3em; left:87.5%; height:1em;"></span>

	<!-- Extra "Screen" range display -->
    <div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
	<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>

	<!-- Visual memory image, is mainly transparent and put on top -->
	<img class="slot" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; width:100%;">

    <!-- Slots  2nd -->
    <div class="border transparent" style="top:3.5em; left:0%; width:25%;">ROM</div>
    <div class="border transparent" style="top:3.5em; left:25%; width:25%">RAM</div>
    <div class="border transparent" style="top:3.5em; left:50%; width:25%;">RAM</div>
    <div class="border transparent" style="top:3.5em; left:75%; width:25%;">RAM</div>

    <script>
        <!-- Store the visual mem image source -->
        var visualMemImg=document.getElementById("visual_mem_img_id");
 	</script>

</div>
<br><br>
`;
		}

		// ZX Spectrum 128K: 16k slots/banks
		else if (Settings.launch.zsim.visualMemory=="ZX128") {
			html+=
				`<!-- Visual Memory (memory activity) -->
<!-- Legend, Slots -->
<div style="position:relative; width:100%; height:4.5em;">
    <style>
        .border {
            outline: 1px solid var(--vscode-foreground);
            outline-offset: 0;
            height:1em;
            position:absolute;
            text-align: center;
		}
		.slot {
			height:2em;
			background: gray
        }
		.transparent {
			height:2em;
			background: transparent
        }
    </style>

	<!-- Legend -->
    <span style="position:absolute; top: 0em; left:0%">
		<label style="background:blue">&ensp;&ensp;</label><label>&nbsp;PROG &ensp;&ensp;</label>
		<label style="background:yellow">&ensp;&ensp;</label><label>&nbsp;READ &ensp;&ensp;</label>
		<label style="background:red">&ensp;&ensp;</label><label>&nbsp;WRITE</label>
	</span>

	<!-- Address labels -->
	<label style="position:absolute; top:2em; left:0%">0x0000</label>
	<label style="position:absolute; top:2em; left:12.5%">0x2000</label>
	<label style="position:absolute; top:1em; left:25%">0x4000</label>
	<label style="position:absolute; top:1em; left:35.5%">0x5B00</label>
	<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
	<label style="position:absolute; top:2em; left:50%">0x8000</label>
	<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
	<label style="position:absolute; top:2em; left:75%">0xC000</label>
	<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

    <!-- Marker ticks -->
	<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
	<span class="border" style="top: 3em; left:12.5%;"></span>
	<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
	<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
	<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->
	<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:50%; height:1em;"></span>
	<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:75%; height:1em;"></span>
    <span class="border" style="top: 3em; left:87.5%; height:1em;"></span>

	<!-- Extra "Screen" range display -->
    <div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
	<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>

	<!-- Visual memory image, is mainly transparent and put on top -->
	<img class="slot" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; width:100%;">

    <!-- Slots  2nd -->
    <div class="border transparent" id="slot0_id" style="top:3.5em; left:0%; width:25%;">ROM</div>
    <div class="border transparent" id="slot1_id" style="top:3.5em; left:25%; width:25%">BANK5</div>
    <div class="border transparent" id="slot2_id" style="top:3.5em; left:50%; width:25%;">BANK7</div>
    <div class="border transparent" id="slot3_id" style="top:3.5em; left:75%; width:25%;">BANK2</div>

    <script>
        <!-- Store the visual mem image source -->
        var visualMemImg=document.getElementById("visual_mem_img_id");
	    <!-- Store the slots -->
	    var slots = [
			document.getElementById("slot0_id"),
			document.getElementById("slot1_id"),
			document.getElementById("slot2_id"),
			document.getElementById("slot3_id"),
		];
 	</script>

</div>
<br><br>
`;
		}

		// ZX Next: 8k slots/banks
		else if (Settings.launch.zsim.visualMemory=="ZXNEXT") {
			html+=
				`<!-- Visual Memory (memory activity) -->
<!-- Legend, Slots -->
<div style="position:relative; width:100%; height:4.5em;">
    <style>
        .border {
            outline: 1px solid var(--vscode-foreground);
            outline-offset: 0;
            height:1em;
            position:absolute;
            text-align: center;
		}
		.slot {
			height:2em;
			background: gray
        }
		.transparent {
			height:2em;
			background: transparent
        }
    </style>

	<!-- Legend -->
    <span style="position:absolute; top: 0em; left:0%">
		<label style="background:blue">&ensp;&ensp;</label><label>&nbsp;PROG &ensp;&ensp;</label>
		<label style="background:yellow">&ensp;&ensp;</label><label>&nbsp;READ &ensp;&ensp;</label>
		<label style="background:red">&ensp;&ensp;</label><label>&nbsp;WRITE</label>
	</span>

	<!-- Address labels -->
	<label style="position:absolute; top:2em; left:0%">0x0000</label>
	<label style="position:absolute; top:2em; left:12.5%">0x2000</label>
	<label style="position:absolute; top:1.1em; left:25%">0x4000</label>
	<label style="position:absolute; top:1.1em; left:35.5%">0x5B00</label>
	<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
	<label style="position:absolute; top:2em; left:50%">0x8000</label>
	<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
	<label style="position:absolute; top:2em; left:75%">0xC000</label>
	<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

    <!-- Marker ticks -->
	<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
	<span class="border" style="top: 3em; left:12.5%;"></span>
	<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
	<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
	<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->
	<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:50%; height:1em;"></span>
	<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:75%; height:1em;"></span>
    <span class="border" style="top: 3em; left:87.5%; height:1em;"></span>

	<!-- Extra "Screen" range display -->
    <div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
	<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>

	<!-- Visual memory image, is mainly transparent and put on top -->
	<img class="slot" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; width:100%;">

    <!-- Slots  2nd -->
    <div class="border transparent" id="slot0_id" style="top:3.5em; left:0%; width:12.5%;">ROM</div>
    <div class="border transparent" id="slot1_id" style="top:3.5em; left:12.5%; width:12.5%">ROM</div>
    <div class="border transparent" id="slot2_id" style="top:3.5em; left:25%; width:12.5%">M . . . BANK5</div>
    <div class="border transparent" id="slot3_id" style="top:3.5em; left:37.5%; width:12.5%;">BANK6</div>
    <div class="border transparent" id="slot4_id" style="top:3.5em; left:50%; width:12.5%;">BANK7</div>
    <div class="border transparent" id="slot5_id" style="top:3.5em; left:62.5%; width:12.5%;">BANK1</div>
    <div class="border transparent" id="slot6_id" style="top:3.5em; left:75%; width:12.5%;">BANK2</div>
    <div class="border transparent" id="slot7_id" style="top:3.5em; left:87.5%; width:12.5%;">BANK3</div>

    <script>
        <!-- Store the visual mem image source -->
        var visualMemImg=document.getElementById("visual_mem_img_id");
	    <!-- Store the slots -->
	    var slots = [
			document.getElementById("slot0_id"),
			document.getElementById("slot1_id"),
			document.getElementById("slot2_id"),
			document.getElementById("slot3_id"),
			document.getElementById("slot4_id"),
			document.getElementById("slot5_id"),
			document.getElementById("slot6_id"),
			document.getElementById("slot7_id")
		];
 	</script>

</div>

<br><br>

`;
		}

		if (Settings.launch.zsim.ulaScreen) {
			html+=
				`<!-- Display the screen gif -->
<img id="screen_img_id" style="image-rendering:pixelated; width:100%;">
<script>
	<!-- Store the screen image source -->
	var screenImg=document.getElementById("screen_img_id");
</script>

`;
		}


		if (Settings.launch.zsim.zxKeyboard) {
			html+=
				`<!-- Keyboard -->
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

`;
		}

		html+=
`<p id="log"></p>

</body>
</html>
`;

		this.vscodePanel.webview.html=html;
	}
}

