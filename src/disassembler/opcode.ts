import * as util from 'util';
import * as assert from 'assert';
import {BaseMemory} from './basememory';
import {Memory, MemAttribute} from './memory';
import {NumberType} from './numbertype'
import {Format} from './format';


/// Classifies opcodes.
export enum OpcodeFlag {
	NONE = 0,
	BRANCH_ADDRESS = 0x01,	///< contains a branch address, e.g. jp, jp cc, jr, jr cc, call, call cc.
	CALL = 0x02,	///< is a subroutine call, e.g. call, call cc or rst
	STOP = 0x04,	///< is a stop-code. E.g. ret, reti, jp or jr. Disassembly procedure stops here.
	RET = 0x08,		///< is a RETURN from a subroutine
	CONDITIONAL = 0x10,	///< is a conditional opcode, e.g. JP NZ, RET Z, CALL P etc.
	LOAD_STACK_TOP = 0x20,	///< value is the stack top value.
	COPY,	///< Is a copy instruction (used for "used registers")
}


/**
 * Class for Opcodes.
 * Contains the name, formatting, type and possibly a value.
 */
export class Opcode {
	/// The code (byte value) of the opcode
	public code: number;	/// Used to test if all codes are in the right place.

	/// The name of the opcode, e.g. "LD A,%d"
	public name: string;
	/// An optional comment, e.g. "; ZX Next opcode"
	protected comment: string;
	/// Opcode flags: branch-address, call, stop
	public flags: OpcodeFlag;
	/// The additional value in the opcode, e.g. nn or n
	public valueType: NumberType;
	/// The length of the opcode + value
	public length: number;

	/// The value (if any) used in the opcode, e.g. nn in "LD HL,nn"
	/// Is only a temporary value, decoded for the current instruction.
	public value: number;

	/// For custom opcodes further bytes to decode can be added.
	public appendValues: Array<number>;

	/// For custom opcodes further bytes to decode can be added.
	public appendValueTypes: Array<NumberType>;


	/**
	 * Sets the handler to convert a number into a label string.
	 * If handler is undefined then value will not be converted, i.e. it remains
	 * a hex value.
	 * @param handler Gets the value and should return a string with the label.
	 * If label string does not exist it can return undefinde and the value will be converted into a hex string.
	 */
	public static setConvertToLabelHandler(handler: (value: number) => string) {
		Opcode.convertToLabelHandler = handler;
	}

	/// The static member that holds the label converter handler.
	protected static convertToLabelHandler: (value: number) => string;


	/// Converts a value to a label or a hex string.
	protected static convertToLabel(value: number): string {
		let valueString;
		if (Opcode.convertToLabelHandler)
			valueString = Opcode.convertToLabelHandler(value);
		if (!valueString) {
			valueString = Format.getHexString(value) + 'h';
		}
		return valueString;
	}


	/// Call this to use lower case or upper case opcodes.
	public static makeLowerCase() {
		for (let oc of Opcodes)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesCB)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesDD)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesED)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesFD)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesDDCB)
			oc.name = oc.name.toLowerCase();
		for (let oc of OpcodesFDCB)
			oc.name = oc.name.toLowerCase();
	}


	/// If true comments might be added to the opcode.
	/// I.e. the hex, decimal etc. conversion of  value.
	public static enableComments = true;


	/**
	 * Constructor.
	 * @param code The opcode number equivalent.
	 * @param name The mnemonic.
	 */
	constructor(code?: number, name = '') {
		if (code == undefined)
			return;	// Ignore the rest because values wil be copied anyway.
		name = name.trim();
		this.code = code;
		this.comment = '';
		this.flags = OpcodeFlag.NONE;
		this.valueType = NumberType.NONE;
		this.value = 0;
		this.length = 1;	// default
		// Retrieve valueType and opcode flags from name
		let k;
		if ((k = name.indexOf('#n')) > 0) {
			if (name.substr(k + 2, 1) == 'n') { // i.e. '#nn'
				// Word
				this.length = 3;
				// substitute formatting
				name = name.substr(0, k) + '%s' + name.substr(k + 3);
				// store type
				const indirect = name.substr(k - 1, 1);
				if (indirect == '(') {
					// Enclosed in brackets ? E.g. "(20fe)" -> indirect (this is no call or jp)
					this.valueType = NumberType.DATA_LBL;
				}
				else {
					// now check for opcode flags
					if (name.startsWith("CALL")) {
						this.flags |= OpcodeFlag.CALL | OpcodeFlag.BRANCH_ADDRESS;
						this.valueType = NumberType.CODE_SUB;
						// Check if conditional
						if (name.indexOf(',') >= 0)
							this.flags |= OpcodeFlag.CONDITIONAL;
					}
					else if (name.startsWith("JP")) {
						this.flags |= OpcodeFlag.BRANCH_ADDRESS;
						this.valueType = NumberType.CODE_LBL;
						// Now check if it is conditional, i.e. if there is a ',' in the opcode
						// Check if conditional or stop code
						this.flags |= (name.indexOf(',') >= 0) ? OpcodeFlag.CONDITIONAL : OpcodeFlag.STOP;
					}
					else if (name.startsWith("LD SP,")) {
						// The stack pointer is loaded, so this is the top of the stack.
						this.valueType = NumberType.DATA_LBL;
						this.flags |= OpcodeFlag.LOAD_STACK_TOP;
						this.comment = 'top of stack';
					}
					else {
						// Either call nor jp
						this.valueType = NumberType.NUMBER_WORD;
					}
				}
			}
			else {
				// Byte
				this.length = 2;
				// substitute formatting
				name = name.substr(0, k) + '%s' + name.substr(k + 2);
				// store type
				this.valueType = NumberType.NUMBER_BYTE;

				// now check for opcode flags
				if (name.startsWith("DJNZ")) {
					//this.valueType = NumberType.CODE_LOCAL_LOOP;
					this.valueType = NumberType.CODE_LOCAL_LBL;	// Becomes a loop because it jumps backwards.
					this.flags |= OpcodeFlag.BRANCH_ADDRESS | OpcodeFlag.CONDITIONAL;
				}
				if (name.startsWith("JR")) {
					this.valueType = NumberType.CODE_LOCAL_LBL;
					this.flags |= OpcodeFlag.BRANCH_ADDRESS;
					// Check if conditional or stop code
					this.flags |= (name.indexOf(',') >= 0) ? OpcodeFlag.CONDITIONAL : OpcodeFlag.STOP;
				}
				else if (name.startsWith("IN") || name.startsWith("OUT")) {
					// a port
					this.valueType = NumberType.PORT_LBL;
				}
			}
		}
		else if (name.startsWith("RET")) {	// "RETN", "RETI", "RET" with or without condition
			this.flags |= OpcodeFlag.RET;
			// Check if conditional or stop code
			this.flags |= (name.indexOf(' ') >= 0) ? OpcodeFlag.CONDITIONAL : OpcodeFlag.STOP;
		}
		else if (name.startsWith("RST")) {	// "RST"
			// Use like a CALL
			this.valueType = NumberType.CODE_RST;
			this.flags |= OpcodeFlag.BRANCH_ADDRESS | OpcodeFlag.CALL;

			// Get jump value
			const jumpAddress = this.code & 0b00111000;
			this.value = jumpAddress;
		}
		else if (name.startsWith("JP")) {	// "JP (HL)", "JP (IXY)" or "JP (C)"
			// Note: we don't set a branch address because we don't know where it jumps to: this.flags |= OpcodeFlag.BRANCH_ADDRESS;
			// But it is a stop code.
			this.flags |= OpcodeFlag.STOP;
		}

		// Store
		this.name = name;
	}


	/**
	 * Creates a copy object,
	 * @returns A new object with same values.
	 */
	public clone(): Opcode {
		// Create empty object
		const clone = Object.create(
			Object.getPrototypeOf(this),
			Object.getOwnPropertyDescriptors(this)
		);

		// Copy properties
		clone.code = this.code;
		clone.comment = this.comment;
		clone.name = this.name;
		clone.flags = this.flags;
		clone.valueType = this.valueType;
		clone.length = this.length;
		clone.value = this.value;
		clone.appendValues = this.appendValues;
		clone.appendValueTypes = this.appendValueTypes;
		return clone;
	}


	/**
	 * Returns the Opcode at address.
	 * @param address The address to retrieve.
	 * @returns It's opcode.
	 */
	public static getOpcodeAt(memory: BaseMemory, address: number, opcodes = Opcodes): Opcode {
		const memValue = memory.getValueAt(address);
		const opcode = opcodes[memValue];
		const realOpcode = opcode.getOpcodeAt(memory, address);
		return realOpcode;
	}


	/**
	 * For custom opcodes like the extension to RST.
	 * E.g. for a byte that follows a RST use the following appendName:
	 * "#n"
	 * This will result in e.g. the name "RST 16,#n" which will decode the
	 * #n as a byte in the disassembly.
	 * @param appendName A string that is appended to the opcode name which includes also
	 * further bytes to decode, e.g. "#n" or "#nn" or even "#n,#nn,#nn"
	 */
	public appendToOpcode(appendName: string) {
		if (!appendName || appendName.length == 0)
			return;

		this.appendValues = new Array<number>();
		this.appendValueTypes = new Array<NumberType>();

		// Calculate length and convert #n to %s
		let k = 0;
		let text = appendName + ' ';
		let len = 0;
		while ((k = text.indexOf("#n", k)) >= 0) {
			// Increment
			len++;
			// Check for word
			if (text[k + 2] == "n") {
				k++;
				len++;
				this.appendValueTypes.push(NumberType.NUMBER_WORD);
			}
			else {
				this.appendValueTypes.push(NumberType.NUMBER_BYTE);
			}
			// Next
			k += 2;
		}
		this.length += len;
		// Substitute formatting
		this.name += appendName.replace(/#nn?/g, "%s");

		// Comment
		this.comment = 'Custom opcode';
	}


	/**
	 * The 1 byte opcodes just return self (this).
	 * @param memory The memory area to get the opcode from.
	 * @param address The address of the opcode.
	 * @returns this
	 */
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		// Get value (if any)
		let offs = 0;
		switch (this.valueType) {
			case NumberType.CODE_RST:
			case NumberType.NONE:
				// no value
				break;
			case NumberType.CODE_LBL:
			case NumberType.CODE_SUB:
			case NumberType.CODE_SUB:
			case NumberType.DATA_LBL:
			case NumberType.NUMBER_WORD:
				// word value
				this.value = memory.getWordValueAt(address + 1);
				offs = 2;
				break;
			case NumberType.NUMBER_WORD_BIG_ENDIAN:
				// e.g. for PUSH $nnnn
				this.value = memory.getBigEndianWordValueAt(address + 1);
				offs = 2;
				break;
			case NumberType.RELATIVE_INDEX:
			case NumberType.CODE_LOCAL_LBL:
			case NumberType.CODE_LOCAL_LOOP:
				// byte value
				this.value = memory.getValueAt(address + 1);
				offs = 1;
				if (this.value >= 0x80)
					this.value -= 0x100;
				// Change relative jump address to absolute
				if (this.valueType == NumberType.CODE_LOCAL_LBL || this.valueType == NumberType.CODE_LOCAL_LOOP)
					this.value += address + 2;
				break;
			case NumberType.NUMBER_BYTE:
				// byte value
				this.value = memory.getValueAt(address + 1);
				offs = 1;
				break;
			case NumberType.PORT_LBL:
				// TODO: need to be implemented differently
				this.value = memory.getValueAt(address + 1);
				offs = 1;
				break;
			default:
				assert(false, 'getOpcodeAt');
				break;
		}

		// Check for custom code
		if (this.appendValueTypes) {
			this.appendValues.length = 0;
			let addr = address + 1 + offs;
			for (const vType of this.appendValueTypes) {
				let val;
				if (vType == NumberType.NUMBER_BYTE) {
					val = memory.getValueAt(addr);
					addr++;
				}
				else {
					val = memory.getWordValueAt(addr);
					addr += 2;
				}
				this.appendValues.push(val);
			}
		}

		return this;
	}


	/**
	 * Disassembles one opcode together with a referenced label (if there
	 * is one).
	 * @returns A string that contains the disassembly, e.g. "LD A,(DATA_LBL1)"
	 * or "JR Z,.sub1_lbl3".
	   * @param memory The memory area. Used to distinguish if the access is maybe wrong.
	 * If this is not required (comment) the parameter can be omitted.
	 */
	public disassemble(memory?: Memory): {mnemonic: string, comment: string} {
		// optional comment
		let comment = '';

		// Check if there is any value
		if (this.valueType == NumberType.NONE) {
			return {mnemonic: this.name, comment: this.comment};
		}

		// Get referenced label name
		let valueName = '';
		if (this.valueType == NumberType.CODE_LBL
			|| this.valueType == NumberType.CODE_LOCAL_LBL
			|| this.valueType == NumberType.CODE_LOCAL_LOOP
			|| this.valueType == NumberType.CODE_SUB) {
			const val = this.value;
			valueName = Opcode.convertToLabel(val);
			comment = Format.getConversionForAddress(val);
			// Check if branching into the middle of an opcode
			if (memory) {
				const memAttr = memory.getAttributeAt(val);
				if (memAttr & MemAttribute.ASSIGNED) {
					if (!(memAttr & MemAttribute.CODE_FIRST)) {
						// Yes, it jumps into the middle of an opcode.
						comment += ', WARNING: Branches into the middle of an opcode!';
					}
				}
			}
		}
		else if (this.valueType == NumberType.DATA_LBL) {
			const val = this.value;
			valueName = Opcode.convertToLabel(val);
			comment = Format.getConversionForAddress(val);
			// Check if accessing code area
			if (memory) {
				const memAttr = memory.getAttributeAt(val);
				if (memAttr & MemAttribute.ASSIGNED) {
					if (memAttr & MemAttribute.CODE) {
						// Yes, code is accessed
						comment += ', WARNING: Instruction accesses code!';
					}
				}
			}
		}
		else if (this.valueType == NumberType.RELATIVE_INDEX) {
			// E.g. in 'LD (IX+n),a'
			let val = this.value;
			valueName = (val >= 0) ? '+' : '';
			valueName += val.toString();
		}
		else if (this.valueType == NumberType.CODE_RST) {
			// Use value instead of label (looks better)
			valueName = Format.getHexString(this.value, 2) + 'h';
		}
		else {
			// Use direct value
			const val = this.value;
			// Add comment
			if (this.valueType == NumberType.NUMBER_BYTE) {
				// byte
				valueName = Format.getHexString(val, 2) + 'h';
				comment = Format.getVariousConversionsForByte(val);
			}
			else {
				// word
				valueName = Format.getHexString(val, 4) + 'h';
				comment = Format.getVariousConversionsForWord(val);
			}
		}

		// Disassemble
		let opCodeString;
		if (!this.appendValueTypes) {
			// Nomal disassembly
			opCodeString = util.format(this.name, valueName);
		}
		else {
			// Custom opcode with appended bytes.
			const len = this.appendValueTypes.length;
			const vals = new Array<string>();
			for (let k = 0; k < len; k++) {
				const vType = this.appendValueTypes[k];
				const val = this.appendValues[k];
				let valName = (vType == NumberType.NUMBER_BYTE) ? Format.getHexString(val, 2) : Format.getHexString(val, 4);
				valName += 'h';
				vals.push(valName);
			}
			opCodeString = util.format(this.name, valueName, ...vals);
		}

		// Comments
		if (Opcode.enableComments) {
			if (this.comment) {
				if (comment.length > 0)
					comment += ', '
				comment += this.comment;
			}
		}
		else {
			// no comment
			comment = '';
		}

		return {mnemonic: opCodeString, comment: comment};
	}
}


