/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// common
export interface Image {
    src: string;
    width: number;
    height: number;
}

// header
export interface Header {
    logo: Image;
    message: string;
}

// changelog
export enum ChangeLogKind {
    NEW = "NEW",
    CHANGED = "CHANGED",
    FIXED = "FIXED",
    VERSION = "VERSION",
    INTERNAL = "INTERNAL"
}

export enum IssueKind {
    Issue = "Issue",
    PR="PR"
}

export interface ChangeLogIssue {
    message: string;
    id?: number;
    kind?: IssueKind;
    kudos?: string;
}

export interface ChangeLogVersion {
    releaseNumber: string;
    releaseDate: string;
}

export interface ChangeLogItem {
    kind: ChangeLogKind;
    detail: ChangeLogIssue | ChangeLogVersion;
}

// sponsor
export interface Sponsor {
    title: string;
    link: string;
    image: string;
    width: number;
    message: string;
    extra: string;
}

export interface ContentProvider {
    provideHeader(logoUrl: string): Header;
    provideChangeLog(): ChangeLogItem[];
    provideSponsors(): Sponsor[];
}