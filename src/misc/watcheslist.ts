
//import {Log} from '../log';
//import {Utility} from './utility';

import {ImmediateValue} from "../variables/shallowvar";


/**
 * The additional values that have to be stored for the variable
 * and that are returned on a 'get'.
 */
export interface WatchesResponse {
	/** The result of the evaluate request. */
	result: string;

	/** The optional type of the evaluate result.
		This attribute should only be returned by a debug adapter if the client has passed the value true for the 'supportsVariableType' capability of the 'initialize' request.
	*/
	type: string;
	/** Properties of a evaluate result that can be used to determine how to render the result in the UI. */

	variablesReference: number;

	/** The number of indexed child variables.
		The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
		The value should be less than or equal to 2147483647 (2^31-1).
	*/
	indexedVariables?: number;
}


/**
 * The items that are stored in the list.
 */
interface WatchExpression {
	// The expression, e.g. "main+4, 2, 5"
	expression: string;
	// The complete response for the evaluateRequest
	respBodyOrValue: WatchesResponse|ImmediateValue;
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
	 * The 'used' flag is set to true for the expression if it was found.
	 * @param expression The expression string to check for.
	 * @returns The associated response or undefined if not found.
	 */
	public async get(expression: string): Promise<WatchesResponse|undefined> {
		// Search for expression
		for (const watch of this.list) {
			if (watch.expression == expression) {
				let respBody = watch.respBodyOrValue;
				if (respBody instanceof ImmediateValue) {
					// Create an immediate result value
					const result = await respBody.getValue();
					respBody = {
						result,
						type: respBody.type,
						variablesReference: 0
					}
				}
				return respBody;
			}
		}
		// Not found
		return undefined;
	}


	/**
	 * Adds an item to the list.
	 * @param expression The expression to store.
	 * @param respBody The complete response with the variable reference.
	 */
	public push(expression: string, respBodyOrValue: WatchesResponse|ImmediateValue) {
		this.list.push({
			expression,
			respBodyOrValue
		});
	}

}