/// Opcode with a number index.
/// E.g. 0xDD 0x74 0x03 = ld (ix+3),h
class OpcodeIndex extends Opcode {
	/**
	 * Constructor.
	 * Set type to relative index.
	 * @param code The opcode number equivalent.
	 * @param name The mnemonic.
	 */
	constructor(code?: number, name = '') {
		super(code, name);
		this.valueType = NumberType.RELATIVE_INDEX;
		this.length++;
	}
}


/// Opcode that has a number index before the opcode (DDCB).
/// E.g. 0xDD 0xCB 0x03 0x01 = ld (ix+3),c
class OpcodePrevIndex extends OpcodeIndex {
	/**
	 * Constructor.
	 * Set type to relative index.
	 * @param code The opcode number equivalent.
	 * @param name The mnemonic.
	 */
	constructor(code?: number, name = '') {
		super(code, name);
		this.length++;
	}

	/**
	 * Gets the value from the byte which is PREVIOUS to the opcode.
	 * @param memory
	 * @param address
	 * @returns this
	 */
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		this.value = memory.getValueAt(address - 1);
		if (this.value >= 0x80)
			this.value -= 0x100;
		return this;
	}
}


/// Opcode that has a number index and an immediate value.
/// E.g. 0xDD 0x36 0x03 0x08 = ld (ix+3),8
class OpcodeIndexImmediate extends Opcode {
	// The second value (the immediate value, i.e. 8 in the example above.
	protected secondValue: number;


	/**
	 * Constructor.
	 */
	constructor(code?: number, name = '') {
		super(code, name);
		this.length = 3;	// Is afterwards corrected to 4
		this.valueType = NumberType.RELATIVE_INDEX;
	}


	/**
	 * Creates a copy object,
	 * @returns A new object with same values.
	 */
	public clone(): Opcode {
		const clone = super.clone() as OpcodeIndexImmediate;
		clone.secondValue = this.secondValue;
		return clone;
	}


	/**
	 * Gets the value from the byte which is PREVIOUS to the opcode.
	 * @param memory
	 * @param address
	 * @returns this
	 */
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		this.value = memory.getValueAt(address + 1);
		if (this.value >= 0x80)
			this.value -= 0x100;
		this.secondValue = memory.getValueAt(address + 2);
		return this;
	}


	/**
	 * Disassembles the opcode.
	 * @returns A string that contains the disassembly, e.g. "LD (IX+6),4"
	 * @param memory The memory area. Used to distinguish if the access is maybe wrong.
	 * If this is not required (comment) the parameter can be omitted.
	 */
	public disassemble(memory?: Memory): {mnemonic: string, comment: string} {
		const dasm = super.disassemble(memory);
		// Results e.g. in "LD (IX+6),%s"

		const valueName = Format.getHexString(this.secondValue, 2) + 'h';
		const comment = Format.getVariousConversionsForByte(this.secondValue);
		const dasm2 = util.format(dasm.mnemonic, valueName);
		return {mnemonic: dasm2, comment};
	}
}


class OpcodeExtended extends Opcode {
	/// Array that holds the sub opcodes for this opcode.
	public opcodes;

	/**
	 * On construction the array is passed which holds the opcodes for this extended opcode.
	 * @param code The code, e.g. 0xCD or 0xDD
	 * @param opcodes The array with opcodes.
	 */
	constructor(code: number, opcodes: Array<Opcode>) {
		super(code);
		this.opcodes = opcodes;
		this.length += 1;	// one more
	}


	/// Clone not supported.
	public clone(): Opcode {
		throw Error("Cloning of OpcodeExtended not supported.");
	}


	/**
	 * The extended opcodes must return the next byte.
	 * @param memory Unused
	 * @param address Unused
	 * @returns The opcode from the address after the current one.
	 */
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		return Opcode.getOpcodeAt(memory, address + 1, this.opcodes);
	}
}


/// 3 (4) byte opcode
class OpcodeExtended2 extends OpcodeExtended {

	/// Pass also the opcode array.
	constructor(code: number, opcodes: Array<Opcode>) {
		super(code, opcodes);
		this.length += 1;	// one more
	}

	/**
	 * This is a 3 byte opcode.
	 * The first 2 bytes are DDCB followed by a value (for the index),
	 * followed by the rest of the opcode.
	 */
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		return Opcode.getOpcodeAt(memory, address + 2, this.opcodes);
	}
}




/// Special opcode that works as a NOP.
/// E.g. 2 0xDD after each other: Then the first 0xDD is like a nop.
class OpcodeNOP extends Opcode {
	constructor(code: number) {
		super(code, '');
		this.name = '[NOP]\t; because of following 0x' + Format.getHexString(code, 2);
		this.length--;	// Does not anything to the length (but is afterwards increased)
	}
}


/// Special opcode for an invalid instruction.
/// E.g. 2 0xDD after each other: Then the first 0xDD is like a nop.
class OpcodeInvalid extends Opcode {
	constructor(code: number) {
		super(code, '');
		this.name = 'INVALID INSTRUCTION\t; mostly equivalent to NOP.';
	}
}


/// Special opcodes for the ZX Spectrum next
class OpcodeNext extends Opcode {
	// Constructor.
	constructor(code: number, name: string) {
		super(code, name);
		this.comment = 'ZX Next opcode'
	}

	/// Clone not supported.
	public clone(): Opcode {
		throw Error("Cloning of OpcodeExtended not supported.");
	}
}


/// Push nn must be derived because the nn is big endian.
class OpcodeNextPush extends OpcodeNext {
	constructor(code: number, name: string) {
		super(code, name);
		this.valueType = NumberType.NUMBER_WORD_BIG_ENDIAN;
	}
}


/**
 * Special opcode to decode the next register
 */
class OpcodeNext_nextreg_n_a extends OpcodeNext {
	/// Disassemble the next register.
	/// (1 byte value)
	public disassemble(): {mnemonic: string, comment: string} {
		const regname = OpcodeNext_nextreg_n_a.getRegisterName(this.value);
		const opCodeString = util.format(this.name, regname);
		return {mnemonic: opCodeString, comment: this.comment};
	}

	/**
	 * Returns the corresponding next feature register name.
	 * @param regId The id of the register
	 * @returns The register name, e.g. "REG_VIDEO_TIMING"
	 */
	protected static getRegisterName(regId: number): string {
		let regname;
		switch (regId) {
			case 0: regname = "REG_MACHINE_ID"; break;
			case 1: regname = "REG_VERSION"; break;
			case 2: regname = "REG_RESET"; break;
			case 3: regname = "REG_MACHINE_TYPE"; break;
			case 4: regname = "REG_RAM_PAGE"; break;
			case 5: regname = "REG_PERIPHERAL_1"; break;
			case 6: regname = "REG_PERIPHERAL_2"; break;
			case 7: regname = "REG_TURBO_MODE"; break;
			case 8: regname = "REG_PERIPHERAL_3"; break;

			case 14: regname = "REG_SUB_VERSION"; break;
			case 15: regname = "REG_VIDEO_PARAM"; break;
			case 16: regname = "REG_ANTI_BRICK"; break;
			case 17: regname = "REG_VIDEO_TIMING"; break;
			case 18: regname = "REG_LAYER_2_RAM_PAGE"; break;
			case 19: regname = "REG_LAYER_2_SHADOW_RAM_PAGE"; break;

			case 20: regname = "REG_GLOBAL_TRANSPARENCY_COLOR"; break;
			case 21: regname = "REG_SPRITE_LAYER_SYSTEM"; break;
			case 22: regname = "REG_LAYER_2_OFFSET_X"; break;
			case 23: regname = "REG_LAYER_2_OFFSET_Y"; break;
			case 24: regname = "REG_CLIP_WINDOW_LAYER_2"; break;
			case 25: regname = "REG_CLIP_WINDOW_SPRITES"; break;
			case 26: regname = "REG_CLIP_WINDOW_ULA"; break;

			case 28: regname = "REG_CLIP_WINDOW_CONTROL"; break;

			case 30: regname = "REG_ACTIVE_VIDEO_LINE_H"; break;
			case 31: regname = "REG_ACTIVE_VIDEO_LINE_L"; break;

			case 34: regname = "REG_LINE_INTERRUPT_CONTROL"; break;
			case 35: regname = "REG_LINE_INTERRUPT_VALUE_L"; break;

			case 40: regname = "REG_KEYMAP_ADDRESS_H"; break;
			case 41: regname = "REG_KEYMAP_ADDRESS_L"; break;
			case 42: regname = "REG_KEYMAP_DATA_H"; break;
			case 43: regname = "REG_KEYMAP_DATA_L"; break;

			case 45: regname = "REG_DAC_MONO"; break;

			case 50: regname = "REG_LORES_OFFSET_X"; break;
			case 51: regname = "REG_LORES_OFFSET_Y"; break;

			case 64: regname = "REG_PALETTE_INDEX"; break;
			case 65: regname = "REG_PALETTE_VALUE_8"; break;
			case 66: regname = "REG_ULANEXT_PALETTE_FORMAT"; break;
			case 67: regname = "REG_PALETTE_CONTROL"; break;
			case 68: regname = "REG_PALETTE_VALUE_16"; break;

			case 74: regname = "REG_FALLBACK_COLOR"; break;

			case 80: regname = "REG_MMU0"; break;
			case 81: regname = "REG_MMU1"; break;
			case 82: regname = "REG_MMU2"; break;
			case 83: regname = "REG_MMU3"; break;
			case 84: regname = "REG_MMU4"; break;
			case 85: regname = "REG_MMU5"; break;
			case 86: regname = "REG_MMU6"; break;
			case 87: regname = "REG_MMU7"; break;

			case 96: regname = "REG_COPPER_DATA"; break;
			case 97: regname = "REG_COPPER_CONTROL_L"; break;
			case 98: regname = "REG_COPPER_CONTROL_H"; break;

			case 255: regname = "REG_DEBUG"; break;

			default:
				// unknown
				regname = Format.getHexString(regId, 2) + 'h';
				break;
		}
		return regname;
	}
}


/**
 * Special opcode to decode the 2 values.
 */
class OpcodeNext_nextreg_n_n extends OpcodeNext_nextreg_n_a {
	// The 2nd value.
	public value2: number;

