import {Serializable, MemBuffer} from "../../misc/membuffer";
import {Z80Ports} from "./z80ports";


/** ZX81 keyboard simulation.
 */
export class Zx81Keyboard implements Serializable {

	// The keyboard values, each low bit is an activated key.
	protected keyboardMatrix = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);


	/** Constructor.
	 */
	constructor(ports: Z80Ports) {
		// Register the keyboard ports
		ports.registerGenericInPortFunction((port: number) => this.readPort(port));
	}


	/** Returns the value of the read port.
	 * @param port The port to read.
	 */
	protected readPort(port: number): number {
		// Every even port address will do.
		if (port & 0x01)
			return undefined as any;
		// Even port address: In the high byte of the port, every low
		// bit activates another part of the keyboard.
		const activeBit = (port >> 8) ^ 0xFF;	// Invert: HIGH = active
		let value = 0xFF;
		if (activeBit & 0b0000_0001)	// SHIFT, Z, X, C, V
			value &= this.keyboardMatrix[0];
		if (activeBit & 0b0000_0010)	// A, S, D, F, G
			value &= this.keyboardMatrix[1];
		if (activeBit & 0b0000_0100)	// Q, W, E, R, T
			value &= this.keyboardMatrix[2];
		if (activeBit & 0b0000_1000)	// 1, 2, 3, 4, 5
			value &= this.keyboardMatrix[3];
		if (activeBit & 0b0001_0000)	// 0, 9, 8, 7, 6
			value &= this.keyboardMatrix[4];
		if (activeBit & 0b0010_0000)	// P, O, I, U, Y
			value &= this.keyboardMatrix[5];
		if (activeBit & 0b0100_0000)	// ENTER, L, K, J, H
			value &= this.keyboardMatrix[6];
		if (activeBit & 0b1000_0000)	// SPACE, . (SYM), M, N, B
			value &= this.keyboardMatrix[7];

		// Note: The other bits:
		// Bit 5: Not used
		// Bit 6: Display refresh rate (0=60Hz, 1=50Hz)
		// Bit 7: Cassette input (0=normal, 1=pulse)
		return (value & 0b0001_1111) | 0b0100_0000;
	}


	/** Sets a key in the keyboard matrix.
	 * @param row The row of the key.
	 * @param bit The bit that correspondents to the column, active high.
	 * @param pressed True, if the key is pressed.
	 */
	public setKey(row: number, bit: number, pressed: boolean) {
		const oldValue = this.keyboardMatrix[row];
		this.keyboardMatrix[row] = pressed ? (oldValue & ~bit) : (oldValue | bit);
	}


	/** Serializes the object.
	 * Basically the last beeper value.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Note: keyboardMAtrix is not saved, as the keys are probably not pressed anymore on restore.
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
	}
}
