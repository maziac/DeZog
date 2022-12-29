import {vscode} from "./vscode-import";
import {ZxAudioBeeper, zxAudioBeeper} from "./zxaudiobeeper";
import {UlaScreen} from "./ulascreen";
import {VisualMem} from "./visualmem";
import {joystickObjs, initJoystickPolling} from "./joysticks";
import {UIAPI, UiBit} from "./helper";



// HTML element used for the cpu load.
let cpuLoad: HTMLLabelElement


// For flow control.
let countOfProcessedMessages = 0;

// Message water marks.
// @ts-ignore
const MESSAGE_HIGH_WATERMARK = 100;
const MESSAGE_LOW_WATERMARK = 10;


// The slot HTML elements.
const slots: HTMLElement[] = [];

// For the ULA screen.
let screenImg: HTMLCanvasElement;
let screenImgImgData: ImageData;
let screenImgContext: CanvasRenderingContext2D;



//---- Handle Messages from vscode extension --------
window.addEventListener('message', event => {// NOSONAR
	// Count message
	countOfProcessedMessages++;
	if (countOfProcessedMessages >= MESSAGE_LOW_WATERMARK) {
		// Send info to vscode
		vscode.postMessage({
			command: 'countOfProcessedMessages',
			value: countOfProcessedMessages
		});
		countOfProcessedMessages = 0;
	}

	// Process message
	const message = event.data;
	switch (message.command) {
		case 'cpuStopped':
			// Z80 CPU was stopped, t-states do not advance.
			zxAudioBeeper.stop();
			break;

		case 'update':
			{
				if (message.cpuLoad != undefined)
					cpuLoad.innerHTML = message.cpuLoad;

				if (message.slotNames) {
					let i = 0;
					for (const slotString of message.slotNames) {
						const slot = slots[i++];
						if (slot)
							slot.textContent = slotString;
					}
				}

				if (message.visualMem) {
					VisualMem.drawVisualMemory(message.visualMem);
				}

				if (message.screenImg) {
					const data = message.screenImg.ulaData;
					const time = message.screenImg.time;
					UlaScreen.drawUlaScreen(screenImgContext, screenImgImgData, data, time);
				}

				if (message.borderColor != undefined) {
					// Convert ZX color to html color
					const htmlColor = UlaScreen.getHtmlColor(message.borderColor);
					// Set color
					screenImg.style.borderColor = htmlColor;
				}

				if (message.audio) {
					const audio = message.audio;
					zxAudioBeeper.writeBeeperSamples(audio);
				}
			}
			break;

		case 'receivedFromCustomLogic':
			// Message received from custom code.
			// Call custom UI code
			if (UIAPI.receivedFromCustomLogic) {
				// Unwrap original message:
				const innerMsg = message.value;
				// Process message
				UIAPI.receivedFromCustomLogic(innerMsg);
			}
			break;
	}
});


/** Init: Initializes parts of the simulation.
 * This depends on if the UI element is available.
 * If it is available was setup in zsimulationview.ts.
 * @param cpuLoadInterruptRange The number of interrupts to calculate the average from. 0 to disable.
 * @param visualMemory Enable/disable visual memory display.
 * @param visualMemoryZxScreen Enable/disable the display of hte ZX screen markers within the visual memory.
 * @param ulaScreen Enable/disable the ula screen display.
 * @param zxBorderWidth The pixel width to use for the border.
 * @param zxBeeper Enable/disable the beeper display.
 * @param initialBeeperValue The initial value to show for the beeper.
 * @param audioSampleRate In Hz.
 * @param volume Number in range [0;1.0]
 * @param zxKeyboard Enable/disable the keyboard display.
 * @param zxInterface2Joy Enable/disable the IF2 joystick display.
 * @param kempstonJoy Enable/disable the Kempston joystick display.
 * @param jsCustomCode The javascript custom code to execute. Is disabled if empty string or undefined.
 * @param customCodeDebug Enable/disable the debug area display.
 */
