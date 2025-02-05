
/** For AggregateErrors I noticed that the 'message' property is empty.
 * This wrapper will use the first error message as the message.
 */
export class ErrorWrapper extends Error {

	public static wrap(err?: Error): Error {
		if (!err) {
			// If nothing passed -> unspecified error
			return new Error('Unspecified error!');
		}
		if (!err.message && err instanceof AggregateError && err.errors.length > 0) {
			// If aggregate error -> use first error message
			return new Error(err.errors[0]);
		}
		// Otherwise pass through
		return err;
	}
}
