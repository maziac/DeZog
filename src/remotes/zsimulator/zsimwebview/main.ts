import {ZxAudioBeeper} from "./zxaudiobeeper";

declare let acquireVsCodeApi: any;
declare let cpuLoad: HTMLLabelElement;
declare let slots: Array<HTMLDivElement>;
declare let visualMem: HTMLCanvasElement;
declare let screenImgContext: CanvasRenderingContext2D;
declare let screenImgImgData: ImageData;
declare let screenImg: HTMLDivElement;
declare let UIAPI: CustomUiApi;
// @ts-ignore
declare let zxAudioBeeper: ZxAudioBeeper;


let countOfProcessedMessages = 0;

const vscode = acquireVsCodeApi();

// Pointer to the joystick html elements
// @ts-ignore
const joystickObjs = new Array<{
	fire: UiBit,
	up: UiBit,
	left: UiBit,
	right: UiBit,
	down: UiBit
}>();


// Message water marks.
// @ts-ignore
const MESSAGE_HIGH_WATERMARK = 100;
const MESSAGE_LOW_WATERMARK = 10;



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
					VisualMem.drawVisualMemory(visualMem, message.visualMem);
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


