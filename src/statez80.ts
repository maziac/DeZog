import * as assert from 'assert';
import { MachineType } from './remotes/emulator';
import { Emulator } from './remotes/emulatorfactory';


/// For saving/restoring the state.
//import * as fs from 'fs';
import * as BinaryFile from 'binary-file';
//var BinaryFile = require('binary-file');


export class StateZ80 {
	/// Stores all registers.
	public registers: Uint16Array;

	/// All registers to save/restore.
	protected allRegs = [
		"AF", "BC", "DE", "HL", "IX", "IY",
		"SP", "PC",
		"AF'", "BC'", "DE'", "HL'",
		"R", "I"
	];

	/// Constructor:
	constructor() {
		this.registers = new Uint16Array(this.allRegs.length);
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
	 * Stores all registers.
	 * @param handler(stateData) The handler that is called after saving.
	 */
	public stateSave(handler?: (stateData) => void) {
		// Get registers
		Emulator.getRegisters().then(() => {
			// Save all registers
			let i = 0;
			for (const regName of this.allRegs) {
				this.registers[i] = Emulator.getRegisterValue(regName);
				i++;
			}
		});
	}


	/**
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


export class StateZX16K extends StateZ80 {
	/// Stores the RAM memory banks.
	protected banks = new Array<Uint8Array>();
	protected bankNrs = new Array<number>();

	/// Constructor:
	constructor() {
		super();
		// Default = 16K
		this.bankNrs.push(5);
		this.banks.push(new Uint8Array(1));
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
	 * Writes all data to the binary file.
	 * @param binFile The opened file descriptor.
	 */
	public async write(binFile: BinaryFile) {
		// Write registers
		//const bufRegs = new Buffer(this.registers.buffer);
		const bufRegs = Buffer.from(this.registers.buffer);
		await binFile.write(bufRegs);

		//for(const reg of this.registers)
		//	await binFile.writeUInt16(reg);
		// Write count of banks and bank numbers
		await binFile.writeUInt16(this.bankNrs.length);
		for(const bankNr of this.bankNrs)
			await binFile.writeUInt16(bankNr);
		// Write all mem banks with size
		for(const bank of this.banks) {
			// size
			await binFile.writeUInt16(bank.length);
			// data
			//await binFile.write(new Buffer(bank.buffer));
			await binFile.write(Buffer.from(bank.buffer));
		}
	}


	/**
	 * Loads all data from a binary file.
	 * @param binFile The opened file descriptor.
	 */
	public async read(binFile: BinaryFile) {
		// Read registers
		const bufRegs = await binFile.read(this.allRegs.length*2);
		this.registers = new Uint16Array(bufRegs.buffer);

		// Read count of banks and bank numbers
		const count = await binFile.readUInt16();
		this.bankNrs =  new Array<number>(count);
		for(let i=0; i<count; i++)
			this.bankNrs[i] = await binFile.readUInt16();
		// Write all mem banks with size
		this.banks =  new Array<Uint8Array>(count);
		for(let i=0; i<count; i++) {
			// size
			const length = await binFile.readUInt16();
			// data
			const bufBank = await binFile.read(length);
			this.banks[i] = new Uint8Array(bufBank.buffer);
		}
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
		const count = this.banks.length;
		let i = 0;
		const bankNrs = this.bankNrs.slice(0);	// clone
		for(const bankNr of this.bankNrs) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			Emulator.getMemoryDump(address, 0x4000, data => {
				const bnr = bankNrs.shift();
				if(bnr != undefined)	// calm the transpiler
					this.banks[i] = data;
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
		const count = this.banks.length;
		let i = 0;
		let k = 0;
		for(const bankNr of this.bankNrs) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			const bankData = this.banks[k++];
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
		this.bankNrs.push(2);
		this.banks.push(new Uint8Array(1));
		this.bankNrs.push(0);
		this.banks.push(new Uint8Array(1));
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
Nee, ich muss alle Next Register über die Emulator Klasse verfügbar machen für andere Funktionalität sowieso.
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
