/**
 * Subagents for pi
 *
 * A compact subagent orchestration extension optimized for low overhead:
 * - In-process SDK sessions (no child pi process per task)
 * - Small built-in agent registry with optional ~/.pi/agent/agents/*.md overrides
 * - Foreground and background execution with bounded background concurrency
 * - Agent, get_subagent_result, and steer_subagent tools
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum, type Model } from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	createAgentSession,
	DefaultResourceLoader,
	type AgentSession,
	type AgentSessionEvent,
	type AgentToolResult,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	getMarkdownTheme,
	parseFrontmatter,
	SessionManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { type Component, Container, Markdown, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const TOOL_AGENT = "Agent";
const TOOL_GET_RESULT = "get_subagent_result";
const TOOL_STEER = "steer_subagent";
const WIDGET_ID = "subagents";
const NOTIFICATION_TYPE = "subagent-notification";

const DEFAULT_MAX_BACKGROUND = 3;
const DEFAULT_MAX_TURNS = 20;
const GRACE_TURNS = 3;
const MAX_AGENT_PROMPT_CHARS = 40_000;
const MAX_FOREGROUND_RESULT_CHARS = 60_000;
const MAX_BACKGROUND_NOTIFICATION_CHARS = 8_000;
const MAX_CONTEXT_INHERIT_CHARS = 16_000;
const MAX_TRANSCRIPT_CHARS = 80_000;
const COMPLETED_RECORD_TTL_MS = 45 * 60 * 1000;
const RECENT_WIDGET_TTL_MS = 5 * 60 * 1000;

const ALL_BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;
const VERIFY_TOOLS = ["read", "bash", "grep", "find", "ls"] as const;

type AgentStatus = "queued" | "running" | "completed" | "wrapped" | "aborted" | "stopped" | "error";
type AgentSource = "builtin" | "user" | "project";
type AgentScope = "user" | "project" | "both";
type PromptMode = "replace" | "append";

interface SubagentSpec {
	name: string;
	displayName: string;
	description: string;
	systemPrompt: string;
	tools?: string[];
	model?: string;
	thinking?: string;
	promptMode: PromptMode;
	source: AgentSource;
	enabled: boolean;
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

interface AgentRecord {
	id: string;
	type: string;
	displayName: string;
	description: string;
	prompt: string;
	status: AgentStatus;
	background: boolean;
	source: AgentSource;
	model?: string;
	tools: string[];
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	turns: number;
	maxTurns?: number;
	toolUses: number;
	activeTools: Map<string, string>;
	usage: UsageStats;
	result?: string;
	transcript?: string;
	error?: string;
	wrapped: boolean;
	abortController: AbortController;
	session?: AgentSession;
	promise?: Promise<void>;
	pendingSteers?: string[];
}

interface AgentDetails {
	id: string;
	status: AgentStatus;
	type: string;
	description: string;
	background: boolean;
	turns: number;
	maxTurns?: number;
	toolUses: number;
	activeTools: string[];
	usage: UsageStats;
	model?: string;
	durationMs?: number;
	error?: string;
	resultPreview?: string;
}

interface NotificationDetails extends AgentDetails {
	result: string;
}

const TaskScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description:
		'Which custom agent definition directories to include. Default "user" loads ~/.pi/agent/agents plus built-ins. "both" also loads project .pi/agents; use only in trusted repos.',
	default: "user",
});

const AgentParamsSchema = Type.Object(
	{
		subagent_type: Type.Optional(
			Type.String({
				description:
					'Agent type to run. Built-ins: "Explore", "Plan", "Verify", "general-purpose". Defaults to general-purpose.',
			}),
		),
		description: Type.String({
			description:
				"Short human-readable task label (3-8 words). Used in status displays and background notifications.",
		}),
		prompt: Type.String({ description: "Detailed task instructions for the subagent." }),
		run_in_background: Type.Optional(
			Type.Boolean({
				description:
					"If true, return an agent id immediately and notify the parent session when complete. Use for independent work.",
				default: false,
			}),
		),
		max_turns: Type.Optional(
			Type.Number({
				minimum: 1,
				maximum: 80,
				description: `Soft turn limit. The subagent is asked to wrap up at this point; default ${DEFAULT_MAX_TURNS}.`,
			}),
		),
		inherit_context: Type.Optional(
			Type.Boolean({
				description:
					"Include a compact snapshot of recent parent conversation. Leave false for most independent searches to save context.",
				default: false,
			}),
		),
		model: Type.Optional(
			Type.String({
				description:
					'Optional model override. Accepts exact "provider/model-id" or a fuzzy substring of an available model name/id.',
			}),
		),
		cwd: Type.Optional(
			Type.String({
				description: "Optional working directory for the subagent. Relative paths resolve from the current pi cwd.",
			}),
		),
		agent_scope: Type.Optional(TaskScopeSchema),
		confirm_project_agents: Type.Optional(
			Type.Boolean({
				description:
					"Prompt before running project-local .pi/agents definitions. Default true; set false only for trusted repositories/headless runs.",
				default: true,
			}),
		),
	},
	{ additionalProperties: false },
);

const GetResultParamsSchema = Type.Object(
	{
		agent_id: Type.Optional(Type.String({ description: "Background subagent id returned by Agent." })),
		task_id: Type.Optional(Type.String({ description: "Alias for agent_id." })),
		include_transcript: Type.Optional(
			Type.Boolean({ description: "Include a compact full conversation transcript if available.", default: false }),
		),
		max_chars: Type.Optional(
			Type.Number({
				minimum: 500,
				maximum: 120_000,
				description: "Maximum characters of result/transcript to return to the parent model.",
			}),
		),
	},
	{ additionalProperties: false },
);

const SteerParamsSchema = Type.Object(
	{
		agent_id: Type.Optional(Type.String({ description: "Running subagent id returned by Agent." })),
		task_id: Type.Optional(Type.String({ description: "Alias for agent_id." })),
		message: Type.String({ description: "Steering instruction to inject into the running subagent." }),
	},
	{ additionalProperties: false },
);

type AgentParams = Static<typeof AgentParamsSchema>;
type GetResultParams = Static<typeof GetResultParamsSchema>;
type SteerParams = Static<typeof SteerParamsSchema>;

function nowIso(): string {
	return new Date().toISOString();
}

function truncateText(text: string, maxChars: number, label = "output"): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[${label} truncated: ${text.length - maxChars} characters omitted]`;
}

function formatDuration(ms: number | undefined): string {
	if (!ms || ms < 0) return "0s";
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const min = Math.floor(ms / 60_000);
	const sec = Math.round((ms % 60_000) / 1000);
	return `${min}m${sec ? ` ${sec}s` : ""}`;
}

function formatTokens(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0";
	if (n < 1000) return String(Math.round(n));
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function statusIcon(status: AgentStatus): string {
	switch (status) {
		case "queued":
			return "○";
		case "running":
			return "●";
		case "completed":
			return "✓";
		case "wrapped":
			return "✓";
		case "stopped":
			return "■";
		case "aborted":
			return "✗";
		case "error":
			return "✗";
	}
}

function statusLabel(status: AgentStatus): string {
	if (status === "wrapped") return "completed (turn limit)";
	return status;
}

function totalTokens(usage: UsageStats): number {
	return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function makeUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function modelKey(model: Model<any> | undefined): string | undefined {
	return model ? `${model.provider}/${model.id}` : undefined;
}

function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

function parseList(value: unknown): string[] | undefined {
	if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return trimmed
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseBoolean(value: unknown, fallback = true): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["false", "no", "0", "off", "disabled"].includes(normalized)) return false;
		if (["true", "yes", "1", "on", "enabled"].includes(normalized)) return true;
	}
	return fallback;
}

function normalizeTools(value: unknown, fallback: string[] | undefined): string[] | undefined {
	const raw = parseList(value);
	if (!raw) return fallback;
	if (raw.some((v) => normalizeName(v) === "all")) return undefined;
	if (raw.some((v) => normalizeName(v) === "none")) return [];
	const allowed = new Set<string>(ALL_BUILTIN_TOOLS as readonly string[] as string[]);
	return raw.filter((tool) => allowed.has(tool));
}

function builtInAgents(): SubagentSpec[] {
	return [
		{
			name: "general-purpose",
			displayName: "Agent",
			description:
				"General-purpose coding agent for multi-step research or implementation tasks that benefit from an isolated context.",
			tools: [...ALL_BUILTIN_TOOLS],
			promptMode: "replace",
			source: "builtin",
			enabled: true,
			systemPrompt: `You are an autonomous coding subagent running inside Pi.

Work independently on the delegated task. Use tools efficiently, prefer parallel independent tool calls when possible, and keep your final answer concise and directly useful to the parent agent.

Rules:
- Do not ask the user questions. If information is missing, state assumptions and proceed.
- Use absolute or cwd-relative file paths when reporting findings.
- If you modify files, summarize exactly what changed and mention any verification performed.
- If the task is exploratory, do not make changes.
- End with a compact result the parent agent can act on.`,
		},
		{
			name: "Explore",
			displayName: "Explore",
			description:
				"Fast read-only codebase exploration: find files, definitions, references, patterns, and concise factual answers.",
			tools: [...READ_ONLY_TOOLS],
			promptMode: "replace",
			source: "builtin",
			enabled: true,
			systemPrompt: `You are a read-only code exploration subagent.

Your job is to locate and summarize existing code. You cannot edit files or run shell commands; use read, grep, find, and ls. Be systematic but efficient.

Rules:
- Never attempt to create, modify, delete, or move files.
- Prefer targeted searches first, then broaden if needed.
- Cite file paths and line-relevant context when useful.
- Return facts, not implementation unless explicitly asked.
- Keep the final answer concise and structured.`,
		},
		{
			name: "Plan",
			displayName: "Plan",
			description:
				"Read-only implementation planner: inspect the codebase and produce a sequenced plan with risks and critical files.",
			tools: [...READ_ONLY_TOOLS],
			promptMode: "replace",
			source: "builtin",
			enabled: true,
			systemPrompt: `You are a read-only software planning subagent.

Explore the relevant code and design an implementation approach. You cannot edit files or run shell commands; use read, grep, find, and ls.

Output:
- Brief understanding of the current architecture.
- Step-by-step implementation plan.
- Risks, edge cases, and verification strategy.
- Critical files to inspect or modify, with reasons.

Do not write code unless asked for pseudocode. Do not modify files.`,
		},
		{
			name: "Verify",
			displayName: "Verify",
			description:
				"Independent verifier for tests, regressions, review checklists, and adversarial validation. Does not edit files.",
			tools: [...VERIFY_TOOLS],
			promptMode: "replace",
			source: "builtin",
			enabled: true,
			systemPrompt: `You are an independent verification subagent.

Validate the delegated work. You may inspect files and run relevant read-only or test commands. You must not edit files.

Focus on:
- Whether requirements are actually satisfied.
- Bugs, regressions, missing edge cases, and unsafe assumptions.
- Concrete test/build/lint results when runnable.
- Clear pass/fail status and actionable findings.

If you run commands, report the exact command and outcome.`,
		},
	];
}

function agentDirs(cwd: string, scope: AgentScope): Array<{ dir: string; source: AgentSource }> {
	const dirs: Array<{ dir: string; source: AgentSource }> = [];
	if (scope === "user" || scope === "both") dirs.push({ dir: path.join(getAgentDir(), "agents"), source: "user" });
	if (scope === "project" || scope === "both") {
		let current = cwd;
		while (true) {
			const candidate = path.join(current, ".pi", "agents");
			if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
				dirs.push({ dir: candidate, source: "project" });
				break;
			}
			const parent = path.dirname(current);
			if (parent === current) break;
			current = parent;
		}
	}
	return dirs;
}

function loadAgentFile(filePath: string, source: AgentSource): SubagentSpec | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}

	const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
	const fallbackName = path.basename(filePath, path.extname(filePath));
	const name = typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : fallbackName;
	const description =
		typeof frontmatter.description === "string" && frontmatter.description.trim()
			? frontmatter.description.trim()
			: `Custom ${name} subagent`;

	const promptModeRaw = String(frontmatter.prompt_mode ?? frontmatter.promptMode ?? "replace").toLowerCase();
	const promptMode: PromptMode = promptModeRaw === "append" ? "append" : "replace";
	const tools = normalizeTools(frontmatter.tools, undefined);
	const disallowed = new Set(parseList(frontmatter.disallowed_tools ?? frontmatter.disallowedTools) ?? []);
	const filteredTools = tools ? tools.filter((t) => !disallowed.has(t)) : tools;

	return {
		name,
		displayName: typeof frontmatter.displayName === "string" ? frontmatter.displayName : name,
		description,
		systemPrompt: body.trim(),
		tools: filteredTools,
		model: typeof frontmatter.model === "string" ? frontmatter.model.trim() : undefined,
		thinking: typeof frontmatter.thinking === "string" ? frontmatter.thinking.trim() : undefined,
		promptMode,
		source,
		enabled: parseBoolean(frontmatter.enabled, true),
	};
}

function loadCustomAgents(cwd: string, scope: AgentScope): SubagentSpec[] {
	const result: SubagentSpec[] = [];
	for (const { dir, source } of agentDirs(cwd, scope)) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.name.endsWith(".md")) continue;
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			const spec = loadAgentFile(path.join(dir, entry.name), source);
			if (spec?.enabled) result.push(spec);
		}
	}
	return result;
}

function discoverAgents(cwd: string, scope: AgentScope): SubagentSpec[] {
	const map = new Map<string, SubagentSpec>();
	for (const spec of builtInAgents()) map.set(normalizeName(spec.name), spec);
	for (const spec of loadCustomAgents(cwd, scope)) map.set(normalizeName(spec.name), spec);
	return [...map.values()];
}

function resolveAgentType(requested: string | undefined, agents: SubagentSpec[]): { spec: SubagentSpec; note?: string } {
	const name = requested?.trim() || "general-purpose";
	const exact = agents.find((a) => a.name === name);
	if (exact) return { spec: exact };
	const ci = agents.find((a) => normalizeName(a.name) === normalizeName(name));
	if (ci) return { spec: ci };
	const fallback = agents.find((a) => normalizeName(a.name) === "general-purpose") ?? agents[0];
	return { spec: fallback, note: `Unknown subagent_type "${name}"; used "${fallback.name}".` };
}

function resolveWorkingDir(ctx: ExtensionContext, requested?: string): string {
	if (!requested?.trim()) return ctx.cwd;
	const resolved = path.resolve(ctx.cwd, requested);
	if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
		throw new Error(`Subagent cwd does not exist or is not a directory: ${resolved}`);
	}
	return resolved;
}

function resolveModel(ctx: ExtensionContext, requested?: string): Model<any> | undefined {
	const wanted = requested?.trim();
	if (!wanted) return ctx.model;

	if (wanted.includes("/")) {
		const [provider, ...rest] = wanted.split("/");
		const modelId = rest.join("/");
		const exact = ctx.modelRegistry.find(provider, modelId);
		if (exact) return exact;
	}

	const lower = wanted.toLowerCase();
	const candidates = [...ctx.modelRegistry.getAvailable(), ...ctx.modelRegistry.getAll()];
	const seen = new Set<string>();
	for (const model of candidates) {
		const key = `${model.provider}/${model.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const haystack = `${model.provider}/${model.id} ${(model as any).name ?? ""}`.toLowerCase();
		if (haystack.includes(lower)) return model;
	}
	return ctx.model;
}

function extractMessageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
		else if (part?.type === "toolCall") parts.push(`[tool:${part.name ?? part.toolName ?? "unknown"}]`);
	}
	return parts.join("\n");
}

function lastAssistantText(session: AgentSession): string {
	for (let i = session.messages.length - 1; i >= 0; i--) {
		const message: any = session.messages[i];
		if (message.role !== "assistant") continue;
		const text = extractMessageText(message).trim();
		if (text) return text;
	}
	return "";
}

function buildTranscript(session: AgentSession): string {
	const parts: string[] = [];
	for (const message of session.messages as any[]) {
		if (message.role === "user") {
			const text = extractMessageText(message).trim();
			if (text) parts.push(`[User]\n${truncateText(text, 4_000, "message")}`);
		} else if (message.role === "assistant") {
			const text = extractMessageText(message).trim();
			if (text) parts.push(`[Assistant]\n${truncateText(text, 8_000, "message")}`);
		} else if (message.role === "toolResult") {
			const text = extractMessageText(message).trim();
			parts.push(`[Tool result: ${message.toolName ?? "tool"}]\n${truncateText(text, 1_500, "tool result")}`);
		}
	}
	return truncateText(parts.join("\n\n"), MAX_TRANSCRIPT_CHARS, "transcript");
}

function buildInheritedContext(ctx: ExtensionContext): string {
	try {
		const entries = ctx.sessionManager.getEntries();
		const leafId = ctx.sessionManager.getLeafId();
		const context = buildSessionContext(entries as any, leafId);
		const messages = context.messages.slice(-10);
		const chunks: string[] = [];
		for (const msg of messages as any[]) {
			const role = msg.role ?? "message";
			const text = extractMessageText(msg).trim();
			if (!text) continue;
			chunks.push(`[${role}] ${truncateText(text, 2_000, "parent message")}`);
		}
		const joined = chunks.join("\n\n");
		if (!joined) return "";
		return `<parent_context>\n${truncateText(joined, MAX_CONTEXT_INHERIT_CHARS, "parent context")}\n</parent_context>\n\n`;
	} catch {
		return "";
	}
}

function buildSystemPrompt(spec: SubagentSpec, ctx: ExtensionContext, effectiveCwd: string): string {
	const base = `You are ${spec.displayName}, a specialized subagent running in an isolated Pi session.

Environment:
- Current date: ${nowIso()}
- Working directory: ${effectiveCwd}
- Parent agent delegated this task; return a result for the parent agent, not the end user.

Operational guidance:
- Be efficient: gather only the context needed for the delegated task.
- Prefer independent parallel tool calls when useful.
- Do not ask the user questions; state assumptions if needed.
- Use clear file paths and concrete evidence.
- Finish with a compact final answer.`;

	const agentPrompt = spec.systemPrompt.trim();
	if (spec.promptMode === "append") {
		const parent = truncateText(ctx.getSystemPrompt?.() ?? "", 12_000, "parent system prompt");
		return [parent, base, agentPrompt].filter(Boolean).join("\n\n---\n\n");
	}
	return [base, agentPrompt].filter(Boolean).join("\n\n");
}

function makeDetails(record: AgentRecord): AgentDetails {
	const durationMs = record.startedAt ? (record.completedAt ?? Date.now()) - record.startedAt : undefined;
	return {
		id: record.id,
		status: record.status,
		type: record.type,
		description: record.description,
		background: record.background,
		turns: record.turns,
		maxTurns: record.maxTurns,
		toolUses: record.toolUses,
		activeTools: [...record.activeTools.values()],
		usage: record.usage,
		model: record.model,
		durationMs,
		error: record.error,
		resultPreview: record.result ? truncateText(record.result, 1_000, "result") : undefined,
	};
}

function formatSummaryLine(record: AgentRecord): string {
	const duration = record.startedAt ? formatDuration((record.completedAt ?? Date.now()) - record.startedAt) : "queued";
	const turns = record.maxTurns ? `${record.turns}/${record.maxTurns}` : `${record.turns}`;
	const tokens = formatTokens(totalTokens(record.usage));
	const active = record.activeTools.size ? ` · ${compactActiveTools(record)}` : "";
	return `${statusIcon(record.status)} ${record.displayName} ${record.description} · ${statusLabel(record.status)} · turn ${turns} · ${record.toolUses} tools · ${tokens} tok · ${duration}${active}`;
}

function compactId(id: string): string {
	return id.length <= 8 ? id : id.slice(0, 8);
}

function compactActiveTools(record: Pick<AgentRecord, "activeTools">): string {
	const unique = [...new Set([...record.activeTools.values()])];
	if (unique.length === 0) return "idle";
	if (unique.length <= 3) return unique.join(", ");
	return `${unique.slice(0, 3).join(", ")} +${unique.length - 3}`;
}

function statusColor(status: AgentStatus): "accent" | "muted" | "success" | "warning" | "error" {
	switch (status) {
		case "queued":
			return "muted";
		case "running":
			return "accent";
		case "completed":
			return "success";
		case "wrapped":
			return "warning";
		case "stopped":
			return "warning";
		case "aborted":
		case "error":
			return "error";
	}
}

function styledStatus(theme: Theme, status: AgentStatus): string {
	return theme.fg(statusColor(status), statusLabel(status));
}

function styledIcon(theme: Theme, status: AgentStatus): string {
	return theme.fg(statusColor(status), statusIcon(status));
}

function progressRatio(record: Pick<AgentRecord, "turns" | "maxTurns" | "status">): number {
	if (record.status === "completed" || record.status === "wrapped") return 1;
	if (!record.maxTurns || record.maxTurns <= 0) return 0;
	return Math.max(0, Math.min(1, record.turns / record.maxTurns));
}

function progressBar(theme: Theme, record: Pick<AgentRecord, "turns" | "maxTurns" | "status">, width = 10): string {
	const ratio = progressRatio(record);
	const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
	const empty = width - filled;
	const color = record.status === "error" || record.status === "aborted" ? "error" : ratio >= 0.85 ? "warning" : "accent";
	return theme.fg(color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
}

function statParts(record: Pick<AgentRecord, "turns" | "maxTurns" | "toolUses" | "usage" | "startedAt" | "completedAt">): string[] {
	const turnText = record.maxTurns ? `${record.turns}/${record.maxTurns}` : `${record.turns}`;
	const duration = record.startedAt ? formatDuration((record.completedAt ?? Date.now()) - record.startedAt) : "queued";
	return [`turn ${turnText}`, `${record.toolUses} tools`, `${formatTokens(totalTokens(record.usage))} tok`, duration];
}

function detailLineForRecord(record: AgentRecord): string {
	if (record.error) return `Error: ${record.error}`;
	if (record.activeTools.size > 0) return `Using ${compactActiveTools(record)}`;
	if (record.status === "queued") return "Waiting for a background slot";
	if (record.status === "running") return "Thinking";
	if (record.status === "wrapped") return "Finished after turn-limit wrap-up";
	if (record.status === "completed") return "Done";
	if (record.status === "stopped") return "Stopped";
	if (record.status === "aborted") return "Aborted";
	return statusLabel(record.status);
}

function detailLineForDetails(details: AgentDetails): string {
	if (details.error) return `Error: ${details.error}`;
	if (details.activeTools?.length) return `Using ${details.activeTools.slice(0, 3).join(", ")}${details.activeTools.length > 3 ? ` +${details.activeTools.length - 3}` : ""}`;
	if (details.status === "queued") return "Waiting for a background slot";
	if (details.status === "running") return "Still running";
	if (details.status === "wrapped") return "Finished after turn-limit wrap-up";
	if (details.status === "completed") return "Done";
	if (details.status === "stopped") return "Stopped";
	if (details.status === "aborted") return "Aborted";
	return statusLabel(details.status);
}

function renderAgentCardLines(theme: Theme, details: AgentDetails, width: number, resultText?: string, expanded = false): string[] {
	const lines: string[] = [];
	const title = `${styledIcon(theme, details.status)} ${theme.fg("toolTitle", theme.bold(details.type))} ${theme.fg("text", details.description)} ${theme.fg("dim", `#${compactId(details.id)}`)}`;
	lines.push(truncateToWidth(title, width));

	const turnText = details.maxTurns ? `${details.turns}/${details.maxTurns}` : `${details.turns}`;
	const stats = [`turn ${turnText}`, `${details.toolUses} tools`, `${formatTokens(totalTokens(details.usage))} tok`];
	if (details.durationMs) stats.push(formatDuration(details.durationMs));
	const meta = `  ${progressBar(theme, details, 10)} ${styledStatus(theme, details.status)} ${theme.fg("dim", `· ${stats.join(" · ")}`)}`;
	lines.push(truncateToWidth(meta, width));

	const activity = `  ${theme.fg("muted", "└─")} ${theme.fg(details.status === "error" || details.status === "aborted" ? "error" : "dim", detailLineForDetails(details))}`;
	lines.push(truncateToWidth(activity, width));

	const previewSource = resultText || details.resultPreview || "";
	if (previewSource.trim()) {
		const previewLines = previewSource.trim().split("\n").filter(Boolean).slice(0, expanded ? 12 : 3);
		for (const line of previewLines) {
			lines.push(truncateToWidth(`  ${theme.fg("muted", "│")} ${theme.fg("toolOutput", line)}`, width));
		}
		if (!expanded && previewSource.trim().split("\n").length > 3) {
			lines.push(truncateToWidth(`  ${theme.fg("muted", "└─ expand for more")}`, width));
		}
	}
	return lines;
}

function agentCardComponent(theme: Theme, details: AgentDetails, resultText?: string, expanded = false): Component {
	return {
		render(width: number) {
			return renderAgentCardLines(theme, details, width, resultText, expanded);
		},
		invalidate() {},
	};
}

function firstTextContent(result: AgentToolResult<any>): string {
	const part = result.content?.find((item) => item.type === "text");
	return part?.type === "text" ? part.text : "";
}

function renderWidgetLines(theme: Theme, records: AgentRecord[], width: number): string[] {
	const active = records
		.filter((record) => record.status === "running" || record.status === "queued")
		.sort((a, b) => (a.status === b.status ? a.createdAt - b.createdAt : a.status === "running" ? -1 : 1));
	const recentCutoff = Date.now() - RECENT_WIDGET_TTL_MS;
	const recentDone = records
		.filter((record) => record.status !== "running" && record.status !== "queued" && (record.completedAt ?? 0) >= recentCutoff)
		.sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))
		.slice(0, Math.max(0, 3 - active.length));

	const running = active.filter((record) => record.status === "running").length;
	const queued = active.filter((record) => record.status === "queued").length;
	const headerParts = [`${running} running`];
	if (queued) headerParts.push(`${queued} queued`);
	if (recentDone.length) headerParts.push(`${recentDone.length} recent`);

	const lines = [
		truncateToWidth(
			`${theme.fg("accent", "●")} ${theme.fg("toolTitle", theme.bold("Subagents"))} ${theme.fg("dim", headerParts.join(" · "))}`,
			width,
		),
	];

	for (const record of active.slice(0, 6)) {
		const name = theme.fg("accent", record.displayName.padEnd(7).slice(0, 7));
		const stats = statParts(record).join(" · ");
		lines.push(
			truncateToWidth(
				`  ${styledIcon(theme, record.status)} ${name} ${theme.fg("text", record.description)} ${theme.fg("dim", `#${compactId(record.id)}`)}`,
				width,
			),
		);
		lines.push(
			truncateToWidth(
				`    ${progressBar(theme, record, 10)} ${styledStatus(theme, record.status)} ${theme.fg("dim", `· ${stats}`)}`,
				width,
			),
		);
		lines.push(truncateToWidth(`    ${theme.fg("muted", "└─")} ${theme.fg("dim", detailLineForRecord(record))}`, width));
	}

	if (active.length > 6) lines.push(truncateToWidth(`  ${theme.fg("muted", `… ${active.length - 6} more active subagents`)}`, width));

	if (recentDone.length > 0) {
		lines.push(truncateToWidth(`  ${theme.fg("muted", "Recent")}`, width));
		for (const record of recentDone) {
			lines.push(
				truncateToWidth(
					`  ${styledIcon(theme, record.status)} ${theme.fg("dim", record.displayName)} ${record.description} ${theme.fg("dim", `· ${statusLabel(record.status)} · ${formatDuration(record.startedAt ? (record.completedAt ?? Date.now()) - record.startedAt : 0)}`)}`,
					width,
				),
			);
		}
	}

	return lines;
}

function formatTaskNotification(record: AgentRecord): string {
	const result = record.result ?? record.error ?? "No output.";
	const preview = truncateText(result, MAX_BACKGROUND_NOTIFICATION_CHARS, "subagent result");
	return [
		`<task-notification>`,
		`<task-id>${record.id}</task-id>`,
		`<agent-type>${record.type}</agent-type>`,
		`<status>${statusLabel(record.status)}</status>`,
		`<summary>${record.displayName} "${record.description}" ${statusLabel(record.status)}</summary>`,
		`<usage><turns>${record.turns}</turns><tool_uses>${record.toolUses}</tool_uses><tokens>${totalTokens(record.usage)}</tokens><duration_ms>${record.startedAt ? (record.completedAt ?? Date.now()) - record.startedAt : 0}</duration_ms></usage>`,
		`<result>${preview.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</result>`,
		`</task-notification>`,
	].join("\n");
}

function renderNotificationText(d: NotificationDetails, theme: Theme, expanded: boolean): string {
	const isBad = d.status === "error" || d.status === "aborted" || d.status === "stopped";
	const icon = theme.fg(isBad ? "error" : "success", statusIcon(d.status));
	let text = `${icon} ${theme.bold(d.description)} ${theme.fg("dim", statusLabel(d.status))}`;
	const parts = [`↻${d.maxTurns ? `${d.turns}≤${d.maxTurns}` : d.turns}`, `${d.toolUses} tool${d.toolUses === 1 ? "" : "s"}`, `${formatTokens(totalTokens(d.usage))} tok`];
	if (d.durationMs) parts.push(formatDuration(d.durationMs));
	text += `\n  ${parts.map((p) => theme.fg("dim", p)).join(theme.fg("dim", " · "))}`;
	const lines = d.result.split("\n").slice(0, expanded ? 40 : 4);
	for (const line of lines) text += `\n  ${theme.fg("dim", line)}`;
	return text;
}

function formatRecordForModel(record: AgentRecord, maxChars: number, includeTranscript = false): string {
	const lines = [
		`Subagent ${record.id} (${record.type}) ${statusLabel(record.status)}.`,
		`Description: ${record.description}`,
		`Turns: ${record.turns}${record.maxTurns ? `/${record.maxTurns}` : ""}; tool uses: ${record.toolUses}; tokens: ${totalTokens(record.usage)}.`,
	];
	if (record.error) lines.push(`Error: ${record.error}`);
	if (record.result) lines.push(`\nResult:\n${truncateText(record.result, maxChars, "result")}`);
	if (includeTranscript && record.transcript) {
		lines.push(`\nTranscript:\n${truncateText(record.transcript, maxChars, "transcript")}`);
	}
	return lines.join("\n");
}

async function runSubagent(
	ctx: ExtensionContext,
	spec: SubagentSpec,
	record: AgentRecord,
	taskPrompt: string,
	effectiveCwd: string,
	onActivity?: () => void,
): Promise<void> {
	const systemPrompt = buildSystemPrompt(spec, ctx, effectiveCwd);
	const loader = new DefaultResourceLoader({
		cwd: effectiveCwd,
		agentDir: getAgentDir(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => systemPrompt,
		appendSystemPromptOverride: () => [],
	});
	await loader.reload();

	const model = resolveModel(ctx, record.model ?? spec.model);
	record.model = modelKey(model) ?? record.model ?? spec.model;

	const { session } = await createAgentSession({
		cwd: effectiveCwd,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(effectiveCwd),
		modelRegistry: ctx.modelRegistry,
		model,
		thinkingLevel: (spec.thinking as any) || undefined,
		tools: record.tools,
	});

	record.session = session;
	session.setSessionName(`${spec.displayName}#${record.id.slice(0, 8)}`);
	onActivity?.();

	for (const steer of record.pendingSteers ?? []) await session.steer(steer);
	record.pendingSteers = undefined;

	let responseText = "";
	let currentAssistantText = "";
	let softLimitReached = false;
	let hardAbort = false;

	const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
		if (event.type === "message_start") currentAssistantText = "";
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			currentAssistantText += event.assistantMessageEvent.delta;
			responseText = currentAssistantText;
		}
		if (event.type === "tool_execution_start") {
			record.activeTools.set(event.toolCallId, event.toolName);
			onActivity?.();
		}
		if (event.type === "tool_execution_end") {
			record.activeTools.delete(event.toolCallId);
			record.toolUses++;
			onActivity?.();
		}
		if (event.type === "turn_end") {
			record.turns++;
			if (record.maxTurns && record.turns >= record.maxTurns && !softLimitReached) {
				softLimitReached = true;
				record.wrapped = true;
				session.steer("You have reached your turn budget. Stop using tools and provide your final answer now.").catch(() => {});
			} else if (record.maxTurns && softLimitReached && record.turns >= record.maxTurns + GRACE_TURNS) {
				hardAbort = true;
				session.abort().catch(() => {});
			}
			onActivity?.();
		}
		if (event.type === "message_end" && (event.message as any).role === "assistant") {
			const usage = (event.message as any).usage;
			if (usage) {
				record.usage.input += usage.input ?? 0;
				record.usage.output += usage.output ?? 0;
				record.usage.cacheRead += usage.cacheRead ?? 0;
				record.usage.cacheWrite += usage.cacheWrite ?? 0;
				record.usage.cost += usage.cost?.total ?? 0;
			}
			onActivity?.();
		}
	});

	const onAbort = () => session.abort().catch(() => {});
	record.abortController.signal.addEventListener("abort", onAbort, { once: true });

	try {
		await session.prompt(truncateText(taskPrompt, MAX_AGENT_PROMPT_CHARS, "subagent prompt"), {
			expandPromptTemplates: false,
			source: "extension",
		});
		record.result = (responseText.trim() || lastAssistantText(session)).trim() || "(no output)";
		if (record.abortController.signal.aborted || record.status === "stopped") {
			record.status = "stopped";
		} else {
			record.status = hardAbort ? "aborted" : record.wrapped ? "wrapped" : "completed";
		}
	} catch (error) {
		record.error = error instanceof Error ? error.message : String(error);
		record.result = responseText.trim() || lastAssistantText(session);
		record.status = record.abortController.signal.aborted ? "stopped" : hardAbort ? "aborted" : "error";
	} finally {
		record.completedAt = Date.now();
		record.activeTools.clear();
		record.transcript = buildTranscript(session);
		record.abortController.signal.removeEventListener("abort", onAbort);
		unsubscribe();
		session.dispose();
		record.session = undefined;
		onActivity?.();
	}
}

class SubagentManager {
	private records = new Map<string, AgentRecord>();
	private queue: Array<{ record: AgentRecord; start: () => void }> = [];
	private runningBackground = 0;
	private lastCtx: ExtensionContext | undefined;
	private cleanupTimer: ReturnType<typeof setInterval>;
	private widgetRefreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly pi: ExtensionAPI,
		private maxBackground = DEFAULT_MAX_BACKGROUND,
	) {
		this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
		this.cleanupTimer.unref();
	}

	setUiContext(ctx: ExtensionContext | undefined): void {
		this.lastCtx = ctx;
		this.updateWidget();
	}

	list(): AgentRecord[] {
		return [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt);
	}

	get(id: string): AgentRecord | undefined {
		return this.records.get(id);
	}

	clearCompleted(): number {
		let removed = 0;
		for (const [id, record] of this.records) {
			if (!["running", "queued"].includes(record.status)) {
				this.records.delete(id);
				removed++;
			}
		}
		this.updateWidget();
		return removed;
	}

	abort(id: string): boolean {
		const record = this.records.get(id);
		if (!record || !["queued", "running"].includes(record.status)) return false;
		if (record.status === "queued") {
			record.status = "stopped";
			record.completedAt = Date.now();
			this.queue = this.queue.filter((item) => item.record.id !== id);
			this.updateWidget();
			return true;
		}
		record.status = "stopped";
		record.abortController.abort();
		this.updateWidget();
		return true;
	}

	async steer(id: string, message: string): Promise<boolean> {
		const record = this.records.get(id);
		if (!record || !["queued", "running"].includes(record.status)) return false;
		if (record.session) await record.session.steer(message);
		else record.pendingSteers = [...(record.pendingSteers ?? []), message];
		return true;
	}

	spawn(
		ctx: ExtensionContext,
		spec: SubagentSpec,
		params: AgentParams,
		effectiveCwd: string,
		parentSignal?: AbortSignal,
	): AgentRecord {
		this.setUiContext(ctx);
		const background = params.run_in_background ?? false;
		const id = randomUUID().slice(0, 12);
		const tools = spec.tools ?? [...ALL_BUILTIN_TOOLS];
		const record: AgentRecord = {
			id,
			type: spec.name,
			displayName: spec.displayName,
			description: params.description,
			prompt: params.prompt,
			status: background ? "queued" : "running",
			background,
			source: spec.source,
			model: params.model ?? spec.model,
			tools,
			createdAt: Date.now(),
			turns: 0,
			maxTurns: params.max_turns ? Math.max(1, Math.min(80, Math.floor(params.max_turns))) : DEFAULT_MAX_TURNS,
			toolUses: 0,
			activeTools: new Map(),
			usage: makeUsage(),
			wrapped: false,
			abortController: new AbortController(),
		};
		this.records.set(id, record);

		const detachParentAbort =
			!background && parentSignal
				? (() => {
						const abort = () => record.abortController.abort();
						if (parentSignal.aborted) abort();
						else parentSignal.addEventListener("abort", abort, { once: true });
						return () => parentSignal.removeEventListener("abort", abort);
					})()
				: undefined;

		const inherited = params.inherit_context ? buildInheritedContext(ctx) : "";
		const taskPrompt = `${inherited}<task>\n${params.prompt}\n</task>`;
		const start = () => this.start(ctx, spec, record, taskPrompt, effectiveCwd, detachParentAbort);

		if (background && this.runningBackground >= this.maxBackground) {
			this.queue.push({ record, start });
			this.updateWidget();
			return record;
		}

		start();
		return record;
	}

	private start(
		ctx: ExtensionContext,
		spec: SubagentSpec,
		record: AgentRecord,
		taskPrompt: string,
		effectiveCwd: string,
		detachParentAbort?: () => void,
	): void {
		record.status = "running";
		record.startedAt = Date.now();
		if (record.background) this.runningBackground++;
		this.updateWidget();

		record.promise = runSubagent(ctx, spec, record, taskPrompt, effectiveCwd, () => this.updateWidget())
			.catch((error) => {
				record.error = error instanceof Error ? error.message : String(error);
				record.status = record.abortController.signal.aborted ? "stopped" : "error";
				record.completedAt = Date.now();
			})
			.finally(() => {
				detachParentAbort?.();
				if (record.background) {
					this.runningBackground = Math.max(0, this.runningBackground - 1);
					this.notifyCompletion(record);
					this.drainQueue();
				}
				this.updateWidget();
			});
	}

	private drainQueue(): void {
		while (this.queue.length > 0 && this.runningBackground < this.maxBackground) {
			const item = this.queue.shift()!;
			if (item.record.status !== "queued") continue;
			item.start();
		}
	}

	private notifyCompletion(record: AgentRecord): void {
		const result = record.result ?? record.error ?? "No output.";
		const details: NotificationDetails = { ...makeDetails(record), result: truncateText(result, MAX_BACKGROUND_NOTIFICATION_CHARS, "result") };
		try {
			this.pi.sendMessage<NotificationDetails>(
				{
					customType: NOTIFICATION_TYPE,
					content: formatTaskNotification(record),
					display: true,
					details,
				},
				{ deliverAs: "followUp", triggerTurn: true },
			);
		} catch {
			// The parent session may be gone after reload/shutdown. Keep the record for get_subagent_result.
		}
	}

	private updateWidget(): void {
		const ctx = this.lastCtx;
		if (!ctx?.hasUI) return;
		const records = this.list();
		const active = records
			.filter((record) => record.status === "running" || record.status === "queued")
			.sort((a, b) => a.createdAt - b.createdAt);
		const recentCutoff = Date.now() - RECENT_WIDGET_TTL_MS;
		const recent = records.filter(
			(record) => record.status !== "running" && record.status !== "queued" && (record.completedAt ?? 0) >= recentCutoff,
		);

		if (active.length === 0 && recent.length === 0) {
			ctx.ui.setStatus(WIDGET_ID, undefined);
			ctx.ui.setWidget(WIDGET_ID, undefined);
			this.ensureWidgetRefresh(false);
			return;
		}

		const statusText = active.length > 0
			? `● ${active.length} active${recent.length ? ` · ${recent.length} done` : ""}`
			: `✓ ${recent.length} recent`;
		ctx.ui.setStatus(WIDGET_ID, ctx.ui.theme.fg(active.length > 0 ? "accent" : "muted", statusText));
		ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
			render: (width: number) => renderWidgetLines(theme, this.list(), width),
			invalidate() {},
		}));
		this.ensureWidgetRefresh(active.length > 0 || recent.length > 0);
	}

	private ensureWidgetRefresh(active: boolean): void {
		if (active && !this.widgetRefreshTimer) {
			this.widgetRefreshTimer = setInterval(() => this.updateWidget(), 1000);
			this.widgetRefreshTimer.unref();
			return;
		}
		if (!active && this.widgetRefreshTimer) {
			clearInterval(this.widgetRefreshTimer);
			this.widgetRefreshTimer = undefined;
		}
	}

	private cleanup(): void {
		const cutoff = Date.now() - COMPLETED_RECORD_TTL_MS;
		for (const [id, record] of this.records) {
			if (record.completedAt && record.completedAt < cutoff && !["running", "queued"].includes(record.status)) {
				this.records.delete(id);
			}
		}
	}

	shutdown(): void {
		clearInterval(this.cleanupTimer);
		if (this.widgetRefreshTimer) clearInterval(this.widgetRefreshTimer);
		for (const record of this.records.values()) {
			if (["running", "queued"].includes(record.status)) this.abort(record.id);
		}
		this.lastCtx?.ui.setStatus(WIDGET_ID, undefined);
		this.lastCtx?.ui.setWidget(WIDGET_ID, undefined);
	}
}

export default function (pi: ExtensionAPI) {
	const manager = new SubagentManager(pi);

	pi.registerMessageRenderer<NotificationDetails>(NOTIFICATION_TYPE, (message, { expanded }, theme) => {
		const details = message.details;
		if (!details) return undefined;
		if (expanded) {
			const container = new Container();
			container.addChild(agentCardComponent(theme, details, details.result, false));
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(details.result, 0, 0, getMarkdownTheme()));
			return container;
		}
		return agentCardComponent(theme, details, details.result, false);
	});

	pi.on("session_start", (_event, ctx) => manager.setUiContext(ctx));
	pi.on("session_shutdown", () => manager.shutdown());

	pi.registerTool({
		name: TOOL_AGENT,
		label: "Agent",
		description: [
			"Launch a specialized subagent in an isolated context.",
			"Use Explore for code search, Plan for implementation planning, Verify for independent validation, and general-purpose for complex tasks.",
			"Foreground calls return the final result. Background calls return an id and later deliver a task notification.",
		].join(" "),
		promptSnippet: "Agent: delegate independent research/planning/verification/implementation to isolated subagents.",
		promptGuidelines: [
			"Use Agent for independent multi-step work that benefits from an isolated context; avoid it for trivial one-file lookups.",
			"Prefer subagent_type Explore for read-only code search and Plan for architecture/implementation plans.",
			"Use run_in_background=true for independent tasks that can proceed while you continue other work.",
			"Give every Agent call a short description and a detailed prompt with expected output.",
		],
		parameters: AgentParamsSchema,
		executionMode: "parallel",

		async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<AgentDetails>> {
			const scope: AgentScope = params.agent_scope ?? "user";
			const agents = discoverAgents(ctx.cwd, scope);
			const { spec, note } = resolveAgentType(params.subagent_type, agents);
			if (spec.source === "project" && params.confirm_project_agents !== false) {
				if (!ctx.hasUI) {
					return {
						content: [
							{
								type: "text",
								text:
									'Project-local subagent definitions require confirmation. Re-run with confirm_project_agents: false only for trusted repositories.',
							},
						],
						details: {
							id: "",
							status: "error",
							type: spec.name,
							description: params.description,
							background: params.run_in_background ?? false,
							turns: 0,
							toolUses: 0,
							activeTools: [],
							usage: makeUsage(),
							error: "Project-local subagent confirmation required.",
						},
						isError: true,
					};
				}
				const ok = await ctx.ui.confirm(
					"Run project-local subagent?",
					`Agent: ${spec.name}\n\nProject-local .pi/agents prompts are controlled by this repository. Only continue for trusted repos.`,
				);
				if (!ok) {
					return {
						content: [{ type: "text", text: "Canceled: project-local subagent was not approved." }],
						details: {
							id: "",
							status: "stopped",
							type: spec.name,
							description: params.description,
							background: params.run_in_background ?? false,
							turns: 0,
							toolUses: 0,
							activeTools: [],
							usage: makeUsage(),
						},
					};
				}
			}
			const effectiveCwd = resolveWorkingDir(ctx, params.cwd);
			const record = manager.spawn(ctx, spec, params, effectiveCwd, signal);

			if (note) record.result = `${note}\n\n${record.result ?? ""}`.trim();

			if (record.background) {
				const status = `${note ? `${note}\n` : ""}Started background subagent ${record.id} (${record.type}): ${record.description}\nStatus: ${record.status}. Use get_subagent_result({ agent_id: "${record.id}" }) to check it.`;
				return { content: [{ type: "text", text: status }], details: makeDetails(record) };
			}

			const interval = onUpdate
				? setInterval(() => {
						onUpdate({
							content: [{ type: "text", text: formatSummaryLine(record) }],
							details: makeDetails(record),
						});
					}, 500)
				: undefined;
			if (interval) interval.unref();
			try {
				await record.promise;
			} finally {
				if (interval) clearInterval(interval);
			}

			const text = [note, formatRecordForModel(record, MAX_FOREGROUND_RESULT_CHARS)].filter(Boolean).join("\n\n");
			const isError = record.status === "error" || record.status === "aborted" || record.status === "stopped";
			return { content: [{ type: "text", text }], details: makeDetails(record), isError };
		},

		renderCall(args, theme) {
			const type = args.subagent_type ?? "general-purpose";
			const bg = args.run_in_background ? theme.fg("muted", " background") : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("Agent"))} ${theme.fg("accent", type)}${bg}\n  ${theme.fg("dim", args.description ?? "subtask")}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as AgentDetails | undefined;
			const text = firstTextContent(result);
			if (!details) return new Text(text, 0, 0);
			if (!expanded) return agentCardComponent(theme, details, text, false);

			const container = new Container();
			container.addChild(agentCardComponent(theme, details, text, false));
			if (text.trim()) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(text, 0, 0, getMarkdownTheme()));
			}
			return container;
		},
	});

	pi.registerTool({
		name: TOOL_GET_RESULT,
		label: "Get Subagent Result",
		description: "Check status and retrieve output from a background subagent started by Agent.",
		promptSnippet: "get_subagent_result: retrieve background Agent status/result by id.",
		parameters: GetResultParamsSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params): Promise<AgentToolResult<AgentDetails | { available: string[] }>> {
			const id = params.agent_id ?? params.task_id;
			if (!id) {
				const available = manager.list().slice(0, 20).map((r) => `${r.id} ${r.type} ${statusLabel(r.status)} ${r.description}`);
				return {
					content: [{ type: "text", text: available.length ? `Available subagents:\n${available.join("\n")}` : "No subagents found." }],
					details: { available },
				};
			}
			const record = manager.get(id);
			if (!record) {
				return { content: [{ type: "text", text: `Unknown subagent id: ${id}` }], details: { available: [] }, isError: true };
			}
			const maxChars = params.max_chars ? Math.max(500, Math.min(120_000, params.max_chars)) : MAX_FOREGROUND_RESULT_CHARS;
			return {
				content: [{ type: "text", text: formatRecordForModel(record, maxChars, params.include_transcript ?? false) }],
				details: makeDetails(record),
				isError: record.status === "error" || record.status === "aborted",
			};
		},
		renderCall(args, theme) {
			const id = args.agent_id ?? args.task_id;
			return new Text(
				`${theme.fg("toolTitle", theme.bold("Subagent result"))}${id ? ` ${theme.fg("accent", `#${compactId(id)}`)}` : ""}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as AgentDetails | { available?: string[] } | undefined;
			const text = firstTextContent(result);
			if (!details || !("status" in details)) return new Text(text, 0, 0);
			if (!expanded) return agentCardComponent(theme, details, text, false);

			const container = new Container();
			container.addChild(agentCardComponent(theme, details, text, false));
			if (text.trim()) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(text, 0, 0, getMarkdownTheme()));
			}
			return container;
		},
	});

	pi.registerTool({
		name: TOOL_STEER,
		label: "Steer Subagent",
		description: "Send a steering instruction to a queued or running background subagent.",
		promptSnippet: "steer_subagent: redirect a running background Agent by id.",
		parameters: SteerParamsSchema,
		executionMode: "parallel",
		async execute(_toolCallId, params): Promise<AgentToolResult<AgentDetails | { id?: string }>> {
			const id = params.agent_id ?? params.task_id;
			if (!id) return { content: [{ type: "text", text: "Missing agent_id." }], details: {}, isError: true };
			const ok = await manager.steer(id, params.message);
			const record = manager.get(id);
			if (!ok || !record) {
				return { content: [{ type: "text", text: `Cannot steer ${id}: not found or not running.` }], details: { id }, isError: true };
			}
			return { content: [{ type: "text", text: `Steered subagent ${id}.` }], details: makeDetails(record) };
		},
		renderCall(args, theme) {
			const id = args.agent_id ?? args.task_id ?? "…";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("Steer subagent"))} ${theme.fg("accent", `#${compactId(id)}`)}\n  ${theme.fg("dim", args.message ?? "")}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as AgentDetails | { id?: string } | undefined;
			const text = firstTextContent(result);
			if (!details || !("status" in details)) return new Text(text, 0, 0);
			return agentCardComponent(theme, details, text, expanded);
		},
	});

	pi.registerCommand("agents", {
		description: "List or manage subagents. Usage: /agents, /agents stop <id>, /agents clear",
		handler: async (args, ctx) => {
			manager.setUiContext(ctx);
			const [command, id] = args.trim().split(/\s+/, 2);
			if (command === "stop" && id) {
				const ok = manager.abort(id);
				ctx.ui.notify(ok ? `Stopped subagent ${id}` : `No running subagent ${id}`, ok ? "info" : "warning");
				return;
			}
			if (command === "clear") {
				const removed = manager.clearCompleted();
				ctx.ui.notify(`Cleared ${removed} completed subagent record${removed === 1 ? "" : "s"}.`, "info");
				return;
			}
			const records = manager.list();
			ctx.ui.notify(records.length ? records.map(formatSummaryLine).join("\n") : "No subagents in this session.", "info");
		},
	});
}
