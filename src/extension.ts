'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as ini from 'ini';
import * as clipboardy from 'clipboardy';

function getGitHubRepoURL(url: string) {
    if (url.endsWith('.git')) {
        url = url.substring(0, url.length - '.git'.length)
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    if (url.startsWith('git@')) {
        var domainList = url.match("git@(.+):.+$");
        if (domainList) {
            var domain = domainList[1];
            return 'https://' + domain + '/' + url.substring(('git@' + domain + ':').length);
        }
    }
    return null;
}

function calculateURL() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error('No selected editor');
    }
    const {document, selection} = editor;
    const {fileName} = document;
    let dir = path.dirname(fileName)
    let gitDir = null;
    while (true) {
        gitDir = path.join(dir, '.git')
        const exits = fs.existsSync(gitDir)
        if (exits) {
            console.log(gitDir);
            break;
        }
        dir = path.dirname(dir);
    }

    if (!gitDir) {
        throw new Error('No .git dir found. Is this a git repo?');
    }
    const relativePath = path.relative(dir, fileName);

    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8')
    const refPrefix = 'ref: ';
    const ref = head.split('\n').find(line => line.startsWith(refPrefix))
    if (!ref) {
        throw new Error('No ref found. Cannot calculate current commit');
    }
    const refName = ref.substring(refPrefix.length)
    const sha = fs.readFileSync(path.join(gitDir, refName), 'utf8').trim();

    const gitConfig = ini.parse(fs.readFileSync(path.join(gitDir, 'config'), 'utf8'))

    const branchInfo = Object.values(gitConfig).find(val => val['merge'] === refName);
    var remoteName = "origin";
    if (!branchInfo) {
        console.error('No branch info found. Cannot calculate remote. Will use origin by default');
    } else {
        remoteName = branchInfo['remote'];
    }
    const remote = remoteName;
    const remoteInfo = Object.entries(gitConfig).find((entry) => entry[0] === `remote "${remote}"`)
    if (!remoteInfo) {
        throw new Error(`No remote found called "${remote}"`);
    }
    const url = remoteInfo[1]['url'];
    const repoURL = getGitHubRepoURL(url)
    if (!url) {
        throw new Error(`The remote "${remote}" does not look like to be hosted at GitHub`);
    }

    const start = selection.start.line + 1;
    const end = selection.end.line + 1;

    return `${repoURL}/blob/${sha}/${relativePath}#L${start}-L${end}`;
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('githublinker.copyLink', () => {
        let finalURL = 'error URL'
        try {
            finalURL = calculateURL();
            clipboardy.writeSync(finalURL);
            vscode.window.showInformationMessage('GitHub URL copied to the clipboard!');
        } catch (err) {
            console.log("finalURL copied: \n" + finalURL);
            vscode.window.showErrorMessage(err.message);
            throw err;
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('githublinker.copyMarkdown', () => {
        let markdown = 'error copied';
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                throw new Error('No selected editor');
            }
            const {document, selection} = editor;

            const text = document.getText(selection);

            const finalURL = calculateURL();
            markdown = finalURL + '\n\n```' + document.languageId + '\n' + text + '\n```';
            clipboardy.writeSync(markdown);
            vscode.window.showInformationMessage('GitHub URL and code copied to the clipboard!');
        } catch (err) {
            console.log("code snippet copied: \n" + markdown);
            vscode.window.showErrorMessage(err.message);
            throw err;
        }
    }));
}

export function deactivate() {
}