	/// Constructor.
	constructor(code: number, name: string) {
		super(code, name);
		// There is still an '#n' to convert
		this.name = this.name.replace('#n', '%s');
		this.length++;
	}

	/// Collects the 2 values.
	public getOpcodeAt(memory: BaseMemory, address: number): Opcode {
		this.value = memory.getValueAt(address + 1);
		this.value2 = memory.getValueAt(address + 2);
		return this;
	}

	/// Disassemble the 2 values.
	/// Both are #n (1 byte values)
	public disassemble(): {mnemonic: string, comment: string} {
		const regId = this.value;
		const regValue = this.value2;
		const regname = OpcodeNext_nextreg_n_a.getRegisterName(regId);
		const valuename = OpcodeNext_nextreg_n_n.getRegisterValueName(regId, regValue);
		const opCodeString = util.format(this.name, regname, valuename);
		return {mnemonic: opCodeString, comment: this.comment};
	}

	/**
	 * Returns the corresponding value name for a value for a next feature register name.
	 * @param regId The id of the register. e.g. "REG_PERIPHERAL_1"
	 * @param regValue The value for the register, e.g. 0x40
	 * @returns E.g. "RP1_JOY1_KEMPSTON"
	 */
	protected static getRegisterValueName(regId: number, regValue: number): string {
		let valuename;
		let arr;
		switch (regId) {
			case 0:	// REG_MACHINE_ID
				switch (regValue) {
					case 0: valuename = "REG_MACHINE_ID"; break;
					case 1: valuename = "RMI_DE1A"; break;
					case 2: valuename = "RMI_DE2A"; break;
					case 5: valuename = "RMI_FBLABS"; break;
					case 6: valuename = "RMI_VTRUCCO"; break;
					case 7: valuename = "RMI_WXEDA"; break;
					case 8: valuename = "RMI_EMULATORS"; break;
					case 10: valuename = "RMI_ZXNEXT"; break;      // ZX Spectrum Next
					case 11: valuename = "RMI_MULTICORE"; break;
					case 250: valuename = "RMI_ZXNEXT_AB"; break;  // ZX Spectrum Next Anti-brick
				}
				break;

			case 1: // REG_VERSION
				valuename = Format.getHexString(regValue, 2) + 'h (v' + (regValue >>> 4) + '.' + (regValue & 0x0f) + ')';
				break;

			case 2: // REG_RESET
				valuename = Format.getHexString(regValue, 2) + 'h';
				arr = new Array<string>();
				if (regValue & 0x04)
					arr.push("RR_POWER_ON_RESET");
				if (regValue & 0x02)
					arr.push("RR_HARD_RESET");
				if (regValue & 0x01)
					arr.push("RR_SOFT_RESET");
				if (arr.length > 0)
					valuename += ' (' + arr.join('|') + ')';
				break;

			case 3: // REG_MACHINE_TYPE
				valuename = Format.getHexString(regValue, 2) + 'h';
				arr = new Array<string>();
				if (regValue & 0x80)
					arr.push("lock timing");
				switch ((regValue >>> 4) & 0x07) {
					case 0b000:
					case 0b001: arr.push("Timing:ZX 48K"); break;
					case 0b010: arr.push("Timing:ZX 128K"); break;
					case 0b011: arr.push("Timing:ZX +2/+3e"); break;
					case 0b100: arr.push("Timing:Pentagon 128K"); break;
				}
				switch (regValue & 0x07) {
					case 0b000: arr.push("Machine:Config mode"); break;
					case 0b001: arr.push("Machine:ZX 48K"); break;
					case 0b010: arr.push("Machine:ZX 128K"); break;
					case 0b011: arr.push("Machine:ZX +2/+3e"); break;
					case 0b100: arr.push("Machine:Pentagon 128K"); break;
				}
				if (arr.length > 0)
					valuename += ' (' + arr.join('|') + ')';
				break;

			case 4: // REG_RAM_PAGE
				switch (regValue) {
					case 0x08: valuename = "RRP_RAM_DIVMMC"; break;    // 0x00
					case 0x04: valuename = "RRP_ROM_DIVMMC"; break;    // 0x18
					case 0x05: valuename = "RRP_ROM_MF"; break;        // 0x19
					case 0x00: valuename = "RRP_ROM_SPECTRUM"; break;  // 0x1c
				}
				break;

			case 5: // REG_PERIPHERAL_1
				switch (regValue) {
					case 0x00: valuename = "RP1_JOY1_SINCLAIR"; break;
					case 0x40: valuename = "RP1_JOY1_KEMPSTON"; break;
					case 0x80: valuename = "RP1_JOY1_CURSOR"; break;
					case 0x00: valuename = "RP1_JOY2_SINCLAIR"; break;
					case 0x10: valuename = "RP1_JOY2_KEMPSTON"; break;
					case 0x20: valuename = "RP1_JOY2_CURSOR"; break;
					case 0x00: valuename = "RP1_RATE_50"; break;
					case 0x04: valuename = "RP1_RATE_60"; break;
					case 0x02: valuename = "RP1_ENABLE_SCANLINES"; break;
					case 0x01: valuename = "RP1_ENABLE_SCANDOUBLER"; break;
				}
				break;

			case 6: // REG_PERIPHERAL_2
				break;

			case 7: // REG_TURBO_MODE
				switch (regValue) {
					case 0x00: valuename = "RTM_3MHZ"; break;
					case 0x01: valuename = "RTM_7MHZ"; break;
					case 0x02: valuename = "RTM_14MHZ"; break;
					case 0x03: valuename = "RTM_28MHZ"; break;
				}
				break;

			case 8: // REG_PERIPHERAL_3
				break;

			case 14: // REG_SUB_VERSION
				break;

			case 15: // REG_VIDEO_PARAM
				break;

			case 16: // REG_ANTI_BRICK
				break;

			case 17: // REG_VIDEO_TIMING
				break;

			case 18: // REG_LAYER_2_RAM_PAGE
				switch (regValue) {
					case 0x3f: valuename = "RL2RP_MASK"; break;
				}
				break;

			case 19: // REG_LAYER_2_SHADOW_RAM_PAGE
				switch (regValue) {
					case 0x3f: valuename = "RL2RP_MASK"; break;
				}
				break;

			case 20: // REG_GLOBAL_TRANSPARENCY_COLOR
				break;

			case 21: // REG_SPRITE_LAYER_SYSTEM
				switch (regValue) {
					case 0x80: valuename = "RSLS_ENABLE_LORES"; break;
					case 0x00: valuename = "RSLS_LAYER_PRIORITY_SLU"; break;
					case 0x04: valuename = "RSLS_LAYER_PRIORITY_LSU"; break;
					case 0x08: valuename = "RSLS_LAYER_PRIORITY_SUL"; break;
					case 0x0c: valuename = "RSLS_LAYER_PRIORITY_LUS"; break;
					case 0x10: valuename = "RSLS_LAYER_PRIORITY_USL"; break;
					case 0x14: valuename = "RSLS_LAYER_PRIORITY_ULS"; break;
					case 0x02: valuename = "RSLS_SPRITES_OVER_BORDER"; break;
					case 0x01: valuename = "RSLS_SPRITES_VISIBLE"; break;
				}
				break;

			case 22: // REG_LAYER_2_OFFSET_X
				break;

			case 23: // REG_LAYER_2_OFFSET_Y
				break;

			case 24: // REG_CLIP_WINDOW_LAYER_2
				break;

			case 25: // REG_CLIP_WINDOW_SPRITES
				break;

			case 26: // REG_CLIP_WINDOW_ULA
				break;

			case 28: // REG_CLIP_WINDOW_CONTROL
				switch (regValue) {
					case 0x04: valuename = "RCWC_RESET_ULA_CLIP_INDEX"; break;
					case 0x02: valuename = "RCWC_RESET_SPRITE_CLIP_INDEX"; break;
					case 0x01: valuename = "RCWC_RESET_LAYER_2_CLIP_INDEX"; break;
				}
				break;

			case 30: // REG_ACTIVE_VIDEO_LINE_H
				break;

			case 31: // REG_ACTIVE_VIDEO_LINE_L
				break;

			case 34: // REG_LINE_INTERRUPT_CONTROL
				switch (regValue) {
					case 0x80: valuename = "RLIC_INTERRUPT_FLAG"; break;
					case 0x04: valuename = "RLIC_DISABLE_ULA_INTERRUPT"; break;
					case 0x02: valuename = "RLIC_ENABLE_LINE_INTERRUPT"; break;
					case 0x01: valuename = "RLIC_LINE_INTERRUPT_VALUE_H"; break;
				}
				break;

			case 35: // REG_LINE_INTERRUPT_VALUE_L
				break;

			case 40: // REG_KEYMAP_ADDRESS_H
				break;

			case 41: // REG_KEYMAP_ADDRESS_L
				break;

			case 42: // REG_KEYMAP_DATA_H
				break;

			case 43: // REG_KEYMAP_DATA_L
				break;

			case 45: // REG_DAC_MONO
				break;

			case 50: // REG_LORES_OFFSET_X
				break;

			case 51: // REG_LORES_OFFSET_Y
				break;

			case 64: // REG_PALETTE_INDEX
				break;

			case 65: // REG_PALETTE_VALUE_8
				break;

			case 66: // REG_ULANEXT_PALETTE_FORMAT
				break;

			case 67: // REG_PALETTE_CONTROL
				switch (regValue) {
					case 0x80: valuename = "RPC_DISABLE_AUTOINC"; break;
					case 0x00: valuename = "RPC_SELECT_ULA_PALETTE_0"; break;
					case 0x40: valuename = "RPC_SELECT_ULA_PALETTE_1"; break;
					case 0x10: valuename = "RPC_SELECT_LAYER_2_PALETTE_0"; break;
					case 0x50: valuename = "RPC_SELECT_LAYER_2_PALETTE_1"; break;
					case 0x20: valuename = "RPC_SELECT_SPRITES_PALETTE_0"; break;
					case 0x60: valuename = "RPC_SELECT_SPRITES_PALETTE_1"; break;
					case 0x00: valuename = "RPC_ENABLE_SPRITES_PALETTE_0"; break;
					case 0x08: valuename = "RPC_ENABLE_SPRITES_PALETTE_1"; break;
					case 0x00: valuename = "RPC_ENABLE_LAYER_2_PALETTE_0"; break;
					case 0x04: valuename = "RPC_ENABLE_LAYER_2_PALETTE_1"; break;
					case 0x00: valuename = "RPC_ENABLE_ULA_PALETTE_0"; break;
					case 0x02: valuename = "RPC_ENABLE_ULA_PALETTE_1"; break;
					case 0x01: valuename = "RPC_ENABLE_ULANEXT"; break;
				}
				break;

			case 68: // REG_PALETTE_VALUE_16
				break;

			case 74: // REG_FALLBACK_COLOR
				break;

			case 80: // REG_MMU0
				break;

			case 81: // REG_MMU1
				break;

			case 82: // REG_MMU2
				break;

			case 83: // REG_MMU3
				break;

			case 84: // REG_MMU4
				break;

			case 85: // REG_MMU5
				break;

			case 86: // REG_MMU6
				break;

			case 87: // REG_MMU7
				break;

			case 96: // REG_COPPER_DATA
				break;

			case 97: // REG_COPPER_CONTROL_L
				break;

			case 98: // REG_COPPER_CONTROL_H
				switch (regValue) {
					case 0x00: valuename = "RCCH_COPPER_STOP"; break;
					case 0x40: valuename = "RCCH_COPPER_RUN_LOOP_RESET"; break;
					case 0x80: valuename = "RCCH_COPPER_RUN_LOOP"; break;
					case 0xc0: valuename = "RCCH_COPPER_RUN_VBI"; break;
				}
				break;

			case 255: // REG_DEBUG
				break;
		}

		// Check if undefined
		if (!valuename)
			valuename = Format.getHexString(regValue, 2) + 'h';
		return valuename;
	}
}


