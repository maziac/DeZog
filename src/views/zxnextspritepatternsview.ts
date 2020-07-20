import * as util from 'util';
import { Remote } from '../remotes/remotefactory';
import { BaseView } from './baseview';
import {ImageConvert} from '../misc/imageconvert';
import {WebviewPanel} from 'vscode';
import {Utility} from '../misc/utility';
import * as Random from 'rng';
import {Log} from '../log';


/**
 * Constants to be used for the palete selection in the drop down menu.
 */
enum PaletteSelection {
	CURRENT,	///< The palette used in tbblue
	PALETTE_0,		///< The first sprite palette
	PALETTE_1,		///< The second sprite palette
	DEFAULT,	///< The default palette. The index is the color value.
	FALSE_COLORS,	///< A false color palette
};


/**
 * A Webview that shows the ZX Next sprite patterns.
 * The view cannot be edited.
 *
 * The display consists of:
 * - index
 * - Pattern as image
 *
 * The range of the indices can be chosen. Eg. "5 10" or "5 10, 17 2".
 * There exist a checkbox that allows for live update of the patterns and palettes.
 */
export class ZxNextSpritePatternsView extends BaseView {
	// STATIC:

	/// The sprites palette transparent index.
	protected static spritesPaletteTransparentIndex: number;

	/// The sprite patterns, i.e. max 64 patterns each with 256 bytes describing the pattern.
	protected static spritePatterns: Map<number, Array<number>>;


	/// The sprite palettes, first and second sprite palette, but also the
	/// fixed palettes.
	protected static spritePalettes: Map<number, Array<number>>;


	/// The currently selected sprite palette.
	protected static currentPaletteNumber: number;

	/// String that is shown if retrieving was not possible.
	protected retrievingError;


	/**
	 * Initializes the static variables.
	 * Called at launchRequest.
	 */
	public static staticInit() {
		ZxNextSpritePatternsView.currentPaletteNumber=-1;
		ZxNextSpritePatternsView.spritesPaletteTransparentIndex=0;
		ZxNextSpritePatternsView.spritePatterns=new Map<number, Array<number>>();
		ZxNextSpritePatternsView.spritePalettes=new Map<number, Array<number>>();
		// Register for static updates.
		BaseView.staticViewClasses.push(ZxNextSpritePatternsView);
	}


	/**
	 * Static update function. This is called once per update and takes care of the
	 * pattern update. I.e. it removes the patterns if not 'step' update.
	 * Afterwards the dynamic updates are called and might fill it.
	 * @param reason
	 */
	protected static staticUpdate(reason?: any) {
		// Reload current palette number and transparent index on every update.
		ZxNextSpritePatternsView.currentPaletteNumber=-1;
		// Reload patterns and palettes only if not 'step'
		if (!reason||reason.step!=true) {
			// Mark 'dirty'
			ZxNextSpritePatternsView.spritePatterns.clear();
			ZxNextSpritePatternsView.spritePalettes.delete(PaletteSelection.PALETTE_0);
			ZxNextSpritePatternsView.spritePalettes.delete(PaletteSelection.PALETTE_1);
		}
	}


	// DYNAMIC:

	/// The patterns indices to display.
	protected patternIds: Array<number>;

	/// The used background color for the patterns.
	protected usedBckgColor = 0;

	/// The used palette. User selection in drop down menu.
	protected usedPalette = PaletteSelection.CURRENT;

	/// Is true if data is not valie, i.e. if data has not been updated for a 'step'.
	protected patternDataValid = false;

	/// prohibits processing a new message from the web view when the previous is not finally processed yet.
	protected processingWebViewMessage=false;