export function initSimulation(
	cpuLoadInterruptRange: number,
	visualMemory: boolean, visualMemoryZxScreen: boolean, banks: any,
	ulaScreen: boolean, zxBorderWidth: number,
	zxBeeper: boolean, initialBeeperValue: number, audioSampleRate: number, volume: number,
	zxKeyboard: boolean, zxInterface2Joy: boolean, kempstonJoy: boolean,
	jsCustomCode: string, customCodeDebug: boolean
) {
	let html = '';

	// CPU Load
	if (cpuLoadInterruptRange > 0) {
		html += `
			<!-- Z80 CPU load -->
			<p>
				<label>Z80 CPU load:</label>
				<label id="cpu_load_id">100</label>
				<label>%</label>
			</p>
			`;
	}

	// Memory Pages / Visual Memory
	if (visualMemory) {
		//const visualMemoryZxScreen = Settings.launch.zsim.memoryModel.includes("ZX");
		//const slots = this.simulator.getSlots();
		//const banks = this.simulator.memoryModel.getMemoryBanks(slots);
		html += `
			<!-- Visual Memory (memory activity) -->
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
					.disabled {
						font-style: italic;
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
				<label style="position:absolute; top:2em; left:12.5%">0x2000</label>`;
		// ZX screen memory marker
		if (visualMemoryZxScreen) {
			html += `
				<label style="position:absolute; top:1.1em; left:25%">0x4000</label>
				<label style="position:absolute; top:1.1em; left:35.5%">0x5B00</label>`;
		}
		else {
			html += `
				<label style="position:absolute; top:2em; left:25%">0x4000</label>`;
		}

		html += `
			<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
			<label style="position:absolute; top:2em; left:50%">0x8000</label>
			<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
			<label style="position:absolute; top:2em; left:75%">0xC000</label>
			<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

			<!-- Marker ticks -->
			<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
			<span class="border" style="top: 3em; left:12.5%; height:1em;"></span>`;
		if (visualMemoryZxScreen) {
			// ZX screen memory marker
			html += `
				<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
				<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
				<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->`;
		}
		else {
			// ZX screen memory marker
			html += `
				<span class="border" style="top: 3em; left:25%; height:1em;"></span>`;
		}

		html += `
			<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
			<span class="border" style="top: 3em; left:50%; height:1em;"></span>
			<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
			<span class="border" style="top: 3em; left:75%; height:1em;"></span>
			<span class="border" style="top: 3em; left:87.5%; height:1em;"></span>
		`;
		if (visualMemoryZxScreen) {
			// Markers for display
			html += `
				<!-- Extra "Screen" range display -->
				<div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
				<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>`;
		}

		html += `
			<!-- Visual memory image, is mainly transparent and put on top -->
			<canvas class="slot" width="256" height="1" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; left:0; width:100%;"></canvas>

			<!-- Slots  2nd -->
			`;

		// TODO: exchange banks with slot-ranges
		const count = banks.length;
		for (let i = 0; i < count; i++) {
			const bank = banks[i];
			const pos = bank.start * 100 / 0x10000;
			const width = (bank.end + 1 - bank.start) * 100 / 0x10000;
			const add = `<div class="border" id="slot${i}_id" style="top:3.5em; left:${pos}%; width:${width}%; height: 2em">${bank.name}</div>
			`;
			html += add;
		}

		html += `
			</div>
			<br><br>
			`;
	}


	// Add code for the screen
	if (ulaScreen) {
		html += `
			<!-- Display the screen gif -->
			<canvas id="screen_img_id" width="256" height="192" style="image-rendering:pixelated; border:${zxBorderWidth}px solid white; outline: 1px solid var(--vscode-foreground); width:95%; height:95%">
			</canvas>
			`;
	}

	// Add code for the ZX beeper
	if (zxBeeper) {
		html += `
			<details open="true">
			<summary>ZX Beeper</summary>
			<span style="display:table-cell; vertical-align: middle">
				<img src="assets/loudspeaker.svg" width="20em"></img>
				&nbsp;
			</span>

			<!-- 0/1 visual output -->
			<span id="beeper.output" style="display:table-cell; vertical-align: middle; width: 4em">${initialBeeperValue.toString()}</span>

			<!-- Volume slider -->
			<span style="display:table-cell; vertical-align: middle;">-</span>

			<span style="display:table-cell; vertical-align: middle">
				<input id="audio.volume" type="range" min="0" max="1" step="0.01" value="0" oninput="volumeChanged(parseFloat(this.value))">
			</span>
			<span style="display:table-cell; vertical-align: middle">+</span>

			</details>
			`;
	}


	// Add code for the keyboard
	if (zxKeyboard) {
		html += `
			<!-- Keyboard -->
			<details open="true">
			<summary>ZX Keyboard</summary>

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
		</details>
		`;
	}

	// Add code for the Interface 2 joysticks
	if (zxInterface2Joy) {
		html += `
			<!-- ZX Interface 2 Joysticks -->
			<details open="true">
			<summary>ZX Interface 2 Joysticks</summary>

			<table>
				<tr>
				<td>
				<table style="color:black;" oncolor="red" offcolor="white">
					<tr>
						<td>
							<ui-bit id="if2.joy1.fire" style="border-radius:1em;" onchange="togglePortBitNeg(this, 0xEFFE, 0x01)">F</ui-bit>
						</td>
						<td align="center">
							<ui-bit id="if2.joy1.up" onchange="togglePortBitNeg(this, 0xEFFE, 0x02)">U</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="if2.joy1.left" onchange="togglePortBitNeg(this, 0xEFFE, 0x10)">L</ui-bit>
						</td>
						<td style="color:var(--vscode-editor-foreground)">Joy1</td>
						<td>
							<ui-bit id="if2.joy1.right" onchange="togglePortBitNeg(this, 0xEFFE, 0x08)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td align="center">
							<ui-bit id="if2.joy1.down" onchange="togglePortBitNeg(this, 0xEFFE, 0x04)">D</ui-bit>
						</td>
					</tr>
				</table>
			</td>

			<td></td>
			<td></td>

			<td>
				<table style="color:black;">
					<tr>
						<td>
							<ui-bit id="if2.joy2.fire" style="border-radius:1em;" onchange="togglePortBitNeg(this, 0xF7FE, 0x10)">F</ui-bit>
						</td>
						<td align="center">
							<ui-bit id="if2.joy2.up" onchange="togglePortBitNeg(this, 0xF7FE, 0x08)">U</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="if2.joy2.left" onchange="togglePortBitNeg(this, 0xF7FE, 0x01)">L</ui-bit>
						</td>
						<td style="color:var(--vscode-editor-foreground)">Joy2</td>
						<td>
							<ui-bit id="if2.joy2.right" onchange="togglePortBitNeg(this, 0xF7FE, 0x02)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td align="center">
							<ui-bit id="if2.joy2.down" onchange="togglePortBitNeg(this, 0xF7FE, 0x04)">D</ui-bit>
						</td>
					</tr>
				</table>
				</td>
				</tr>
			</table>

			</details>
			`;
	}


	// Add code for the Kempston joystick
	if (kempstonJoy) {
		html += `
			<!-- Kempston Joystick -->
			<details open="true">
			<summary>Kempston Joystick</summary>

			<table>
				<tr>
				<td>
				<table style="color:black;" oncolor="red" offcolor="white" >
					<tr>
						<td>
							<ui-bit id="kempston.joy1.fire" style="border-radius:1em;color:black;" onchange="togglePortBit(this, 0x001F, 0x10)">F</ui-bit>
						</td>
						<td>
							<ui-bit id="kempston.joy1.up" onchange="togglePortBit(this, 0x001F, 0x08)">U</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="kempston.joy1.left" onchange="togglePortBit(this, 0x001F, 0x02)">L</ui-bit>
						</td>
						<td></td>
						<td>
							<ui-bit id="kempston.joy1.right" onchange="togglePortBit(this, 0x001F, 0x01)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td>
							<ui-bit id="kempston.joy1.down" onchange="togglePortBit(this, 0x001F, 0x04)">D</ui-bit>
						</td>
					</tr>
				</table>
				</td>

				</table>
				</td>
				</tr>
			</table>

			</details>
			`;
	}

	// Space for logging
	html += `
		<p id="log"></p>
		`;

	// Custom javascript code area
	if (jsCustomCode) {
		html += `
			<!-- Room for extra/user editable javascript/html code -->
			<p>
				<div id="js_code_id">
				${jsCustomCode}
				</div>
			</p>
			`;
	}

	if (customCodeDebug) {
		html += `
			<!-- Debug Area -->
			<hr>

			<details open="true">
				<summary>Debug Area</summary>
				<button onclick="reloadCustomLogicAndUi()">Reload Custom Logic and UI</button>
				&nbsp;&nbsp;
				<button onclick="copyHtmlToClipboard()">Copy all HTML to clipboard</button>
			</details>
			`;
	}

	document.body.innerHTML = html;

	// Connect visuals with simulation
	connectVisuals(audioSampleRate, volume);
}



