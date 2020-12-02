import { Remote } from '../remotes/remotefactory';
import { MemoryDumpView } from './memorydumpview';



/**
 * A Webview that shows the memory dump for certain registers.
 * I.e. it looks at the registers value and chooses a matching memory
 * range to display.
 */
export class MemoryRegisterView extends MemoryDumpView {

	/// The registers to take into account.
	protected registers = new Array<string>();


	/**
	 * Constructor.
	 */
	constructor() {
		super();
		this.vscodePanel.title='Memory View for Registers';
	}


	/**
	 * Select the registers to display the memory contents.
	 */
	public addRegisters(addRegs: Array<string>) {
		this.registers.push(...addRegs);
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason Not used.
	 */
	public async update(reason?: any): Promise<void> {
		// Get register values
		//await Remote.getRegisters();

		// If run the first time
		if (!this.vscodePanel.webview.html) {
			for (let reg of this.registers) {
				// Get register value
				const value=Remote.getRegisterValue(reg);
				// Create new block
				this.memDump.addBlock(value, 1, '@'+reg);
			}
		}
		else {
			// Change blocks
			let i=0;
			for (let reg of this.registers) {
				// Get register value
				const value=Remote.getRegisterValue(reg);
				// Change existing mem block
				this.memDump.changeBlock(i, value, 1);
				// Next
				i++;
			}
		}

		// update
		await super.update(reason);
	}

}
