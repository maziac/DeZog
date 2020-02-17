import * as assert from 'assert';
import * as vscode from 'vscode';
import { CallSerializer } from '../callserializer';



/**
 * A Webview that serves as base class for other views like the MemoryDumpView or the
 * ZxNextSpritesView.
 */
export class BaseView {

	// STATIC:

	/// Holds a list of all derived view classes.
	/// Used to call the static update functions.
	public static staticViewClasses = new Array<any>();

	/// Holds a list of all open views.
	protected static staticViews = new Array<BaseView>();

	/**
	 * Is called on 'update' event.
	 * First calls the static update functions.
	 * Afterwards the update functions of all views.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 */
	public static staticCallUpdateFunctions(reason?: any) {
		// Loop all view classes
		for(const viewClass of BaseView.staticViewClasses) {
			viewClass.staticUpdate(reason);
		}
		// Loop all views
		for(const view of BaseView.staticViews) {
			view.update(reason);
		}
	}


	/**
	 * Closes all opened views.
	 * Is called when the debugger closes.
	 */
	public static staticCloseAll() {
		// Copy view array
		const views = BaseView.staticViews.map(view => view);
		// Dispose/close all views
		for(const view of views) {
			view.vscodePanel.dispose();
		}
	}


	/**
	 * Returns a list of all open views for a given class.
	 * @param viewClass A classname.
	 * @return All open views for the given class.
	 */
	public static staticGetAllViews(viewClass: any) {
		// Get all views of the given class
		const views = BaseView.staticViews.filter(view => view instanceof viewClass);
		return views;
	}


	// DYNAMIC:

	/// The panel to show the base view in vscode.
	protected vscodePanel: vscode.WebviewPanel;

	protected serializer = new CallSerializer('ViewUpdate');

	/**
	 * Creates the basic view.
	 * @param addToStaticViews Adds the view to the static views list so that
	 * it will get an update event. This is the default for debug windows.
	 * Other (independent) views can set this to false.
	 */
	constructor(addToStaticViews = true) {
		// Add to view list
		if (addToStaticViews)
			BaseView.staticViews.push(this);

		// create vscode panel view
		this.vscodePanel = vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine}, {enableScripts: true});

		// Handle closing of the view
		this.vscodePanel.onDidDispose(() => {
			// Remove from list
			const index = BaseView.staticViews.indexOf(this);
    		assert(index !== -1)
			BaseView.staticViews.splice(index, 1);
			// Call overwritable function
			this.disposeView();
		});

		// Handle messages from the webview
		this.vscodePanel.webview.onDidReceiveMessage(message => {
			console.log("webView command '"+message.command+"':", message);
			this.webViewMessageReceived(message);
		});

	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		// Can be overwritten
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 * This needs to be created inside the web view.
	 */
	protected webViewMessageReceived(message: any) {
		// Overwrite
	}


	/**
	 * A message is posted to the web view.
	 * @param message The message. message.command should contain the command as a string.
	 * This needs to be evaluated inside the web view.
	 * @param webview The webview to post to. Can be omitted, default is 'this'.
	 */
	protected sendMessageToWebView(message: any, webview: BaseView = this) {
		webview.vscodePanel.webview.postMessage(message);
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 */
	public update(reason?: any) {
		// Overwrite this.
	}

}

