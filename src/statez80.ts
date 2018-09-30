import * as assert from 'assert';
import { MachineType } from './emulator';
import { Emulator } from './emulatorfactory';
//import { EmulDebugAdapter } from './emuldebugadapter';

/// For saving/restoring the state.



export class StateZ80 {
	/// Stores all registers.
	public registers = new Array<number>();

	/// All registers to save/restore.
	protected allRegs = [
		"AF", "BC", "DE", "HL", "IX", "IY",
		"SP", "PC",
		"AF'", "BC'", "DE'", "HL'",
		"R", "I"
	];

	/// Constructor:
	constructor() {
	}

	/// Factory.
	public static createState(typ: MachineType) {
		switch(typ) {
			case MachineType.SPECTRUM16K:	return new StateZX16K();
			case MachineType.SPECTRUM48K:	return new StateZX48K();
			case MachineType.SPECTRUM128K:	return new StateZX128K();
			case MachineType.TBBLUE:	return new StateTBBlue();
			default:	return new StateZX48K();;
		}
	}

	/**
	 * Called from "-state save" command.
	 * Stores all registers.
	 * @param handler(stateData) The handler that is called after restoring.
	 */
	public stateSave(handler?: (stateData) => void) {
		// Save all registers
		this.registers = new Array<number>();
		for( const regName of this.allRegs) {
			Emulator.getRegisterValue( regName, value => {
				this.registers.push(value);
			});
		}
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param handler The handler that is called after restoring.
	 */
	public stateRestore(handler?: ()=>void) {
		// Restore all registers
		let i = 0;
		for( const regName of this.allRegs) {
			const value = this.registers[i++];
			Emulator.setRegisterValue(regName, value);
		}
	}
};


class StateZX16K extends StateZ80 {
	/// Stores all registers.
	public registers = new Array<number>();

	/// Stores the RAM memory banks.
	public banks = new Map<number, Uint8Array>();

	/// Constructor:
	constructor() {
		super();
		// Default = 16K
		this.banks.set(5, new Uint8Array(0x4000));
	}


	/// Converts a bank number to an address.
	protected getAddressForBankNr(bankNr: number) {
		// Get address
		let address;
		switch(bankNr) {
			case 0:	address = 0xC000; break;
			case 2:	address = 0x8000; break;
			case 5:	address = 0x4000; break;
			default: assert(false);
		}
		return address;
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM + the registers.
	 * @param handler(stateData) The handler that is called after restoring.
	 */
	public stateSave(handler?: (stateData) => void) {
		// Save all registers
		super.stateSave();
		// Save all RAM, all memory banks (exclude ROM)
		const count = this.banks.size;
		let i = 0;
		const bankNrs = new Array<number>();
		for(const [bankNr,] of this.banks) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			bankNrs.push(bankNr);
			Emulator.getMemoryDump(address, 0x4000, data => {
				const bnr = bankNrs.shift();
				if(bnr != undefined)	// calm the transpiler
					this.banks.set(bnr, data);
				// Call handler
				i ++;
				if(i >= count && handler)
					handler(this);
			});
		}
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param handler The handler that is called after restoring.
	 */
	public stateRestore(handler?: ()=>void) {
		// Restore registers
		super.stateRestore(handler);
//return; // REMOVE

		// Restore all RAM (exclude ROM)
		const count = this.banks.size;
		let i = 0;
		for(const [bankNr,bankData] of this.banks) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			Emulator.writeMemoryDump(address, bankData, () => {
				// Call handler
				i ++;
				if(i >= count && handler)
					handler();
			});
		}
	}
};

class StateZX48K extends StateZX16K {
	/// Constructor:
	constructor() {
		super();
		// Add 2 more banks
		this.banks.set(2, new Uint8Array(0x4000));
		this.banks.set(0, new Uint8Array(0x4000));
	}
};

class StateZX128K extends StateZX48K {
	/// Constructor:
	constructor() {
		super();
		// Add memory banks
		// TODO: at the moment it is not possible via ZRCP to read different memory banks.
		/*
		this.banks.set(1, new Uint8Array(0x4000));
		this.banks.set(3, new Uint8Array(0x4000));
		this.banks.set(4, new Uint8Array(0x4000));
		this.banks.set(6, new Uint8Array(0x4000));
		this.banks.set(7, new Uint8Array(0x4000));
		*/
	}
};


/// Saves also the Next registers like sprites etc.
class StateTBBlue extends StateZX128K {

