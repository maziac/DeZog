
import { Log } from './log';


/**
 * Class for associating IDs with objects.
 * Used e.g. for the variable references.
 */
export class RefList extends Array {

	/**
	 * Adds an object to the list and returns it's index.
	 * @param obj The object to add.
	 * @returns The index of the object in the list. I.e. a unique reference number (!=0) to the object.
	 */
	public addObject(obj: any): number {
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
		if(ref<=0 || ref>this.length) {
			Log.log('Error: reference '+ref+' not found!');
			return undefined;
		}
		const obj = this[ref-1];
		return obj;
	}

}
