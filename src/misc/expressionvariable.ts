import {ImmediateMemoryValue} from "../variables/shallowvar";

/**
 * The data here represents a variable held in the expressions list.
 * It is either a reference to variable or an ImmediateValue object.
 */
export interface ExpressionVariable {
	// A description shown on hovering.
	description: string;

	// An immediate value object or a reference to the variable.
	// If set varRef is 0.
	immediateValue?: ImmediateMemoryValue;

	// The variables reference.
	// If used the immediateValue is undefined.
	varRef: number;

	// The number of indexed child variables.
	count: number;
}

