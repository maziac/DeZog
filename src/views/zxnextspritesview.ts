
import * as assert from 'assert';
import { Remote } from '../remotes/remotefactory';
import * as util from 'util';
import { EventEmitter } from 'events';
import { ZxNextSpritePatternsView} from './zxnextspritepatternsview';
import {ImageConvert} from '../imageconvert';



/// Contains the sprite attributes in an converted form.
class SpriteData {
	/// X-Position
	public x = 0;

	/// Y-Position
	public y = 0;

	/// X-Mirroring
	public xMirrored = 0;

	/// Y-Mirroring
	public yMirrored = 0;

	/// Rotated
	public rotated = 0;

	/// Palette offset
	public paletteOffset = 0;

	/// Pattern index
	public patternIndex = 0;

	/// Visible
	public visible = false;

	/// The pngimage created from the pattern.
	public image:  Array<number>;

	/// Constructor
	constructor(attributes: Uint8Array) {
		this.x = attributes[0] + (attributes[2]&0x01)*256;
		this.y = attributes[1];
		this.xMirrored = (attributes[2] & 0b00001000) ? 1 : 0;
		this.yMirrored = (attributes[2] & 0b00000100) ? 1 : 0;
		this.rotated = (attributes[2] & 0b00000010) ? 1 : 0;
		this.paletteOffset = attributes[2] & 0b11110000;
		this.patternIndex = attributes[3] & 0b00111111;
		this.visible = ((attributes[3] & 0b10000000) != 0);
	}

	/**
	 * Creates an image from the givven pattern.
	 * @param pattern 256 bytes, 16x16 pattern.
	 * @param palette 256 bytes, colors: rrrgggbbb
	 * @param transparentIndex The index used for transparency.
	 */
	public createImageFromPattern(pattern: Array<number>, palette: Array<number>, transparentIndex: number) {
		let usedPattern = pattern;
		// Rotate
		if(this.rotated) {
			const np = new Array<number>(256);
			// Mirror
			let k = 0;
			for(let y=0; y<16; y++) {
				for(let x=0; x<16; x++)
					np[x*16+15-y] = usedPattern[k++];
			}
			// Use
			usedPattern = np;
		}
		// X-mirror
		if(this.xMirrored) {
			const np = new Array<number>(256);
			// Mirror
			let k = 0;
			for(let y=0; y<16; y++) {
				for(let x=0; x<16; x++)
					np[k++] = usedPattern[y*16+15-x];
			}
			// Use
			usedPattern = np;
		}
		// Y-mirror
		if(this.yMirrored) {
			const np = new Array<number>(256);
			// Mirror
			let k = 0;
			for(let y=0; y<16; y++) {
				for(let x=0; x<16; x++)
					np[k++] = usedPattern[(15-y)*16+x];
			}
			// Use
			usedPattern = np;
		}

		// Convert to gif
		this.image = ImageConvert.createGifFromArray(16, 16, usedPattern, palette, transparentIndex);
	}
}


/**
 * A Webview that shows the ZX Next sprite slots and the associated pattern with it's palette.
 * The view cannot be edited.
 *
 * The display consists of:
 * - x/y position
 * - Palette offset, mirroring, rotation.
 * - Visibility
 * - Pattern index
 * - Pattern as image
 *
 * The range of the slot indices can be chosen. Eg. "5 10" or "5 10, 17 2".
 * There exist a checkbox that allows for live update of the patterns and palettes.
 * The sprite values themselves are always updated live.
 *
 */
export class ZxNextSpritesView extends ZxNextSpritePatternsView {

	/// Contains the sprite slots to display.
	protected slotIndices: Array<number>;

	/// The sprites, i.e. 64 slots with 4 bytes attributes each
	protected sprites = Array<SpriteData|undefined>(64);

	/// The previous sprites, i.e. the values here are used to check which attribute has changed
	// so it can be printed in bold.
	protected previousSprites = Array<SpriteData|undefined>(64);

