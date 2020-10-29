
import { Remote } from '../remotes/remotefactory';
import * as util from 'util';
import { ZxNextSpritePatternsView} from './zxnextspritepatternsview';
import {ImageConvert} from '../misc/imageconvert';
import {WebviewPanel} from 'vscode';
import {Utility} from '../misc/utility';


/// Max. number of sprites.
const MAX_COUNT_SPRITES=128;


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
	public visible=false;

	/// Only for relative sprites:
	/// 1 = Palette offset is relative to anchor's palette index.
	/// 0 = Palette offset is absolute.
	public PR: number=0;

	/// 8bit or 4bit color pattern.
	/// undefined=8bit
	/// 1 = N6 is 1
	/// 0 = N6 is 0
	public N6: number|undefined=undefined;

	// If the sprite is an anchor sprite. T contains information
	// if the following sprites are composite (0) or unified (1).
	// undefined if relative sprite.
	public T: number|undefined = undefined;

	// Palette offset is relative (1) for relative sprites.
	// undefined for anchor sprites.
	public PO: number|undefined=undefined;

	/// Anchor sprite. If available it is a relative sprite.
	public anchorSprite?: SpriteData;

	/// The index of the anchor sprite.
	public anchorSpriteIndex=-1;

	/// X/Y magnification, 1x, 2x, 4x, 8x
	/// 0=use the anchor magnification (unified sprites)
	public xMagnification=1;
	public yMagnification=1;

	/// The pngimage created from the pattern.
	public image:  Array<number>;


	/**
	 * Constructor.
	 * The values stored here are the values from the sprite itself.
	 * I.e. for relative sprites they are not adjusted by the anchor
	 * sprites values.
	 * The not adjusted values are displayed in the columns.
	 * To get the adjusted values use the 'getAbs...' functions.
	 * These are the ones used by the screen display.
	 * Also the image (sprite patterns uses the adjusted values. I.e.
	 * a relative sprite's image in the column is adjusted by all the
	 * anchor's values (e.g. mirroring/rotating). So that it is easier
	 * to visualize and see if the sprite is correct.
	 * @param attributes 4-5 bytes attributes
	 * @param anchorSprite The last anchor sprite. If attributes are from a
	 * relative sprite a few info is taken from the last anchor sprite.
	 * @param anchorSpriteIndex The index of the anchor sprite.
	 */
	constructor(attributes: Uint8Array, anchorSprite: SpriteData, anchorSpriteIndex: number) {
		this.x=attributes[0];
		this.y = attributes[1];
		this.xMirrored = (attributes[2] & 0b0000_1000) ? 1 : 0;
		this.yMirrored = (attributes[2] & 0b0000_0100) ? 1 : 0;
		this.rotated=(attributes[2]&0b0000_0010)? 1:0;
		this.paletteOffset=attributes[2]&0b1111_0000;
		this.PR=attributes[2]&0b0000_0001;
		this.patternIndex = attributes[3] & 0b0011_1111;
		this.visible=((attributes[3]&0b1000_0000)!=0);
		// Handle Attribute[4]: Anchor sprites + 4bit sprites.
		if (attributes.length>4) {
			const attr4=attributes[4];

			// Magnification, 00b=1x, 01b=2x, 10b=4x, 11b=8x
			const xPow=(attr4&0b0001_1000)>>>3;
			this.xMagnification=2**xPow;
			const yPow=(attr4&0b0000_0110)>>>1;
			this.yMagnification=2**yPow;

			const relativeSprite=((attr4&0b1100_0000)==0b0100_0000);
			if (relativeSprite) {
				Utility.assert(anchorSprite);

				// Relative sprite
				this.anchorSprite=anchorSprite;
				this.anchorSpriteIndex=anchorSpriteIndex;
				if (this.anchorSprite.N6!=undefined)
					this.N6=(attr4&0b0010_0000)>>>5;	// N6
				this.PO=attr4&0b0000_0001;	// PO=Pattern offset is relative

				// Use relative x/y coordinate
				if (this.x>=128)
					this.x-=256;
				if (this.y>=128)
					this.y-=256;

				// Composite sprites:
				// Use following info from anchor:
				// visible, x, y, paletteOffset, patternIndex, N6

				// Unified sprites:
				// Additionally following info is used from anchor:
				// x/yMirrored, rotated, x/yMagnification
				// T is left undefined to indicate a relative sprite.
			}
			else {
				// Anchor sprite (normal)
				if (attr4&0b1000_0000)
					this.N6=(attr4&0b0100_0000)>>>6;	// N6
				this.T=(attr4&0b0010_0000)>>>5;	// Anchor for composite or unified sprites
				// 9bit y-position
				this.x+=(attributes[2]&0x01)*256;
				this.y+=(attr4&0x01)*256;
			}
		}
	}


	/**
	 * Returns the absolute pattern index.
	 * I.e. relative sprites will add the anchor's sprite index
	 * to the pattern index.
	 * Other sprites just return the pattern index.
	 */
	public getAbsPatternIndex(): number {
		let patternIndex=this.patternIndex;
		if (this.PO==1) {
			const anchor=this.anchorSprite!;
			patternIndex+=anchor.patternIndex;
			// Take also the N6 into account
			let N6=anchor.N6;
			if (N6) {
				N6+=this.N6!;
				if (N6>1)	// Overflow?
					patternIndex++;
			}
			patternIndex&=0x3F;
		}
		return patternIndex;
	}


	/**
	 * Returns N6 or for relative sprites the N6 + the anchor's N6.
	 * @returns 0, 1, 2. undefined for 8bit pattern.
	 */
	public getAbsN6(): number|undefined {
		let N6=this.N6!;
		if (this.PO==1) {
			const anchor=this.anchorSprite!;
			// Take the N6 into account
			if (anchor.N6) {
				N6+=anchor.N6;
			}
		}
		return N6;
	}


	/**
	 * Returns the absolute palette index.
	 */
	public getAbsPaletteOffset(): number {
		let paletteOffset=this.paletteOffset;
		if (this.anchorSprite && this.PR!=0) {
			paletteOffset+=this.anchorSprite!.paletteOffset;
			paletteOffset&=0xFF;
		}
		return paletteOffset;
	}


	/**
	 * Returns the absolute x/y value and the scale.
	 * Takes the anchor into account for composite/unified sprites.
	 */
	public getAbsXYScale(): {x: number, y: number, scaleX: number, scaleY: number} {
		// Get sprite attributes
		let x=this.x;
		let y=this.y;
		let scaleX=this.xMagnification;
		let scaleY=this.yMagnification;
		//let rotated=this.rotated;
		//let xMirrored=this.xMirrored;
		//let yMirrored=this.yMirrored;

		// Check if it is a unified relative sprite
		const anchorSprite=this.anchorSprite;
		if (anchorSprite) {
			if (anchorSprite.T==1) {
				// Unified sprite
				scaleX=anchorSprite.xMagnification;
				scaleY=anchorSprite.yMagnification;
				if (anchorSprite.rotated) {
					const old_x=x;
					x=-y;
					y=old_x;
					//const oldX=xMirrored;
					//xMirrored=rotated^yMirrored;
					//yMirrored=rotated^oldX;
					//rotated^=0x01;
				}
				if (anchorSprite.xMirrored) {
					//xMirrored^=0x01;
					x=-x;
				}
				if (anchorSprite.yMirrored) {
					//yMirrored^=0x01;
					y=-y;
				}
				x*=scaleX;
				y*=scaleY;
			}
			// Update final relative coordinates, also for composite sprite
			x+=anchorSprite.x;
			y+=anchorSprite.y;
		}

		// -127 .. +384 (cover 8x)
		if (512-128<x)
			x-=512;
		if (512-128<y)
			y-=512;

		return {x, y, scaleX, scaleY};
	}


	/**
	 * Returns the type as string.
	 */
	public getTypeString() {
		if (this.T == undefined) {
			return "Relative";
		}
		else {
			if(this.T==0)
				return "Composite";
			else
				return "Unified"
		}
	}

	/**
	 * Returns the type as string.
	 */
	public getAnchorIndexString() {
		if (this.anchorSpriteIndex<0) {
			// No relative sprite (or no anchor found)
			return "-";
		}
		return this.anchorSpriteIndex.toString();
	}


	/**
	 * Returns the X-magnification as string.
	 */
	public getXScaleString() {
		if (this.T==undefined) {
			// Relative
			if (this.anchorSprite) {
				if (this.anchorSprite.T==1)
					return "-";	 // Unified
			}
			else
				return "?";	// No anchor given
		}
		// Anchor or Unified (relative)
		return this.xMagnification.toString()+'x';
	}

	/**
	 * Returns the X-magnification as string.
	 */
	public getYScaleString() {
		if (this.T==undefined) {
			// Relative
			if (this.anchorSprite) {
				if (this.anchorSprite.T==1)
					return "-";	 // Unified
			}
			else
				return "?";	// No anchor given
		}
		// Anchor or Unified (relative)
		return this.yMagnification.toString()+'x';
	}


	/**
	 * Returns the palette offset in hex.
	 */
	public getPaletteOffsetString() {
		const hex=Utility.getHexString(this.paletteOffset, 2)+'h';
		return hex;
	}


	/**
	 * Returns if a relative palette index should be used.
	 */
	public getPoString() {
		if (this.T==undefined) {
			// Relative
			return this.PO!.toString();
		}
		// Anchor
		return "-";
	}


	/**
	 * Returns the value of N6.
	 * Undefined for 8bit patterns
	 */
	public getN6String() {
		if (this.N6==undefined) {
			// 8Bit
			return "-";
		}
		// Value
		return this.N6!.toString();
	}


	/**
	 * Creates an image from the given pattern.
	 * @param pattern 256 bytes, 16x16 pattern.
	 * @param palette 256 bytes, colors: rrrgggbbb
	 * @param transparentIndex The index used for transparency.
	 */
	public createImageFromPattern(pattern: Array<number>, palette: Array<number>, transparentIndex: number) {
		let usedPattern=pattern;
		// If 4bit color pattern change to use 1 byte per color
		const N6=this.getAbsN6();	// N6=0, 1 or 2
		if (N6!=undefined) {
			transparentIndex&=0x0F;
			const offset=(N6&0x01)*128;	// 0 or 128
			const np=new Array<number>(256);
			for (let i=0; i<128; i++) {
				const val=usedPattern[i+offset];
				np[2*i]=val>>>4;
				np[2*i+1]=val&0x0F;
			}
			// Use
			usedPattern=np;
		}

		// Get sprite attributes
		//let scaleX=this.xMagnification;
		//let scaleY=this.yMagnification;
		let rotated=this.rotated;
		let xMirrored=this.xMirrored;
		let yMirrored=this.yMirrored;

		// Check if it is a unified relative sprite
		const anchorSprite=this.anchorSprite;
		if (anchorSprite?.T==1) {
			// Unified sprite
			//scaleX=anchorSprite.xMagnification;
			//scaleY=anchorSprite.yMagnification;
			if (anchorSprite.rotated) {
//				const old_x=sprite_x;
//				sprite_x=-sprite_y;
//				sprite_y=old_x;
				const oldX=xMirrored;
				xMirrored=rotated^yMirrored;
				yMirrored=rotated ^oldX;
				rotated^=0x01;
			}
			if (anchorSprite.xMirrored) {
				xMirrored^=0x01;
//				sprite_x=-sprite_x;
			}
			if (anchorSprite.yMirrored) {
				yMirrored^=0x01;
//				sprite_y=-sprite_y;
			}
//			sprite_x<<=scaleX;
//			sprite_y<<=scaleY;
		}
		// update final relative coordinates
//		sprite_x+=anchor.x;
//		sprite_y+=anchor.y;

		// Rotate
		if (rotated) {
			const np=new Array<number>(256);
			// Mirror
			let k=0;
			for (let y=0; y<16; y++) {
				for (let x=0; x<16; x++)
					np[x*16+15-y]=usedPattern[k++];
			}
			// Use
			usedPattern=np;
		}
		// X-mirror
		if(xMirrored) {
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
		if(yMirrored) {
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

	// An ordered list of this.slotIndices. The order is important
	// (priorities) when drawing.
	protected orderedSlotIndices: Array<number>;

	/// The sprites, i.e. 128 slots with 4-5 bytes attributes each
	protected sprites = Array<SpriteData|undefined>(MAX_COUNT_SPRITES);

	/// The start index and last index (excluding) of sprites to retrieve.
	//protected spriteStartIndex: number;
	protected spriteLastIndex: number;

	/// The previous sprites, i.e. the values here are used to check which attribute has changed
	// so it can be printed in bold.
	protected previousSprites = Array<SpriteData|undefined>(MAX_COUNT_SPRITES);

	// Sprite clipping dimensions.
	protected clipXl: number;
	protected clipXr: number;
	protected clipYt: number;
	protected clipYb: number;

	// Sprites control byte (Next register 0x15), e.g. sprite order priority bit 6
	protected control: number;

	/// true if only visible sprites should be shown.
	protected showOnlyVisible: boolean;


	/**
	 * Creates the basic panel.
	 * @param title The title to use for this view.
	 * @param slotRanges Pairs of start slot/count. If undefined all visible sprites will be chosen (on each update).
	 */
	constructor(title: string, slotRanges: Array<number>|undefined) {
		super(title, []);

		this.control=0;

		if (slotRanges) {
			this.showOnlyVisible=false;
			// Create array with slots
			this.slotIndices=new Array<number>();
			while (true) {
				const start=slotRanges.shift();
				if (start==undefined)
					break;
				let end=slotRanges.shift()||0;
				Utility.assert(end>0);
				end+=start;
				for (let k=start; k<end; k++) {
					if (k>=MAX_COUNT_SPRITES)
						break;
					this.slotIndices.push(k);
				}
			}
			// Get max. slot
			let max=-1;
			//let min=MAX_COUNT_SPRITES;
			for (const k of this.slotIndices) {
				if (k>max)
					max=k;
				//if (k<min)
				//	min=k;
			}
			this.spriteLastIndex=max;
			//this.spriteStartIndex=-min;	// Unknown at the moment, therefore negative
			// Order the slot list for drawing
			this.orderedSlotIndices=this.slotIndices.sort((n1, n2) => n1-n2);
		}
		else {
			this.showOnlyVisible=true;
			this.spriteLastIndex=MAX_COUNT_SPRITES-1;
			//this.spriteStartIndex=0;
			this.slotIndices=new Array<number>(MAX_COUNT_SPRITES);
			this.orderedSlotIndices=new Array<number>(MAX_COUNT_SPRITES);
			for (let i=0; i<MAX_COUNT_SPRITES; i++) {
				this.slotIndices[i]=i;
				this.orderedSlotIndices[i]=i;
			}
		}

		// Title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as WebviewPanel).title = title;
	}


	/**
	 * Retrieves the sprites info from the Remote.
	 * @param slotIndices Array with all the slots to retrieve.
	 */
	protected async getSprites(): Promise<void> {
		// Get sprites. This always starts at 0 because
		// there might be relative sprites where we need to get
		// the anchor for (and the anchor might not be given)
		let index=0;
		const spriteCount=this.spriteLastIndex+1-index;
		const sprites=await Remote.getTbblueSprites(index, spriteCount);
		let lastAnchorSprite = new SpriteData(new Uint8Array(5), undefined as any, -1);
		let lastAnchorSpriteIndex=-1;
		for (const attrs of sprites) {
			// Create sprite
			const sprite=new SpriteData(attrs, lastAnchorSprite, lastAnchorSpriteIndex);
			this.sprites[index]=sprite;
			// Remember last anchor
			if (sprite.T!=undefined) {
				lastAnchorSprite=sprite;
				lastAnchorSpriteIndex=index;
			}
			// Next
			index++;
		}
		/* The next time this value might have been changed, so this is useless:
		// Find first required sprite, if not done before
		if (this.spriteStartIndex<0) {
			const reqIndex=-this.spriteStartIndex;	// Is negative the first time
			// Go backwards through list to find the first anchor sprite.
			let k=reqIndex;
			for (; k>=0; k--) {
				const sprite=this.sprites[k];
				if (sprite!.T!=undefined) {
					// anchor sprite
					break;
				}
			}
			this.spriteStartIndex=k;
		}
		*/
	}


	/**
	 * Check if clipping window is set.
	 * If YES it also retrieves the sprite clipping coordinates.
	 */
	protected async getSpritesClippingWindow(): Promise<void> {
		// Get clipping
		const clip=await Remote.getTbblueSpritesClippingWindow();
		this.clipXl=clip.xl;
		this.clipXr=clip.xr;
		this.clipYt=clip.yt;
		this.clipYb=clip.yb;
		this.control=clip.control;
		// Adjust the clipping coordinates according control byte
		if (this.control&0b0000_0010) { // over border
			this.clipXl=2*this.clipXl-32;
			this.clipXr=2*this.clipXr-32;
			this.clipYt-=32;
			this.clipYb-=32;
		}
	}


	/**
	 * Retrieves the sprite patterns from the emulator.
	 * It knows which patterns to request from the loaded sprites.
	 * And it requests only that data that has not been requested before.
	 */
	protected async getSpritePatterns(): Promise<void> {
		// Get all unique patterns (do not request the same pattern twice)
		const onlyVisible=this.showOnlyVisible;
		let patternSet = new Set<number>();
		for (const sprite of this.sprites) {
			if (!sprite)
				continue;
			// Check if visible
			if (onlyVisible&&!sprite.visible)
				continue;
			// Get pattern
			const index=sprite.getAbsPatternIndex();
			patternSet.add(index);
		}
		// Change to array
		this.patternIds = Array.from(patternSet);

		// Call super
		await super.getSpritePatterns();

		// Set the sprite bitmaps according to pattern, palette offset, mirroring and rotation.
		const palette=ZxNextSpritePatternsView.staticGetPaletteForSelectedIndex(this.usedPalette);
		Utility.assert(palette);
		for (const sprite of this.sprites) {
			if (!sprite)
				continue;
			// Check if visible
			if (onlyVisible&&!sprite.visible)
				continue;
			const pattern=ZxNextSpritePatternsView.spritePatterns.get(sprite.getAbsPatternIndex())!;
			Utility.assert(pattern);
			// Get palette with offset
			const offs=sprite.getAbsPaletteOffset();	// 16-240
			let usedPalette;
			if (offs==0)
				usedPalette=palette;
			else {
				// Rotate palette instead of adding something to each pixel
				const index=3*offs;	// 3 colors per index
				const firstPart=palette.slice(index);
				const secondPart=palette.slice(0, index);
				usedPalette=firstPart;
				usedPalette.push(...secondPart);
			}
			sprite.createImageFromPattern(pattern, usedPalette, ZxNextSpritePatternsView.spritesPaletteTransparentIndex);
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
			// Save previous data
			this.previousSprites=this.sprites;
			this.sprites=new Array<SpriteData|undefined>(MAX_COUNT_SPRITES);

			try {
				// Reload sprites
				await this.getSprites();
			}
			catch (e) {
				this.retrievingError=e.message;
			};

			// Get clipping window
			await this.getSpritesClippingWindow();

			// Call super
			await super.update(reason);
		}
		catch(e) {
			Remote.emit('warning', e.message);
		};
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
		let convCurrentValue=currentValue;
		if (convCurrentValue==undefined)
			convCurrentValue='-';
		let td = ' <td>';
		td+=(currentValue==prevValue)? convCurrentValue:'<b>'+convCurrentValue + '</b>';
		td += '</td>\n';
		return td;
	}


	/**
	 * Creates one html table out of the sprites data.
	 */
	protected createHtmlTable(): string {
		if(this.retrievingError) {
			return '<div>'+this.retrievingError+'</div>';
		}

		const format= `
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
			.classRow0 {
				//background:#2C3E50;
				background:var(--vscode-panel-background);
				//background:var(--vscode-titleBar-activeBackground);
			}
			.classRow1 {
				//background:#566573;
				background:var(--vscode-panel-dropBackground);
				//background:var(--vscode-titleBar-inactiveBackground);
			}
		</style>
		<table  style="text-align: center" border="1" cellpadding="0">
			<colgroup>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
				<col>
			</colgroup>

          <tr>
			<th>Slot</th>
			<th><span title="The image takes all mirroring and rotation into account. In case of unified (relative) sprites also the mirror/rotation of the anchor.">Image</span></th>

			<th><span title="For anchor sprites the absolute 9bit value.\nFor relative sprite the signed 8bit relative value.">X</span></th>
			<th><span title="For anchor sprites the absolute 9bit value.\nFor relative sprite the signed 8bit relative value.">Y</span></th>

			<th><span title="XM bit. 1 = mirror horizontally.">X-Mir.</span></th>
			<th><span title="YM bit. 1 = mirror vertically.">Y-Mir.</span></th>
			<th><span title="R bit. 1 = rotate 90 degrees clockwise.">Rot.</span></th>
			<th><span title="P bit. 4 bit palette offset.">Pal.Offs.</span></th>
			<th><span title="PR bit (Palette relative).\n Only for relative sprites:\n1 = Palette offset is relative to anchor's palette index.\n0 = Palette offset is absolute.">PR</span></th>
			<th><span title="Relative sprites only.\nPO bit (Pattern offset).\n1 = pattern number is relative to anchor's pattern index.">PO</span></th>
			<th><span title="N5-N0 bits. Pattern index.">Pattern</span></th>
			<th><span title="7th pattern bit if sprite uses 4-bit color pattern. '-' if sprite uses 8-bit color pattern.">N6</span></th>
			<th><span title="XX bits. I.e. the sale factor in X direction.">X-Scale</span></th>
			<th><span title="YY bits. I.e. the sale factor in Y direction.">Y-Scale</span></th>
			<th><span title="V bit. 1 = visible.">Visibility</span></th>
			<th><span title="The sprite type.\nAnchor sprite or relative sprite.\nAn anchor sprite can be either Composite or Unified.\nThe anchor sprite determines the Composite/Unified type of the following relative sprites.">T (Type)<span></th>
			<th><span title="For a relative sprite this is the index of it's anchor sprite.">Anchor</span></th>
		  </tr>

%s

		</table>

		`;

		// Create a string with the table itself.
		const onlyVisible=this.showOnlyVisible;
		let table='';
		let classRowIndex=1;
		let lastAnchorspriteIndex=-1;
		for(const k of this.slotIndices) {
			const sprite=this.sprites[k];
			if (!sprite)
				continue;
			// Check if visible
			if (onlyVisible) {
				if (!sprite.visible)
					continue;
				if (sprite.anchorSprite&&!sprite.anchorSprite.visible)
					continue;
			}
			const prevSprite=this.previousSprites[k];

			// Row color, all anchor+relative sprites share the same row color.
			// I.e. the next composite/uniform sprite gets an alternate row color.
			let index=k;
			if (sprite.T==undefined) {
				// Relative sprite
				index=sprite.anchorSpriteIndex;
			}
			// Toggle?
			if (lastAnchorspriteIndex!=index) {
				// Toggle 0/1
				classRowIndex=(classRowIndex+1)%2;
				lastAnchorspriteIndex=index;
			}

			// Create row and columns
			table+='<tr class="classRow'+classRowIndex+'">\n'
			table+=' <td>'+k+'</td>\n'
			// Sprite image - convert to base64
			const buf=Buffer.from(sprite.image);
			const base64String=buf.toString('base64');
			table+=' <td class="classPattern"><img class="classImg" src="data:image/gif;base64,'+base64String+'"></td>\n'
			// X/Y
			table+=this.getTableTdWithBold(sprite.x, (prevSprite)? prevSprite.x:-1);
			table+=this.getTableTdWithBold(sprite.y, (prevSprite)? prevSprite.y:-1);
			// Attributes
			table+=this.getTableTdWithBold(sprite.xMirrored, (prevSprite)? prevSprite.xMirrored:-1);
			table+=this.getTableTdWithBold(sprite.yMirrored, (prevSprite)? prevSprite.yMirrored:-1);
			table+=this.getTableTdWithBold(sprite.rotated, (prevSprite)? prevSprite.rotated:-1);
			table+=this.getTableTdWithBold(sprite.getPaletteOffsetString(), prevSprite?.getPaletteOffsetString());
			table+=this.getTableTdWithBold(sprite.PR, (prevSprite)? prevSprite.PR:-1);
			table+=this.getTableTdWithBold(sprite.getPoString(), prevSprite?.getPoString());
			table+=this.getTableTdWithBold(sprite.patternIndex, (prevSprite)? prevSprite.patternIndex:-1);
			table+=this.getTableTdWithBold(sprite.getN6String(), prevSprite?.getN6String());
			table+=this.getTableTdWithBold(sprite.getXScaleString(), prevSprite?.getXScaleString());
			table+=this.getTableTdWithBold(sprite.getYScaleString(), prevSprite?.getYScaleString());
			table+=this.getTableTdWithBold(sprite.visible, prevSprite?.visible);
			table+=this.getTableTdWithBold(sprite.getTypeString(), prevSprite?.getTypeString());
			table+=this.getTableTdWithBold(sprite.getAnchorIndexString(), prevSprite?.getAnchorIndexString());
			table+='</tr>\n\n';
		}

		const html = util.format(format, table);
		return html;
	}


	/**
	 * Creates one html canvas to display the sprites on the "screen".
	 * The screen also shows the border and the clipping rectangle.
	 * Additionally all sprites are drawn into together with their slot index.
	 */
	protected createHtmlCanvas(): string {
		const format = `
		<canvas id="screen" width="640px" height="512px" style="border:1px solid #c3c3c3;">

		<script>
			var canvas = document.getElementById("screen");
			var ctx = canvas.getContext("2d");
			ctx.scale(2, 2);

				function drawScreen() {
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
		//if (this.control&0x02==0)
		{
			clipHtml += 'ctx.beginPath();\n';
			clipHtml += 'ctx.strokeStyle = "red";\n';
			clipHtml += util.format('ctx.rect(%d,%d,%d,%d);\n', this.clipXl+32, this.clipYt+32, this.clipXr-this.clipXl+1, this.clipYb-this.clipYt+1);
			clipHtml += 'ctx.closePath();\n';
			clipHtml += 'ctx.stroke();\n\n';
		}

		// Create the sprites
		let spritesHtml='ctx.beginPath();\n';
		const lastItem=this.orderedSlotIndices.length-1;
		const priorityNormal=((this.control&0x40)==0);
		for (let i=0; i<=lastItem; i++) {
			const j=(priorityNormal)? i:lastItem-i;
			const k=this.orderedSlotIndices[j];
			const sprite=this.sprites[k];
			if (!sprite)
				continue;
			if (!sprite.visible)
				continue;
			if (sprite.anchorSprite&&!sprite.anchorSprite.visible)
				continue;
			// Get X/Y
			let pos=sprite.getAbsXYScale();
			const width=16*pos.scaleX;
			const height=16*pos.scaleY;
			// Surrounding rectangle
			spritesHtml+=util.format("ctx.rect(%d,%d,%d,%d);\n", pos.x, pos.y, width, height);
			// The slot index
			spritesHtml+=util.format('ctx.fillText("%d",%d,%d);\n', k, pos.x+width+2, pos.y+height);
			// The image
			const buf = Buffer.from(sprite.image);
			const base64String = buf.toString('base64');
			spritesHtml += util.format('var img%d = new Image();\n', k);
			spritesHtml+=util.format('img%d.onload = function() { ctx.drawImage(img%d,%d,%d,%d,%d); };\n', k, k, pos.x, pos.y, width, height);
			spritesHtml += util.format('img%d.src = "data:image/gif;base64,%s";\n', k, base64String);
		}
		spritesHtml += 'ctx.closePath();\n';
		spritesHtml += 'ctx.stroke();\n\n';

		// Put everything together
		const html=util.format(format,
			clipHtml,
			spritesHtml);
		return html;
	}


	/**
	 * Sets the html code to display the sprites.
	 */
	protected setHtml() {
		const format = this.createHtmlSkeleton();
		// Add content
		const ui=this.createScriptsAndButtons();
		const table=this.createHtmlTable();
		const canvas = this.createHtmlCanvas();
		const content = ui + table + '\n<p style="margin-bottom:3em;"></p>\n\n' + canvas;
		const html = util.format(format, content);
		this.vscodePanel.webview.html = html;
	}

}

