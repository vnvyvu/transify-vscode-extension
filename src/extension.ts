import translate from 'googletrans';
import * as vscode from 'vscode';

class TranslationService {
	static async translate(
		text: string,
		targetLanguages: string = 'vi',
	): Promise<string> {
		const MAX_TOKENS = 15000;
		if (text.length >= MAX_TOKENS) {
			return `Input text exceeds ${MAX_TOKENS} characters.`;
		}

		const promises: Promise<{ text: string }>[] = [];

		const targetLanguagesArray = targetLanguages
			.split(',')
			.map(lang => lang.trim())
			.slice(0, 3); // Limit to 3 target languages;

		for (let i = 0; i < targetLanguagesArray.length; i++) {
			const targetLanguage = targetLanguagesArray[i];

			promises.push(
				translate(text, { to: targetLanguage }).catch(err => {
					const googleTranslateUrl =
						'https://translate.googleapis.com/translate_a/single';
					return {
						text: `Please verify by accessing: ${googleTranslateUrl}`,
					};
				}),
			);
		}

		const result = (await Promise.all(promises)).reduce(
			(acc, curr, index) => {
				if (acc) {
					acc += `\n\n[${targetLanguagesArray[index]}] ${curr.text}`;
				} else {
					acc = `[${targetLanguagesArray[index]}] ${curr.text}`;
				}
				return acc;
			},
			'',
		);

		return result;
	}
}

export function activate(context: vscode.ExtensionContext) {
	let lastSelection: vscode.Selection | null = null;
	let lastTranslatedText: string = '';
	let lastTranslation: string | null = null;

	const config = vscode.workspace.getConfiguration('transify');
	let targetLanguages = config.get<string>('targetLanguages', 'vi');

	// Check for an existing selection when the extension activates
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && !activeEditor.selection.isEmpty) {
		lastSelection = new vscode.Selection(
			activeEditor.selection.start.line,
			activeEditor.selection.start.character,
			activeEditor.selection.end.line,
			activeEditor.selection.end.character,
		);
		lastTranslatedText = activeEditor.document.getText(lastSelection);
		// Optionally, pre-translate the text here (uncomment if desired)
		// lastTranslation = await TranslationService.translate(lastTranslatedText, targetLanguages);
	}

	const hoverProvider = vscode.languages.registerHoverProvider('*', {
		async provideHover(
			document: vscode.TextDocument,
			position: vscode.Position,
		) {
			if (
				lastSelection &&
				lastSelection.contains(position) &&
				!lastSelection.isEmpty
			) {
				const selectedText = document.getText(lastSelection);
				if (selectedText !== lastTranslatedText || !lastTranslation) {
					lastTranslation = await TranslationService.translate(
						selectedText,
						targetLanguages,
					);
					lastTranslatedText = selectedText;
				}

				const hoverContent = new vscode.MarkdownString(lastTranslation);
				hoverContent.isTrusted = true;
				return new vscode.Hover(hoverContent, lastSelection);
			}
			return null;
		},
	});

	const selectionListener = vscode.window.onDidChangeTextEditorSelection(
		e => {
			const editor = e.textEditor;
			if (!editor) {
				return;
			}

			const selection = editor.selection;
			if (!selection.isEmpty) {
				const newSelection = new vscode.Selection(
					selection.start.line,
					selection.start.character,
					selection.end.line,
					selection.end.character,
				);
				if (!lastSelection?.isEqual(newSelection)) {
					lastSelection = newSelection;
					lastTranslation = null;
					lastTranslatedText = '';
				}
			} else {
				lastSelection = null;
				lastTranslation = null;
				lastTranslatedText = '';
			}
		},
	);

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('transify.targetLanguages')) {
			const newConfig = vscode.workspace.getConfiguration('transify');
			targetLanguages = newConfig.get<string>('targetLanguages', 'vi');
			lastTranslation = null;
			lastTranslatedText = '';
		}
	});

	context.subscriptions.push(
		hoverProvider,
		selectionListener,
		configListener,
	);
}

export function deactivate() {}