	/// Set if sprite clipping enabled.
	protected clippingEnabled = false;

	// Sprite clipping dimensions.
	protected clipXl: number;
	protected clipXr: number;
	protected clipYt: number;
	protected clipYb: number;


	/**
	 * Creates the basic panel.
	 * @param parent The parent which may send 'update' notifications.
	 * @param title The title to use for this view.
	 * @param slotRanges Pairs of start slot/count. If undefined all visible sprites will be chosen (on each update).
	 */
	constructor(parent: EventEmitter, title: string, slotRanges: Array<number>|undefined) {
		super(parent, title, []);

		if(slotRanges) {
			// Create array with slots
			this.slotIndices = new Array<number>();
			while(true) {
				const start = slotRanges.shift();
				if(start == undefined)
					break;
				let end = slotRanges.shift() || 0;
				assert(end>0);
				end += start;
				for(let k=start; k<end; k++) {
					if(k > 63)
						break;
					this.slotIndices.push(k);
				}
			}
		}

		// Title
		this.vscodePanel.title = title;
	}


	/**
	 * Retrieves all sprites info from the emulator.
	 * Then sets the slotIndices accordingly: with only the visible slots.
	 */
	protected async getAllVisibleSprites(): Promise<void> {
		// Get sprites
		const sprites=await Remote.getTbblueSprites(0, 64);
		// Loop over all sprites
		for (let k=0; k<64; k++) {
			const attrs=sprites[k];
			// Check if visible
			let sprite;
			if (attrs[3]&0b10000000)
				sprite=new SpriteData(attrs);
			this.sprites[k]=sprite;
		}
	}


	/**
	 * Retrieves the sprites info from the emulator.
	 * @param slotIndices Array with all the slots to retrieve.
	 */
	protected async getSprites(slotIndices: Array<number>): Promise<void> {
		// Clear all sprites
		for(let k=0; k<64; k++)
			this.sprites[k]=undefined;

		// Loop over all slots
		for (const slot of this.slotIndices) {
			const sprites=await Remote.getTbblueSprites(slot, 1);
			const attrs=sprites[0];
			const sprite=new SpriteData(attrs);
			this.sprites[slot]=sprite;
		}
	}


	/**
	 * Check if clipping window is set.
	 * If YES it also retrieves the sprite clipping coordinates.
	 */
	protected async getSpritesClippingWindow(): Promise<void> {
		// Check if clippping is set (Layer priority)
		const value=await Remote.getTbblueRegister(21);
		this.clippingEnabled=(value&0x02)==0;
		if (!this.clippingEnabled) {
			return;
		}
		// Get clipping
		const clip=await Remote.getTbblueSpritesClippingWindow();
		this.clipXl=clip.xl;
		this.clipXr=clip.xr;
		this.clipYt=clip.yt;
		this.clipYb=clip.yb;
	}