/// Opcodes that start with 0xED.
export const OpcodesED: Array<Opcode> = [
	...Array<number>(0x23).fill(0).map((value, index) => new OpcodeInvalid(index)),

	new OpcodeNext(0x23, "SWAPNIB"),     // ZX Spectrum Next
	new OpcodeNext(0x24, "MIRROR"),     // ZX Spectrum Next
	...Array<number>(0x02).fill(0).map((value, index) => new OpcodeInvalid(0x25 + index)),

	new OpcodeNext(0x27, "TEST #n"),     // ZX Spectrum Next

	new OpcodeNext(0x28, "BSLA DE,B"),     // ZX Spectrum Next
	new OpcodeNext(0x29, "BSRA DE,B"),     // ZX Spectrum Next
	new OpcodeNext(0x2A, "BSRL DE,B"),     // ZX Spectrum Next
	new OpcodeNext(0x2B, "BSRF DE,B"),     // ZX Spectrum Next
	new OpcodeNext(0x2C, "BRLC DE,B"),     // ZX Spectrum Next
	...Array<number>(0x03).fill(0).map((value, index) => new OpcodeInvalid(0x2D + index)),

	new OpcodeNext(0x30, "MUL D,E"),     // ZX Spectrum Next
	new OpcodeNext(0x31, "ADD HL,A"),     // ZX Spectrum Next
	new OpcodeNext(0x32, "ADD DE,A"),     // ZX Spectrum Next
	new OpcodeNext(0x33, "ADD BC,A"),     // ZX Spectrum Next
	new OpcodeNext(0x34, "ADD HL,#nn"),     // ZX Spectrum Next
	new OpcodeNext(0x35, "ADD DE,#nn"),     // ZX Spectrum Next
	new OpcodeNext(0x36, "ADD BC,#nn"),     // ZX Spectrum Next
	...Array<number>(0x09).fill(0).map((value, index) => new OpcodeInvalid(0x37 + index)),

	new Opcode(0x40, "IN B,(C)"),
	new Opcode(0x41, "OUT (C),B"),
	new Opcode(0x42, "SBC HL,BC"),
	new Opcode(0x43, "LD (#nn),BC"),
	new Opcode(0x44, "NEG"),
	new Opcode(0x45, "RETN"),
	new Opcode(0x46, "IM 0"),
	new Opcode(0x47, "LD I,A"),
	new Opcode(0x48, "IN C,(C)"),
	new Opcode(0x49, "OUT (C),C"),
	new Opcode(0x4A, "ADC HL,BC"),
	new Opcode(0x4B, "LD BC,(#nn)"),
	new Opcode(0x4C, "[neg]"),
	new Opcode(0x4D, "RETI"),
	new Opcode(0x4E, "[im0]"),
	new Opcode(0x4F, "LD R,A"),
	new Opcode(0x50, "IN D,(C)"),
	new Opcode(0x51, "OUT (C),D"),
	new Opcode(0x52, "SBC HL,DE"),
	new Opcode(0x53, "LD (#nn),DE"),
	new Opcode(0x54, "[neg]"),
	new Opcode(0x55, "[retn]"),
	new Opcode(0x56, "IM 1"),
	new Opcode(0x57, "LD A,I"),
	new Opcode(0x58, "IN E,(C)"),
	new Opcode(0x59, "OUT (C),E"),
	new Opcode(0x5A, "ADC HL,DE"),
	new Opcode(0x5B, "LD DE,(#nn)"),
	new Opcode(0x5C, "[neg]"),
	new Opcode(0x5D, "[reti]"),
	new Opcode(0x5E, "IM 2"),
	new Opcode(0x5F, "LD A,R"),
	new Opcode(0x60, "IN H,(C)"),
	new Opcode(0x61, "OUT (C),H"),
	new Opcode(0x62, "SBC HL,HL"),
	new Opcode(0x63, "LD (#nn),HL"),
	new Opcode(0x64, "[neg]"),
	new Opcode(0x65, "[retn]"),
	new Opcode(0x66, "[im0]"),
	new Opcode(0x67, "RRD"),
	new Opcode(0x68, "IN L,(C)"),
	new Opcode(0x69, "OUT (C),L"),
	new Opcode(0x6A, "ADC HL,HL"),
	new Opcode(0x6B, "LD HL,(#nn)"),
	new Opcode(0x6C, "[neg]"),
	new Opcode(0x6D, "[reti]"),
	new Opcode(0x6E, "[im0]"),
	new Opcode(0x6F, "RLD"),
	new Opcode(0x70, "IN F,(C)"),
	new Opcode(0x71, "OUT (C),F"),
	new Opcode(0x72, "SBC HL,SP"),
	new Opcode(0x73, "LD (#nn),SP"),
	new Opcode(0x74, "[neg]"),
	new Opcode(0x75, "[retn]"),
	new Opcode(0x76, "[im1]"),
	new Opcode(0x77, "[ld i,i?]"),
	new Opcode(0x78, "IN A,(C)"),
	new Opcode(0x79, "OUT (C),A"),
	new Opcode(0x7A, "ADC HL,SP"),
	new Opcode(0x7B, "LD SP,(#nn)"),
	new Opcode(0x7C, "[neg]"),
	new Opcode(0x7D, "[reti]"),
	new Opcode(0x7E, "[im2]"),
	new Opcode(0x7F, "[ld r,r?]"),
	...Array<number>(0x0A).fill(0).map((value, index) => new OpcodeInvalid(0x80 + index)),

	new OpcodeNextPush(0x8A, "PUSH #nn"),     // ZX Spectrum Next
	...Array<number>(0x06).fill(0).map((value, index) => new OpcodeInvalid(0x8B + index)),

	new OpcodeNext_nextreg_n_n(0x91, "NEXTREG #n,#n"),     // ZX Spectrum Next
	new OpcodeNext_nextreg_n_a(0x92, "NEXTREG #n,A"),     // ZX Spectrum Next
	new OpcodeNext(0x93, "PIXELDN"),     // ZX Spectrum Next
	new OpcodeNext(0x94, "PIXELAD"),     // ZX Spectrum Next
	new OpcodeNext(0x95, "SETAE"),     // ZX Spectrum Next
	...Array<number>(0x02).fill(0).map((value, index) => new OpcodeInvalid(0x96 + index)),
	new OpcodeNext(0x98, "JP (C)"),     // ZX Spectrum Next

	...Array<number>(0x07).fill(0).map((value, index) => new OpcodeInvalid(0x99 + index)),

	new Opcode(0xA0, "LDI"),
	new Opcode(0xA1, "CPI"),
	new Opcode(0xA2, "INI"),
	new Opcode(0xA3, "OUTI"),

	new OpcodeNext(0xA4, "LDIX"),     // ZX Spectrum Next
	new OpcodeNext(0xA5, "LDWS"),     // ZX Spectrum Next

	...Array<number>(0x02).fill(0).map((value, index) => new OpcodeInvalid(0xA6 + index)),

	new Opcode(0xA8, "LDD"),
	new Opcode(0xA9, "CPD"),
	new Opcode(0xAA, "IND"),
	new Opcode(0xAB, "OUTD"),

	new OpcodeNext(0xAC, "LDDX"),     // ZX Spectrum Next

	...Array<number>(0x03).fill(0).map((value, index) => new OpcodeInvalid(0xAD + index)),

	new Opcode(0xB0, "LDIR"),
	new Opcode(0xB1, "CPIR"),
	new Opcode(0xB2, "INIR"),
	new Opcode(0xB3, "OUTIR"),

	new OpcodeNext(0xB4, "LDIRX"),     // ZX Spectrum Next
	new OpcodeInvalid(0xB5),
	new OpcodeNext(0xB6, "LDIRSCALE"),     // ZX Spectrum Next
	new OpcodeNext(0xB7, "LDPIRX"),     // ZX Spectrum Next

	new Opcode(0xB8, "LDDR"),
	new Opcode(0xB9, "CPDR"),
	new Opcode(0xBA, "INDR"),
	new Opcode(0xBB, "OUTDR"),

	new OpcodeNext(0xBC, "LDDRX"),     // ZX Spectrum Next

	...Array<number>(0x100 - 0xBC - 1).fill(0).map((value, index) => new OpcodeInvalid(0xBD + index))
];
// Fix length (2)
OpcodesED.forEach(opcode => {
	opcode.length++;
});

