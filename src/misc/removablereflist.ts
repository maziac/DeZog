
import {Log} from '../log';
import {RefList} from './reflist';


/**
 * Class for associating IDs with objects.
 * Note:
 * Use of length is unreliable as the list may contain also undefined items.
 * This happens when entries are removed.
 */
export class RemovableRefList<type> extends RefList<type> {

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
		// First check if there maybe is an undefined entry (because of 'remove')
		const foundIndex = this.indexOf(undefined as any);
		if (foundIndex >= 0) {
			// Re-use
			this[foundIndex] = obj;
			return foundIndex + 1;
		}
		// New entry
		this.push(obj);
		const id = this.length;
		return id;
	}


	/**
	 * Returns the corresponding object for a given reference.
	 * @param ref The reference to the object.
	 * @returns The object or undefined if not found.
	 */
	public getObject(ref: number): any {
		if (ref <= 0 || ref > this.length) {
			Log.log('RefList Error: reference ' + ref + ' not found!');
			return undefined;
		}
		const obj = this[ref - 1];
		if (obj == undefined) {
			Log.log('RefList Error: reference ' + ref + ' not found (inside)!');
		}
		return obj;
	}


	/**
	 * @returns The first element of the array. undefined if array is empty.
	 */
	public first(): any {
		for (const obj of this) {
			if (obj)
				return obj;
		}
		return undefined;
	}


	/**
	 * @returns The last element of the array. undefined if array is empty.
	 */
	public last(): any {
		// Skip undefined entries
		for (let i = this.length - 1; i >= 0; i--) {
			const obj = this[i];
			if (obj)
				return obj;
		}
		return undefined;
	}


	/**
	 * Removes the variables that are passed as references.
	 * Note: this can lead to undefined entries in the array.
	 * @param refs An array with the variable references to remove.
	 */
	public removeObjects(refs: number[]) {
		const length = this.length;
		for (const ref of refs) {
			const i = ref - 1;
			if (i >= 0 && i < length) {
				this[i] = undefined as any;
			}
		}
	}


	/**
	 * Removes all variables.
	 */
	public clear() {
		this.length = 0;
	}

}
