'use strict';

import { Remote  } from '../remotes/remotefactory';
//import { Z80Registers } from './z80Registers';
//import { EventEmitter } from 'events';
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
	 * Creates the basic panel.
	 */
	/*
	constructor(parent: EventEmitter) {
		super(parent);
	}
	*/


	/**
	 * Select the registers to display the memory contents.
	 */
	public addRegisters(addRegs: Array<string>) {
		this.registers.push(...addRegs);
	}


	/**
	 * Do not show dots between the memory blocks.
	 */
	protected getHtmlVertBreak() {
		return '\n';
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason Not used.	 */
	public async update(reason?: any): Promise<void> {
		if (!this.vscodePanel)
			return;

		// Get register values
		await Remote.getRegisters();
		// Recalculate the memory addresses
		this.memDump.clearBlocks();
		this.vscodePanel.title='';
		for (let reg of this.registers) {
			// get register value
			const value=Remote.getRegisterValue(reg);
			// add memory block
			this.addBlock(value, 1, '@'+reg);
		}

		// update
		await super.update(reason);
	}

}
