import {UlaDraw} from "./uladraw";

/** The ZX81 base class for ULA drawing.
 * Hires and standard ULA drawing is derived from here.
 */
export class Zx81BaseUlaDraw extends UlaDraw {
	// For the standard screen the minimum/maximum x/y values
	protected ZX81_STD_SCREEN_MIN_X = 64;
	protected ZX81_STD_SCREEN_MAX_X = this.ZX81_STD_SCREEN_MIN_X + this.SCREEN_WIDTH;	// (320) Exclusive
	protected ZX81_STD_SCREEN_MIN_Y = 56;
	protected ZX81_STD_SCREEN_MAX_Y = this.ZX81_STD_SCREEN_MIN_Y + this.SCREEN_HEIGHT;	// (248) Exclusive

	// If debug mode is on: Shows grey background if nothing is drawn.
	protected debug: boolean;


	/** Constructor.
	 * Checks the ulaOptions for the horizontal and vertical lines to draw.
	 * @param htmlCanvas The html canvas to draw to.
	 * @param ulaOptions The ULA options.
	 */
	constructor(htmlCanvas: HTMLCanvasElement, ulaOptions: any) {
		super(htmlCanvas, ulaOptions);
		this.debug = ulaOptions.debug;
		if (ulaOptions.showStandardLines) {
			// The horizontal standard border
			this.lines.push({x1: this.ZX81_STD_SCREEN_MIN_X, y1: 0, x2: this.ZX81_STD_SCREEN_MIN_X, y2: 1000, color: "yellow"});		// Left border
			this.lines.push({x1: this.ZX81_STD_SCREEN_MAX_X, y1: 0, x2: this.ZX81_STD_SCREEN_MAX_X, y2: 1000, color: "yellow"});	// Right border
			// The vertical standard border
			this.lines.push({x1: 0, y1: this.ZX81_STD_SCREEN_MIN_Y, x2: 1000, y2: this.ZX81_STD_SCREEN_MIN_Y, color: "yellow"});		// Top border
			this.lines.push({x1: 0, y1: this.ZX81_STD_SCREEN_MAX_Y, x2: 1000, y2: this.ZX81_STD_SCREEN_MAX_Y, color: "yellow"});	// Bottom border
		}
	}
}

