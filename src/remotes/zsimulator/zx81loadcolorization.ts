import {parseString} from 'xml2js';
import {readFileSync} from 'fs';

/** Class to load and parse Chroma81 colourisation files. */
export class Zx81LoadColorization {
	// The border color (with brightness)
	public borderColor: number;

	// The xml will be converted into this colormap array.
	public colorMap: Uint8Array;


	/** Static method to create an instance of Zx81LoadColorization from a file.
	 * @param filePath - The path to the XML file.
	 * @returns An instance of Zx81LoadColorization.
	 */
	public static fromFile(filePath: string): Zx81LoadColorization {
		// Read the XML content from the file
		const xmlContent = readFileSync(filePath, 'utf-8');
		// Create and return a new instance of Zx81LoadColorization
		return new Zx81LoadColorization(xmlContent);
	}


	/** Constructor to initialize the Zx81LoadColorization instance with XML content.
	 * @param xmlContent - The XML content as a string.
	 */
	constructor(xmlContent: string) {
		this.colorMap = new Uint8Array(0x400);
		this.parseXml(xmlContent);
	}


	/** Private method to parse the XML content and populate the class properties.
	 * @param xmlContent - The XML content as a string.
	 */
	private parseXml(xmlContent: string) {
		// Parse the XML content into a JavaScript object
		let jsonObj: any;
		parseString(xmlContent, (err, result) => {
			if (err) {
				throw new Error(`Error parsing XML: ${err.message}`);
			}
			jsonObj = result;
		});


		// Extract and set the border properties
		const borderElement = jsonObj.colourisation.border[0];
		this.borderColor = parseInt(borderElement.colour[0] || "0") + 8 * parseInt(borderElement.bright[0] || "0");

		// Extract and set the entries
		const entryElements = jsonObj.colourisation.entry;
		for (const entryElement of entryElements) {
			const code = parseInt(entryElement.$.code || "0");
			const quantity = parseInt(entryElement.$.quantity || "1");
			const mainOffset = code * 8;

			const lineElements = entryElement.line;
			for (const lineElement of lineElements) {
				const index = parseInt(lineElement.$.index || "0");
				const paper = parseInt(lineElement.paper[0].colour || "0") + 8 * parseInt(lineElement.paper[0].bright || "0");
				const ink = parseInt(lineElement.ink[0].colour || "0") + 8 * parseInt(lineElement.ink[0].bright || "0");
				const color = paper * 16 + ink;
				for (let i = 0; i < quantity; i++) {
					const offset = mainOffset + i * 8 + index;
					if (offset >= 0 && offset < this.colorMap.length) {
						this.colorMap[offset] = color;
					}
				}
			}
		}
	}
}