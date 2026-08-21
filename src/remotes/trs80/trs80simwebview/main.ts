import {vscode} from './vscode-import';
// Deep imports so the browser bundle only contains the screen renderer,
// not the whole emulator (ROM blobs etc.).
import {CanvasScreen} from 'trs80-emulator/dist/CanvasScreen.js';
import {Config, ModelType} from 'trs80-emulator/dist/Config.js';


// The TRS-80 canvas screen (Kesteloot renderer with authentic fonts).
let screen: CanvasScreen;

// Remembered mode flags to only update on change.
let prevExpanded = false;
let prevAlternate = false;


/** Creates the canvas screen and appends it to the container. */
function initScreen(model: number) {
	const container = document.getElementById('trs80_screen_container')!;
	container.innerHTML = '';
	screen = new CanvasScreen(1.5);
	const config = Config.makeDefault()
		.withModelType((model === 3) ? ModelType.MODEL3 : ModelType.MODEL1);
	screen.setConfig(config);
	container.appendChild(screen.getNode());
}


//---- Handle messages from the vscode extension ----
window.addEventListener('message', event => {	// NOSONAR
	const message = event.data;

	switch (message.command) {
		case 'init':
			initScreen(message.model);
			break;

		case 'updateScreen': {
			if (!screen)
				initScreen(1);
			const chars: number[] = message.chars;
			for (let i = 0; i < chars.length; i++)
				screen.writeChar(0x3C00 + i, chars[i]);
			if (message.expanded !== prevExpanded) {
				prevExpanded = message.expanded;
				screen.setExpandedCharacters(prevExpanded);
			}
			if (message.alternate !== prevAlternate) {
				prevAlternate = message.alternate;
				screen.setAlternateCharacters(prevAlternate);
			}
			break;
		}

		default:
			break;
	}
});


//---- Keyboard: forward key events to the emulated keyboard ----
function sendKey(event: KeyboardEvent, on: boolean) {
	// Let vscode shortcuts (Ctrl/Cmd combinations) pass through.
	if (event.ctrlKey || event.metaKey)
		return;
	vscode.postMessage({
		command: 'keyChanged',
		key: event.key,
		on
	});
	event.preventDefault();
}

window.addEventListener('keydown', event => sendKey(event, true));
window.addEventListener('keyup', event => sendKey(event, false));

// When the panel loses focus the keyup events are lost — tell the
// extension to release everything so no key sticks pressed.
window.addEventListener('blur', () => {
	vscode.postMessage({command: 'allKeysUp'});
});


//---- Handshake: inform the extension that the DOM is ready ----
window.addEventListener('load', () => {
	vscode.postMessage({command: 'loaded'});
});
