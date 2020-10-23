import {Labels} from '../labels/labels';
import {Utility} from '../misc/utility';
import {Z80Registers} from './z80registers';



/// Used for the data received fom the remote.
// I.e. holds any data.
export type RegisterData=any;


/**
 * Parses the register data for PC etc.
 */
export class DecodeRegisterData {

	/// All values of the registers are provided in a map.
	/// Together with a function to retrieve the value from the data string.
	protected regMap=new Map<string, {(data: string): number}>();


	/**
	* Called during the launchRequest.
	*/
	constructor() {
		// Init the map
		this.regMap.set("PC", this.parsePC.bind(this));
		this.regMap.set("SP", this.parseSP.bind(this));

		this.regMap.set("AF", this.parseAF.bind(this));
		this.regMap.set("BC", this.parseBC.bind(this));
		this.regMap.set("DE", this.parseDE.bind(this));
		this.regMap.set("HL", this.parseHL.bind(this));
		this.regMap.set("IX", this.parseIX.bind(this));
		this.regMap.set("IY", this.parseIY.bind(this));

		this.regMap.set("AF'", this.parseAF2.bind(this));
		this.regMap.set("BC'", this.parseBC2.bind(this));
		this.regMap.set("DE'", this.parseDE2.bind(this));
		this.regMap.set("HL'", this.parseHL2.bind(this));

		this.regMap.set("A", this.parseA.bind(this));
		this.regMap.set("F", this.parseF.bind(this));
		this.regMap.set("B", this.parseB.bind(this));
		this.regMap.set("C", this.parseC.bind(this));
		this.regMap.set("D", this.parseD.bind(this));
		this.regMap.set("E", this.parseE.bind(this));
		this.regMap.set("H", this.parseH.bind(this));
		this.regMap.set("L", this.parseL.bind(this));
		this.regMap.set("I", this.parseI.bind(this));
		this.regMap.set("R", this.parseR.bind(this));

		this.regMap.set("IM", this.parseIM.bind(this));

		this.regMap.set("A'", this.parseA2.bind(this));
		this.regMap.set("F'", this.parseF2.bind(this));

		this.regMap.set("IXL", this.parseIXL.bind(this));
		this.regMap.set("IXH", this.parseIXH.bind(this));
		this.regMap.set("IYL", this.parseIYL.bind(this));
		this.regMap.set("IYH", this.parseIYH.bind(this));
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register name.
	 * @returns The value of the register.
	 */
	public getRegValueByName(regName: string, data: RegisterData): number {
		let handler=this.regMap.get(regName.toUpperCase())||(data => 0);
		Utility.assert(handler!=undefined, 'Register '+regName+' does not exist.');
		Utility.assert(data);
		let value=handler(data);
		return value;
	}


	public parsePC(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseSP(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseAF(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseBC(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseHL(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseDE(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseIX(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseIY(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseAF2(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseBC2(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseHL2(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseDE2(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseI(data: RegisterData): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseR(data: string): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseIM(data: string): number {
		// Override
		Utility.assert(false);
		return 0;
	}

	public parseSlots(data: RegisterData): number[] {
		// Override
		Utility.assert(false);
		return [];
	}

	public parsePCLong(data: RegisterData): number {
		// Get PC
		const pc=this.parsePC(data);
		if (!Labels.AreLongAddressesUsed())
			return pc;
		// Get slots
		const slots=this.parseSlots(data);
		if (slots.length==0)
			return pc;
		// Convert
		const pcLong=Z80Registers.createLongAddress(pc, slots);
		return pcLong;
	}


	// Note: Normally no need to override the 1 byte register access functions.
	public parseA(data: RegisterData): number {
		const res=this.parseAF(data)>>>8;
		return res;
	}

	public parseF(data: RegisterData): number {
		const res=this.parseAF(data)&0xFF;
		return res;
	}

	public parseB(data: RegisterData): number {
		const res=this.parseBC(data)>>>8;
		return res;
	}

	public parseC(data: RegisterData): number {
		const res=this.parseBC(data)&0xFF;
		return res;
	}

	public parseD(data: RegisterData): number {
		const res=this.parseDE(data)>>>8;
		return res;
	}

	public parseE(data: RegisterData): number {
		const res=this.parseDE(data)&0xFF;
		return res;
	}

	public parseH(data: RegisterData): number {
		const res=this.parseHL(data)>>>8;
		return res;
	}

	public parseL(data: RegisterData): number {
		const res=this.parseHL(data)&0xFF;
		return res;
	}

	public parseA2(data: RegisterData): number {
		const res=this.parseAF2(data)>>>8;
		return res;
	}

	public parseF2(data: RegisterData): number {
		const res=this.parseAF2(data)&0xFF;
		return res;
	}

	public parseIXL(data: RegisterData): number {
		const res=this.parseIX(data)&0xFF;
		return res;
	}

	public parseIXH(data: RegisterData): number {
		const res=this.parseIX(data)>>>8;
		return res;
	}

	public parseIYL(data: RegisterData): number {
		const res=this.parseIY(data)&0xFF;
		return res;
	}

	public parseIYH(data: RegisterData): number {
		const res=this.parseIY(data)>>>8;
		return res;
	}

}

