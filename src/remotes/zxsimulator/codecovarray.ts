import {Utility} from "../../misc/utility";



/**
 * This is an array to store the code coverage addresses efficiently.
 * A Set could be used instead, but this would be about 4 times slower.
 *
 * Idea:
 * Each time an address is executed it needs to be stored.
 * Only the knowledge if an address has been executed is important and not
 * how often or the order of execution.
 *
 * So we need only 1 bit of information. In one byte we could can store 8 addresses.
 * So for the whole address range 0x0000-0xFFFF we need an array of
 * size 65536/8 = 8k = 8192.
 *
 * To retrieve the addresses another array is used:
 * When an address should be stored it is checked if it is already present.
 * If so, nothing is done.
 * If not, the bit in th 8k array is set. Then the address is stored additionally
 * in the other array.
 */
export class CodeCoverageArray {

	/**
	 * This tests the performance of using a specialized Uint8Array
	 * versus a Set.
	 * The result is that the Set version is about 4x slower.
	 */
	static performanceTest() {
		const repetitions=100;

		{
			const bytes=new Uint8Array(0x10000);
			const t0=new Date().getTime();
			for (let r=repetitions; r>0; r--) {
				for (let i=32768; i>0; i--) {
					bytes[i]=1;
				}
			}
			const t1=new Date().getTime();
			const diff=(t1-t0)/repetitions;
			const diffns=diff*1000000;	// convert to ns
			console.log("Pure Uint8Array: ", diffns);
		}

		{
			const bytes=new Uint8Array(0x10000);
			const arr=new Uint16Array(0x10000);
			let index=0;
			const t0=new Date().getTime();
			for (let r=repetitions; r>0; r--) {
				for (let i=32768; i>0; i--) {
					if (bytes[i]==0) {
						// New address
						arr[index++]=i;
						bytes[i]=1;
					}
				}
			}
			const t1=new Date().getTime();
			const diff=(t1-t0)/repetitions;
			const diffns=diff*1000000;	// convert to ns
			console.log("Intelligent Uint8Array: ", diffns);
		}

		{
			const set=new Set<number>();
			const t0=new Date().getTime();
			for (let r=repetitions; r>0; r--) {
				for (let i=32768; i>0; i--) {
					set.add(i);
				}
			}
			const t1=new Date().getTime();
			const diff=(t1-t0)/repetitions;
			const diffns=diff*1000000;	// convert to ns
			console.log("Set: ", diffns);
		}

		{
			const data=new Uint8Array(8192);
			const time_ns=Utility.measure(() => {
				data.fill(0);
			});
			console.log("fill: ", time_ns);	// 100
		}

		{
			const data=new Uint8Array(8192);
			const time_ns=Utility.measure(() => {
				for (let i=1000; i<2000; i++)
					data[i]=0;
			});
			console.log("fill: ", time_ns);	// 570
		}

		console.log("Ready");
	}


	// The 8k memory area to store information about 8 addresses.
	protected memoryArea = new Uint8Array(0x10000/8);

	// This is a list of addresses used addresses.
	protected addressList=new Uint16Array(0x10000);

	// Index into the addressList.
	protected listIndex=0;


	/**
	 * When an address should be stored it is checked if it is already present.
	 * If so, nothing is done.
	 * If not, the bit in th 8k array is set. Then the address is stored additionally
	 * in another array.
	 */
	public storeAddress(address: number) {
		// Check if address already exists
		const reducedAddress=address>>>3;	// 2^3=8 bit
		const lowAddr=address&0b111;	// last 3 bits
		const bit=0b1<<lowAddr;	// Get bit position
		const memValue=this.memoryArea[reducedAddress];
		if (memValue && (memValue&bit)) {
			// Address already used
			return;
		}

		// Address not yet used
		this.memoryArea[reducedAddress]=memValue|bit;
		// Add to list
		this.addressList[this.listIndex++]=address;
	}


	/**
	 * Returns an array with the addresses.
	 */
	public getAddresses(): Set<number> {
		const addresses=new Set<number>();
		const len=this.listIndex;
		for (let i=0; i<len; i++)
			addresses.add(this.addressList[i]);
		return addresses;
	}


	/**
	 * Clears the memory for the next code coverage measurements.
	 * Note: The fill is done in a few nano seconds no need for optimization.
	 */
	public clearAll() {
		this.memoryArea.fill(0);
		this.listIndex=0;
	}

}
