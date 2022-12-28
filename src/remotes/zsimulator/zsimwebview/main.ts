
import {vscode} from "./vscode-import";
import {ZxAudioBeeper, zxAudioBeeper} from "./zxaudiobeeper";
import {UlaScreen} from "./ulascreen";
import {VisualMem} from "./visualmem";
import {joystickObjs, initJoystickPolling} from "./joysticks";
import {UIAPI, UiBit} from "./helper";
import {MemorySlotsVar} from "../../../variables/shallowvar";
import Settings from "fast-glob/out/settings";

// Make sure that it is not removed by optimization.
joystickObjs;
initJoystickPolling;


// HTML element used for the cpu load.
export let cpuLoad: HTMLLabelElement


/*
declare let slots: Array<HTMLDivElement>;
declare let screenImgContext: CanvasRenderingContext2D;
declare let screenImgImgData: ImageData;
declare let screenImg: HTMLDivElement;
*/


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
 * @param audioSampleRate In Hz.
 * @param volume Number in range [0;1.0]
 */
export function initSimulation(audioSampleRate: number, volume: number) {
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
	const joy1Fire = document.getElementById("if2.joy1.fire") as UiBit;
	if (joy1Fire) {
		joystickObjs.push({
			fire: joy1Fire,
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


