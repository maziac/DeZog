import {ChangeLogItem, ChangeLogKind, ContentProvider, Header, Image, Sponsor, IssueKind} from "../3rdparty/vscode-whats-new/src/ContentProvider";

// Provide "Whatsnew" data
export class WhatsNewContentProvider implements ContentProvider {

	provideHeader(logoUrl: string): Header {
		return <Header>{
			logo: <Image>{src: logoUrl, height: 50, width: 50},
			message: `<b>DeZog<b> is an integrated Development environment for the Z80. It supports various assemblers and remote debugging. Especially for, but not limited to, ZX Spectrum devices.`};
	}

	provideChangeLog(): ChangeLogItem[] {
		let changeLog: ChangeLogItem[]=[];
		changeLog.push(...[
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `Support for the 'zxnext' remote type. This allows <a href="https://github.com/maziac/DeZogPlugin"><b>remote debugging via a serial cable directly on ZX Next device<b></a>.`,
					kind: IssueKind.Other
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `Changed to DZRP 1.6. I.e. if you are using CSpect <a href="https://github.com/maziac/DeZogPlugin/releases"><b>you need to update the DeZog CSpect Plugin</b></a>.
					The same time you should update <a href="http://dailly.blogspot.com">CSpect to (at least) version 2.12.34</a>`,
					id: 45,
					kind: IssueKind.Issue
				}
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `sjasmplus: support for additional '--lstlab' option. Simply add '--lstlab' to the samsplus assembler options. DeZog will automatically extract these option to improve label recognition.`,
					id: undefined as any,
					kind: IssueKind.PR
				},
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `Formatting of the Z80 flags changed.`,
					id: 45,
					kind: IssueKind.Issue
				}
			},
			{
				kind: ChangeLogKind.FIXED, detail: {
					message: `Activation error for "No-Folders Workspace" scenario (<a title=\"Open Issue #212\"
            href=\"https://github.com/alefragnani/vscode-bookmarks/issues/212\">
			Issue #212</a>)`,
					id: 45,
					kind: IssueKind.Issue
				}
			}
		]);
		return changeLog;
	}

	provideSponsors(): Sponsor[] {
		return [];
	}

}