/// Opcodes that start with 0xCB.
export const OpcodesCB: Array<Opcode> = [
	new Opcode(0x00, "RLC B"),
	new Opcode(0x01, "RLC C"),
	new Opcode(0x02, "RLC D"),
	new Opcode(0x03, "RLC E"),
	new Opcode(0x04, "RLC H"),
	new Opcode(0x05, "RLC L"),
	new Opcode(0x06, "RLC (HL)"),
	new Opcode(0x07, "RLC A"),
	new Opcode(0x08, "RRC B"),
	new Opcode(0x09, "RRC C"),
	new Opcode(0x0A, "RRC D"),
	new Opcode(0x0B, "RRC E"),
	new Opcode(0x0C, "RRC H"),
	new Opcode(0x0D, "RRC L"),
	new Opcode(0x0E, "RRC (HL)"),
	new Opcode(0x0F, "RRC A"),
	new Opcode(0x10, "RL B"),
	new Opcode(0x11, "RL C"),
	new Opcode(0x12, "RL D"),
	new Opcode(0x13, "RL E"),
	new Opcode(0x14, "RL H"),
	new Opcode(0x15, "RL L"),
	new Opcode(0x16, "RL (HL)"),
	new Opcode(0x17, "RL A"),
	new Opcode(0x18, "RR B"),
	new Opcode(0x19, "RR C"),
	new Opcode(0x1A, "RR D"),
	new Opcode(0x1B, "RR E"),
	new Opcode(0x1C, "RR H"),
	new Opcode(0x1D, "RR L"),
	new Opcode(0x1E, "RR (HL)"),
	new Opcode(0x1F, "RR A"),
	new Opcode(0x20, "SLA B"),
	new Opcode(0x21, "SLA C"),
	new Opcode(0x22, "SLA D"),
	new Opcode(0x23, "SLA E"),
	new Opcode(0x24, "SLA H"),
	new Opcode(0x25, "SLA L"),
	new Opcode(0x26, "SLA (HL)"),
	new Opcode(0x27, "SLA A"),
	new Opcode(0x28, "SRA B"),
	new Opcode(0x29, "SRA C"),
	new Opcode(0x2A, "SRA D"),
	new Opcode(0x2B, "SRA E"),
	new Opcode(0x2C, "SRA H"),
	new Opcode(0x2D, "SRA L"),
	new Opcode(0x2E, "SRA (HL)"),
	new Opcode(0x2F, "SRA A"),
	new Opcode(0x30, "SLL B"),
	new Opcode(0x31, "SLL C"),
	new Opcode(0x32, "SLL D"),
	new Opcode(0x33, "SLL E"),
	new Opcode(0x34, "SLL H"),
	new Opcode(0x35, "SLL L"),
	new Opcode(0x36, "SLL (HL)"),
	new Opcode(0x37, "SLL A"),
	new Opcode(0x38, "SRL B"),
	new Opcode(0x39, "SRL C"),
	new Opcode(0x3A, "SRL D"),
	new Opcode(0x3B, "SRL E"),
	new Opcode(0x3C, "SRL H"),
	new Opcode(0x3D, "SRL L"),
	new Opcode(0x3E, "SRL (HL)"),
	new Opcode(0x3F, "SRL A"),
	new Opcode(0x40, "BIT 0,B"),
	new Opcode(0x41, "BIT 0,C"),
	new Opcode(0x42, "BIT 0,D"),
	new Opcode(0x43, "BIT 0,E"),
	new Opcode(0x44, "BIT 0,H"),
	new Opcode(0x45, "BIT 0,L"),
	new Opcode(0x46, "BIT 0,(HL)"),
	new Opcode(0x47, "BIT 0,A"),
	new Opcode(0x48, "BIT 1,B"),
	new Opcode(0x49, "BIT 1,C"),
	new Opcode(0x4A, "BIT 1,D"),
	new Opcode(0x4B, "BIT 1,E"),
	new Opcode(0x4C, "BIT 1,H"),
	new Opcode(0x4D, "BIT 1,L"),
	new Opcode(0x4E, "BIT 1,(HL)"),
	new Opcode(0x4F, "BIT 1,A"),
	new Opcode(0x50, "BIT 2,B"),
	new Opcode(0x51, "BIT 2,C"),
	new Opcode(0x52, "BIT 2,D"),
	new Opcode(0x53, "BIT 2,E"),
	new Opcode(0x54, "BIT 2,H"),
	new Opcode(0x55, "BIT 2,L"),
	new Opcode(0x56, "BIT 2,(HL)"),
	new Opcode(0x57, "BIT 2,A"),
	new Opcode(0x58, "BIT 3,B"),
	new Opcode(0x59, "BIT 3,C"),
	new Opcode(0x5A, "BIT 3,D"),
	new Opcode(0x5B, "BIT 3,E"),
	new Opcode(0x5C, "BIT 3,H"),
	new Opcode(0x5D, "BIT 3,L"),
	new Opcode(0x5E, "BIT 3,(HL)"),
	new Opcode(0x5F, "BIT 3,A"),
	new Opcode(0x60, "BIT 4,B"),
	new Opcode(0x61, "BIT 4,C"),
	new Opcode(0x62, "BIT 4,D"),
	new Opcode(0x63, "BIT 4,E"),
	new Opcode(0x64, "BIT 4,H"),
	new Opcode(0x65, "BIT 4,L"),
	new Opcode(0x66, "BIT 4,(HL)"),
	new Opcode(0x67, "BIT 4,A"),
	new Opcode(0x68, "BIT 5,B"),
	new Opcode(0x69, "BIT 5,C"),
	new Opcode(0x6A, "BIT 5,D"),
	new Opcode(0x6B, "BIT 5,E"),
	new Opcode(0x6C, "BIT 5,H"),
	new Opcode(0x6D, "BIT 5,L"),
	new Opcode(0x6E, "BIT 5,(HL)"),
	new Opcode(0x6F, "BIT 5,A"),
	new Opcode(0x70, "BIT 6,B"),
	new Opcode(0x71, "BIT 6,C"),
	new Opcode(0x72, "BIT 6,D"),
	new Opcode(0x73, "BIT 6,E"),
	new Opcode(0x74, "BIT 6,H"),
	new Opcode(0x75, "BIT 6,L"),
	new Opcode(0x76, "BIT 6,(HL)"),
	new Opcode(0x77, "BIT 6,A"),
	new Opcode(0x78, "BIT 7,B"),
	new Opcode(0x79, "BIT 7,C"),
	new Opcode(0x7A, "BIT 7,D"),
	new Opcode(0x7B, "BIT 7,E"),
	new Opcode(0x7C, "BIT 7,H"),
	new Opcode(0x7D, "BIT 7,L"),
	new Opcode(0x7E, "BIT 7,(HL)"),
	new Opcode(0x7F, "BIT 7,A"),
	new Opcode(0x80, "RES 0,B"),
	new Opcode(0x81, "RES 0,C"),
	new Opcode(0x82, "RES 0,D"),
	new Opcode(0x83, "RES 0,E"),
	new Opcode(0x84, "RES 0,H"),
	new Opcode(0x85, "RES 0,L"),
	new Opcode(0x86, "RES 0,(HL)"),
	new Opcode(0x87, "RES 0,A"),
	new Opcode(0x88, "RES 1,B"),
	new Opcode(0x89, "RES 1,C"),
	new Opcode(0x8A, "RES 1,D"),
	new Opcode(0x8B, "RES 1,E"),
	new Opcode(0x8C, "RES 1,H"),
	new Opcode(0x8D, "RES 1,L"),
	new Opcode(0x8E, "RES 1,(HL)"),
	new Opcode(0x8F, "RES 1,A"),
	new Opcode(0x90, "RES 2,B"),
	new Opcode(0x91, "RES 2,C"),
	new Opcode(0x92, "RES 2,D"),
	new Opcode(0x93, "RES 2,E"),
	new Opcode(0x94, "RES 2,H"),
	new Opcode(0x95, "RES 2,L"),
	new Opcode(0x96, "RES 2,(HL)"),
	new Opcode(0x97, "RES 2,A"),
	new Opcode(0x98, "RES 3,B"),
	new Opcode(0x99, "RES 3,C"),
	new Opcode(0x9A, "RES 3,D"),
	new Opcode(0x9B, "RES 3,E"),
	new Opcode(0x9C, "RES 3,H"),
	new Opcode(0x9D, "RES 3,L"),
	new Opcode(0x9E, "RES 3,(HL)"),
	new Opcode(0x9F, "RES 3,A"),
	new Opcode(0xA0, "RES 4,B"),
	new Opcode(0xA1, "RES 4,C"),
	new Opcode(0xA2, "RES 4,D"),
	new Opcode(0xA3, "RES 4,E"),
	new Opcode(0xA4, "RES 4,H"),
	new Opcode(0xA5, "RES 4,L"),
	new Opcode(0xA6, "RES 4,(HL)"),
	new Opcode(0xA7, "RES 4,A"),
	new Opcode(0xA8, "RES 5,B"),
	new Opcode(0xA9, "RES 5,C"),
	new Opcode(0xAA, "RES 5,D"),
	new Opcode(0xAB, "RES 5,E"),
	new Opcode(0xAC, "RES 5,H"),
	new Opcode(0xAD, "RES 5,L"),
	new Opcode(0xAE, "RES 5,(HL)"),
	new Opcode(0xAF, "RES 5,A"),
	new Opcode(0xB0, "RES 6,B"),
	new Opcode(0xB1, "RES 6,C"),
	new Opcode(0xB2, "RES 6,D"),
	new Opcode(0xB3, "RES 6,E"),
	new Opcode(0xB4, "RES 6,H"),
	new Opcode(0xB5, "RES 6,L"),
	new Opcode(0xB6, "RES 6,(HL)"),
	new Opcode(0xB7, "RES 6,A"),
	new Opcode(0xB8, "RES 7,B"),
	new Opcode(0xB9, "RES 7,C"),
	new Opcode(0xBA, "RES 7,D"),
	new Opcode(0xBB, "RES 7,E"),
	new Opcode(0xBC, "RES 7,H"),
	new Opcode(0xBD, "RES 7,L"),
	new Opcode(0xBE, "RES 7,(HL)"),
	new Opcode(0xBF, "RES 7,A"),
	new Opcode(0xC0, "SET 0,B"),
	new Opcode(0xC1, "SET 0,C"),
	new Opcode(0xC2, "SET 0,D"),
	new Opcode(0xC3, "SET 0,E"),
	new Opcode(0xC4, "SET 0,H"),
	new Opcode(0xC5, "SET 0,L"),
	new Opcode(0xC6, "SET 0,(HL)"),
	new Opcode(0xC7, "SET 0,A"),
	new Opcode(0xC8, "SET 1,B"),
	new Opcode(0xC9, "SET 1,C"),
	new Opcode(0xCA, "SET 1,D"),
	new Opcode(0xCB, "SET 1,E"),
	new Opcode(0xCC, "SET 1,H"),
	new Opcode(0xCD, "SET 1,L"),
	new Opcode(0xCE, "SET 1,(HL)"),
	new Opcode(0xCF, "SET 1,A"),
	new Opcode(0xD0, "SET 2,B"),
	new Opcode(0xD1, "SET 2,C"),
	new Opcode(0xD2, "SET 2,D"),
	new Opcode(0xD3, "SET 2,E"),
	new Opcode(0xD4, "SET 2,H"),
	new Opcode(0xD5, "SET 2,L"),
	new Opcode(0xD6, "SET 2,(HL)"),
	new Opcode(0xD7, "SET 2,A"),
	new Opcode(0xD8, "SET 3,B"),
	new Opcode(0xD9, "SET 3,C"),
	new Opcode(0xDA, "SET 3,D"),
	new Opcode(0xDB, "SET 3,E"),
	new Opcode(0xDC, "SET 3,H"),
	new Opcode(0xDD, "SET 3,L"),
	new Opcode(0xDE, "SET 3,(HL)"),
	new Opcode(0xDF, "SET 3,A"),
	new Opcode(0xE0, "SET 4,B"),
	new Opcode(0xE1, "SET 4,C"),
	new Opcode(0xE2, "SET 4,D"),
	new Opcode(0xE3, "SET 4,E"),
	new Opcode(0xE4, "SET 4,H"),
	new Opcode(0xE5, "SET 4,L"),
	new Opcode(0xE6, "SET 4,(HL)"),
	new Opcode(0xE7, "SET 4,A"),
	new Opcode(0xE8, "SET 5,B"),
	new Opcode(0xE9, "SET 5,C"),
	new Opcode(0xEA, "SET 5,D"),
	new Opcode(0xEB, "SET 5,E"),
	new Opcode(0xEC, "SET 5,H"),
	new Opcode(0xED, "SET 5,L"),
	new Opcode(0xEE, "SET 5,(HL)"),
	new Opcode(0xEF, "SET 5,A"),
	new Opcode(0xF0, "SET 6,B"),
	new Opcode(0xF1, "SET 6,C"),
	new Opcode(0xF2, "SET 6,D"),
	new Opcode(0xF3, "SET 6,E"),
	new Opcode(0xF4, "SET 6,H"),
	new Opcode(0xF5, "SET 6,L"),
	new Opcode(0xF6, "SET 6,(HL)"),
	new Opcode(0xF7, "SET 6,A"),
	new Opcode(0xF8, "SET 7,B"),
	new Opcode(0xF9, "SET 7,C"),
	new Opcode(0xFA, "SET 7,D"),
	new Opcode(0xFB, "SET 7,E"),
	new Opcode(0xFC, "SET 7,H"),
	new Opcode(0xFD, "SET 7,L"),
	new Opcode(0xFE, "SET 7,(HL)"),
	new Opcode(0xFF, "SET 7,A")
];
// Fix length (2)
OpcodesCB.forEach(opcode => {
	opcode.length++;
});


