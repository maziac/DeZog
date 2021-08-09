
//import {Log} from '../log';
import {RefList} from './reflist';
import {Utility} from './utility';


/**
 * Class for associating IDs with objects.
 * Used for the variable references.
 * It maintains permanent and temporary variables.
 * Temporary variables live only for one debugger step.
 * The list is cleared every step via 'clearTemporary'.
 * The whole list is cleared by 'clear'.
 */
export class VarRefList<type> extends RefList<type> {
	// Temporary IDs start at this value. I.e. everything below is a persistent ID.
	protected TMP_ID_START = 100_000;

	// Temporary list
	protected tmpObjs = new RefList<type>();

	/**
	 * Adds an object to the list and returns it's index.
	 * @param obj The object to add.
	 * @returns The index of the object in the list. I.e. a unique reference number (!=0) to the object. Or if obj is undefined it returns 0.
	 */
	public addObject(obj: any): number {
		const id = super.addObject(obj);
		Utility.assert(id < this.TMP_ID_START, 'RefList Error: Too many persistent variables.');
		return id;
	}


	/**
	 * Adds a temporary object.
	 */
	public addTmpObject(obj: any): number {
		let id = this.tmpObjs.addObject(obj);
		if (id != 0)
			id += this.TMP_ID_START;
		return id;
	}


	/**
	 * Returns the corresponding object for a given reference.
	 * @param ref The reference to the object.
	 * @returns The object or undefined if not found.
	 */
	public getObject(ref: number): any {
		if (ref < this.TMP_ID_START) {
			// Persistent variable
			return super.getObject(ref);
		}
		// Temporary variable
		return this.tmpObjs.getObject(ref - this.TMP_ID_START);
	}


	/**
	 * Removes all temporary variables.
	 */
	public clearTemporary() {
		this.tmpObjs.clear();
	}


	/**
	 * Removes all variables.
	*/
	public clear() {
		super.clear();
		this.clearTemporary();
	}
}