/** Connect the visuals with the simulation.
 * @param audioSampleRate In Hz.
 * @param volume Number in range [0;1.0]
 */
function connectVisuals(audioSampleRate: number, volume: number) {

	// Store the cpu_load_id
	const cpuLoad = document.getElementById("cpu_load_id") as HTMLLabelElement;
	if (cpuLoad) {
		setCpuLoadHtmlElement(cpuLoad);
	}

	// Store the visual mem image source
	const visualMemCanvas = document.getElementById("visual_mem_img_id") as HTMLCanvasElement;
	if (visualMemCanvas) {
		// Init both
		VisualMem.initCanvas(visualMemCanvas);
	}

	// Slots
	for (let i = 0; ; i++) {
		const slot = document.getElementById("slot" + i + "_id");
		if (!slot)
			break;
		slots.push(slot);
	}

	// Store the screen image source
	screenImg = document.getElementById("screen_img_id") as HTMLCanvasElement;
	if (screenImg) {
		screenImgContext = screenImg.getContext("2d")!;
		screenImgImgData = screenImgContext.createImageData(UlaScreen.SCREEN_WIDTH, UlaScreen.SCREEN_HEIGHT);
	}

	// Get Beeper output object
	const beeperOutput = document.getElementById("beeper.output");
	if (beeperOutput) {
		// Singleton for audio
		ZxAudioBeeper.createZxAudioBeeper(audioSampleRate, beeperOutput);
		zxAudioBeeper.setVolume(volume);

		// Get Volume slider
		const volumeSlider = document.getElementById("audio.volume") as HTMLInputElement;
		volumeSlider.value = zxAudioBeeper.getVolume().toString();
	}

	// Joysticks (Interface II)
	const if2Joy1Fire = document.getElementById("if2.joy1.fire") as UiBit;
	if (if2Joy1Fire) {
		joystickObjs.push({
			fire: if2Joy1Fire,
			up: document.getElementById("if2.joy1.up") as UiBit,
			left: document.getElementById("if2.joy1.left") as UiBit,
			right: document.getElementById("if2.joy1.right") as UiBit,
			down: document.getElementById("if2.joy1.down") as UiBit
		});
		joystickObjs.push({
			fire: document.getElementById("if2.joy2.fire") as UiBit,
			up: document.getElementById("if2.joy2.up") as UiBit,
			left: document.getElementById("if2.joy2.left") as UiBit,
			right: document.getElementById("if2.joy2.right") as UiBit,
			down: document.getElementById("if2.joy2.down") as UiBit
		});
	}

	// Joystick (Kempston)
	const kempstonJoy1Fire = document.getElementById("kempston.joy1.fire") as UiBit;
	if (kempstonJoy1Fire) {
		joystickObjs.push({
			fire: kempstonJoy1Fire,
			up: document.getElementById("kempston.joy1.up") as UiBit,
			left: document.getElementById("kempston.joy1.left") as UiBit,
			right: document.getElementById("kempston.joy1.right") as UiBit,
			down: document.getElementById("kempston.joy1.down") as UiBit,
		});
	}

	// Stat joystick polling (if joystick is setup)
	initJoystickPolling();

}