	/**
	 * Retrieves the sprite patterns from the emulator.
	 * It knows which patterns to request from the loaded sprites.
	 * And it requests only that data that has not been requested before.
	 */
	protected async getSpritePatterns(): Promise<void> {
		// Get all unique patterns (do not request the same pattern twice)
		let patternSet = new Set<number>();
		for(const sprite of this.sprites) {
			if(sprite && sprite.visible) {
				const index = sprite.patternIndex;
				patternSet.add(index);
			}
		}
		// Change to array
		this.patternIds = Array.from(patternSet);

		// Call super
		await super.getSpritePatterns();

		// Set the sprite bitmaps according to pattern, palette offset, mirroring and rotation.
		const palette=ZxNextSpritePatternsView.staticGetPaletteForSelectedIndex(this.usedPalette);
		assert(palette);
		for (const sprite of this.sprites) {
			if (!sprite)
				continue;
			const pattern=ZxNextSpritePatternsView.spritePatterns.get(sprite.patternIndex);
			if (pattern) { // Calm the transpiler
				// Get palette with offset
				const offs=sprite.paletteOffset
				let usedPalette;
				if (offs==0)
					usedPalette=palette;
				else {
					const index=3*offs;
					const firstPart=palette.slice(index);
					const secondPart=palette.slice(0, index);
					usedPalette=firstPart;
					usedPalette.push(...secondPart);
				}
				sprite.createImageFromPattern(pattern, usedPalette, ZxNextSpritePatternsView.spritesPaletteTransparentIndex);
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
		// Save previous data
		this.previousSprites = this.sprites;
		this.sprites = new Array<SpriteData|undefined>(64);

		// Check if all visible sprites should be shown automatically
		if(this.slotIndices) {
			// Reload sprites given by user
			await this.getSprites(this.slotIndices);
		}
		else {
			// Get all sprites to check which are visible
			await this.getAllVisibleSprites();
		}

		// Get clipping window
		await this.getSpritesClippingWindow();

		// Call super
		await super.update(reason);
	}


	/**
	 * Creates the js scripts and the UI elements.
	 */
	protected createScriptsAndButtons(): string {
		let html = super.createScriptsAndButtons();
		html +=  `
		<script>
			var zxBorderColor;
			var zxScreenBckgColor;
			var zxScreenFgColor;

			//----- To change also the background color of the screen -----
			function spriteBckgSelected() {
				// First call general function
				bckgSelected();

				// Set colors in canvas
				let selectedId = bckgSelector.selectedIndex;
				let color = bckgSelector.options[selectedId].value;
				zxScreenBckgColor = color;
				if(color == "black") {
					zxBorderColor = "gray";
					zxScreenFgColor = "white";
				}
				else if(color == "white") {
					zxBorderColor = "gray";
					zxScreenFgColor = "black";
				}
				else if(color == "gray") {
					zxBorderColor = "lightgray";
					zxScreenFgColor = "black";
				}
				drawScreen();
			}


			// Change the function called when the background dropdown is chosen.
			bckgSelector.onchange = spriteBckgSelected;
		</script>
		`;

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
	 * Creates one html table out of the sprites data.
	 */
	protected createHtmlTable(): string {
		const format = `
		<table  style="text-align: center" border="1" cellpadding="0">
			<colgroup>
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			<col width="35em">
			</colgroup>

          <tr>
			<th>Slot</th>
			<th>X</th>
			<th>Y</th>
			<th>Image</th>
			<th>X-M.</th>
			<th>Y-M.</th>
			<th>Rot.</th>
			<th>Pal.</th>
			<th>Pattern</th>
		  </tr>

%s

		</table>

		`;

		// Create a string with the table itself.
		let table = '';
		for(let k=0; k<64; k++) {
			const sprite = this.sprites[k];
			if(!sprite)
				continue;
			const prevSprite = this.previousSprites[k];
			table += '<tr">\n'
			table += ' <td>' + k + '</td>\n'
			if(sprite.visible) {
				table += this.getTableTdWithBold(sprite.x, (prevSprite) ? prevSprite.x : -1);
				table += this.getTableTdWithBold(sprite.y, (prevSprite) ? prevSprite.y : -1);
				// Sprite image - convert to base64
				const buf = Buffer.from(sprite.image);
				const base64String = buf.toString('base64');
				table += ' <td class="classPattern"><img src="data:image/gif;base64,' + base64String + '"></td>\n'
				// Attributes
				table += this.getTableTdWithBold(sprite.xMirrored, (prevSprite) ? prevSprite.xMirrored : -1);
				table += this.getTableTdWithBold(sprite.yMirrored, (prevSprite) ? prevSprite.yMirrored : -1);
				table += this.getTableTdWithBold(sprite.rotated, (prevSprite) ? prevSprite.rotated : -1);
				table += this.getTableTdWithBold(sprite.paletteOffset, (prevSprite) ? prevSprite.paletteOffset : -1);
				table += this.getTableTdWithBold(sprite.patternIndex, (prevSprite) ? prevSprite.patternIndex : -1);
			}
			else {
				// Invisible
				table += ' <td> - </td>\n <td> - </td>\n <td> - </td>\n <td> - </td>\n <td> - </td>\n <td> - </td>\n <td> - </td>\n <td> - </td>\n'
			}
			table += '</tr>\n\n';
		}

		const html = util.format(format, table);
		return html;
	}


	/**
	 * Creates one html canvas to display the sprites on the "screen".
	 * The screen also shows the border and the clipping rectangle.
	 * Additionally alls sprites are drawn into together with their slot index.
	 */
	protected createHtmlCanvas(): string {
		const format = `
		<canvas id="screen" width="320px" height="256px" style="border:1px solid #c3c3c3;">

		<script>
			function drawScreen() {
				var canvas = document.getElementById("screen");
				var ctx = canvas.getContext("2d");

				ctx.clearRect(0, 0, canvas.width, canvas.height);

				ctx.imageSmoothingEnabled = false;
				ctx.lineWidth=1;
				ctx.translate(0.5, 0.5);

				ctx.fillStyle = zxBorderColor;
				ctx.fillRect(0,0,320,256);
				ctx.fillStyle = zxScreenBckgColor;
				ctx.fillRect(32,32,320-2*32,256-2*32);

%s

				ctx.strokeStyle = zxScreenFgColor;
				ctx.fillStyle = zxScreenFgColor;

%s

			}
		</script>
`;

		// Html text for clipping
		let clipHtml = '';
		if(this.clippingEnabled) {
			clipHtml += 'ctx.beginPath();\n';
			clipHtml += 'ctx.strokeStyle = "red";\n';
			clipHtml += util.format('ctx.rect(%d,%d,%d,%d);\n', this.clipXl+32, this.clipYt+32, this.clipXr-this.clipXl+1, this.clipYb-this.clipYt+1);
			clipHtml += 'ctx.closePath();\n';
			clipHtml += 'ctx.stroke();\n\n';
		}

		// Create the sprites
		let spritesHtml = 'ctx.beginPath();\n';
		for(let k=0; k<64; k++) {
			const sprite = this.sprites[k];
			if(!sprite)
				continue;
			if(!sprite.visible)
				continue;
			// Surrounding rectangle
			spritesHtml += util.format("ctx.rect(%d,%d,%d,%d);\n", sprite.x, sprite.y, 16, 16);
			// The slot index
			spritesHtml += util.format('ctx.fillText("%d",%d,%d);\n', k, sprite.x+16+2, sprite.y+16);
			// The image
			const buf = Buffer.from(sprite.image);
			const base64String = buf.toString('base64');
			spritesHtml += util.format('var img%d = new Image();\n', k);
			spritesHtml += util.format('img%d.onload = function() { ctx.drawImage(img%d,%d,%d); };\n', k, k, sprite.x, sprite.y);
			spritesHtml += util.format('img%d.src = "data:image/gif;base64,%s";\n', k, base64String);
		}
		spritesHtml += 'ctx.closePath();\n';
		spritesHtml += 'ctx.stroke();\n\n';

		// Put everything together
		const html = util.format(format,
			clipHtml,
			spritesHtml,
			this.usedBckgColor);
		return html;
	}


	/**
	 * Sets the html code to display the sprites.
	 */
	protected setHtml() {
		const format = this.createHtmlSkeleton();

		// Add content
		const ui = this.createScriptsAndButtons();
		const table = this.createHtmlTable();
		const canvas = this.createHtmlCanvas();
		const content = ui + table + '\n<p style="margin-bottom:3em;"></p>\n\n' + canvas;
		const html = util.format(format, content);
		this.vscodePanel.webview.html = html;
	}

}

