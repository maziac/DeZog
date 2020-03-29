/**
 * Used for commenting labels (addresses) in the disassembly.
 */
export class Comment {
	/// The line before the statement.
	public linesBefore: Array<string>;
	/// The line on the statement.
	public inlineComment: string;
	/// The line after the statement.
	public linesAfter: Array<string>;

	/// Adds a line to the 'before'-comment.
	public addBefore(line: string) {
		if(!this.linesBefore)
			this.linesBefore = Array<string>();
		this.linesBefore.push(line);
	}

	/// Adds a line to the 'after'-comment.
	public addAfter(line: string) {
		if(!this.linesAfter)
			this.linesAfter = Array<string>();
		this.linesAfter.push(line);
	}

	/**
	 * Return a text with a lines array:
	 * Comment before the statement.
	 * Comment after the statement.
	 * Comment a line after the statement.
	 * @param comment The comment object.
	 * @param statement E.g. "SUB001:"
	 * @param disableComments If true, then no comment is written.
	 * @returns E.g. ";comment", "SUB001:\t; comment", ";comment"
	 */
	public static getLines(comment: Comment|undefined, statement: string, disableComments: boolean): Array<string> {
		if (!disableComments&&comment) {
			const arr = new Array<string>();
			if(comment.linesBefore)
				arr.push(...comment.linesBefore);
			let text = statement;
			if(comment.inlineComment)
				text += '\t' + comment.inlineComment;
			arr.push(text);
			if(comment.linesAfter)
				arr.push(...comment.linesAfter);
			return arr;
		}
		else {
			// no comment
			return [statement];
		}
	}
}