/// Opcodes that start with 0xDDCB.
export const OpcodesDDCB: Array<Opcode> = [
	new OpcodePrevIndex(0x00, "RLC (IX%s),B"),
	new OpcodePrevIndex(0x01, "RLC (IX%s),C"),
	new OpcodePrevIndex(0x02, "RLC (IX%s),D"),
	new OpcodePrevIndex(0x03, "RLC (IX%s),E"),
	new OpcodePrevIndex(0x04, "RLC (IX%s),H"),
	new OpcodePrevIndex(0x05, "RLC (IX%s),L"),
	new OpcodePrevIndex(0x06, "RLC (IX%s)"),
	new OpcodePrevIndex(0x07, "RLC (IX%s),A"),
	new OpcodePrevIndex(0x08, "RRC (IX%s),B"),
	new OpcodePrevIndex(0x09, "RRC (IX%s),C"),
	new OpcodePrevIndex(0x0A, "RRC (IX%s),D"),
	new OpcodePrevIndex(0x0B, "RRC (IX%s),E"),
	new OpcodePrevIndex(0x0C, "RRC (IX%s),H"),
	new OpcodePrevIndex(0x0D, "RRC (IX%s),L"),
	new OpcodePrevIndex(0x0E, "RRC (IX%s)"),
	new OpcodePrevIndex(0x0F, "RRC (IX%s),A"),
	new OpcodePrevIndex(0x10, "RL (IX%s),B"),
	new OpcodePrevIndex(0x11, "RL (IX%s),C"),
	new OpcodePrevIndex(0x12, "RL (IX%s),D"),
	new OpcodePrevIndex(0x13, "RL (IX%s),E"),
	new OpcodePrevIndex(0x14, "RL (IX%s),H"),
	new OpcodePrevIndex(0x15, "RL (IX%s),L"),
	new OpcodePrevIndex(0x16, "RL (IX%s)"),
	new OpcodePrevIndex(0x17, "RL (IX%s),A"),
	new OpcodePrevIndex(0x18, "RR (IX%s),B"),
	new OpcodePrevIndex(0x19, "RR (IX%s),C"),
	new OpcodePrevIndex(0x1A, "RR (IX%s),D"),
	new OpcodePrevIndex(0x1B, "RR (IX%s),E"),
	new OpcodePrevIndex(0x1C, "RR (IX%s),H"),
	new OpcodePrevIndex(0x1D, "RR (IX%s),L"),
	new OpcodePrevIndex(0x1E, "RR (IX%s)"),
	new OpcodePrevIndex(0x1F, "RR (IX%s),A"),
	new OpcodePrevIndex(0x20, "SLA (IX%s),B"),
	new OpcodePrevIndex(0x21, "SLA (IX%s),C"),
	new OpcodePrevIndex(0x22, "SLA (IX%s),D"),
	new OpcodePrevIndex(0x23, "SLA (IX%s),E"),
	new OpcodePrevIndex(0x24, "SLA (IX%s),H"),
	new OpcodePrevIndex(0x25, "SLA (IX%s),L"),
	new OpcodePrevIndex(0x26, "SLA (IX%s)"),
	new OpcodePrevIndex(0x27, "SLA (IX%s),A"),
	new OpcodePrevIndex(0x28, "SRA (IX%s),B"),
	new OpcodePrevIndex(0x29, "SRA (IX%s),C"),
	new OpcodePrevIndex(0x2A, "SRA (IX%s),D"),
	new OpcodePrevIndex(0x2B, "SRA (IX%s),E"),
	new OpcodePrevIndex(0x2C, "SRA (IX%s),H"),
	new OpcodePrevIndex(0x2D, "SRA (IX%s),L"),
	new OpcodePrevIndex(0x2E, "SRA (IX%s)"),
	new OpcodePrevIndex(0x2F, "SRA (IX%s),A"),
	new OpcodePrevIndex(0x30, "SLL (IX%s),B"),
	new OpcodePrevIndex(0x31, "SLL (IX%s),C"),
	new OpcodePrevIndex(0x32, "SLL (IX%s),D"),
	new OpcodePrevIndex(0x33, "SLL (IX%s),E"),
	new OpcodePrevIndex(0x34, "SLL (IX%s),H"),
	new OpcodePrevIndex(0x35, "SLL (IX%s),L"),
	new OpcodePrevIndex(0x36, "SLL (IX%s)"),
	new OpcodePrevIndex(0x37, "SLL (IX%s),A"),
	new OpcodePrevIndex(0x38, "SRL (IX%s),B"),
	new OpcodePrevIndex(0x39, "SRL (IX%s),C"),
	new OpcodePrevIndex(0x3A, "SRL (IX%s),D"),
	new OpcodePrevIndex(0x3B, "SRL (IX%s),E"),
	new OpcodePrevIndex(0x3C, "SRL (IX%s),H"),
	new OpcodePrevIndex(0x3D, "SRL (IX%s),L"),
	new OpcodePrevIndex(0x3E, "SRL (IX%s)"),
	new OpcodePrevIndex(0x3F, "SRL (IX%s),A"),
	new OpcodePrevIndex(0x40, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x41, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x42, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x43, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x44, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x45, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x46, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x47, "BIT 0,(IX%s)"),
	new OpcodePrevIndex(0x48, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x49, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4A, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4B, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4C, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4D, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4E, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x4F, "BIT 1,(IX%s)"),
	new OpcodePrevIndex(0x50, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x51, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x52, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x53, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x54, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x55, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x56, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x57, "BIT 2,(IX%s)"),
	new OpcodePrevIndex(0x58, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x59, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5A, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5B, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5C, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5D, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5E, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x5F, "BIT 3,(IX%s)"),
	new OpcodePrevIndex(0x60, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x61, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x62, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x63, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x64, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x65, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x66, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x67, "BIT 4,(IX%s)"),
	new OpcodePrevIndex(0x68, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x69, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6A, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6B, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6C, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6D, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6E, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x6F, "BIT 5,(IX%s)"),
	new OpcodePrevIndex(0x70, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x71, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x72, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x73, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x74, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x75, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x76, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x77, "BIT 6,(IX%s)"),
	new OpcodePrevIndex(0x78, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x79, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7A, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7B, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7C, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7D, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7E, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x7F, "BIT 7,(IX%s)"),
	new OpcodePrevIndex(0x80, "RES 0,(IX%s),B"),
	new OpcodePrevIndex(0x81, "RES 0,(IX%s),C"),
	new OpcodePrevIndex(0x82, "RES 0,(IX%s),D"),
	new OpcodePrevIndex(0x83, "RES 0,(IX%s),E"),
	new OpcodePrevIndex(0x84, "RES 0,(IX%s),H"),
	new OpcodePrevIndex(0x85, "RES 0,(IX%s),L"),
	new OpcodePrevIndex(0x86, "RES 0,(IX%s)"),
	new OpcodePrevIndex(0x87, "RES 0,(IX%s),A"),
	new OpcodePrevIndex(0x88, "RES 1,(IX%s),B"),
	new OpcodePrevIndex(0x89, "RES 1,(IX%s),C"),
	new OpcodePrevIndex(0x8A, "RES 1,(IX%s),D"),
	new OpcodePrevIndex(0x8B, "RES 1,(IX%s),E"),
	new OpcodePrevIndex(0x8C, "RES 1,(IX%s),H"),
	new OpcodePrevIndex(0x8D, "RES 1,(IX%s),L"),
	new OpcodePrevIndex(0x8E, "RES 1,(IX%s)"),
	new OpcodePrevIndex(0x8F, "RES 1,(IX%s),A"),
	new OpcodePrevIndex(0x90, "RES 2,(IX%s),B"),
	new OpcodePrevIndex(0x91, "RES 2,(IX%s),C"),
	new OpcodePrevIndex(0x92, "RES 2,(IX%s),D"),
	new OpcodePrevIndex(0x93, "RES 2,(IX%s),E"),
	new OpcodePrevIndex(0x94, "RES 2,(IX%s),H"),
	new OpcodePrevIndex(0x95, "RES 2,(IX%s),L"),
	new OpcodePrevIndex(0x96, "RES 2,(IX%s)"),
	new OpcodePrevIndex(0x97, "RES 2,(IX%s),A"),
	new OpcodePrevIndex(0x98, "RES 3,(IX%s),B"),
	new OpcodePrevIndex(0x99, "RES 3,(IX%s),C"),
	new OpcodePrevIndex(0x9A, "RES 3,(IX%s),D"),
	new OpcodePrevIndex(0x9B, "RES 3,(IX%s),E"),
	new OpcodePrevIndex(0x9C, "RES 3,(IX%s),H"),
	new OpcodePrevIndex(0x9D, "RES 3,(IX%s),L"),
	new OpcodePrevIndex(0x9E, "RES 3,(IX%s)"),
	new OpcodePrevIndex(0x9F, "RES 3,(IX%s),A"),
	new OpcodePrevIndex(0xA0, "RES 4,(IX%s),B"),
	new OpcodePrevIndex(0xA1, "RES 4,(IX%s),C"),
	new OpcodePrevIndex(0xA2, "RES 4,(IX%s),D"),
	new OpcodePrevIndex(0xA3, "RES 4,(IX%s),E"),
	new OpcodePrevIndex(0xA4, "RES 4,(IX%s),H"),
	new OpcodePrevIndex(0xA5, "RES 4,(IX%s),L"),
	new OpcodePrevIndex(0xA6, "RES 4,(IX%s)"),
	new OpcodePrevIndex(0xA7, "RES 4,(IX%s),A"),
	new OpcodePrevIndex(0xA8, "RES 5,(IX%s),B"),
	new OpcodePrevIndex(0xA9, "RES 5,(IX%s),C"),
	new OpcodePrevIndex(0xAA, "RES 5,(IX%s),D"),
	new OpcodePrevIndex(0xAB, "RES 5,(IX%s),E"),
	new OpcodePrevIndex(0xAC, "RES 5,(IX%s),H"),
	new OpcodePrevIndex(0xAD, "RES 5,(IX%s),L"),
	new OpcodePrevIndex(0xAE, "RES 5,(IX%s)"),
	new OpcodePrevIndex(0xAF, "RES 5,(IX%s),A"),
	new OpcodePrevIndex(0xB0, "RES 6,(IX%s),B"),
	new OpcodePrevIndex(0xB1, "RES 6,(IX%s),C"),
	new OpcodePrevIndex(0xB2, "RES 6,(IX%s),D"),
	new OpcodePrevIndex(0xB3, "RES 6,(IX%s),E"),
	new OpcodePrevIndex(0xB4, "RES 6,(IX%s),H"),
	new OpcodePrevIndex(0xB5, "RES 6,(IX%s),L"),
	new OpcodePrevIndex(0xB6, "RES 6,(IX%s)"),
	new OpcodePrevIndex(0xB7, "RES 6,(IX%s),A"),
	new OpcodePrevIndex(0xB8, "RES 7,(IX%s),B"),
	new OpcodePrevIndex(0xB9, "RES 7,(IX%s),C"),
	new OpcodePrevIndex(0xBA, "RES 7,(IX%s),D"),
	new OpcodePrevIndex(0xBB, "RES 7,(IX%s),E"),
	new OpcodePrevIndex(0xBC, "RES 7,(IX%s),H"),
	new OpcodePrevIndex(0xBD, "RES 7,(IX%s),L"),
	new OpcodePrevIndex(0xBE, "RES 7,(IX%s)"),
	new OpcodePrevIndex(0xBF, "RES 7,(IX%s),A"),
	new OpcodePrevIndex(0xC0, "SET 0,(IX%s),B"),
	new OpcodePrevIndex(0xC1, "SET 0,(IX%s),C"),
	new OpcodePrevIndex(0xC2, "SET 0,(IX%s),D"),
	new OpcodePrevIndex(0xC3, "SET 0,(IX%s),E"),
	new OpcodePrevIndex(0xC4, "SET 0,(IX%s),H"),
	new OpcodePrevIndex(0xC5, "SET 0,(IX%s),L"),
	new OpcodePrevIndex(0xC6, "SET 0,(IX%s)"),
	new OpcodePrevIndex(0xC7, "SET 0,(IX%s),A"),
	new OpcodePrevIndex(0xC8, "SET 1,(IX%s),B"),
	new OpcodePrevIndex(0xC9, "SET 1,(IX%s),C"),
	new OpcodePrevIndex(0xCA, "SET 1,(IX%s),D"),
	new OpcodePrevIndex(0xCB, "SET 1,(IX%s),E"),
	new OpcodePrevIndex(0xCC, "SET 1,(IX%s),H"),
	new OpcodePrevIndex(0xCD, "SET 1,(IX%s),L"),
	new OpcodePrevIndex(0xCE, "SET 1,(IX%s)"),
	new OpcodePrevIndex(0xCF, "SET 1,(IX%s),A"),
	new OpcodePrevIndex(0xD0, "SET 2,(IX%s),B"),
	new OpcodePrevIndex(0xD1, "SET 2,(IX%s),C"),
	new OpcodePrevIndex(0xD2, "SET 2,(IX%s),D"),
	new OpcodePrevIndex(0xD3, "SET 2,(IX%s),E"),
	new OpcodePrevIndex(0xD4, "SET 2,(IX%s),H"),
	new OpcodePrevIndex(0xD5, "SET 2,(IX%s),L"),
	new OpcodePrevIndex(0xD6, "SET 2,(IX%s)"),
	new OpcodePrevIndex(0xD7, "SET 2,(IX%s),A"),
	new OpcodePrevIndex(0xD8, "SET 3,(IX%s),B"),
	new OpcodePrevIndex(0xD9, "SET 3,(IX%s),C"),
	new OpcodePrevIndex(0xDA, "SET 3,(IX%s),D"),
	new OpcodePrevIndex(0xDB, "SET 3,(IX%s),E"),
	new OpcodePrevIndex(0xDC, "SET 3,(IX%s),H"),
	new OpcodePrevIndex(0xDD, "SET 3,(IX%s),L"),
	new OpcodePrevIndex(0xDE, "SET 3,(IX%s)"),
	new OpcodePrevIndex(0xDF, "SET 3,(IX%s),A"),
	new OpcodePrevIndex(0xE0, "SET 4,(IX%s),B"),
	new OpcodePrevIndex(0xE1, "SET 4,(IX%s),C"),
	new OpcodePrevIndex(0xE2, "SET 4,(IX%s),D"),
	new OpcodePrevIndex(0xE3, "SET 4,(IX%s),E"),
	new OpcodePrevIndex(0xE4, "SET 4,(IX%s),H"),
	new OpcodePrevIndex(0xE5, "SET 4,(IX%s),L"),
	new OpcodePrevIndex(0xE6, "SET 4,(IX%s)"),
	new OpcodePrevIndex(0xE7, "SET 4,(IX%s),A"),
	new OpcodePrevIndex(0xE8, "SET 5,(IX%s),B"),
	new OpcodePrevIndex(0xE9, "SET 5,(IX%s),C"),
	new OpcodePrevIndex(0xEA, "SET 5,(IX%s),D"),
	new OpcodePrevIndex(0xEB, "SET 5,(IX%s),E"),
	new OpcodePrevIndex(0xEC, "SET 5,(IX%s),H"),
	new OpcodePrevIndex(0xED, "SET 5,(IX%s),L"),
	new OpcodePrevIndex(0xEE, "SET 5,(IX%s)"),
	new OpcodePrevIndex(0xEF, "SET 5,(IX%s),A"),
	new OpcodePrevIndex(0xF0, "SET 6,(IX%s),B"),
	new OpcodePrevIndex(0xF1, "SET 6,(IX%s),C"),
	new OpcodePrevIndex(0xF2, "SET 6,(IX%s),D"),
	new OpcodePrevIndex(0xF3, "SET 6,(IX%s),E"),
	new OpcodePrevIndex(0xF4, "SET 6,(IX%s),H"),
	new OpcodePrevIndex(0xF5, "SET 6,(IX%s),L"),
	new OpcodePrevIndex(0xF6, "SET 6,(IX%s)"),
	new OpcodePrevIndex(0xF7, "SET 6,(IX%s),A"),
	new OpcodePrevIndex(0xF8, "SET 7,(IX%s),B"),
	new OpcodePrevIndex(0xF9, "SET 7,(IX%s),C"),
	new OpcodePrevIndex(0xFA, "SET 7,(IX%s),D"),
	new OpcodePrevIndex(0xFB, "SET 7,(IX%s),E"),
	new OpcodePrevIndex(0xFC, "SET 7,(IX%s),H"),
	new OpcodePrevIndex(0xFD, "SET 7,(IX%s),L"),
	new OpcodePrevIndex(0xFE, "SET 7,(IX%s)"),
	new OpcodePrevIndex(0xFF, "SET 7,(IX%s),A")
];
// Fix length (4)
OpcodesDDCB.forEach(opcode => {
	opcode.length += 1;
});

/// Opcodes that start with 0xFDCB.
/// Create FDCB (use IY instead of IX)
export const OpcodesFDCB = OpcodesDDCB.map(opcode => {
	const opcodeFDCB = opcode.clone();
	const name = opcode.name.replace('IX', 'IY');
	opcodeFDCB.name = name;
	return opcodeFDCB;
});


