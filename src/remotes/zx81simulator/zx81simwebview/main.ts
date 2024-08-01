import { UIAPI } from "../../zsimulator/zsimwebview/helper";
import { VisualMem } from "../../zsimulator/zsimwebview/visualmem";
import { vscode } from "../../zsimulator/zsimwebview/vscode-import";
import { ZX81UlaScreen } from "./zx81ulascreen";


// HTML element used for the cpu frequency.
let cpuFreq: HTMLLabelElement

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
		case 'init':
			// Configuration received. Is received once after 'configRequest' was sent.
			// Is only done once after loading.
			initSimulation(message.audioSampleRate, message.volume);
			break;

		case 'cpuStopped':
			// Z80 CPU was stopped, t-states do not advance.
			break;

		case 'update':
			if (message.cpuFreq) {
				cpuFreq.innerHTML = message.cpuFreq
			}

			if (cpuLoad && message.cpuLoad)
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
				ZX81UlaScreen.drawUlaScreen(screenImgContext, screenImgImgData, data, time);
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
 * @param audioSampleRate In Hz.
 * @param volume Number in range [0;1.0]
 */
function initSimulation(audioSampleRate: number, volume: number) {

	// Store the cpu_freq_id
	cpuFreq = document.getElementById("cpu_freq_id") as HTMLLabelElement;

	// Store the cpu_load_id
	cpuLoad = document.getElementById("cpu_load_id") as HTMLLabelElement;

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
		screenImgImgData = screenImgContext.createImageData(ZX81UlaScreen.SCREEN_WIDTH, ZX81UlaScreen.SCREEN_HEIGHT);
	}
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
globalThis.cellClicked = function (cell) {
	cell.tag = !cell.tag;
	cellSelect(cell, cell.tag);
}

// Toggle the cell and the corresponding bit
globalThis.togglePortBit = function (cell, port, bitByte) {
	// Send request to vscode
	vscode.postMessage({
		command: 'portBit',
		value: {port: port, on: cell.bitvalue, bitByte: bitByte}
	});
}

// Toggle the cell and the corresponding bit.
// Inverts the bit before sending.
// I.e. Active=LOW
globalThis.togglePortBitNeg = function (cell, port, bitByte) {
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
globalThis.copyHtmlToClipboard = function () {
	const copyText = document.documentElement.innerHTML;
	(async () => {
		await navigator.clipboard.writeText(copyText);
	})();
}


// Reload the javascript business logic.
globalThis.reloadCustomLogicAndUi = function () {
	// Send request to vscode
	vscode.postMessage({
		command: 'reloadCustomLogicAndUi'
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


// Handle initial load.
window.addEventListener('load', () => {
	// Inform vscode that page was loaded.
	vscode.postMessage({
		command: 'loaded'
	});
});
