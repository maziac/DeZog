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
			initSimulation();
			break;

		case 'cpuStopped':
			// Z80 CPU was stopped, t-states do not advance.
			break;

		case 'update':
			if (cpuFreq && message.cpuFreq)
				cpuFreq.innerHTML = message.cpuFreq

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

			if (message.romChars && message.dfile) {
				ZX81UlaScreen.drawUlaScreen(screenImgContext, screenImgImgData, message.dfile, message.romChars);
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
 */
function initSimulation() {

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


// Handle initial load.
window.addEventListener('load', () => {
	// Inform vscode that page was loaded.
	vscode.postMessage({
		command: 'loaded'
	});
});

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("focus", onFocus);
window.addEventListener("blur", onBlur);

function onKeyDown(e) {
	vscode.postMessage({
		command: 'keyChanged',
		value: true,
		key: e.code,
		shift: e.shiftKey
	});
}

function onKeyUp(e) {
	vscode.postMessage({
		command: 'keyChanged',
		value: false,
		key: e.code,
		shift: e.shiftKey
	});
}

function onFocus() {
	const keyboard = document.querySelector(".keyboard");
	if(keyboard) keyboard.classList.add("focus");
}

function onBlur() {
	const keyboard = document.querySelector(".keyboard");
	if(keyboard) keyboard.classList.remove("focus");
}
