import * as assert from 'assert';
import { MachineType } from './remotes/remotebase';
import { Remote } from './remotes/remotefactory';
import * as fs from 'fs';


// TODO: REMOVE
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
	 */
	public async stateSave(): Promise<void> {
		// Get registers
		await Remote.getRegisters();
		// Save all registers
		let i = 0;
		for (const regName of this.allRegs) {
			this.registers[i] = Remote.getRegisterValue(regName);
			i++;
		}
	}


	/**
	 * Restores all RAM + the registers from a former "-state save".
	 * @param handler The handler that is called after restoring.
	 */
	public async stateRestore(): Promise<void> {
		// Restore all registers
		let i = 0;
		for( const regName of this.allRegs) {
			const value = this.registers[i++];
			await Remote.setRegisterValue(regName, value);
		}
	}


	/**
	 * Writes all data to the binary file.
	 * Override.
	 * @param filePath The absolute path to the file.
	 */
	public async write(filePath: string) {
		assert(false);
	}


	/**
	 * Loads all data from a binary file.
	 * Override.
	 * @param filePath The absolute path to the file.
	 */
	public async read(filePath: string) {
		assert(false);
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
	 * @param filePath The absolute path to the file.
	 */
	public async write(filePath: string) {
		// Open file
		const fd=fs.openSync(filePath, "w");
		try {
			// Write registers
			//const bufRegs = new Buffer(this.registers.buffer);
			fs.writeSync(fd, this.registers.buffer);

			//for(const reg of this.registers)
			// Write count of banks and bank numbers
			const singleNumberArray=new Uint16Array(1);
			singleNumberArray[0] = this.bankNrs.length;
			fs.writeSync(fd, singleNumberArray);
			const bankNrsBuffer=new Uint8Array(this.bankNrs);
			fs.writeSync(fd, bankNrsBuffer);
			// Write all mem banks with size
			for (const bank of this.banks) {
				// size
				singleNumberArray[0]=bank.length;
				fs.writeSync(fd, singleNumberArray);
				// data
				fs.writeSync(fd, bank);
			}
		}
		finally {
			// Close file
			fs.closeSync(fd);
		}
	}


	/**
	 * Loads all data from a binary file.
	 * @param filePath The absolute path to the file.
	 */
	public async read(filePath: string) {
		// Open file
		const fd=fs.openSync(filePath, "r");
		try {
			// Read registers
			const len=this.allRegs.length;
			this.registers=new Uint16Array(len);
			fs.readSync(fd, this.registers, 0, 2*len, null);

			// Read count of banks and bank numbers
			const singleNumberArray=new Uint16Array(1);
			fs.readSync(fd, singleNumberArray, 0, 1, null);
			const count=singleNumberArray[0];
			const bankNrsBuffer=new Uint8Array(count);
			fs.readSync(fd, bankNrsBuffer, 0, count, null);
			this.bankNrs=new Array<number>(...bankNrsBuffer);
			// REad all mem banks with size
			this.banks=new Array<Uint8Array>(count);
			for (let i=0; i<count; i++) {
				// Size
				fs.readSync(fd, singleNumberArray, 0, 1, null);
				const length=singleNumberArray[0];
				// Data
				this.banks[i]=new Uint8Array(length);
				fs.readSync(fd, this.banks[i], 0, length, null);
			}
		}
		finally {
			// Close file
			fs.closeSync(fd);
		}
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM + the registers.
	 */
	public async stateSave(): Promise<void> {
		// Save all registers
		await super.stateSave();
		// Save all RAM, all memory banks (exclude ROM)
		let i = 0;
		for (const bankNr of this.bankNrs) {
			// Get address
			const address=this.getAddressForBankNr(bankNr);
			// Get data
			const data=await Remote.readMemoryDump(address, 0x4000);
			// Store
			this.banks[i]=data;
			i++;
		}
	}


	/**
	 * Called from "-state load" command.
	 * Restores all RAM + the registers from a former "-state save".
	 */
	public async stateRestore(): Promise<void> {
		// Restore registers
		await super.stateRestore();
//return; // REMOVE

		// Restore all RAM (exclude ROM)
		let k = 0;
		for(const bankNr of this.bankNrs) {
			// Get address
			const address = this.getAddressForBankNr(bankNr);
			// Get data
			const bankData = this.banks[k++];
			await Remote.writeMemoryDump(address, bankData);
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
	 */
	public async stateSave(): Promise<void> {
		// Save all memory and registers
		await super.stateSave();
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
	 */
	public async stateRestore(): Promise<void> {
		// Restore registers
		await super.stateRestore();
	}
};
