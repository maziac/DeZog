import {Remote} from '../remotes/remotebase';
import {MemoryDumpView} from './memorydumpview';



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
		this.vscodePanel.title = 'Memory View for Registers';
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
				const value = Remote.getRegisterValue(reg);
				// Create new block
				this.memDump.addBlock(value, 1, '@' + reg);
			}
		}
		else {
			// Change blocks
			let i = 0;
			for (let reg of this.registers) {
				// Get register value
				const value = Remote.getRegisterValue(reg);
				// Change existing mem block
				this.memDump.changeBlock(i, value, 1);
				// Next
				i++;
			}
		}

		// update
		await super.update(reason);
	}


	/**
	 * Updates the html. E.g. after the change of a value.
	 * Without getting the memory from the Remote.
	 */
	protected updateWithoutRemote() {
		// Check if first time,
		if (!this.vscodePanel.webview.html) {
			// First time: use the parent's method
			super.updateWithoutRemote();
		}
		else {
			// Use a different method, because for the register view the ranges may change all the time.
			const msg = {
				command: 'setMemoryTable',
				index: 0,
				html: ""
			};
			let i = 0;
			for (let metaBlock of this.memDump.metaBlocks) {
				// Update the block in html
				msg.html = this.createHtmlTable(metaBlock);
				msg.index = i;
				this.sendMessageToWebView(msg);
				// Next
				i++;
			}
			// Set colors for register pointers
			this.setColorsForRegisterPointers();
		}
	}


	/** The search widget is disabled.
	 * Would be difficult to implement as the ranges change
	 * when the registers change.
	 */
	protected createSearchHtml(): string {
		return '';
	}
}