// Set the HTML element used for the cpu load.
export function setCpuLoadHtmlElement(elem: HTMLLabelElement) {
	cpuLoad = elem;
}


// Set cell to selected or unselected.
function cellSelect(cell, on) {
	cell.tag = on;
	if (on) {
		cell.className = "td_on";
	}
	else {
		cell.className = "td_off";
	}

	// Send request to vscode
	vscode.postMessage({
		command: 'keyChanged',
		value: on,
		key: cell.id
	});
}


// Toggle the cell.
// @ts-ignore
// TODO: Test if called (zx keyboard)
function cellClicked(cell) {
	cell.tag = !cell.tag;
	cellSelect(cell, cell.tag);
}

// Toggle the cell and the corresponding bit
// @ts-ignore
function togglePortBit(cell, port, bitByte) {
	// Send request to vscode
	vscode.postMessage({
		command: 'portBit',
		value: {port: port, on: cell.bitvalue, bitByte: bitByte}
	});
}

// Toggle the cell and the corresponding bit.
// Inverts the bit before sending.
// I.e. Active=LOW
// @ts-ignore
function togglePortBitNeg(cell, port, bitByte) {
	// Send request to vscode
	vscode.postMessage({
		command: 'portBit',
		value: {port: port, on: !cell.bitvalue, bitByte: bitByte}
	});
}

// Find right cell for keycode.
function findCell(keyCode) {
	// Find correspondent cell
	const cell = document.getElementById("key_" + keyCode);
	return cell;
}


// "Copy all HTML" button-- >

// Copies the complete html of the document to the clipboard.
// @ts-ignore
function copyHtmlToClipboard() {
	const copyText = document.documentElement.innerHTML;
	navigator.clipboard.writeText(copyText);
}


// Reload the javascript business logic.
// @ts-ignore
function reloadCustomLogicAndUi() {
	// Send request to vscode
	vscode.postMessage({
		command: 'reloadCustomLogicAndUi'
	});
}


// Called when the volume was changed by the user.
// @ts-ignore
function volumeChanged(volumeStr: string) {
	// Convert to number
	const volume = parseFloat(volumeStr);
	// Inform beeper
	zxAudioBeeper.setVolume(volume);
	// Inform vscode
	vscode.postMessage({
		command: 'volumeChanged',
		value: volume
	});
}


// Handle key down presses.
document.addEventListener('keydown', keydown);
function keydown(e) {
	// Find correspondent cell
	const cell = findCell(e.code);
	cellSelect(cell, true);
}


// Handle key up presses.
document.addEventListener('keyup', keyup);
function keyup(e) {
	// Find correspondent cell
	const cell = findCell(e.code);
	cellSelect(cell, false);
}
