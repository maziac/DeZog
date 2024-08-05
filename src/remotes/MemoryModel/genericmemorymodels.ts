import {MemoryModel} from "./memorymodel";


/** Contains the predefined generic memory models not associated with any specific
 * computer.
 */


/** Default model for MAME.
 * Nothing known.
 */
export class MemoryModelUnknown extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0,
							name: 'UNKNOWN'
						}
					]
				}
			]
		});
		this.name = 'UNKNOWN';
	}
}


/** Model with all RAM.
 */
export class MemoryModelAllRam extends MemoryModel {
	constructor() {
		super({
			slots: [
				{
					range: [0x0000, 0xFFFF],
					banks: [
						{
							index: 0,
							name: 'RAM'
						}
					]
				}
			]
		});
		this.name = 'RAM';
	}
}