/// Opcodes that start with 0xDD.
export const OpcodesDD: Array<Opcode> = [
	new OpcodeInvalid(0x00),
	new OpcodeInvalid(0x01),
	new OpcodeInvalid(0x02),
	new OpcodeInvalid(0x03),
	new OpcodeInvalid(0x04),
	new OpcodeInvalid(0x05),
	new OpcodeInvalid(0x06),
	new OpcodeInvalid(0x07),
	new OpcodeInvalid(0x08),
	new Opcode(0x09, "ADD IX,BC"),
	new OpcodeInvalid(0x0A),
	new OpcodeInvalid(0x0B),
	new OpcodeInvalid(0x0C),
	new OpcodeInvalid(0x0D),
	new OpcodeInvalid(0x0E),
	new OpcodeInvalid(0x0F),
	new OpcodeInvalid(0x10),
	new OpcodeInvalid(0x11),
	new OpcodeInvalid(0x12),
	new OpcodeInvalid(0x13),
	new OpcodeInvalid(0x14),
	new OpcodeInvalid(0x15),
	new OpcodeInvalid(0x16),
	new OpcodeInvalid(0x17),
	new OpcodeInvalid(0x18),
	new Opcode(0x19, "ADD IX,DE"),
	new OpcodeInvalid(0x1A),
	new OpcodeInvalid(0x1B),
	new OpcodeInvalid(0x1C),
	new OpcodeInvalid(0x1D),
	new OpcodeInvalid(0x1E),
	new OpcodeInvalid(0x1F),
	new OpcodeInvalid(0x20),
	new Opcode(0x21, "LD IX,#nn"),
	new Opcode(0x22, "LD (#nn),IX"),
	new Opcode(0x23, "INC IX"),
	new Opcode(0x24, "INC IXH"),
	new Opcode(0x25, "DEC IXH"),
	new Opcode(0x26, "LD IXH,#n"),
	new OpcodeInvalid(0x27),
	new OpcodeInvalid(0x28),
	new Opcode(0x29, "ADD IX,IX"),
	new Opcode(0x2A, "LD IX,(#nn)"),
	new Opcode(0x2B, "DEC IX"),
	new Opcode(0x2C, "INC IXL"),
	new Opcode(0x2D, "DEC IXL"),
	new Opcode(0x2E, "LD IXL,#n"),
	new OpcodeInvalid(0x2F),
	new OpcodeInvalid(0x30),
	new OpcodeInvalid(0x31),
	new OpcodeInvalid(0x32),
	new OpcodeInvalid(0x33),
	new Opcode(0x34, "INC (IX)"),
	new Opcode(0x35, "DEC (IX)"),
	new OpcodeIndexImmediate(0x36, 'LD (IX%s),%s'),
	new OpcodeInvalid(0x37),
	new OpcodeInvalid(0x38),
	new Opcode(0x39, "ADD IX,SP"),
	new OpcodeInvalid(0x3A),
	new OpcodeInvalid(0x3B),
	new OpcodeInvalid(0x3C),
	new OpcodeInvalid(0x3D),
	new OpcodeInvalid(0x3E),
	new OpcodeInvalid(0x3F),
	new OpcodeInvalid(0x40),
	new OpcodeInvalid(0x41),
	new OpcodeInvalid(0x42),
	new OpcodeInvalid(0x43),
	new Opcode(0x44, "LD B,IXH"),
	new Opcode(0x45, "LD B,IXL"),
	new OpcodeIndex(0x46, "LD B,(IX%s)"),
	new OpcodeInvalid(0x47),
	new OpcodeInvalid(0x48),
	new OpcodeInvalid(0x49),
	new OpcodeInvalid(0x4A),
	new OpcodeInvalid(0x4B),
	new Opcode(0x4C, "LD C,IXH"),
	new Opcode(0x4D, "LD C,IXL"),
	new OpcodeIndex(0x4E, "LD C,(IX%s)"),
	new OpcodeInvalid(0x4F),
	new OpcodeInvalid(0x50),
	new OpcodeInvalid(0x51),
	new OpcodeInvalid(0x52),
	new OpcodeInvalid(0x53),
	new Opcode(0x54, "LD D,IXH"),
	new Opcode(0x55, "LD D,IXL"),
	new OpcodeIndex(0x56, "LD D,(IX%s)"),
	new OpcodeInvalid(0x57),
	new OpcodeInvalid(0x58),
	new OpcodeInvalid(0x59),
	new OpcodeInvalid(0x5A),
	new OpcodeInvalid(0x5B),
	new Opcode(0x5C, "LD E,IXH"),
	new Opcode(0x5D, "LD E,IXL"),
	new OpcodeIndex(0x5E, "LD E,(IX%s)"),
	new OpcodeInvalid(0x5F),
	new Opcode(0x60, "LD IXH,B"),
	new Opcode(0x61, "LD IXH,C"),
	new Opcode(0x62, "LD IXH,D"),
	new Opcode(0x63, "LD IXH,E"),
	new Opcode(0x64, "LD IXH,IXH"),
	new Opcode(0x65, "LD IXH,IXL"),
	new OpcodeIndex(0x66, "LD H,(IX%s)"),
	new Opcode(0x67, "LD IXH,A"),
	new Opcode(0x68, "LD IXL,B"),
	new Opcode(0x69, "LD IXL,C"),
	new Opcode(0x6A, "LD IXL,D"),
	new Opcode(0x6B, "LD IXL,E"),
	new Opcode(0x6C, "LD IXL,IXH"),
	new Opcode(0x6D, "LD IXL,IXL"),
	new OpcodeIndex(0x6E, "LD L,(IX%s)"),
	new Opcode(0x6F, "LD IXL,A"),
	new OpcodeIndex(0x70, "LD (IX%s),B"),
	new OpcodeIndex(0x71, "LD (IX%s),C"),
	new OpcodeIndex(0x72, "LD (IX%s),D"),
	new OpcodeIndex(0x73, "LD (IX%s),E"),
	new OpcodeIndex(0x74, "LD (IX%s),H"),
	new OpcodeIndex(0x75, "LD (IX%s),L"),
	new OpcodeInvalid(0x76),
	new OpcodeIndex(0x77, "LD (IX%s),A"),
	new OpcodeInvalid(0x78),
	new OpcodeInvalid(0x79),
	new OpcodeInvalid(0x7A),
	new OpcodeInvalid(0x7B),
	new Opcode(0x7C, "LD A,IXH"),
	new Opcode(0x7D, "LD A,IXL"),
	new OpcodeIndex(0x7E, "LD A,(IX%s)"),
	new OpcodeInvalid(0x7F),
	new OpcodeInvalid(0x80),
	new OpcodeInvalid(0x81),
	new OpcodeInvalid(0x82),
	new OpcodeInvalid(0x83),
	new Opcode(0x84, "ADD A,IXH"),
	new Opcode(0x85, "ADD A,IXL"),
	new OpcodeIndex(0x86, "ADD A,(IX%s)"),
	new OpcodeInvalid(0x87),
	new OpcodeInvalid(0x88),
	new OpcodeInvalid(0x89),
	new OpcodeInvalid(0x8A),
	new OpcodeInvalid(0x8B),
	new Opcode(0x8C, "ADC A,IXH"),
	new Opcode(0x8D, "ADC A,IXL"),
	new OpcodeIndex(0x8E, "ADC A,(IX%s)"),
	new OpcodeInvalid(0x8F),
	new OpcodeInvalid(0x90),
	new OpcodeInvalid(0x91),
	new OpcodeInvalid(0x92),
	new OpcodeInvalid(0x93),
	new Opcode(0x94, "SUB IXH"),
	new Opcode(0x95, "SUB IXL"),
	new OpcodeIndex(0x96, "SUB (IX%s)"),
	new OpcodeInvalid(0x97),
	new OpcodeInvalid(0x98),
	new OpcodeInvalid(0x99),
	new OpcodeInvalid(0x9A),
	new OpcodeInvalid(0x9B),
	new Opcode(0x9C, "SBC A,IXH"),
	new Opcode(0x9D, "SBC A,IXL"),
	new OpcodeIndex(0x9E, "SBC A,(IX%s)"),
	new OpcodeInvalid(0x9F),
	new OpcodeInvalid(0xA0),
	new OpcodeInvalid(0xA1),
	new OpcodeInvalid(0xA2),
	new OpcodeInvalid(0xA3),
	new Opcode(0xA4, "AND IXH"),
	new Opcode(0xA5, "AND IXL"),
	new OpcodeIndex(0xA6, "AND (IX%s)"),
	new OpcodeInvalid(0xA7),
	new OpcodeInvalid(0xA8),
	new OpcodeInvalid(0xA9),
	new OpcodeInvalid(0xAA),
	new OpcodeInvalid(0xAB),
	new Opcode(0xAC, "XOR IXH"),
	new Opcode(0xAD, "XOR IXL"),
	new OpcodeIndex(0xAE, "XOR (IX%s)"),
	new OpcodeInvalid(0xAF),
	new OpcodeInvalid(0xB0),
	new OpcodeInvalid(0xB1),
	new OpcodeInvalid(0xB2),
	new OpcodeInvalid(0xB3),
	new Opcode(0xB4, "OR IXH"),
	new Opcode(0xB5, "OR IXL"),
	new OpcodeIndex(0xB6, "OR (IX%s)"),
	new OpcodeInvalid(0xB7),
	new OpcodeInvalid(0xB8),
	new OpcodeInvalid(0xB9),
	new OpcodeInvalid(0xBA),
	new OpcodeInvalid(0xBB),
	new Opcode(0xBC, "CP IXH"),
	new Opcode(0xBD, "CP IXL"),
	new OpcodeIndex(0xBE, "CP (IX%s)"),
	new OpcodeInvalid(0xBF),
	new OpcodeInvalid(0xC0),
	new OpcodeInvalid(0xC1),
	new OpcodeInvalid(0xC2),
	new OpcodeInvalid(0xC3),
	new OpcodeInvalid(0xC4),
	new OpcodeInvalid(0xC5),
	new OpcodeInvalid(0xC6),
	new OpcodeInvalid(0xC7),
	new OpcodeInvalid(0xC8),
	new OpcodeInvalid(0xC9),
	new OpcodeInvalid(0xCA),
	new OpcodeExtended2(0xCB, OpcodesDDCB),
	new OpcodeInvalid(0xCC),
	new OpcodeInvalid(0xCD),
	new OpcodeInvalid(0xCE),
	new OpcodeInvalid(0xCF),
	new OpcodeInvalid(0xD0),
	new OpcodeInvalid(0xD1),
	new OpcodeInvalid(0xD2),
	new OpcodeInvalid(0xD3),
	new OpcodeInvalid(0xD4),
	new OpcodeInvalid(0xD5),
	new OpcodeInvalid(0xD6),
	new OpcodeInvalid(0xD7),
	new OpcodeInvalid(0xD8),
	new OpcodeInvalid(0xD9),
	new OpcodeInvalid(0xDA),
	new OpcodeInvalid(0xDB),
	new OpcodeInvalid(0xDC),
	new OpcodeNOP(0xDD),
	new OpcodeInvalid(0xDE),
	new OpcodeInvalid(0xDF),
	new OpcodeInvalid(0xE0),
	new Opcode(0xE1, "POP IX"),
	new OpcodeInvalid(0xE2),
	new Opcode(0xE3, "EX (SP),IX"),
	new OpcodeInvalid(0xE4),
	new Opcode(0xE5, "PUSH IX"),
	new OpcodeInvalid(0xE6),
	new OpcodeInvalid(0xE7),
	new OpcodeInvalid(0xE8),
	new Opcode(0xE9, "JP (IX)"),
	new OpcodeInvalid(0xEA),
	new OpcodeInvalid(0xEB),
	new OpcodeInvalid(0xEC),
	new OpcodeNOP(0xED),
	new OpcodeInvalid(0xEE),
	new OpcodeInvalid(0xEF),
	new OpcodeInvalid(0xF0),
	new OpcodeInvalid(0xF1),
	new OpcodeInvalid(0xF2),
	new OpcodeInvalid(0xF3),
	new OpcodeInvalid(0xF4),
	new OpcodeInvalid(0xF5),
	new OpcodeInvalid(0xF6),
	new OpcodeInvalid(0xF7),
	new OpcodeInvalid(0xF8),
	new Opcode(0xF9, "LD SP,IX"),
	new OpcodeInvalid(0xFA),
	new OpcodeInvalid(0xFB),
	new OpcodeInvalid(0xFC),
	new OpcodeNOP(0xFD),
	new OpcodeInvalid(0xFE),
	new OpcodeInvalid(0xFF),
];
// Fix length (2)
OpcodesDD.forEach(opcode => {
	opcode.length++;
});

/// Opcodes that start with 0xFD.
/// Create FD (use IY instead of IX)
export const OpcodesFD = OpcodesDD.map(opcode => {
	let opcodeFD;
	// Check for extended opcode
	if (opcode.code == 0xCB) {
		opcodeFD = new OpcodeExtended2(0xCB, OpcodesFDCB);
	}
	else {
		// Simple copy
		opcodeFD = opcode.clone();
		opcodeFD.name = opcode.name.replace(/IX/g, 'IY');
	}
	return opcodeFD;
});



