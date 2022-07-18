import {BaseView} from './baseview';
import {Utility} from '../misc/utility';



/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class TextView extends BaseView {
	/**
	 * Creates the text view.
	 * @param title The title to use for this view.
	 * @param html The html to show.
	 */
	constructor(title: string, html: string) {
		super();
		// Title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = title;
		// Use the text
		this.setHtml(html);
	}


	/**
	 * Sets the html code to display the text.
	 * @param text Text to display.
	 */
	protected setHtml(text: string) {
		const format = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Dump</title>
</head>

<body>

<pre>
${text}
</pre>

</body>
</html>
`;
		// Add html body
		const html = format;
		this.vscodePanel.webview.html = html;
	}
}