	/**
	 * Creates the basic panel.
	 * @param parent The parent which may send 'update' notifications.
	 * @param title The title to use for this view.
	 * @param indexRanges Pairs of start index/count..
	 */
	constructor(title: string, indexRanges: Array<number>) {
		super();

		// Create array with slots
		this.patternIds = new Array<number>();
		while(true) {
			const start = indexRanges.shift();
			if(start == undefined)
				break;
			let end = indexRanges.shift() || -1;
			Utility.assert(end >= 0);
			end += start;
			for(let k=start; k<end; k++) {
				if(k > 63)
					break;
				this.patternIds.push(k);
			}
		}

		// Title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as WebviewPanel).title = title;
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 */
	protected webViewMessageReceived(message: any) {
		if (this.processingWebViewMessage)
			return;
		this.processingWebViewMessage=true;
		(async () => {
			switch (message.command) {
				case 'reload':
					ZxNextSpritePatternsView.staticUpdate();
					const views=BaseView.staticGetAllViews(ZxNextSpritePatternsView);
					for (const view of views) {
						await view.update();
					}
					break;
				case 'bckgColor':
					// Save color
					this.usedBckgColor=message.value;
					break;
				case 'palette':
					// Save palette
					this.usedPalette=message.value;
					// Reload only current view, keep already loaded palettes
					ZxNextSpritePatternsView.currentPaletteNumber=-1;
					await this.update();
					break;
				default:
					Utility.assert(false);
					break;
			}
			this.processingWebViewMessage=false;
		})();
	}


	/**
	 * Returns the real palette number (0 or 1) from the
	 * current selected index.
	 * @param selectedIndex The index, e.g. PaletteSelection.PALETTE_1
	 * @returns 0 or 1
	 */
	protected static staticGetPaletteNumberFromSelectedIndex(selectedIndex: PaletteSelection): number {
		let paletteNumber;
		switch(selectedIndex) {
			case PaletteSelection.PALETTE_0:
				paletteNumber = 0;
				break;
			case PaletteSelection.PALETTE_1:
				paletteNumber = 1;
				break;
			case PaletteSelection.CURRENT:
				// Use current palette
				paletteNumber = ZxNextSpritePatternsView.currentPaletteNumber;
				break;
			default:
				Utility.assert(false);
				break;
		}
		return paletteNumber;
	}


	/**
	 * Returns the selected index from the real palette number (0 or 1).
	 * @param paletteNumber 0 or 1.
	 * @returns PaletteSelection.PALETTE_0 or PaletteSelection.PALETTE_1
	 */
	protected static staticGetSelectedIndexFromPaletteNumber(paletteNumber: number): PaletteSelection {
		if(paletteNumber == 0)
			return PaletteSelection.PALETTE_0;
		else {
			Utility.assert(paletteNumber == 1);
			return PaletteSelection.PALETTE_1;
		}
	}


	/**
	 * Returns the palette for a given selected index.
	 * @param selectedIndex The selected ID, e.g. PaletteSelection.PALETTE_1.
	 * @return A palette array. May return undefined if no palette is found.
	 */
	protected static staticGetPaletteForSelectedIndex(selectedIndex: PaletteSelection): any {

		Log.log('ZxNextSpritePatternView::staticGetPaletteForSelectedIndex a, selectedIndex='+selectedIndex+', currentPaletteNumber='+ZxNextSpritePatternsView.currentPaletteNumber);
		let paletteSelection = selectedIndex;
		if(selectedIndex == PaletteSelection.CURRENT) {
			switch(ZxNextSpritePatternsView.currentPaletteNumber) {
				case 0:
					paletteSelection = PaletteSelection.PALETTE_0;
					break;
				case 1:
					paletteSelection = PaletteSelection.PALETTE_1;
					break;
				default:
					Utility.assert(false);
					//paletteSelection=PaletteSelection.PALETTE_0;
					break;
			}
		}

		const palette=ZxNextSpritePatternsView.spritePalettes.get(paletteSelection);
		Log.log('ZxNextSpritePatternView::staticGetPaletteForSelectedIndex b');
		return palette;
	}


	/**
	 * Sets the palette for a given palette number. Converts the palette number
	 * to the selected index.
	 * @param paletteNumber 0 or 1.
	 * @param palette The palette to store.
	 */
	protected static staticSetPaletteForPaletteNumber(paletteNumber: number, palette: Array<number>) {
		let selectedIndex = ZxNextSpritePatternsView.staticGetSelectedIndexFromPaletteNumber(paletteNumber);
		ZxNextSpritePatternsView.spritePalettes.set(selectedIndex, palette);
	}


	/**
	 * Create the default palette.
	 */
	protected createDefaultPalette(): Array<number> {
		// Create default palette
		const defaultPalette = new Array<number>(3*256);
		let k = 0;
		const offs = [0x0, 0x2, 0x5, 0x7, 0x8, 0xA, 0xD, 0xF];
		for(let i=0;i<256; i++) {
		//000 002 005 007 008 00A 00D 00F 010 012 015 017 018 01A 01D 01F 020 022 025 027 028 02A 02D 02F 030 032 035 037 038 03A 03D 03F 040 042 045 047 048 04A 04D 04F 050 052 055 057 058 05A 05D 05F 060 062 065 067 068 06A 06D 06F 070 072 075 077 078 07A 07D 07F 080 082 085 087 088 08A 08D 08F 090 092 095 097 098 09A 09D 09F 0A0 0A2 0A5 0A7 0A8 0AA 0AD 0AF 0B0 0B2 0B5 0B7 0B8 0BA 0BD 0BF 0C0 0C2 0C5 0C7 0C8 0CA 0CD 0CF 0D0 0D2 0D5 0D7 0D8 0DA 0DD 0DF 0E0 0E2 0E5 0E7 0E8 0EA 0ED 0EF 0F0 0F2 0F5 0F7 0F8 0FA 0FD 0FF 100 102 105 107 108 10A 10D 10F 110 112 115 117 118 11A 11D 11F 120 122 125 127 128 12A 12D 12F 130 132 135 137 138 13A 13D 13F 140 142 145 147 148 14A 14D 14F 150 152 155 157 158 15A 15D 15F 160 162 165 167 168 16A 16D 16F 170 172 175 177 178 17A 17D 17F 180 182 185 187 188 18A 18D 18F 190 192 195 197 198 19A 19D 19F 1A0 1A2 1A5 1A7 1A8 1AA 1AD 1AF 1B0 1B2 1B5 1B7 1B8 1BA 1BD 1BF 1C0 1C2 1C5 1C7 1C8 1CA 1CD 1CF 1D0 1D2 1D5 1D7 1D8 1DA 1DD 1DF 1E0 1E2 1E5 1E7 1E8 1EA 1ED 1EF 1F0 1F2 1F5 1F7 1F8 1FA 1FD 1FF
			const j = i % 8;
			const high = (i << 1) & 0xF0;
			const val = high + offs[j];
			defaultPalette[k++] = (val & 0b11100000);
			defaultPalette[k++] = ((val << 3) & 0b11100000);
			defaultPalette[k++] = ((val << 6) & 0b11000000) | ((val >>> 3) & 0b00100000);
		}
		return defaultPalette;
	}


	/**
	 * Create a false color palette. The purpose is to make
	 * sprites/patterns visible (although with false color)
	 * even if the palette is incorrect.
	 */
	protected createFalseColorsPalette(): Array<number> {
		// Create false colors palette
		const falseColorsPalette = new Array<number>(3*256);
		let k=0;
		var rng=new Random.MT(12345);	// Use always teh same seed
		for(let i=0;i<256; i++) {
			falseColorsPalette[k++]=rng.range(0, 255);
			falseColorsPalette[k++]=rng.range(0, 255);
			falseColorsPalette[k++]=rng.range(0, 255);
		}
		return falseColorsPalette;
	}


	/**
	 * First checks which palette is in use, then loads it from the emulator.
	 */
	protected async getSpritesPalette(): Promise<void> {
		if (ZxNextSpritePatternsView.currentPaletteNumber>=0) {
			return;
		}

		// Get the transparent index
		let value = await Remote.getTbblueRegister(75);
		ZxNextSpritePatternsView.spritesPaletteTransparentIndex=value;

		// Get in use palette number
		value=await Remote.getTbblueRegister(0x43);	// ULANextControlRegister
		ZxNextSpritePatternsView.currentPaletteNumber=(value>>>3)&0x01;

		// Check if already existing
		if(ZxNextSpritePatternsView.staticGetPaletteForSelectedIndex(this.usedPalette)) {
			return;
		}

		// Get in use palette number
		///value=await Remote.getTbblueRegister(0x43);	// ULANextControlRegister
		let paletteNumber;
		// Check palette selection and maybe override this number
		const usedPal = this.usedPalette;
		switch(usedPal) {
			case PaletteSelection.DEFAULT:
				// Create default palette
				ZxNextSpritePatternsView.spritePalettes.set(usedPal, this.createDefaultPalette());
				return;
			case PaletteSelection.FALSE_COLORS:
				// Create false colors palette
				ZxNextSpritePatternsView.spritePalettes.set(usedPal, this.createFalseColorsPalette());
				return;
			default:
				paletteNumber = ZxNextSpritePatternsView.staticGetPaletteNumberFromSelectedIndex(usedPal);
				break;
		}
		// Get palette
		const paletteArray=await Remote.getTbblueSpritesPalette(paletteNumber);
		// Convert bits to single numbers
		const loadedPalette = new Array<number>(3*256);
		// 3 colors
		let k = 0;
		for(const color of paletteArray) {
			// Red
			loadedPalette[k++] = color & 0b11100000;
			// Green
			loadedPalette[k++] = (color << 3) & 0b11100000;
			// Blue
			loadedPalette[k++] = ((color << 6) & 0b11000000) + ((color >>> 3) & 0b00100000);
		}
		// Store
		ZxNextSpritePatternsView.staticSetPaletteForPaletteNumber(paletteNumber, loadedPalette);
	}


	/**
	 * Retrieves the sprite patterns from the Remote.
	 * It knows which patterns to request from the loaded sprites.
	 * And it requests only that data that has not been requested before.
	  */
	protected async getSpritePatterns(): Promise<void> {
		// Check if a pattern needs to be requested
		if (this.patternIds.length==0) {
			return;
		}

		const usedIndex=new Array<number>();
		for (const index of this.patternIds) {
			// Check if it exists already
			const pattern=ZxNextSpritePatternsView.spritePatterns.get(index);
			if (!pattern) {
				// Pattern does not exists yet.
				// Get pattern from emulator
				usedIndex.push(index);
				const spritePatterns=await Remote.getTbblueSpritePatterns(index, 1);
				const indexPop=usedIndex.shift()!;
				Utility.assert(indexPop!=undefined);
				if(spritePatterns.length>0)
					ZxNextSpritePatternsView.spritePatterns.set(indexPop, spritePatterns[0]);
			}
		}
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 * If 'step'==true the sprite patterns will not be generally updated for performance reasons.
	 * If 'step' not defined then all required sprite patterns will be retrieved from the
	 * emulator. I.e. if you do a "break" after letting the program run.
	 */
	public async update(reason?: any): Promise<void> {
		try {
			Log.log('ZxNextSpritePatternView::update a');
			// Mark as invalid until pattern have been loaded.
			this.patternDataValid=(!reason||reason.step!=true);

			// TODO: Muss ich verloggen um rauszukriegen wo currentpalette auf -1 gesetzt wird.

			// Load palette if not available
			await this.getSpritesPalette();

			try {
				// Get patterns
				Log.log('ZxNextSpritePatternView::update b');
				await this.getSpritePatterns();
			}
			catch (e) {
				this.retrievingError=e.message;
			};

			Log.log('ZxNextSpritePatternView::update c');

			// Create a new web view html code
			this.setHtml();
			Log.log('ZxNextSpritePatternView::update d');

		}
		catch (e) {
			Remote.emit('warning', e.message);
		};
	}


	/**
	 * Creates the js scripts and the UI elements.
	 */
	protected createScriptsAndButtons(): string {
		const format = `
		<script>

		//----- Does a reload of everything. -----
		function reload() {
			// Send new value for address to vscode
			vscode.postMessage({
				command: 'reload'
			});
		}

		//----- To change the background color of the sprite image -----
		function bckgSelected() {
			// Get color for index
			let color = bckgSelector[bckgSelector.selectedIndex].value;
			// Update sprite patterns backgrounds
			var cells = document.getElementsByClassName("classPattern");
			for(var i=0; i<cells.length; i++) {
				 cells[i].style.background = color;
			}

			// Send request to vscode
			vscode.postMessage({
				command: 'bckgColor',
				value: bckgSelector.selectedIndex
			});
		}

		//----- To change the used palette -----
		function paletteSelected() {
			// Send request to vscode that user selected a new palette.
			// Leads to a complete redraw.
			vscode.postMessage({
				command: 'palette',
				value: paletteSelector.selectedIndex
			});
		}

		</script>

		%s

		<div %s>
		<button onclick="reload()">Reload</button>

		<!-- To change the background color of the sprite pattern -->
		<select id="bckgSelector" onchange="bckgSelected(this);">
			<option value="black">Black Background</option>
			<option value="white">White Background</option>
			<option value="gray">Gray Background</option>
		</select>

		<!-- To change the used palette -->
		<select id="paletteSelector" onchange="paletteSelected(this);">
			<option>Current Palette (%d)</option>
			<option>Sprite Palette 0</option>
			<option>Sprite Palette 1</option>
			<option>Default Palette</option>
			<option>False Colors Palette</option>
		</select>
		</div>

		<br>

		<script>
			// Also select the right index
			var bckgSelector = document.getElementById("bckgSelector");
			bckgSelector.selectedIndex = %d;

			// Set the palette selection
			var paletteSelector = document.getElementById("paletteSelector");
			paletteSelector.selectedIndex = %d;
		</script>
		`;

		const invalid = (this.patternDataValid) ? "" : "*";
		const hidden=(this.retrievingError)? "hidden":"";
		const html=util.format(format, invalid, hidden, ZxNextSpritePatternsView.currentPaletteNumber, this.usedBckgColor, this.usedPalette);
		return html;
	}


	/**
	 * Returns a table cell (td) and inserts the first value.
	 * If first and second value are different then the cell is made bold.
	 * @param currentValue The currentvalue to show.
	 * @param prevValue The previous value.
	 */
	protected getTableTdWithBold(currentValue: any, prevValue: any): string {
		let td = ' <td>';
		td += (currentValue == prevValue) ? currentValue : '<b>' + currentValue + '</b>';
		td += '</td>\n';
		return td;
	}


	/**
	 * Creates several html table out of the sprite pattern data.
	 */
	protected createHtmlTable(): string {
		if (this.retrievingError)
			return '<div>'+this.retrievingError+'</div>';

		// Create a string with the table itself.
		Log.log('ZxNextSpritePatternView::createHtmlTable a');

		let palette = ZxNextSpritePatternsView.staticGetPaletteForSelectedIndex(this.usedPalette);
		Utility.assert(palette);
		let table=`
<style>
	.classPattern {
		width:auto;
		height:2em;
	}
	.classImg {
		image-rendering:pixelated;
		width:auto;
		height:2em;
	}
</style>
`;
		let k = 0;
		let count = this.patternIds.length;
		for(const patternId of this.patternIds) {
			count --;
			let pattern = ZxNextSpritePatternsView.spritePatterns.get(patternId);
			if (!pattern) {
				// Use empty image
				pattern=new Array<number>(16*16);
			}

			// Start of table (note there are several tables next to each other).
			if(k % 16 == 0) {
				table += `<table style="text-align:center; float:left" border="1"
					cellpadding="0">
					<colgroup>
						<col>
						<col>
						<col>
						<col>
					</colgroup>
					<tr>
						<th>Index</th>
						<th>8bit Pattern</th>
						<th>4bit N6=0</th>
						<th>4bit N6=1</th>
					</tr>
				`;
			}

			// The cells
			table += '<tr>\n<td>' + patternId + '</td>\n'

			// Convert 8bit Pattern to base64
			const buf8b=Buffer.from(ImageConvert.createGifFromArray(16, 16, pattern, palette, ZxNextSpritePatternsView.spritesPaletteTransparentIndex));
			const base64String8b=buf8b.toString('base64');
			table+=' <td class="classPattern"><img class="classImg" src="data:image/gif;base64,'+base64String8b+'"></td>\n';

			// Convert 4bit N6=0 Pattern to base64
			const pattern4b0=new Array<number>(256);
			for (let i=0; i<128; i++) {
				const val=pattern[i];
				pattern4b0[2*i]=val>>>4;
				pattern4b0[2*i+1]=val&0x0F;
			}
			const buf4b0=Buffer.from(ImageConvert.createGifFromArray(16, 16, pattern4b0, palette, ZxNextSpritePatternsView.spritesPaletteTransparentIndex&0x0F));
			const base64String4b0=buf4b0.toString('base64');
			table+=' <td class="classPattern"><img class="classImg" src="data:image/gif;base64,'+base64String4b0+'"></td>\n';

			// Convert 4bit N6=1 Pattern to base64
			const pattern4b1=new Array<number>(256);
			for (let i=0; i<128; i++) {
				const val=pattern[128+i];
				pattern4b1[2*i]=val>>>4;
				pattern4b1[2*i+1]=val&0x0F;
			}
			const buf4b1=Buffer.from(ImageConvert.createGifFromArray(16, 16, pattern4b1, palette, ZxNextSpritePatternsView.spritesPaletteTransparentIndex&0x0F));
			const base64String4b1=buf4b1.toString('base64');
			table+=' <td class="classPattern"><img class="classImg" src="data:image/gif;base64,'+base64String4b1+'"></td>\n';

			// End of row
			table+='</tr>\n\n';

			// end of table
			if((k % 16 == 15) || (count == 0)) {
				table += '</table>\n\n';
			}

			// Next
			k ++;
		}


		Log.log('ZxNextSpritePatternView::createHtmlTable b');
		return table;
	}


	/**
	 * Creates the html surrounding the table etc.
	 */
	protected createHtmlSkeleton() {
		const html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<body style="font-family: Courier">

		<script>
			const vscode = acquireVsCodeApi();
		</script>

		%s

		<script>
			// Choose right background color (bckgSelected)
			bckgSelector.onchange(bckgSelector);
		</script>

		</body>

		</html>`;

		return html;
	}


	/**
	* Sets the html code to display the sprite patterns.
	*/
	protected setHtml() {
		if (!this.vscodePanel)
			return;

		const format = this.createHtmlSkeleton();
		// Add content
		const ui = this.createScriptsAndButtons();
		const table = this.createHtmlTable();
		const html = util.format(format, ui + table);
		this.vscodePanel.webview.html = html;
	}
}

