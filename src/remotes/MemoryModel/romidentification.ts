/** Identifies ZX Next ROM images (factory ROM0/ROM1 and the alternative
 * ROMs shipped on the ZX Next distribution SD card, e.g. Gosh Wonderful,
 * Looking Glass, +3, TC2048, NextZX/NextLG, AltZX, Multiface, NextMMC)
 * from their content.
 * This is used because it is otherwise difficult to programmatically
 * determine which ROM is currently paged into slot 0/1, e.g. when an
 * AltROM has been loaded on real hardware.
 */


/** A known ROM signature.
 * 'name' is returned if the primary check matches and either there is
 * no secondary check or the secondary check does not match anything
 * in 'secondaryMatches' (graceful fallback to the more generic name).
 * If 'secondaryMatches' is given, a 2nd (small) memory area is read to
 * discriminate between ROMs that happen to share identical bytes in the
 * primary area (e.g. different builds of the same 48k-compatible ROM).
 */
interface RomSignature {
	name: string;
	secondaryOffset?: number;
	secondaryLength?: number;
	secondaryMatches?: Map<string, string>;	// key: uppercase hex bytes
}


export class RomIdentification {
	/** Converts the bytes to an uppercase hex string, used as map key. */
	protected static bytesToHexKey(bytes: Uint8Array): string {
		let s = '';
		for (const b of bytes)
			s += b.toString(16).padStart(2, '0');
		return s.toUpperCase();
	}


	/** A single 10 byte read at this (bank-relative) offset is enough to
	 * tell apart almost all known ZX Next ROM images. Since the whole 16k
	 * ROM content is reachable through a single bank read (not restricted
	 * to the 8k currently visible in the slot that bank happens to be
	 * paged into), one read covers both the low and the high half of the
	 * ROM at once - there is no need to identify slot 0 and slot 1
	 * separately.
	 * A few ROMs are byte-identical at this offset and need one extra
	 * byte (secondaryOffset/-Length, which may lie anywhere in 0-0x3FFF)
	 * to be told apart.
	 */
	protected static readonly ROM_PRIMARY_OFFSET = 0x1341;
	protected static readonly ROM_PRIMARY_LENGTH = 10;
	protected static readonly ROM_SIGNATURES = new Map<string, RomSignature>([
		['7F5BF5EF551623F177D1', {name: 'ROM0 (128-2)'}],
		['2CC3142D06151617C3B4', {name: 'ROM0 (128-3e)'}],
		['CD732B210DECCB76200B', {name: 'ROM1 (128-3e)'}],
		['72D12373237223772122', {name: 'ROM2 (128-3e)'}],
		['2BEFE519ED4B725B2A53', {name: 'ROM0 (128)'}],
		['425CFD360A0021665BCB', {name: 'ROM0 (128 ES)'}],
		['D778119313CD0A0CCD3B', {name: 'ROM1 (128 ES)'}],
		['46013A3CD7804FD7040D', {name: 'ROM0 (AltZX)'}],
		['00F5ED8A1352ED8A007B', {name: 'ROM1 (AltZX)'}],
		['00000000000000000000', {name: 'ROM0 (NextZX/NextLG)'}],
		['2B56ED34040009DD7CC9', {name: 'ROM1 (NextZX/NextLG)'}],
		['CDB22AC31227285E2D2B', {name: 'ROM3 (NextZX/NextLG)'}],
		['0BF132973EA7C921F11B', {name: 'Multiface'}],
		['007E23B9C07EB8C0ED34', {name: 'NextMMC'}],
		['3C78119113CD0A0CAF11', {name: 'ROM1 (Gosh Wonderful)'}],
		['00197E2FE611200CD5E5', {name: 'ROM0 (+3)'}],
		['5C010700EDB02A595C22', {name: 'ROM1 (+3)'}],
		['2416D1E130057EE6C777', {name: 'ROM2 (+3DOS)'}],
		['C0C0E0C000C820C840C8', {name: 'ROM (ZX80)'}],
		['401B79D606473E40280E', {name: 'ROM (ZX81)'}],
		// Ambiguous at the primary offset: need a 2nd, single byte read.
		['D778119113CD0A0CCD3B', {
			name: 'ROM1 (128/128-2)',
			secondaryOffset: 0x09A2, secondaryLength: 1,
			secondaryMatches: new Map([['50', 'ROM1 (128-2)'], ['53', 'ROM1 (128)']])
		}],
		['D778119113CD0A0CCD29', {
			name: 'ROM3 (128-3e/+3)',
			secondaryOffset: 0x0013, secondaryLength: 1,
			secondaryMatches: new Map([['A7', 'ROM3 (128-3e)'], ['FF', 'ROM3 (+3)']])
		}],
		['D778119113CD0A0CAF11', {
			name: 'ROM1 (48k/TC2048)',
			secondaryOffset: 0x129A, secondaryLength: 1,
			secondaryMatches: new Map([['0A', 'ROM1 (48k)'], ['6E', 'ROM1 (TC2048)']])
		}],
		['37C94D5B4D5B44E1E1E1', {
			name: 'ROM2 (NextZX/NextLG)',
			secondaryOffset: 0x1FF7, secondaryLength: 1,
			secondaryMatches: new Map([['6C', 'ROM2 (NextLG)'], ['34', 'ROM2 (NextZX)']])
		}],
		['3978119113CD0A0CAF11', {
			// lg.rom/lg18v07.rom/lg18alt.rom are byte-identical in the
			// low 8k; they only differ in the high 8k, at 0x3D09.
			name: 'ROM1 (Looking Glass)',
			secondaryOffset: 0x3D09, secondaryLength: 1,
			secondaryMatches: new Map([['10', 'ROM1 (Looking Glass)'], ['18', 'ROM1 (Looking Glass Alt)']])
		}],
	]);


	/** Identifies the ROM name by inspecting bytes of the ROM.
	 * Reads a single, small primary area. If several known ROMs share the
	 * same bytes there, a 2nd, small area is read to disambiguate (at most
	 * 1 extra read, to keep the number of round-trips to the target low).
	 * Since 'bank' addresses the ROM content directly (independent of
	 * which 8k slot it may currently be paged into, and independent of
	 * whether it is a "low" or "high" ROM bank), a single call identifies
	 * the complete 16k ROM - there is no need to call this separately for
	 * slot 0 and slot 1.
	 * @param readMemory A function to read memory from the given ROM bank.
	 * @param bank The bank number to inspect.
	 * @returns The identified ROM name or undefined if it could not be identified.
	 */
	public static async identify(readMemory: (bank: number, offset: number, length: number) => Promise<Uint8Array>, bank: number): Promise<string | undefined> {
		const primaryBytes = await readMemory(bank, this.ROM_PRIMARY_OFFSET, this.ROM_PRIMARY_LENGTH);
		const match = this.ROM_SIGNATURES.get(this.bytesToHexKey(primaryBytes));
		if (!match)
			return undefined;

		if (match.secondaryMatches) {
			const secondaryBytes = await readMemory(bank, match.secondaryOffset!, match.secondaryLength!);
			const secondaryName = match.secondaryMatches.get(this.bytesToHexKey(secondaryBytes));
			if (secondaryName)
				return secondaryName;
		}
		return match.name;
	}
}
