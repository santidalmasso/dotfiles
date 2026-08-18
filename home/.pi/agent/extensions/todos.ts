/**
 * Todo Manager Extension
 *
 * - Registers a TodoWrite tool for session task tracking.
 * - Shows current progress in a compact TUI widget/status line.
 * - Adds /todos for an interactive done/pending view and a few manual commands.
 *
 * State is persisted in session tool-result details (and manual command entries), so
 * forks/tree navigation reconstruct the todo list for the active branch.
 */

import { keyHint, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Key, matchesKey, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const TOOL_NAME = "TodoWrite";
const CUSTOM_STATE_ENTRY = "todos-state";
const WIDGET_ID = "todos";
const STATUS_ID = "todos";
const MAX_TODOS = 50;

type TodoStatus = "pending" | "in_progress" | "completed";
type TodoView = "open" | "done" | "all";

interface TodoItem {
	content: string;
	activeForm: string;
	status: TodoStatus;
}

interface TodoStats {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
}

interface TodoWriteDetails {
	oldTodos: TodoItem[];
	newTodos: TodoItem[];
	stats: TodoStats;
	warnings?: string[];
}

interface TodoStateEntryData {
	todos?: TodoItem[];
	widgetVisible?: boolean;
	reason?: string;
	updatedAt?: string;
}

const TodoItemSchema = Type.Object(
	{
		content: Type.String({
			minLength: 1,
			description: "Imperative task description, e.g. 'Run tests' or 'Implement auth callback'.",
		}),
		status: StringEnum(["pending", "in_progress", "completed"] as const),
		activeForm: Type.String({
			minLength: 1,
			description: "Present-continuous form shown while active, e.g. 'Running tests'.",
		}),
	},
	{ additionalProperties: false },
);

const TodoWriteParams = Type.Object(
	{
		todos: Type.Array(TodoItemSchema, {
			maxItems: MAX_TODOS,
			description:
				"The complete updated todo list. This replaces the previous list; include every still-relevant task and omit stale tasks.",
		}),
	},
	{ additionalProperties: false },
);

const PROMPT_GUIDELINES = [
	"Use TodoWrite only for complex multi-step work, explicit checklist requests, or several user tasks; skip it for simple one-step/conversational work.",
	"TodoWrite replaces the whole checklist: include every still-relevant task, keep exactly one in_progress item while working, and remove stale tasks.",
	"Call TodoWrite before the final response if tracked task statuses changed; completed means fully done and verified enough to report.",
];

function isTodoStatus(value: unknown): value is TodoStatus {
	return value === "pending" || value === "in_progress" || value === "completed";
}

function normalizeStatus(value: unknown): TodoStatus {
	if (isTodoStatus(value)) return value;
	if (typeof value !== "string") return "pending";
	const normalized = value.trim().toLowerCase().replace(/[ -]/g, "_");
	if (normalized === "done" || normalized === "complete" || normalized === "closed") return "completed";
	if (normalized === "active" || normalized === "started" || normalized === "inprogress") return "in_progress";
	return isTodoStatus(normalized) ? normalized : "pending";
}

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function inferActiveForm(content: string): string {
	const trimmed = compactWhitespace(content);
	if (!trimmed) return "Working on task";

	const [first = "", ...rest] = trimmed.split(" ");
	const lower = first.toLowerCase().replace(/[^a-z]/g, "");
	const tail = rest.join(" ");
	const gerunds: Record<string, string> = {
		add: "Adding",
		address: "Addressing",
		analyze: "Analyzing",
		audit: "Auditing",
		build: "Building",
		check: "Checking",
		clean: "Cleaning",
		create: "Creating",
		debug: "Debugging",
		design: "Designing",
		document: "Documenting",
		explore: "Exploring",
		fix: "Fixing",
		implement: "Implementing",
		improve: "Improving",
		inspect: "Inspecting",
		install: "Installing",
		investigate: "Investigating",
		plan: "Planning",
		prepare: "Preparing",
		refactor: "Refactoring",
		remove: "Removing",
		rename: "Renaming",
		research: "Researching",
		review: "Reviewing",
		run: "Running",
		set: "Setting",
		test: "Testing",
		update: "Updating",
		validate: "Validating",
		verify: "Verifying",
		write: "Writing",
	};

	const gerund = gerunds[lower];
	if (gerund) return compactWhitespace(`${gerund} ${tail}`);
	return `Working on ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function normalizeTodo(raw: unknown): TodoItem | null {
	if (!raw || typeof raw !== "object") return null;
	const item = raw as Record<string, unknown>;
	const contentCandidate = item.content ?? item.text ?? item.task ?? item.title ?? item.subject;
	if (typeof contentCandidate !== "string") return null;
	const content = compactWhitespace(contentCandidate);
	if (!content) return null;

	const activeCandidate = item.activeForm ?? item.active ?? item.progressText;
	const activeForm = typeof activeCandidate === "string" && compactWhitespace(activeCandidate)
		? compactWhitespace(activeCandidate)
		: inferActiveForm(content);

	return {
		content,
		activeForm,
		status: normalizeStatus(item.status),
	};
}

function normalizeTodos(rawTodos: unknown): TodoItem[] {
	if (!Array.isArray(rawTodos)) return [];
	return rawTodos.map(normalizeTodo).filter((todo): todo is TodoItem => Boolean(todo)).slice(0, MAX_TODOS);
}

function cloneTodos(items: TodoItem[]): TodoItem[] {
	return items.map((todo) => ({ ...todo }));
}

function getStats(items: TodoItem[]): TodoStats {
	const stats: TodoStats = { total: items.length, pending: 0, inProgress: 0, completed: 0 };
	for (const item of items) {
		if (item.status === "pending") stats.pending += 1;
		else if (item.status === "in_progress") stats.inProgress += 1;
		else stats.completed += 1;
	}
	return stats;
}

function formatStats(stats: TodoStats): string {
	if (stats.total === 0) return "no todos";
	const parts = [`${stats.completed}/${stats.total} done`];
	if (stats.inProgress > 0) parts.push(`${stats.inProgress} active`);
	if (stats.pending > 0) parts.push(`${stats.pending} pending`);
	return parts.join(" • ");
}

function validationWarnings(items: TodoItem[]): string[] {
	const warnings: string[] = [];
	const stats = getStats(items);
	if (stats.inProgress > 1) warnings.push("More than one todo is in_progress; keep exactly one active task.");
	if (stats.total > 0 && stats.pending > 0 && stats.inProgress === 0) {
		warnings.push("No todo is in_progress; mark the task you are about to work on as in_progress.");
	}
	if (stats.total >= 3 && stats.pending === 0 && stats.inProgress === 0) {
		const hasVerification = items.some((todo) => /test|build|lint|verify|verification|validate|check/i.test(todo.content));
		if (!hasVerification) warnings.push("All todos are completed; consider whether a verification task was needed before finalizing.");
	}
	return warnings;
}

function statusIcon(status: TodoStatus): string {
	switch (status) {
		case "completed":
			return "✓";
		case "in_progress":
			return "●";
		case "pending":
			return "○";
	}
}

function statusLabel(status: TodoStatus): string {
	switch (status) {
		case "completed":
			return "done";
		case "in_progress":
			return "active";
		case "pending":
			return "pending";
	}
}

function styleTodoText(theme: Theme, todo: TodoItem, selected = false): string {
	if (todo.status === "completed") return theme.fg("dim", theme.strikethrough(todo.content));
	if (todo.status === "in_progress") return theme.fg(selected ? "accent" : "text", theme.bold(todo.content));
	return theme.fg(selected ? "accent" : "text", todo.content);
}

function filterTodos(items: TodoItem[], view: TodoView): TodoItem[] {
	if (view === "done") return items.filter((todo) => todo.status === "completed");
	if (view === "open") return items.filter((todo) => todo.status !== "completed");
	return items;
}

function todoPlainLines(items: TodoItem[]): string[] {
	const stats = getStats(items);
	if (items.length === 0) {
		return [
			"No todos yet.",
			"Todos are created when the assistant calls TodoWrite for multi-step work, or manually with /todos add <task>.",
		];
	}
	return [
		`Todos: ${formatStats(stats)}`,
		...items.map((todo, index) => `${index + 1}. [${todo.status === "completed" ? "x" : todo.status === "in_progress" ? ">" : " "}] ${todo.content}`),
	];
}

function formatChecklistSnapshot(items: TodoItem[]): string {
	return items
		.map((todo, index) => {
			const active = todo.status === "in_progress" ? ` (active: ${todo.activeForm})` : "";
			return `${index + 1}. [${todo.status}] ${todo.content}${active}`;
		})
		.join("\n");
}

function makeChecklistReminder(items: TodoItem[]): string {
	const stats = getStats(items);
	const openCount = stats.pending + stats.inProgress;
	const statusInstruction = openCount > 0
		? "If you just completed, started, discovered, removed, or invalidated any tracked task, call TodoWrite before continuing or before your final response. Do not tell the user a tracked task is complete while it is still pending or in_progress here."
		: "All tracked todos are currently completed. If new work appears, call TodoWrite with the updated list; otherwise do not resurrect completed tasks.";

	return `Current TodoWrite checklist for this session (${formatStats(stats)}):\n${formatChecklistSnapshot(items)}\n\n${statusInstruction}`;
}

function progressBar(theme: Theme, stats: TodoStats, width: number): string {
	if (stats.total === 0 || width <= 0) return "";
	const filled = Math.round((stats.completed / stats.total) * width);
	return theme.fg("success", "█".repeat(filled)) + theme.fg("dim", "░".repeat(Math.max(0, width - filled)));
}

function fitLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(0, width), "");
}

function renderWidgetLines(theme: Theme, items: TodoItem[], width: number): string[] {
	if (items.length === 0) return [];
	const stats = getStats(items);
	const lines: string[] = [];
	const barWidth = Math.min(14, Math.max(6, width - 45));
	const bar = progressBar(theme, stats, barWidth);
	lines.push(
		fitLine(
			`${theme.fg("accent", theme.bold("Todos"))} ${bar} ${theme.fg("muted", formatStats(stats))} ${theme.fg("dim", "(/todos)")}`,
			width,
		),
	);

	const active = items.find((todo) => todo.status === "in_progress");
	if (active) {
		lines.push(fitLine(`  ${theme.fg("accent", "●")} ${theme.fg("text", theme.bold(active.activeForm || active.content))}`, width));
	}

	const pending = items.filter((todo) => todo.status === "pending");
	const availableRows = Math.max(1, 5 - lines.length);
	for (const todo of pending.slice(0, availableRows)) {
		lines.push(fitLine(`  ${theme.fg("dim", "○")} ${theme.fg("text", todo.content)}`, width));
	}

	const hiddenPending = Math.max(0, pending.length - Math.max(0, availableRows));
	const hiddenDone = stats.completed;
	const summary: string[] = [];
	if (hiddenPending > 0) summary.push(`${hiddenPending} more pending`);
	if (hiddenDone > 0) summary.push(`${hiddenDone} done`);
	if (summary.length > 0) lines.push(fitLine(`  ${theme.fg("dim", summary.join(" • "))}`, width));

	return lines.slice(0, 6);
}

class TodoPanelComponent {
	private readonly todos: TodoItem[];
	private readonly theme: Theme;
	private readonly onClose: () => void;
	private view: TodoView;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private readonly maxRows: number;
	private readonly requestRender: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		todos: TodoItem[],
		theme: Theme,
		initialView: TodoView,
		maxRows: number,
		onClose: () => void,
		requestRender: () => void,
	) {
		this.todos = todos;
		this.theme = theme;
		this.view = initialView;
		this.maxRows = Math.max(12, maxRows);
		this.onClose = onClose;
		this.requestRender = requestRender;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data === "q") {
			this.onClose();
			return;
		}
		if (data === "1") return this.setView("open");
		if (data === "2") return this.setView("done");
		if (data === "3") return this.setView("all");

		const visible = this.visibleTodos();
		if (visible.length === 0) return;
		if (matchesKey(data, Key.up)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.invalidate();
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.selectedIndex = Math.min(visible.length - 1, this.selectedIndex + 1);
			this.invalidate();
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 8);
			this.invalidate();
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.selectedIndex = Math.min(visible.length - 1, this.selectedIndex + 8);
			this.invalidate();
			this.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const theme = this.theme;
		const stats = getStats(this.todos);
		const visible = this.visibleTodos();
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, visible.length - 1));

		const lines: string[] = [];
		const add = (line = "") => lines.push(fitLine(line, width));
		const rule = theme.fg("borderMuted", "─".repeat(Math.max(1, width)));
		const title = `${theme.fg("accent", theme.bold("Todos"))} ${theme.fg("muted", formatStats(stats))}`;
		const barWidth = Math.min(24, Math.max(8, width - visibleWidth(title) - 4));

		add(rule);
		add(`${title}  ${progressBar(theme, stats, barWidth)}`);
		add(this.renderTabs());
		add();

		if (this.todos.length === 0) {
			add(`  ${theme.fg("dim", "No todos yet.")}`);
			add(`  ${theme.fg("dim", "The assistant creates them with TodoWrite for multi-step work.")}`);
			add(`  ${theme.fg("dim", "Manual: /todos add <task>")}`);
		} else if (visible.length === 0) {
			add(`  ${theme.fg("dim", `No ${this.view === "done" ? "completed" : "open"} todos.`)}`);
		} else {
			const footerRows = 3;
			const usedRows = 5;
			const listHeight = Math.max(3, this.maxRows - usedRows - footerRows);
			this.scrollOffset = Math.max(
				0,
				Math.min(this.scrollOffset, Math.max(0, visible.length - listHeight)),
			);
			if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
			if (this.selectedIndex >= this.scrollOffset + listHeight) this.scrollOffset = this.selectedIndex - listHeight + 1;

			const slice = visible.slice(this.scrollOffset, this.scrollOffset + listHeight);
			for (const todo of slice) {
				const absoluteIndex = this.todos.indexOf(todo) + 1;
				const filteredIndex = visible.indexOf(todo);
				const selected = filteredIndex === this.selectedIndex;
				const pointer = selected ? theme.fg("accent", "❯") : " ";
				const iconColor: "success" | "accent" | "dim" = todo.status === "completed" ? "success" : todo.status === "in_progress" ? "accent" : "dim";
				const icon = theme.fg(iconColor, statusIcon(todo.status));
				const idx = theme.fg("dim", `${absoluteIndex}.`.padStart(3));
				const label = theme.fg(todo.status === "completed" ? "dim" : iconColor, statusLabel(todo.status).padEnd(7));
				add(`${pointer} ${icon} ${idx} ${label} ${styleTodoText(theme, todo, selected)}`);
				if (todo.status === "in_progress" && todo.activeForm && todo.activeForm !== todo.content) {
					add(`      ${theme.fg("dim", "↳ ")}${theme.fg("muted", todo.activeForm)}`);
				}
			}
			if (this.scrollOffset > 0 || this.scrollOffset + listHeight < visible.length) {
				add(theme.fg("dim", `  showing ${this.scrollOffset + 1}-${Math.min(visible.length, this.scrollOffset + listHeight)} of ${visible.length}`));
			}
		}

		add();
		add(theme.fg("dim", "  ↑↓ navigate • 1 open • 2 done • 3 all • q/esc close"));
		add(rule);

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private visibleTodos(): TodoItem[] {
		return filterTodos(this.todos, this.view);
	}

	private setView(view: TodoView): void {
		this.view = view;
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.invalidate();
		this.requestRender();
	}

	private renderTabs(): string {
		const theme = this.theme;
		const openCount = this.todos.filter((todo) => todo.status !== "completed").length;
		const doneCount = this.todos.filter((todo) => todo.status === "completed").length;
		const tab = (view: TodoView, key: string, label: string, count: number) => {
			const text = ` ${key} ${label} ${count} `;
			return this.view === view ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("muted", text);
		};
		return ` ${tab("open", "1", "open", openCount)} ${tab("done", "2", "done", doneCount)} ${tab("all", "3", "all", this.todos.length)}`;
	}
}

function commandHelp(): string {
	return [
		"/todos                 open the visual todo manager",
		"/todos open|done|all   open a specific view",
		"/todos add <task>      manually add a pending todo",
		"/todos start <n>       mark todo n in_progress (only one active)",
		"/todos done <n>        mark todo n completed",
		"/todos pending <n>     mark todo n pending",
		"/todos remove <n>      remove todo n",
		"/todos clear           clear all todos",
		"/todos hide|show       hide/show the compact widget",
		"",
		"Assistant-created todos come from the TodoWrite tool. It replaces the whole checklist with content, activeForm, and status fields.",
	].join("\n");
}

function parseIndex(value: string): number | null {
	const match = value.trim().match(/^(\d+)/);
	if (!match) return null;
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
}

function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
	else console.log(message);
}

export default function todosExtension(pi: ExtensionAPI) {
	let todos: TodoItem[] = [];
	let widgetVisible = true;

	function updateUi(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;

		if (todos.length === 0) {
			ctx.ui.setStatus(STATUS_ID, undefined);
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const stats = getStats(todos);
		const statusText = stats.inProgress > 0
			? `● ${stats.completed}/${stats.total}`
			: `☑ ${stats.completed}/${stats.total}`;
		ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg(stats.inProgress > 0 ? "accent" : "muted", statusText));

		if (!widgetVisible) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
			render(width: number) {
				return renderWidgetLines(theme, todos, width);
			},
			invalidate() {},
		}));
	}

	function persistManualState(reason: string): void {
		pi.appendEntry(CUSTOM_STATE_ENTRY, {
			todos: cloneTodos(todos),
			widgetVisible,
			reason,
			updatedAt: new Date().toISOString(),
		} satisfies TodoStateEntryData);
	}

	function reconstructState(ctx: ExtensionContext): void {
		todos = [];
		widgetVisible = true;

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message") {
				const msg = entry.message;
				if (msg.role === "toolResult" && msg.toolName === TOOL_NAME) {
					const details = msg.details as TodoWriteDetails | undefined;
					if (details && Array.isArray(details.newTodos)) todos = normalizeTodos(details.newTodos);
				}
				continue;
			}

			if (entry.type === "custom" && entry.customType === CUSTOM_STATE_ENTRY) {
				const data = entry.data as TodoStateEntryData | undefined;
				if (data && Array.isArray(data.todos)) todos = normalizeTodos(data.todos);
				if (typeof data?.widgetVisible === "boolean") widgetVisible = data.widgetVisible;
			}
		}

		updateUi(ctx);
	}

	async function showTodos(ctx: ExtensionContext, initialView: TodoView = "open"): Promise<void> {
		if (!ctx.hasUI) {
			console.log(todoPlainLines(todos).join("\n"));
			return;
		}

		await ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) => {
				const maxRows = Math.max(14, Math.min(28, (tui.terminal?.rows ?? 30) - 4));
				return new TodoPanelComponent(cloneTodos(todos), theme, initialView, maxRows, () => done(), () => tui.requestRender());
			},
			{
				overlay: true,
				overlayOptions: {
					width: "82%",
					minWidth: 54,
					maxHeight: "82%",
					anchor: "center",
				},
			},
		);
	}

	function setTodoStatus(index: number, status: TodoStatus): TodoItem | null {
		if (index < 0 || index >= todos.length) return null;
		const next = cloneTodos(todos);
		if (status === "in_progress") {
			for (const item of next) {
				if (item.status === "in_progress") item.status = "pending";
			}
		}
		const current = next[index];
		if (!current) return null;
		next[index] = { ...current, status };
		todos = next;
		return todos[index] ?? null;
	}

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	pi.on("before_agent_start", async (event) => {
		if (todos.length === 0 || !pi.getActiveTools().includes(TOOL_NAME)) return;
		return {
			systemPrompt: event.systemPrompt + `\n\n${makeChecklistReminder(todos)}`,
		};
	});

	pi.registerTool<typeof TodoWriteParams, TodoWriteDetails>({
		name: TOOL_NAME,
		label: "Todo Write",
		description:
			"Update the current session todo list. Use proactively for complex multi-step work to track progress for the user. " +
			"This tool replaces the entire list. Each todo needs content (imperative), activeForm (present-continuous), and status: pending, in_progress, or completed.",
		promptSnippet: "Update the current session's structured todo checklist.",
		promptGuidelines: PROMPT_GUIDELINES,
		parameters: TodoWriteParams,
		executionMode: "sequential",

		prepareArguments(args) {
			if (!args || typeof args !== "object") return args;
			const input = args as Record<string, unknown>;
			if (!Array.isArray(input.todos)) return args;
			return { ...input, todos: normalizeTodos(input.todos) };
		},

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const oldTodos = cloneTodos(todos);
			const nextTodos = normalizeTodos(params.todos);
			todos = nextTodos;
			const stats = getStats(todos);
			const warnings = validationWarnings(todos);
			updateUi(ctx);

			const lines = [
				todos.length === 0 ? "Todo list cleared." : `Todos updated: ${formatStats(stats)}.`,
				"Before your final response, call TodoWrite again if any task status changed or if the checklist no longer matches reality.",
			];
			if (warnings.length > 0) lines.push("Warnings:", ...warnings.map((warning) => `- ${warning}`));

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					oldTodos,
					newTodos: cloneTodos(todos),
					stats,
					...(warnings.length > 0 ? { warnings } : {}),
				} satisfies TodoWriteDetails,
			};
		},

		renderCall(args, theme) {
			const list = normalizeTodos((args as { todos?: unknown }).todos);
			const stats = getStats(list);
			const text =
				theme.fg("toolTitle", theme.bold(TOOL_NAME)) +
				" " +
				theme.fg("muted", list.length === 0 ? "clear" : formatStats(stats));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Updating todos..."), 0, 0);
			const details = result.details as TodoWriteDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			const stats = details.stats ?? getStats(details.newTodos);
			let text = theme.fg("success", "✓ ") + theme.fg("muted", `Todos updated: ${formatStats(stats)}`);

			if (details.warnings?.length) {
				text += "\n" + details.warnings.map((warning) => theme.fg("warning", `⚠ ${warning}`)).join("\n");
			}

			if (details.newTodos.length > 0) {
				const visible = expanded ? details.newTodos : details.newTodos.slice(0, 5);
				for (const [index, todo] of visible.entries()) {
					const iconColor: "success" | "accent" | "dim" = todo.status === "completed" ? "success" : todo.status === "in_progress" ? "accent" : "dim";
					text += `\n${theme.fg(iconColor, statusIcon(todo.status))} ${theme.fg("dim", `${index + 1}.`)} ${styleTodoText(theme, todo)}`;
				}
				if (!expanded && details.newTodos.length > visible.length) {
					text += `\n${theme.fg("dim", `… ${details.newTodos.length - visible.length} more (${keyHint("app.tools.expand", "to expand")})`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});

	pi.registerCommand("todos", {
		description: "Show/manage session todos. Try /todos help for commands.",
		getArgumentCompletions(prefix: string) {
			const commands = [
				{ value: "help", label: "help", description: "Show /todos command help" },
				{ value: "open", label: "open", description: "Show open/pending todos" },
				{ value: "done", label: "done", description: "Show completed todos" },
				{ value: "all", label: "all", description: "Show all todos" },
				{ value: "add ", label: "add", description: "Add a pending todo" },
				{ value: "start ", label: "start", description: "Mark a todo in progress" },
				{ value: "pending ", label: "pending", description: "Mark a todo pending" },
				{ value: "remove ", label: "remove", description: "Remove a todo" },
				{ value: "clear", label: "clear", description: "Clear all todos" },
				{ value: "hide", label: "hide", description: "Hide compact widget" },
				{ value: "show", label: "show", description: "Show compact widget" },
			];
			const filtered = commands.filter((item) => item.value.startsWith(prefix.trimStart()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			const [command = "", ...restParts] = raw.split(/\s+/);
			const rest = restParts.join(" ").trim();

			if (!raw || command === "open" || (command === "pending" && !rest)) return showTodos(ctx, "open");
			if (command === "done" && !rest) return showTodos(ctx, "done");
			if (command === "all") return showTodos(ctx, "all");
			if (command === "help") {
				if (ctx.hasUI) ctx.ui.notify(commandHelp(), "info");
				else console.log(commandHelp());
				return;
			}

			if (command === "hide" || command === "show" || command === "toggle") {
				widgetVisible = command === "toggle" ? !widgetVisible : command === "show";
				persistManualState(`widget:${command}`);
				updateUi(ctx);
				notify(ctx, `Todo widget ${widgetVisible ? "shown" : "hidden"}.`);
				return;
			}

			if (command === "add") {
				let content = rest;
				if (!content && ctx.hasUI) {
					const input = await ctx.ui.input("Add todo", "Describe the task to track...");
					content = input?.trim() ?? "";
				}
				if (!content) {
					notify(ctx, "Usage: /todos add <task>", "warning");
					return;
				}
				const normalized = compactWhitespace(content);
				todos = [...todos, { content: normalized, activeForm: inferActiveForm(normalized), status: "pending" }].slice(0, MAX_TODOS);
				persistManualState("manual:add");
				updateUi(ctx);
				notify(ctx, `Added todo #${todos.length}: ${normalized}`);
				return;
			}

			if (command === "clear") {
				if (todos.length > 0 && ctx.hasUI) {
					const ok = await ctx.ui.confirm("Clear todos?", `Clear ${todos.length} session todo${todos.length === 1 ? "" : "s"}?`);
					if (!ok) return;
				}
				todos = [];
				persistManualState("manual:clear");
				updateUi(ctx);
				notify(ctx, "Cleared todos.");
				return;
			}

			if (["start", "done", "complete", "completed", "pending", "remove"].includes(command)) {
				const index = parseIndex(rest);
				if (index === null) {
					notify(ctx, `Usage: /todos ${command} <number>`, "warning");
					return;
				}
				if (index < 0 || index >= todos.length) {
					notify(ctx, `Todo #${index + 1} not found.`, "error");
					return;
				}

				if (command === "remove") {
					const removed = todos[index];
					todos = todos.filter((_todo, todoIndex) => todoIndex !== index);
					persistManualState("manual:remove");
					updateUi(ctx);
					notify(ctx, `Removed todo #${index + 1}: ${removed?.content ?? ""}`);
					return;
				}

				const nextStatus: TodoStatus = command === "start" ? "in_progress" : command === "pending" ? "pending" : "completed";
				const updated = setTodoStatus(index, nextStatus);
				persistManualState(`manual:${nextStatus}`);
				updateUi(ctx);
				notify(ctx, `Marked todo #${index + 1} ${statusLabel(nextStatus)}: ${updated?.content ?? ""}`);
				return;
			}

			notify(ctx, `Unknown /todos command: ${command}\n\n${commandHelp()}`, "warning");
		},
	});

	pi.registerShortcut("ctrl+t", {
		description: "Open Todo manager",
		handler: async (ctx) => {
			await showTodos(ctx, "open");
		},
	});
}
