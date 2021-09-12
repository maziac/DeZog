import * as vscode from 'vscode';


/**
 * A single that manges diagnostics. I.e. errors found in the
 * peripherals js code.
 */
export class DiagnosticsHandler {

	// The diagnostics collection.
	protected static diagnosticsCollection: vscode.DiagnosticCollection;


	/**
	 * Subscribes the diagnostics.
	 */
	public static Init(context: vscode.ExtensionContext) {
		this.diagnosticsCollection = vscode.languages.createDiagnosticCollection("DeZog");
		context.subscriptions.push(this.diagnosticsCollection);
	}

	/**
	 * Clears all diagnostics messages.
	 * E.g. called at start of unit tests or at start of a
	 * debug session.
	 */
	public static clear() {
		this.diagnosticsCollection.clear();
	}


	/**
	 * Adds a diagnostics message for a file.
	 * @param message The shown message.
	 * @param filepath Absolute path to the file.
	 * @param lien The line number.
	 * @param column The column number.
	 */
	public static add(message: string, filepath: string, line: number, column = 0) {
		const uri = vscode.Uri.file(filepath);
		const range = new vscode.Range(line, column, line, column);
		const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
		this.diagnosticsCollection.set(uri, [diagnostic]);
	}
}

