
import {Log} from '../log';
import {Utility} from './utility';


/**
 * Class for associating IDs with objects.
 */
export class RefList<type> extends Array<type> {

	// The start index, usually 0.
	protected startIndex = 0;


	/**
	 * Constructor.
	 * @param startIndex (Default = 0) An optional start index which is added to the
	 * ref value.
	 * E.g. if 0 (or empty) the first returned ref starts at 1.
	 */
	constructor(startIndex = 0) {
		super();
		Utility.assert(startIndex >= 0, "RefList: startIndex wrong.");
		this.startIndex = startIndex;
	}


	/**
	 * Adds an object to the list and returns it's index.
	 * Use this instead of a simple push if you need to get the reference id to the object.
	 * If you don't need the id you can use push or unshift.
	 * @param obj The object to add.
	 * @returns The index of the object in the list. I.e. a unique reference number (!=0) to the object. Or if obj is undefined it returns 0.
	 */
	public addObject(obj: any): number {
		if (obj == undefined)
			return 0;
		this.push(obj);
		const id = this.length;
		return id + this.startIndex;
	}


	/**
	 * Returns the corresponding object for a given reference.
	 * @param ref The reference to the object.
	 * @returns The object or undefined if not found.
	 */
	public getObject(ref: number): any {
		ref -= this.startIndex;
		if (ref <= 0 || ref > this.length) {
			Log.log('RefList Error: reference ' + ref + ' not found!');
			return undefined;
		}
		const obj = this[ref-1];
		return obj;
	}


	/**
	 * @returns The first element of the array. undefined if array is empty.
	 */
	public first(): any {
		if (this.length == 0)
			return undefined;
		return this[0];
	}


	/**
	 * @returns The last element of the array. undefined if array is empty.
	 */
	public last(): any {
		if (this.length == 0)
			return undefined;
		return this[this.length-1];
	}


	/**
	 * Removes all variables.
	*/
	public clear() {
		this.length = 0;
	}

}
