/**
 * AskUserQuestion Tool
 *
 * Structured clarification tool for pi. The model generates the questions and
 * options; this extension only presents them to the user and returns selections.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const TOOL_NAME = "AskUserQuestion";
const TYPE_SOMETHING = "Type something.";
const CHAT_ABOUT_THIS = "Chat about this";
const NEXT_LABEL = "Next →";
const NEXT_RESERVED_LABEL = "Next";
const SUBMIT_LABEL = "Submit answers";
const CANCEL_LABEL = "Cancel";
const NO_INPUT = "(no input)";
const ASK_USER_PROMPT_EVENT = "ask_user_question:prompt";

const OptionSchema = Type.Object(
	{
		label: Type.String({
			maxLength: 60,
			description:
				"MAX 60 CHARACTERS — display text for this option. Keep it concise (1-5 words) and clearly describe the choice.",
		}),
		description: Type.String({
			description:
				"Explanation of what this option means or what will happen if chosen. Include relevant trade-offs or implications.",
		}),
		preview: Type.Optional(
			Type.String({
				description:
					"Optional markdown preview rendered when this option is focused. Use only for concrete artifacts such as mockups, code snippets, diagrams, or configuration examples.",
			}),
		),
	},
	{ additionalProperties: false },
);

const QuestionSchema = Type.Object(
	{
		question: Type.String({
			description:
				"The complete question to ask the user. Be clear, specific, and end with a question mark.",
		}),
		header: Type.String({
			maxLength: 16,
			description: "MAX 16 CHARACTERS — very short chip/tag shown next to the question.",
		}),
		options: Type.Array(OptionSchema, {
			minItems: 2,
			maxItems: 4,
			description:
				"The available choices for this question. Must have 2-4 options. Do not include 'Other', 'Type something.', 'Chat about this', or 'Next'; those are provided automatically.",
		}),
		multiSelect: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"Set true to allow selecting multiple options. Use only when choices are not mutually exclusive.",
			}),
		),
	},
	{ additionalProperties: false },
);

const AskUserQuestionParams = Type.Object(
	{
		questions: Type.Array(QuestionSchema, {
			minItems: 1,
			maxItems: 4,
			description: "Questions to ask the user (1-4 questions).",
		}),
	},
	{ additionalProperties: false },
);

type QuestionOption = Static<typeof OptionSchema>;
type Question = Static<typeof QuestionSchema> & { multiSelect?: boolean };
type Params = Static<typeof AskUserQuestionParams>;

type AutoRow = { kind: "type" | "chat" | "next"; label: string; description: string };
type OptionRow = { kind: "option"; option: QuestionOption };
type Row = OptionRow | AutoRow;

interface AskUserQuestionDetails {
	status: "answered" | "chat" | "cancelled" | "error";
	questions: Question[];
	answers: Record<string, string>;
	annotations?: Record<string, { preview?: string; notes?: string }>;
	error?: string;
}

type FlowResult =
	| { status: "answered"; answers: Record<string, string>; annotations?: Record<string, { preview?: string; notes?: string }> }
	| { status: "chat" }
	| { status: "cancelled" }
	| { status: "unsupported" };

const RESERVED_LABELS = new Set([
	"other",
	TYPE_SOMETHING.toLowerCase(),
	CHAT_ABOUT_THIS.toLowerCase(),
	NEXT_LABEL.toLowerCase(),
	NEXT_RESERVED_LABEL.toLowerCase(),
]);

function validateQuestions(questions: Question[]): string | undefined {
	if (!Array.isArray(questions) || questions.length < 1 || questions.length > 4) {
		return "AskUserQuestion requires 1-4 questions.";
	}

	const questionTexts = new Set<string>();
	for (const [qIndex, q] of questions.entries()) {
		const questionText = q.question?.trim();
		if (!questionText) return `Question ${qIndex + 1} is missing question text.`;
		if (questionTexts.has(questionText)) return "Question texts must be unique.";
		questionTexts.add(questionText);

		if (!q.header?.trim()) return `Question ${qIndex + 1} is missing a header.`;
		if (q.header.length > 16) return `Question "${q.question}" header is over 16 characters.`;
		if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
			return `Question "${q.question}" must have 2-4 options.`;
		}

		const labels = new Set<string>();
		const hasPreview = q.options.some((option) => !!option.preview);
		if (hasPreview && q.multiSelect) {
			return `Question "${q.question}" uses previews, which are only supported for single-select questions.`;
		}

		for (const option of q.options) {
			const label = option.label?.trim();
			if (!label) return `Question "${q.question}" has an option without a label.`;
			if (label.length > 60) return `Option "${label}" in question "${q.question}" is over 60 characters.`;
			if (RESERVED_LABELS.has(label.toLowerCase())) {
				return `Do not include reserved option "${label}"; pi adds it automatically when appropriate.`;
			}
			if (labels.has(label)) return `Option labels in question "${q.question}" must be unique.`;
			labels.add(label);
		}
	}

	return undefined;
}

function rowsForQuestion(question: Question): Row[] {
	const hasPreview = question.options.some((option) => !!option.preview);
	const rows: Row[] = question.options.map((option) => ({ kind: "option", option }));

	if (question.multiSelect) {
		rows.push({ kind: "next", label: NEXT_LABEL, description: "Commit these selections and continue to the next question or review tab." });
	} else if (!hasPreview) {
		rows.push({ kind: "type", label: TYPE_SOMETHING, description: "Enter a custom answer for this question." });
	}

	rows.push({ kind: "chat", label: CHAT_ABOUT_THIS, description: "Abandon this questionnaire and continue in free-form chat." });
	return rows;
}

function rowLabel(row: Row): string {
	return row.kind === "option" ? row.option.label : row.label;
}

function rowDescription(row: Row): string {
	return row.kind === "option" ? row.option.description : row.description;
}

function wrapIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return ((index % length) + length) % length;
}

function wrapPlain(text: string, width: number): string[] {
	if (width <= 0) return [""];
	const lines: string[] = [];
	for (const rawLine of text.split("\n")) {
		const words = rawLine.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push("");
			continue;
		}
		let current = "";
		for (const word of words) {
			if (!current) {
				current = word;
			} else if (visibleWidth(`${current} ${word}`) <= width) {
				current += ` ${word}`;
			} else {
				lines.push(current);
				current = word;
			}
		}
		if (current) lines.push(current);
	}
	return lines.length > 0 ? lines : [""];
}

function padVisible(text: string, width: number): string {
	const missing = width - visibleWidth(text);
	return missing > 0 ? text + " ".repeat(missing) : truncateToWidth(text, width, "");
}

function isPrintableTyping(data: string): boolean {
	if (!data || data === " " || data === "\t" || data === "\r" || data === "\n" || data === "\x7f") return false;
	if (data.startsWith("\x1b")) return false;
	return [...data].some((ch) => ch >= " " && ch !== "\x7f");
}

function buildChatContinuation(): string {
	return "User wants to chat about this. Continue the conversation to help them decide.";
}

function answerContent(details: AskUserQuestionDetails): string {
	if (details.status === "error") {
		return `AskUserQuestion could not be shown: ${details.error ?? "Unknown error"}`;
	}
	if (details.status === "cancelled") {
		return "User declined to answer questions";
	}
	if (details.status === "chat") {
		return buildChatContinuation();
	}

	const lines = Object.entries(details.answers).map(([question, answer]) => {
		const annotation = details.annotations?.[question];
		const parts = [`- "${question}" = "${answer}"`];
		if (annotation?.preview) parts.push(`  selected preview:\n${annotation.preview}`);
		if (annotation?.notes) parts.push(`  user notes: ${annotation.notes}`);
		return parts.join("\n");
	});
	return `User has answered your questions:\n${lines.join("\n")}\n\nYou can now continue with the user's answers in mind.`;
}

function renderAnswerSummary(details: AskUserQuestionDetails | undefined, theme: any): string {
	if (!details) return theme.fg("warning", "No AskUserQuestion details returned");
	if (details.status === "answered") {
		return Object.entries(details.answers)
			.map(([question, answer]) => {
				const notes = details.annotations?.[question]?.notes ? theme.fg("dim", " + notes") : "";
				return `${theme.fg("success", "✓")} ${theme.fg("muted", question)} ${theme.fg("accent", answer)}${notes}`;
			})
			.join("\n");
	}
	if (details.status === "chat") return theme.fg("warning", "User chose to chat about the questions");
	if (details.status === "cancelled") return theme.fg("warning", "Questionnaire cancelled");
	return theme.fg("error", details.error ?? "AskUserQuestion error");
}

function emitAskUserPromptEvent(pi: ExtensionAPI, questions: Question[]): void {
	pi.events.emit(ASK_USER_PROMPT_EVENT, {
		questions: questions.map((q) => ({
			question: q.question,
			header: q.header,
			multiSelect: q.multiSelect ?? false,
			options: q.options.map((option) => ({
				label: option.label,
				description: option.description,
				hasPreview: typeof option.preview === "string" && option.preview.length > 0,
			})),
		})),
	});
}

async function runDialogFallback(ctx: ExtensionContext, questions: Question[]): Promise<FlowResult> {
	if (!ctx.hasUI) return { status: "cancelled" };

	const answers: Record<string, string> = {};
	const annotations: Record<string, { preview?: string; notes?: string }> = {};

	for (const question of questions) {
		const hasPreview = question.options.some((option) => !!option.preview);

		if (question.multiSelect) {
			const selected = new Set<string>();
			while (true) {
				const choices = [
					...question.options.map((option) => `${selected.has(option.label) ? "✓" : "○"} ${option.label} — ${option.description}`),
					NEXT_LABEL,
					CHAT_ABOUT_THIS,
				];
				const choice = await ctx.ui.select(
					`${question.header}: ${question.question}${selected.size > 0 ? ` (${selected.size} selected)` : ""}`,
					choices,
				);
				if (!choice) return { status: "cancelled" };
				if (choice === CHAT_ABOUT_THIS) return { status: "chat" };
				if (choice === NEXT_LABEL) {
					answers[question.question] = selected.size > 0 ? Array.from(selected).join(", ") : NO_INPUT;
					break;
				}

				const selectedIndex = choices.indexOf(choice);
				const option = question.options[selectedIndex];
				if (!option) continue;
				if (selected.has(option.label)) selected.delete(option.label);
				else selected.add(option.label);
			}
			continue;
		}

		const choices = [
			...question.options.map((option) => `${option.label} — ${option.description}`),
			...(!hasPreview ? [TYPE_SOMETHING] : []),
			CHAT_ABOUT_THIS,
		];
		const choice = await ctx.ui.select(`${question.header}: ${question.question}`, choices);
		if (!choice) return { status: "cancelled" };
		if (choice === CHAT_ABOUT_THIS) return { status: "chat" };
		if (choice === TYPE_SOMETHING) {
			const custom = await ctx.ui.input(question.question, "Type your answer...");
			if (custom === undefined) return { status: "cancelled" };
			answers[question.question] = custom.trim() || NO_INPUT;
			continue;
		}

		const selectedIndex = choices.indexOf(choice);
		const option = question.options[selectedIndex];
		if (!option) return { status: "cancelled" };
		answers[question.question] = option.label;
		if (option.preview) annotations[question.question] = { preview: option.preview };
	}

	return { status: "answered", answers, annotations: Object.keys(annotations).length ? annotations : undefined };
}

async function runCustomQuestionnaire(ctx: ExtensionContext, questions: Question[]): Promise<FlowResult> {
	if (!ctx.hasUI) return { status: "unsupported" };

	const result = await ctx.ui.custom<FlowResult>((tui, theme, _kb, done) => {
		let currentTab = 0;
		let selectedRowIndex = 0;
		let submitChoiceIndex = 0;
		let textInputMode = false;
		let notesMode = false;
		let cachedWidth = -1;
		let cachedLines: string[] | undefined;
		const answers: Record<string, string> = {};
		const annotations: Record<string, { preview?: string; notes?: string }> = {};
		const multiSelections = new Map<string, Set<string>>();
		const notesByQuestion: Record<string, string> = {};

		const editorTheme: EditorTheme = {
			borderColor: (s) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			},
		};
		const inlineEditor = new Editor(tui, editorTheme);
		const notesEditor = new Editor(tui, editorTheme);

		function isSubmitView(): boolean {
			return questions.length > 1 && currentTab === questions.length;
		}

		function currentQuestion(): Question {
			return questions[Math.min(currentTab, questions.length - 1)];
		}

		function currentRows(): Row[] {
			return isSubmitView() ? [] : rowsForQuestion(currentQuestion());
		}

		function currentRow(): Row | undefined {
			return currentRows()[selectedRowIndex];
		}

		function currentOption(): QuestionOption | undefined {
			const row = currentRow();
			return row?.kind === "option" ? row.option : undefined;
		}

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function complete() {
			done({
				status: "answered",
				answers,
				annotations: Object.keys(annotations).length ? annotations : undefined,
			});
		}

		function goToSubmit() {
			currentTab = questions.length;
			selectedRowIndex = 0;
			submitChoiceIndex = 0;
			textInputMode = false;
			notesMode = false;
			refresh();
		}

		function advanceAfterAnswer() {
			if (questions.length === 1) {
				complete();
				return;
			}
			if (currentTab < questions.length - 1) {
				currentTab++;
				selectedRowIndex = 0;
				textInputMode = false;
				notesMode = false;
				refresh();
				return;
			}
			goToSubmit();
		}

		function applyAnnotation(question: Question, option?: QuestionOption) {
			const notes = notesByQuestion[question.question]?.trim();
			const preview = option?.preview;
			if (preview || notes) {
				annotations[question.question] = {
					...(preview ? { preview } : {}),
					...(notes ? { notes } : {}),
				};
			} else {
				delete annotations[question.question];
			}
		}

		function setAnswer(question: Question, answer: string, option?: QuestionOption) {
			answers[question.question] = answer;
			applyAnnotation(question, option);
		}

		function updateMultiAnswer(question: Question) {
			const selected = multiSelections.get(question.question) ?? new Set<string>();
			if (selected.size === 0) {
				delete answers[question.question];
				applyAnnotation(question);
				return;
			}
			setAnswer(question, Array.from(selected).join(", "));
		}

		function switchTab(delta: number) {
			const total = questions.length > 1 ? questions.length + 1 : 1;
			currentTab = wrapIndex(currentTab + delta, total);
			selectedRowIndex = 0;
			submitChoiceIndex = 0;
			textInputMode = false;
			notesMode = false;
			refresh();
		}

		function enterTextInput() {
			const q = currentQuestion();
			textInputMode = true;
			inlineEditor.setText(answers[q.question] && !q.options.some((o) => o.label === answers[q.question]) ? answers[q.question] : "");
			refresh();
		}

		function enterNotesMode() {
			const option = currentOption();
			if (!option?.preview) return;
			notesMode = true;
			notesEditor.setText(notesByQuestion[currentQuestion().question] ?? "");
			refresh();
		}

		function saveNotesAndExit() {
			const q = currentQuestion();
			const trimmed = notesEditor.getText().trim();
			if (trimmed) notesByQuestion[q.question] = trimmed;
			else delete notesByQuestion[q.question];
			const selectedLabel = answers[q.question];
			const selectedOption = q.options.find((o) => o.label === selectedLabel);
			applyAnnotation(q, selectedOption);
			notesMode = false;
			refresh();
		}

		inlineEditor.onSubmit = (value) => {
			setAnswer(currentQuestion(), value.trim() || NO_INPUT);
			textInputMode = false;
			inlineEditor.setText("");
			advanceAfterAnswer();
		};

		notesEditor.onSubmit = () => saveNotesAndExit();

		function handleRowEnter() {
			const question = currentQuestion();
			const row = currentRow();
			if (!row) return;

			if (row.kind === "chat") {
				done({ status: "chat" });
				return;
			}

			if (row.kind === "type") {
				enterTextInput();
				return;
			}

			if (row.kind === "next") {
				const selected = multiSelections.get(question.question) ?? new Set<string>();
				setAnswer(question, selected.size > 0 ? Array.from(selected).join(", ") : NO_INPUT);
				advanceAfterAnswer();
				return;
			}

			if (question.multiSelect) {
				let selected = multiSelections.get(question.question);
				if (!selected) {
					selected = new Set<string>();
					multiSelections.set(question.question, selected);
				}
				if (selected.has(row.option.label)) selected.delete(row.option.label);
				else selected.add(row.option.label);
				updateMultiAnswer(question);
				refresh();
				return;
			}

			setAnswer(question, row.option.label, row.option);
			advanceAfterAnswer();
		}

		function handleSubmitViewInput(data: string) {
			if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) return switchTab(1);
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) return switchTab(-1);
			if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
				submitChoiceIndex = submitChoiceIndex === 0 ? 1 : 0;
				refresh();
				return;
			}
			if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
				if (submitChoiceIndex === 0) complete();
				else done({ status: "cancelled" });
				return;
			}
			if (matchesKey(data, Key.escape)) done({ status: "cancelled" });
		}

		function handleInput(data: string) {
			if (notesMode) {
				if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
					saveNotesAndExit();
					return;
				}
				notesEditor.handleInput(data);
				refresh();
				return;
			}

			if (textInputMode) {
				if (matchesKey(data, Key.escape)) {
					textInputMode = false;
					inlineEditor.setText("");
					refresh();
					return;
				}
				inlineEditor.handleInput(data);
				refresh();
				return;
			}

			if (isSubmitView()) return handleSubmitViewInput(data);

			const rows = currentRows();
			if (matchesKey(data, Key.tab)) {
				if (rows[selectedRowIndex]?.kind === "type") handleRowEnter();
				else switchTab(1);
				return;
			}
			if (rows[selectedRowIndex]?.kind === "type" && isPrintableTyping(data)) {
				enterTextInput();
				inlineEditor.handleInput(data);
				refresh();
				return;
			}
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
				switchTab(-1);
				return;
			}
			if (matchesKey(data, Key.right)) {
				switchTab(1);
				return;
			}
			if (matchesKey(data, Key.up)) {
				selectedRowIndex = wrapIndex(selectedRowIndex - 1, rows.length);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				selectedRowIndex = wrapIndex(selectedRowIndex + 1, rows.length);
				refresh();
				return;
			}
			if (data === "n" && currentOption()?.preview) {
				enterNotesMode();
				return;
			}
			if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
				handleRowEnter();
				return;
			}
			if (matchesKey(data, Key.escape)) done({ status: "cancelled" });
		}

		function renderTabBar(width: number): string[] {
			if (questions.length <= 1) return [];
			const cells = questions.map((q, index) => {
				const answered = answers[q.question] !== undefined;
				const active = index === currentTab;
				const mark = answered ? "■" : "□";
				const label = ` ${mark} ${q.header.slice(0, 12)} `;
				return active ? theme.bg("selectedBg", theme.fg("text", label)) : theme.fg(answered ? "success" : "muted", label);
			});
			const submitActive = isSubmitView();
			const submit = submitActive ? theme.bg("selectedBg", theme.fg("text", " ✓ Submit ")) : theme.fg("muted", " ✓ Submit ");
			return [truncateToWidth(` ${cells.join(" ")} ${submit}`, width)];
		}

		function renderOptionRows(width: number): string[] {
			const question = currentQuestion();
			const rows = currentRows();
			const selectedLabels = multiSelections.get(question.question) ?? new Set<string>();
			const lines: string[] = [];

			for (const [index, row] of rows.entries()) {
				const selected = index === selectedRowIndex;
				const label = rowLabel(row);
				const description = rowDescription(row);
				const checkbox = question.multiSelect && row.kind === "option" ? (selectedLabels.has(label) ? "[x] " : "[ ] ") : "";
				const prefix = selected ? theme.fg("accent", "❯ ") : "  ";
				const color = selected ? "accent" : row.kind === "chat" ? "warning" : row.kind === "next" ? "success" : "text";
				const note = row.kind === "option" && row.option.preview ? (notesByQuestion[question.question] ? "  note ✓" : "  n: note") : "";
				lines.push(truncateToWidth(`${prefix}${checkbox}${theme.fg(color as any, label)}${theme.fg("dim", note)}`, width));

				for (const descLine of wrapPlain(description, Math.max(10, width - 5)).slice(0, 2)) {
					lines.push(truncateToWidth(`     ${theme.fg("muted", descLine)}`, width));
				}
			}

			return lines;
		}

		function renderPreviewLines(width: number, maxLines: number): string[] {
			const preview = currentOption()?.preview;
			const lines: string[] = [];
			lines.push(theme.fg("muted", "Preview"));
			lines.push(theme.fg("borderMuted", "─".repeat(Math.min(width, 40))));
			if (!preview) {
				lines.push(theme.fg("dim", "No preview for this row."));
				return lines;
			}
			const previewLines = preview.split("\n").flatMap((line) => wrapPlain(line, width));
			for (const line of previewLines.slice(0, maxLines)) {
				lines.push(theme.fg("toolOutput", truncateToWidth(line, width)));
			}
			if (previewLines.length > maxLines) lines.push(theme.fg("dim", `… ${previewLines.length - maxLines} more lines`));
			return lines;
		}

		function renderPreviewLayout(width: number): string[] {
			const leftWidth = Math.min(40, Math.max(28, Math.floor(width * 0.42)));
			const rightWidth = Math.max(20, width - leftWidth - 3);
			const maxPreviewLines = Math.max(4, Math.min(14, (tui.terminal?.rows ?? 40) - 16));
			const left = renderOptionRows(leftWidth);
			const right = renderPreviewLines(rightWidth, maxPreviewLines);
			const rowCount = Math.max(left.length, right.length);
			const merged: string[] = [];
			for (let i = 0; i < rowCount; i++) {
				merged.push(`${padVisible(left[i] ?? "", leftWidth)} ${theme.fg("borderMuted", "│")} ${truncateToWidth(right[i] ?? "", rightWidth)}`);
			}
			return merged.map((line) => truncateToWidth(line, width));
		}

		function renderStackedPreview(width: number): string[] {
			const lines = renderOptionRows(width);
			lines.push("");
			lines.push(...renderPreviewLines(width, Math.max(4, Math.min(10, (tui.terminal?.rows ?? 40) - 18))));
			return lines;
		}

		function renderSubmitView(width: number): string[] {
			const lines: string[] = [];
			const answeredCount = Object.keys(answers).length;
			if (answeredCount < questions.length) {
				lines.push(theme.fg("warning", ` ${questions.length - answeredCount} unanswered question${questions.length - answeredCount === 1 ? "" : "s"}. You can still submit partial answers.`));
			} else {
				lines.push(theme.fg("success", " All questions answered."));
			}
			lines.push("");
			for (const [index, question] of questions.entries()) {
				const answer = answers[question.question];
				const note = annotations[question.question]?.notes ? " + notes" : "";
				lines.push(truncateToWidth(` ${index + 1}. ${theme.fg("muted", question.header)} ${answer ? theme.fg("text", answer) : theme.fg("warning", NO_INPUT)}${theme.fg("dim", note)}`, width));
			}
			lines.push("");
			const submitPointer = submitChoiceIndex === 0 ? theme.fg("accent", "❯ ") : "  ";
			const cancelPointer = submitChoiceIndex === 1 ? theme.fg("accent", "❯ ") : "  ";
			lines.push(`${submitPointer}1. ${submitChoiceIndex === 0 ? theme.fg("accent", theme.bold(SUBMIT_LABEL)) : theme.fg("text", SUBMIT_LABEL)}`);
			lines.push(`${cancelPointer}2. ${submitChoiceIndex === 1 ? theme.fg("accent", theme.bold(CANCEL_LABEL)) : theme.fg("text", CANCEL_LABEL)}`);
			return lines;
		}

		function render(width: number): string[] {
			if (cachedLines && cachedWidth === width) return cachedLines;
			cachedWidth = width;
			const lines: string[] = [];
			const add = (line: string) => lines.push(truncateToWidth(line, width));

			add(theme.fg("accent", "─".repeat(width)));
			add(`${theme.fg("toolTitle", theme.bold(TOOL_NAME))} ${theme.fg("muted", isSubmitView() ? "review" : `${currentTab + 1}/${questions.length}`)}`);
			for (const tabLine of renderTabBar(width)) add(tabLine);
			if (!isSubmitView()) {
				const question = currentQuestion();
				add(`${theme.fg("accent", `[${question.header}]`)}`);
				for (const line of wrapPlain(question.question, Math.max(10, width - 2))) add(` ${theme.fg("text", line)}`);
			} else {
				add(theme.fg("accent", theme.bold("Review answers")));
			}
			lines.push("");

			if (notesMode) {
				add(theme.fg("muted", " Notes for this option:"));
				for (const line of notesEditor.render(Math.max(10, width - 2))) add(` ${line}`);
			} else if (textInputMode) {
				add(theme.fg("muted", " Your answer:"));
				for (const line of inlineEditor.render(Math.max(10, width - 2))) add(` ${line}`);
			} else if (isSubmitView()) {
				lines.push(...renderSubmitView(width));
			} else {
				const question = currentQuestion();
				const hasPreview = question.options.some((option) => !!option.preview);
				if (hasPreview && !question.multiSelect && width >= 78) lines.push(...renderPreviewLayout(width));
				else if (hasPreview && !question.multiSelect) lines.push(...renderStackedPreview(width));
				else lines.push(...renderOptionRows(width));
			}

			lines.push("");
			if (notesMode) {
				add(theme.fg("dim", " Enter/Esc to save note and return"));
			} else if (textInputMode) {
				add(theme.fg("dim", " Enter to submit • Esc to go back"));
			} else if (isSubmitView()) {
				add(theme.fg("dim", " ↑↓ choose • Enter select • Tab/←→ switch tabs • Esc cancel"));
			} else {
				const rows = currentRows();
				const hasTypeSomething = rows.some((row) => row.kind === "type");
				const hasPreview = currentQuestion().options.some((option) => !!option.preview);
				const selectHint = hasTypeSomething ? "Enter/Tab select" : currentQuestion().multiSelect ? "Enter/Space toggle" : "Enter select";
				const noteHint = hasPreview ? " • n note" : "";
				const multi = currentQuestion().multiSelect ? " • Next commits" : "";
				const nav = questions.length > 1 ? " • Tab/←→ switch tabs" : "";
				add(theme.fg("dim", ` ↑↓ navigate • ${selectHint}${multi}${noteHint}${nav} • Esc cancel`));
			}
			add(theme.fg("accent", "─".repeat(width)));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});

	// RPC mode currently returns undefined for custom(). Fall back to simple dialogs there.
	return result ?? { status: "unsupported" };
}

export default function askUserQuestionExtension(pi: ExtensionAPI) {
	pi.registerTool<typeof AskUserQuestionParams, AskUserQuestionDetails>({
		name: TOOL_NAME,
		label: "Ask User Question",
		description:
			"Ask the user structured multiple-choice clarification questions and return their selections. Use this only when you need user input to proceed: gather requirements, clarify ambiguity, understand preferences, make implementation decisions, or offer choices. The model generates the questions and options; the application only presents them and returns the user's selections.",
		promptSnippet: "Ask the user 1-4 structured clarification questions and return their selections.",
		promptGuidelines: [
			"Use AskUserQuestion whenever the user's request is underspecified and you cannot proceed without concrete decisions — you can ask up to 4 questions per invocation.",
			"Each AskUserQuestion question MUST have 2-4 options. Every option requires a concise label and a description explaining the choice or trade-off.",
			"AskUserQuestion appends runtime rows automatically: Type something for single-select questions without previews, Chat about this on every question, and Next for multi-select questions. Do not author reserved labels yourself.",
			"Use AskUserQuestion multiSelect only when multiple answers are valid; this suppresses the Type something row. Previews are for single-select visual comparisons only and also suppress Type something.",
			"Do not stack multiple AskUserQuestion calls back-to-back — group clarifying questions into one invocation.",
		],
		parameters: AskUserQuestionParams,
		executionMode: "sequential",

		async execute(_toolCallId, params: Params, _signal, _onUpdate, ctx) {
			const questions = params.questions as Question[];
			const validationError = validateQuestions(questions);
			if (validationError) {
				const details: AskUserQuestionDetails = {
					status: "error",
					questions,
					answers: {},
					error: validationError,
				};
				return { content: [{ type: "text", text: answerContent(details) }], details };
			}

			if (!ctx.hasUI) {
				const details: AskUserQuestionDetails = {
					status: "error",
					questions,
					answers: {},
					error: "AskUserQuestion requires an interactive UI or RPC extension UI to pause for user input.",
				};
				return { content: [{ type: "text", text: answerContent(details) }], details };
			}

			emitAskUserPromptEvent(pi, questions);

			let flowResult = await runCustomQuestionnaire(ctx, questions);
			if (flowResult.status === "unsupported") {
				flowResult = await runDialogFallback(ctx, questions);
			}

			const details: AskUserQuestionDetails = {
				status: flowResult.status === "answered" ? "answered" : flowResult.status,
				questions,
				answers: flowResult.status === "answered" ? flowResult.answers : {},
				...(flowResult.status === "answered" && flowResult.annotations ? { annotations: flowResult.annotations } : {}),
			};

			return {
				content: [{ type: "text", text: answerContent(details) }],
				details,
			};
		},

		renderCall(args, theme) {
			const count = Array.isArray(args.questions) ? args.questions.length : 0;
			const headers = Array.isArray(args.questions) ? args.questions.map((q: Question) => q.header).filter(Boolean).join(", ") : "";
			let text = `${theme.fg("toolTitle", theme.bold(TOOL_NAME))} ${theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`)}`;
			if (headers) text += ` ${theme.fg("dim", truncateToWidth(headers, 50))}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			return new Text(renderAnswerSummary(result.details as AskUserQuestionDetails | undefined, theme), 0, 0);
		},
	});
}
