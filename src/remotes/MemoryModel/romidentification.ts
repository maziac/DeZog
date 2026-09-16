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


	/** Slot 0 (0x0000-0x1FFF): a single 10 byte read at this (bank-relative)
	 * offset is enough to tell apart almost all known ZX Next ROM images.
	 * A few pairs are byte-identical here and need one extra byte
	 * (secondaryOffset/-Length) to be told apart.
	 */
	protected static readonly SLOT0_PRIMARY_OFFSET = 0x1341;
	protected static readonly SLOT0_PRIMARY_LENGTH = 10;
	protected static readonly SLOT0_SIGNATURES = new Map<string, RomSignature>([
		['7F5BF5EF551623F177D1', {name: 'ROM0 (128-2)'}],
		['2CC3142D06151617C3B4', {name: 'ROM0 (128-3e)'}],
		['CD732B210DECCB76200B', {name: 'ROM1 (128-3e)'}],
		['72D12373237223772122', {name: 'ROM2 (128-3e)'}],
		['2BEFE519ED4B725B2A53', {name: 'ROM0 (128)'}],
		['425CFD360A0021665BCB', {name: 'ROM0 (128 ES)'}],
		['46013A3CD7804FD7040D', {name: 'ROM0 (AltZX)'}],
		['00F5ED8A1352ED8A007B', {name: 'ROM1 (AltZX)'}],
		['00000000000000000000', {name: 'ROM0 (NextZX/NextLG)'}],
		['2B56ED34040009DD7CC9', {name: 'ROM1 (NextZX/NextLG)'}],
		['CDB22AC31227285E2D2B', {name: 'ROM3 (NextZX/NextLG)'}],
		['0BF132973EA7C921F11B', {name: 'Multiface'}],
		['007E23B9C07EB8C0ED34', {name: 'NextMMC'}],
		['3C78119113CD0A0CAF11', {name: 'ROM1 (Gosh Wonderful)'}],
		['3978119113CD0A0CAF11', {name: 'ROM1 (Looking Glass)'}],
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
	]);


	/** Slot 1 (0x2000-0x3FFF), same idea as SLOT0_SIGNATURES but for the
	 * upper half of the ROM. Offsets are bank-relative (0-0x1FFF).
	 * Note: several 48k-compatible ROM1 variants (128, 128-2, 128 ES, 48k,
	 * TC2048, 128-3e/+3 ROM3) only differ in a handful of scattered patch
	 * bytes, spread out so far across the 8k that no single contiguous
	 * area of reasonable size can tell all of them apart at once (checked
	 * up to several hundred bytes). The secondary check below resolves
	 * as many as it can with a single extra byte; 128/128-2/128 ES remain
	 * one combined name, as do 128-3e/+3 (their ROM3 halves are otherwise
	 * near-identical).
	 */
	protected static readonly SLOT1_PRIMARY_OFFSET = 0x2532;
	protected static readonly SLOT1_PRIMARY_LENGTH = 10;
	protected static readonly SLOT1_SIGNATURES = new Map<string, RomSignature>([
		['47E6C04F78878787E638', {name: 'ROM0 (128-2)'}],
		['682600193E20B8C83600', {name: 'ROM0 (128-3e)'}],
		['CD5B23CABE0FE1C9CD73', {name: 'ROM1 (128-3e)'}],
		['300E200CDD34002019DD', {name: 'ROM2 (128-3e)'}],
		['54BA385482150B942A0A', {name: 'ROM0 (128)'}],
		['242003221EFFDD21725B', {name: 'ROM0 (128 ES)'}],
		['535045435452554D227F', {name: 'ROM0 (AltZX)'}],
		['305E2190E00101001101', {name: 'ROM1 (AltZX)'}],
		['A9A9A946CEA9A9CE8888', {name: 'ROM0 (NextZX/NextLG)'}],
		['00000000000000000000', {name: 'ROM1 (NextZX/NextLG)'}],
		['017EC9CD07232A365CED', {name: 'ROM3 (NextZX/NextLG)'}],
		['017EC9CDBF3C2A365C11', {name: 'ROM1 (Gosh Wonderful)'}],
		['CB6728F5FBC9F1F1F1F1', {name: 'ROM0 (+3)'}],
		['BFC978FE2EC8CD512520', {name: 'ROM1 (+3)'}],
		['C93E04CD7E633A916AC6', {name: 'ROM2 (+3DOS)'}],
		['FFFFFFFFFFFFFFFFFFFF', {name: 'ROM (ZX80)'}],
		['2A0AFFCD4D233E13DA7D', {name: 'ROM (ZX81)'}],
		// Ambiguous at the primary offset: need a 2nd, single byte read.
		['017EC9CD07232A365C11', {
			name: 'ROM1 (48k variant)',
			secondaryOffset: 0x3871, secondaryLength: 1,
			secondaryMatches: new Map([
				['CB', 'ROM1 (128/128-2/128 ES)'],
				['FF', 'ROM1 (48k)'],
				['0A', 'ROM1 (TC2048)'],
				['BF', 'ROM3 (128-3e/+3)']
			])
		}],
		['F1DD6E1CDDE5CDF400DD', {
			name: 'ROM2 (NextZX/NextLG)',
			secondaryOffset: 0x20FE, secondaryLength: 1,
			secondaryMatches: new Map([['4C', 'ROM2 (NextLG)'], ['5A', 'ROM2 (NextZX)']])
		}],
		['017EC9CDD3392A365C11', {
			name: 'ROM1 (Looking Glass)',
			secondaryOffset: 0x3D09, secondaryLength: 1,
			secondaryMatches: new Map([['10', 'ROM1 (Looking Glass)'], ['18', 'ROM1 (Looking Glass Alt)']])
		}],
	]);


	/** Identifies the ROM name by inspecting bytes of the ROM.
	 * Reads a single, small primary area (offset/length depend on the slot).
	 * If several known ROMs share the same bytes there, a 2nd, small area
	 * is read to disambiguate (at most 1 extra read, to keep the number of
	 * round-trips to the target low).
	 * @param readMemory A function to read memory from the current 64k space.
	 * @param slot The slot number to inspect (0 or 1 for the ZX Next ROM area).
	 * @returns The identified ROM name or undefined if it could not be identified.
	 */
	public static async identify(readMemory: (offset: number, length: number) => Promise<Uint8Array>, slot: number): Promise<string | undefined> {
		let primaryOffset: number;
		let primaryLength: number;
		let signatures: Map<string, RomSignature>;
		if (slot === 0) {
			primaryOffset = this.SLOT0_PRIMARY_OFFSET;
			primaryLength = this.SLOT0_PRIMARY_LENGTH;
			signatures = this.SLOT0_SIGNATURES;
		}
		else if (slot === 1) {
			primaryOffset = this.SLOT1_PRIMARY_OFFSET;
			primaryLength = this.SLOT1_PRIMARY_LENGTH;
			signatures = this.SLOT1_SIGNATURES;
		}
		else {
			// Only slot 0 and 1 can hold a ROM in the ZX Next.
			return undefined;
		}

		const primaryBytes = await readMemory(primaryOffset, primaryLength);
		const match = signatures.get(this.bytesToHexKey(primaryBytes));
		if (!match)
			return undefined;

		if (match.secondaryMatches) {
			const secondaryBytes = await readMemory(match.secondaryOffset!, match.secondaryLength!);
			const secondaryName = match.secondaryMatches.get(this.bytesToHexKey(secondaryBytes));
			if (secondaryName)
				return secondaryName;
		}
		return match.name;
	}
}
