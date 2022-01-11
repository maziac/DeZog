import {BankType, SimulatedMemory} from './simmemory';
import {CustomMemoryType} from '../../settings';



/**
 * Takes the custom memory model description and creates a memory out of it.
 */
export class CustomMemory extends SimulatedMemory {

	/**
	 * Constructor.
	 * @param customMemory The memory description.
	 */
	constructor(customMemory: CustomMemoryType) {
		super(customMemory.numberOfBanks, customMemory.numberOfBanks);

		// Set all banks
		const nob = customMemory.numberOfBanks;
		for (let b = 0; b < nob; b++) {
			let bankName = customMemory.banks[b.toString()];
			let bankType = BankType.UNUSED;	// Default
			if (bankName != undefined)
				bankType = (BankType as any)[bankName];
			this.bankTypes[b] = bankType;
			if (bankType == BankType.UNUSED) {
				// Fill unused bnks with 0xFF
				this.fillBank(b, 0xFF);
			}
		}
	}

}