	// Save commands
	protected cmds = [
		[
			4,
			'tbblue-get-clipwindow ula',
			'tbblue-set-clipwindow ula'
		],
		[
			4,
			'tbblue-get-clipwindow layer2',
			'tbblue-set-clipwindow layer2'
		],
		[
			4,
			'tbblue-get-clipwindow sprite',
			'tbblue-set-clipwindow sprite'
		],
		[
			256,
			'tbblue-get-palette ula first 0 256',
			'tbblue-set-palette ula first 0'
		],
		[
			256,
			'tbblue-get-palette ula second 0 256',
			'tbblue-set-palette ula second 0'
		],
		[
			256,
			'tbblue-get-palette layer2 first 0 256',
			'tbblue-set-palette layer2 first 0'
		],
		[
			256,
			'tbblue-get-palette layer2 second 0 256',
			'tbblue-set-palette layer2 second 0'
		],
		[
			256,
			'tbblue-get-palette sprite first 0 256',
			'tbblue-set-palette sprite first 0'
		],
		[
			256,
			'tbblue-get-palette sprite second 0 256',
			'tbblue-set-palette sprite second 0'
		],
	];
	protected cmds256 = [
		[
			256,
			'tbblue-get-pattern %d 256',
			'tbblue-set-pattern %d'
		],
		[
			4,
			'tbblue-get-sprite %d 4',
			'tbblue-set-sprite %d'
		],
		[
			1,
			'tbblue-get-register %d',
			'tbblue-set-register %d'
		],
	];


	/// Constructor:
	constructor() {
		super();
	}

		/**
	 * Called from "-state save" command.
	 * Stores all RAM + the registers.
	 * @param handler(stateData) The handler that is called after restoring.
	 */
	public stateSave(handler?: (stateData) => void) {
		// Save all memory and registers
		super.stateSave(handler);
/*
		// Setup data
		const nextRegs = new Uint8Array(256);

		// Function to save sprites


		// Function to save registers (simply save all although some might not be used)
		const saveRegs = (k: number) => {
			Emulator.getTbblueRegister(k, value => {
				nextRegs[k] = value;
				// Next
				if(k < 255)
					saveRegs(k+1);
				else {
					// End: do next step
					saveSprites();
				}
			});
		};


		// Start all
		saveRegs(0);
*/


		// Save sprites

/*
Nee, ich muss alle NExt Register über die Emulator Klasse verfügbar machen für andere Funktionalität sowieso.
Die State save Funktionen sollte ich aber vom spezifischen Emulator machen lassen.
Dann wird zxstate eigentlich nicht mehr gebraucht.
*/
		// save TBBlue data
		//Emulator.getTBBlue

//In den ZesaruxEmulator ->		// Save ZXNext registers.
/*
		for(const cmdData of this.cmds) {
			// Get count
			const count = cmdData[0];
			// Get data
//			Emulator
		}
*/
/*

		// Save all RAM, all memory banks (exclude ROM)
		const count = this.banks.size;
		let i = 0;
		for(const [bankNr,] of this.banks) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			Emulator.getMemoryDump(address, 0x4000, data => {
				this.banks.set(bankNr, data);
				// Call handler
				i ++;
				if(i >= count && handler)
					handler(this);
			});
		}
		*/
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param handler The handler that is called after restoring.
	 */
	public stateRestore(handler?: ()=>void) {
		// Restore registers
		super.stateRestore(handler);
	}
};