// Normal Opcodes
export const Opcodes: Array<Opcode> = [
	new Opcode(0x00, "NOP"),
	new Opcode(0x01, "LD BC,#nn"),
	new Opcode(0x02, "LD (BC),A"),
	new Opcode(0x03, "INC BC"),
	new Opcode(0x04, "INC B"),
	new Opcode(0x05, "DEC B"),
	new Opcode(0x06, "LD B,#n"),
	new Opcode(0x07, "RLCA"),
	new Opcode(0x08, "EX AF,AF'"),
	new Opcode(0x09, "ADD HL,BC"),
	new Opcode(0x0A, "LD A,(BC)"),
	new Opcode(0x0B, "DEC BC"),
	new Opcode(0x0C, "INC C"),
	new Opcode(0x0D, "DEC C"),
	new Opcode(0x0E, "LD C,#n"),
	new Opcode(0x0F, "RRCA"),
	new Opcode(0x10, "DJNZ #n"),
	new Opcode(0x11, "LD DE,#nn"),
	new Opcode(0x12, "LD (DE),A"),
	new Opcode(0x13, "INC DE"),
	new Opcode(0x14, "INC D"),
	new Opcode(0x15, "DEC D"),
	new Opcode(0x16, "LD D,#n"),
	new Opcode(0x17, "RLA"),
	new Opcode(0x18, "JR #n"),
	new Opcode(0x19, "ADD HL,DE"),
	new Opcode(0x1A, "LD A,(DE)"),
	new Opcode(0x1B, "DEC DE"),
	new Opcode(0x1C, "INC E"),
	new Opcode(0x1D, "DEC E"),
	new Opcode(0x1E, "LD E,#n"),
	new Opcode(0x1F, "RRA"),
	new Opcode(0x20, "JR NZ,#n"),
	new Opcode(0x21, "LD HL,#nn"),
	new Opcode(0x22, "LD (#nn),HL"),
	new Opcode(0x23, "INC HL"),
	new Opcode(0x24, "INC H"),
	new Opcode(0x25, "DEC H"),
	new Opcode(0x26, "LD H,#n"),
	new Opcode(0x27, "DAA"),
	new Opcode(0x28, "JR Z,#n"),
	new Opcode(0x29, "ADD HL,HL"),
	new Opcode(0x2A, "LD HL,(#nn)"),
	new Opcode(0x2B, "DEC HL"),
	new Opcode(0x2C, "INC L"),
	new Opcode(0x2D, "DEC L"),
	new Opcode(0x2E, "LD L,#n"),
	new Opcode(0x2F, "CPL"),
	new Opcode(0x30, "JR NC,#n"),
	new Opcode(0x31, "LD SP,#nn"),
	new Opcode(0x32, "LD (#nn),A"),
	new Opcode(0x33, "INC SP"),
	new Opcode(0x34, "INC (HL)"),
	new Opcode(0x35, "DEC (HL)"),
	new Opcode(0x36, "LD (HL),#n"),
	new Opcode(0x37, "SCF"),
	new Opcode(0x38, "JR C,#n"),
	new Opcode(0x39, "ADD HL,SP"),
	new Opcode(0x3A, "LD A,(#nn)"),
	new Opcode(0x3B, "DEC SP"),
	new Opcode(0x3C, "INC A"),
	new Opcode(0x3D, "DEC A"),
	new Opcode(0x3E, "LD A,#n"),
	new Opcode(0x3F, "CCF"),
	new Opcode(0x40, "LD B,B"),
	new Opcode(0x41, "LD B,C"),
	new Opcode(0x42, "LD B,D"),
	new Opcode(0x43, "LD B,E"),
	new Opcode(0x44, "LD B,H"),
	new Opcode(0x45, "LD B,L"),
	new Opcode(0x46, "LD B,(HL)"),
	new Opcode(0x47, "LD B,A"),
	new Opcode(0x48, "LD C,B"),
	new Opcode(0x49, "LD C,C"),
	new Opcode(0x4A, "LD C,D"),
	new Opcode(0x4B, "LD C,E"),
	new Opcode(0x4C, "LD C,H"),
	new Opcode(0x4D, "LD C,L"),
	new Opcode(0x4E, "LD C,(HL)"),
	new Opcode(0x4F, "LD C,A"),
	new Opcode(0x50, "LD D,B"),
	new Opcode(0x51, "LD D,C"),
	new Opcode(0x52, "LD D,D"),
	new Opcode(0x53, "LD D,E"),
	new Opcode(0x54, "LD D,H"),
	new Opcode(0x55, "LD D,L"),
	new Opcode(0x56, "LD D,(HL)"),
	new Opcode(0x57, "LD D,A"),
	new Opcode(0x58, "LD E,B"),
	new Opcode(0x59, "LD E,C"),
	new Opcode(0x5A, "LD E,D"),
	new Opcode(0x5B, "LD E,E"),
	new Opcode(0x5C, "LD E,H"),
	new Opcode(0x5D, "LD E,L"),
	new Opcode(0x5E, "LD E,(HL)"),
	new Opcode(0x5F, "LD E,A"),
	new Opcode(0x60, "LD H,B"),
	new Opcode(0x61, "LD H,C"),
	new Opcode(0x62, "LD H,D"),
	new Opcode(0x63, "LD H,E"),
	new Opcode(0x64, "LD H,H"),
	new Opcode(0x65, "LD H,L"),
	new Opcode(0x66, "LD H,(HL)"),
	new Opcode(0x67, "LD H,A"),
	new Opcode(0x68, "LD L,B"),
	new Opcode(0x69, "LD L,C"),
	new Opcode(0x6A, "LD L,D"),
	new Opcode(0x6B, "LD L,E"),
	new Opcode(0x6C, "LD L,H"),
	new Opcode(0x6D, "LD L,L"),
	new Opcode(0x6E, "LD L,(HL)"),
	new Opcode(0x6F, "LD L,A"),
	new Opcode(0x70, "LD (HL),B"),
	new Opcode(0x71, "LD (HL),C"),
	new Opcode(0x72, "LD (HL),D"),
	new Opcode(0x73, "LD (HL),E"),
	new Opcode(0x74, "LD (HL),H"),
	new Opcode(0x75, "LD (HL),L"),
	new Opcode(0x76, "HALT"),
	new Opcode(0x77, "LD (HL),A"),
	new Opcode(0x78, "LD A,B"),
	new Opcode(0x79, "LD A,C"),
	new Opcode(0x7A, "LD A,D"),
	new Opcode(0x7B, "LD A,E"),
	new Opcode(0x7C, "LD A,H"),
	new Opcode(0x7D, "LD A,L"),
	new Opcode(0x7E, "LD A,(HL)"),
	new Opcode(0x7F, "LD A,A"),
	new Opcode(0x80, "ADD A,B"),
	new Opcode(0x81, "ADD A,C"),
	new Opcode(0x82, "ADD A,D"),
	new Opcode(0x83, "ADD A,E"),
	new Opcode(0x84, "ADD A,H"),
	new Opcode(0x85, "ADD A,L"),
	new Opcode(0x86, "ADD A,(HL)"),
	new Opcode(0x87, "ADD A,A"),
	new Opcode(0x88, "ADC A,B"),
	new Opcode(0x89, "ADC A,C"),
	new Opcode(0x8A, "ADC A,D"),
	new Opcode(0x8B, "ADC A,E"),
	new Opcode(0x8C, "ADC A,H"),
	new Opcode(0x8D, "ADC A,L"),
	new Opcode(0x8E, "ADC A,(HL)"),
	new Opcode(0x8F, "ADC A,A"),
	new Opcode(0x90, "SUB B"),
	new Opcode(0x91, "SUB C"),
	new Opcode(0x92, "SUB D"),
	new Opcode(0x93, "SUB E"),
	new Opcode(0x94, "SUB H"),
	new Opcode(0x95, "SUB L"),
	new Opcode(0x96, "SUB (HL)"),
	new Opcode(0x97, "SUB A"),
	new Opcode(0x98, "SBC A,B"),
	new Opcode(0x99, "SBC A,C"),
	new Opcode(0x9A, "SBC A,D"),
	new Opcode(0x9B, "SBC A,E"),
	new Opcode(0x9C, "SBC A,H"),
	new Opcode(0x9D, "SBC A,L"),
	new Opcode(0x9E, "SBC A,(HL)"),
	new Opcode(0x9F, "SBC A,A"),
	new Opcode(0xA0, "AND B"),
	new Opcode(0xA1, "AND C"),
	new Opcode(0xA2, "AND D"),
	new Opcode(0xA3, "AND E"),
	new Opcode(0xA4, "AND H"),
	new Opcode(0xA5, "AND L"),
	new Opcode(0xA6, "AND (HL)"),
	new Opcode(0xA7, "AND A"),
	new Opcode(0xA8, "XOR B"),
	new Opcode(0xA9, "XOR C"),
	new Opcode(0xAA, "XOR D"),
	new Opcode(0xAB, "XOR E"),
	new Opcode(0xAC, "XOR H"),
	new Opcode(0xAD, "XOR L"),
	new Opcode(0xAE, "XOR (HL)"),
	new Opcode(0xAF, "XOR A"),
	new Opcode(0xB0, "OR B"),
	new Opcode(0xB1, "OR C"),
	new Opcode(0xB2, "OR D"),
	new Opcode(0xB3, "OR E"),
	new Opcode(0xB4, "OR H"),
	new Opcode(0xB5, "OR L"),
	new Opcode(0xB6, "OR (HL)"),
	new Opcode(0xB7, "OR A"),
	new Opcode(0xB8, "CP B"),
	new Opcode(0xB9, "CP C"),
	new Opcode(0xBA, "CP D"),
	new Opcode(0xBB, "CP E"),
	new Opcode(0xBC, "CP H"),
	new Opcode(0xBD, "CP L"),
	new Opcode(0xBE, "CP (HL)"),
	new Opcode(0xBF, "CP A"),
	new Opcode(0xC0, "RET NZ"),
	new Opcode(0xC1, "POP BC"),
	new Opcode(0xC2, "JP NZ,#nn"),
	new Opcode(0xC3, "JP #nn"),
	new Opcode(0xC4, "CALL NZ,#nn"),
	new Opcode(0xC5, "PUSH BC"),
	new Opcode(0xC6, "ADD A,#n"),
	new Opcode(0xC7, "RST %s"),
	new Opcode(0xC8, "RET Z"),
	new Opcode(0xC9, "RET"),
	new Opcode(0xCA, "JP Z,#nn"),
	new OpcodeExtended(0xCB, OpcodesCB),
	new Opcode(0xCC, "CALL Z,#nn"),
	new Opcode(0xCD, "CALL #nn"),
	new Opcode(0xCE, "ADC A,#n"),
	new Opcode(0xCF, "RST %s"),
	new Opcode(0xD0, "RET NC"),
	new Opcode(0xD1, "POP DE"),
	new Opcode(0xD2, "JP NC,#nn"),
	new Opcode(0xD3, "OUT (#n),A"),
	new Opcode(0xD4, "CALL NC,#nn"),
	new Opcode(0xD5, "PUSH DE"),
	new Opcode(0xD6, "SUB #n"),
	new Opcode(0xD7, "RST %s"),
	new Opcode(0xD8, "RET C"),
	new Opcode(0xD9, "EXX"),
	new Opcode(0xDA, "JP C,#nn"),
	new Opcode(0xDB, "IN A,(#n)"),
	new Opcode(0xDC, "CALL C,#nn"),
	new OpcodeExtended(0xDD, OpcodesDD),
	new Opcode(0xDE, "SBC A,#n"),
	new Opcode(0xDF, "RST %s"),
	new Opcode(0xE0, "RET PO"),
	new Opcode(0xE1, "POP HL"),
	new Opcode(0xE2, "JP PO,#nn"),
	new Opcode(0xE3, "EX (SP),HL"),
	new Opcode(0xE4, "CALL PO,#nn"),
	new Opcode(0xE5, "PUSH HL"),
	new Opcode(0xE6, "AND #n"),
	new Opcode(0xE7, "RST %s"),
	new Opcode(0xE8, "RET PE"),
	new Opcode(0xE9, "JP (HL)"),
	new Opcode(0xEA, "JP PE,#nn"),
	new Opcode(0xEB, "EX DE,HL"),
	new Opcode(0xEC, "CALL PE,#nn"),
	new OpcodeExtended(0xED, OpcodesED),
	new Opcode(0xEE, "XOR #n"),
	new Opcode(0xEF, "RST %s"),
	new Opcode(0xF0, "RET P"),
	new Opcode(0xF1, "POP AF"),
	new Opcode(0xF2, "JP P,#nn"),
	new Opcode(0xF3, "DI"),
	new Opcode(0xF4, "CALL P,#nn"),
	new Opcode(0xF5, "PUSH AF"),
	new Opcode(0xF6, "OR #n"),
	new Opcode(0xF7, "RST %s"),
	new Opcode(0xF8, "RET M"),
	new Opcode(0xF9, "LD SP,HL"),
	new Opcode(0xFA, "JP M,#nn"),
	new Opcode(0xFB, "EI"),
	new Opcode(0xFC, "CALL M,#nn"),
	new OpcodeExtended(0xFD, OpcodesFD),
	new Opcode(0xFE, "CP #n"),
	new Opcode(0xFF, "RST %s")
];

