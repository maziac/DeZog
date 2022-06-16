import {HtmlView} from './htmlview';


/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class TextView extends HtmlView {
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

