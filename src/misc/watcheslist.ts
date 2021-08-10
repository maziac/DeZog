
//import {Log} from '../log';
//import {Utility} from './utility';



interface WatchExpression {
	// The expression, e.g. "main+4, 2, 5"
	expression: string;
	// If it was used recently.
	used: boolean;
}


/**
 * A list with the expressions used in the WATCHes panel.
 * Purpose:
 * On every step the WATCHes panels does new evaluateRequests. Even if the
 * expression has not been changed.
 * The variable structures have already been setup, so it would be a waste do that
 * once again.
 * Therefore this list remembers all expression that have been evaluated/for which
 * a variable structure has been created already.
 * At threadsRequest (the start of a step) the list is cleared for all expression
 * that have not been 'used' previously.
 * Then for every evaluateRequest the expression is added.
 * A new variable (evaluateLabelsRequest) is only done if the expression does
 * not exist yet in the list. Because, if it exists, the variable reference
 * exists as well.
 */
export class WatchesList {

	// The list of expressions.
	protected list: Array<WatchExpression>;


	/**
	 * Constructor.
	 */
	constructor() {
		this.list = [];
	}


	/**
	 * Check if expression is in the list.
	 * If not it is added.
	 * The 'used' flag is set to true for the expression.
	 * @param expression The expression string to check for.
	 * @returns true if the expression is in the list. false if not.
	 */
	public using(expression: string): boolean {
		// Search for expression
		for (const watch of this.list) {
			if (watch.expression == expression) {
			 	watch.used = true;
				return true;
			}
		}
		// Not found
		this.list.push({
			expression,
			used: true
		});
		return false;
	}


	/**
	 * Removes all entires with 'used' == false flags.
	 */
	public clearUnused() {
		// Create new list with only used==true.
		const newList = this.list.filter(entry => entry.used);
		this.list = newList;
	}
}
