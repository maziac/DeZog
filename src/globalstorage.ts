import * as vscode from 'vscode';


export class GlobalStorage {

	// The extension context.
	protected static context: vscode.ExtensionContext;

	/**
	 * Store the context here at activation of the extension.
	 */
	public static Init(context: vscode.ExtensionContext) {
		this.context = context;
	}


	/**
	 * Get a value.
	 */
	public static Get<T>(key: string): T | undefined {
		return this.context.globalState.get<T>(key);
	}


	/**
	 * Store a value.
	 */
	public static Set(key: string, value: any) {
		this.context.globalState.update(key, value);
	}
}
