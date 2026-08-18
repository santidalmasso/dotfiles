/**
 * Modes for pi
 *
 * Implements permission modes:
 * - default/manual approval (shown as no special mode)
 * - accept edits
 * - plan mode
 * - auto mode
 *
 * The important mode-management patterns are:
 * - EnterPlanMode tool for non-trivial implementation tasks
 * - plan mode is a permission mode, not just a prompt
 * - plan mode is read-only except for one session-scoped plan file
 * - ExitPlanMode presents that plan for user approval before coding
 * - Shift+Tab cycles the permission-mode carousel
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	CustomEditor,
	DynamicBorder,
	getAgentDir,
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Spacer, matchesKey, Text, truncateToWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const ENTER_PLAN_MODE_TOOL_NAME = "EnterPlanMode";
const EXIT_PLAN_MODE_TOOL_NAME = "ExitPlanMode";
const STATE_ENTRY = "modes-state";
const STATUS_KEY = "modes";
const PLAN_WIDGET_KEY = "modes-plan";
const SHORTCUTS_WIDGET_KEY = "modes-shortcuts";
const CONFIG_FILE = join(getAgentDir(), "modes.json");

const ansi = {
	dim: (text: string) => `\x1b[90m${text}\x1b[39m`,
	yellow: (text: string) => `\x1b[33m${text}\x1b[39m`,
	purple: (text: string) => `\x1b[35m${text}\x1b[39m`,
	cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
};

type PermissionMode = "default" | "acceptEdits" | "plan" | "auto";

type ModeState = {
	mode: PermissionMode;
	prePlanMode?: PermissionMode;
	baselineTools: string[];
	planFilePath?: string;
	readSnapshots?: Record<string, FileSnapshot>;
	allowedReadRoots?: string[];
	allowedEditRoots?: string[];
	allowedBashPrefixes?: string[];
	updatedAt?: string;
};

type UserConfig = {
	autoModeOptIn?: boolean;
};

type FileSnapshot = {
	path: string;
	size: number;
	mtimeMs: number;
	mode: number;
	readAt: string;
	partial?: boolean;
};

type SafetyReview = {
	normalizedPath: string;
	canonicalPath: string;
	exists: boolean;
	blockReasons: string[];
	approvalReasons: string[];
};

type BashSafetyLevel = "read_only" | "needs_approval" | "high_risk" | "blocked";

type BashSafetyAnalysis = {
	level: BashSafetyLevel;
	reasons: string[];
};

interface EnterPlanModeDetails {
	status: "entered" | "declined" | "already_in_plan" | "error";
	mode: PermissionMode;
	planFilePath?: string;
	message: string;
}

interface ExitPlanModeDetails {
	status: "approved" | "keep_planning" | "cancelled" | "not_in_plan" | "missing_plan" | "error";
	mode: PermissionMode;
	approvedMode?: PermissionMode;
	planFilePath?: string;
	plan?: string;
	feedback?: string;
	message: string;
}

const EmptyParamsSchema = Type.Object({}, { additionalProperties: false });
type EmptyParams = Static<typeof EmptyParamsSchema>;

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
const PLAN_FILE_TOOLS = ["edit", "write"];
const SAFE_PLAN_EXTENSION_TOOLS = [
	"AskUserQuestion",
	"ask_user_question",
	"TodoWrite",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
	"questionnaire",
	ENTER_PLAN_MODE_TOOL_NAME,
	EXIT_PLAN_MODE_TOOL_NAME,
];

const MODE_ORDER: PermissionMode[] = ["default", "acceptEdits", "plan", "auto"];

const ENTER_PLAN_MODE_GUIDELINES = [
	"Use EnterPlanMode proactively before non-trivial implementation tasks where exploring and getting user sign-off prevents wasted work.",
	"Prefer EnterPlanMode for new features, multi-file changes, architecture decisions, unclear requirements, performance work, or tasks with multiple reasonable approaches.",
	"Do not use EnterPlanMode for trivial typo fixes, obvious single-line changes, pure research questions, or when the user gave very specific implementation instructions.",
	"EnterPlanMode switches to plan mode: read-only exploration plus edits only to the plan file, then ExitPlanMode asks the user to approve before coding.",
];

const EXIT_PLAN_MODE_GUIDELINES = [
	"Use ExitPlanMode only while plan mode is active and only after the final plan has been written to the plan file.",
	"ExitPlanMode requests approval of the plan. Do not ask 'is this plan ok?' in normal text or with AskUserQuestion; call ExitPlanMode instead.",
	"If requirements or approach are still ambiguous, use AskUserQuestion before ExitPlanMode and keep updating the plan file.",
];

const PLAN_FILE_TEMPLATE = `# Implementation Plan

<!-- Build the plan here. Replace this skeleton before calling ExitPlanMode. -->

## Context

## Files to Change

## Approach

## Verification
`;

const DESTRUCTIVE_BASH_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/\bmktemp\b/i,
	/\bsed\s+[^\n;|&]*\s-i\b/i,
	/\bfind\b[^\n;|&]*(?:\s-delete\b|\s-exec\b)/i,
	/\bawk\b[^\n;|&]*\bsystem\s*\(/i,
	/\bnpm\s+(install|uninstall|update|ci|link|publish|run)\b/i,
	/\byarn\s+(add|remove|install|publish|run)\b/i,
	/\bpnpm\s+(add|remove|install|publish|run)\b/i,
	/\bbun\s+(add|remove|install|run)\b/i,
	/\bpip(?:3)?\s+(install|uninstall)\b/i,
	/\buv\s+(add|remove|sync|pip\s+install)\b/i,
	/\bapt(?:-get)?\s+(install|remove|purge|update|upgrade)\b/i,
	/\bbrew\s+(install|uninstall|upgrade)\b/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone|clean)\b/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
	/\bservice\s+\S+\s+(start|stop|restart)\b/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const READ_ONLY_SEGMENT_PATTERNS = [
	/^(?:cat|head|tail|less|more|grep|rg|find|fd|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|cal|uptime|ps|top|htop|free|jq|bat|eza|true|false)\b/i,
	/^git\s+(?:status|log|diff|show|branch|remote|config\s+--get|ls-files|grep|rev-parse)\b/i,
	/^npm\s+(?:list|ls|view|info|search|outdated|audit)\b/i,
	/^yarn\s+(?:list|info|why|audit)\b/i,
	/^pnpm\s+(?:list|view|info|why|audit)\b/i,
	/^bun\s+(?:pm\s+ls|--version|-v)\b/i,
	/^node\s+(?:--version|-v)\b/i,
	/^python(?:3)?\s+(?:--version|-V)\b/i,
	/^gh\s+(?:auth\s+status|repo\s+view|issue\s+(?:list|view)|pr\s+(?:list|view|status|diff|checks)|api\s+repos\/[^\s]+)\b/i,
	/^npx\s+(?:(?:-y|--yes)\s+)?(?:ctx7|context7|@upstash\/context7|@context7\/cli)(?:@[^\s]+)?\s+(?:docs|resolve-library-id|search)\b/i,
	/^npm\s+exec\s+(?:(?:-y|--yes)\s+)?(?:ctx7|context7|@upstash\/context7|@context7\/cli)(?:@[^\s]+)?\s+(?:docs|resolve-library-id|search)\b/i,
	/^pnpm\s+dlx\s+(?:ctx7|context7|@upstash\/context7|@context7\/cli)(?:@[^\s]+)?\s+(?:docs|resolve-library-id|search)\b/i,
	/^bunx\s+(?:ctx7|context7|@upstash\/context7|@context7\/cli)(?:@[^\s]+)?\s+(?:docs|resolve-library-id|search)\b/i,
	/^sed\s+-n\b/i,
	/^awk\b/i,
	/^cd\b/i,
];

const BLOCKED_BASH_PATTERNS: Array<[RegExp, string]> = [
	[/\brm\s+(?:-[^\s]*[rf][^\s]*|-[^\s]*[fr][^\s]*)\s+(?:\/(?:\*|\s|$)|~\/?(?:\s|$)|\$HOME\/?(?:\s|$))/i, "attempts to recursively remove a root or home directory"],
	[/\brm\s+(?:-[^\s]*[rf][^\s]*|-[^\s]*[fr][^\s]*)\s+\.\.?(?:\s|$)/i, "attempts to recursively remove parent/current directory"],
	[/\b(?:mkfs|mkswap|fdisk|parted)\b/i, "invokes disk formatting or partitioning tooling"],
	[/\bdd\b[^\n;|&]*\bof=\/dev\//i, "writes raw bytes to a device"],
	[/\b(?:curl|wget)\b[^\n;|&]*(?:\||>\s*\/(?:bin|usr\/bin|usr\/local\/bin))[^\n]*(?:sh|bash|zsh|fish)?\b/i, "downloads and executes or installs remote code"],
	[/`[^`]*(?:rm|mv|chmod|chown|sudo|curl|wget|dd)\b[^`]*`/i, "hides a mutating command inside backtick substitution"],
	[/\$\([^)]*(?:rm|mv|chmod|chown|sudo|curl|wget|dd)\b[^)]*\)/i, "hides a mutating command inside command substitution"],
	[/:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&?\s*}\s*;\s*:/, "looks like a fork bomb"],
];

const HIGH_RISK_BASH_PATTERNS: Array<[RegExp, string]> = [
	[/\bsudo\b/i, "requires elevated privileges"],
	[/\bgit\s+push\b[^\n]*(?:--force|-f|--delete|:)/i, "can rewrite or delete remote git history"],
	[/\bgit\s+reset\b[^\n]*(?:--hard|--merge|--keep)/i, "can discard local git changes"],
	[/\bgit\s+clean\b[^\n]*-[^\n]*[fdx]/i, "can permanently delete untracked files"],
	[/\bgit\s+(?:rebase|merge|cherry-pick|revert)\b/i, "changes git history or working tree state"],
	[/\brm\b/i, "removes files"],
	[/\b(?:chmod|chown|chgrp)\b/i, "changes ownership or permissions"],
	[/\b(?:kill|pkill|killall)\b/i, "terminates processes"],
	[/\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|ci|link|publish)\b/i, "changes dependencies or publishes packages"],
	[/\b(?:pip|pip3|uv\s+pip)\s+(?:install|uninstall)\b/i, "changes Python packages"],
	[/\b(?:apt|apt-get|brew|dnf|yum|pacman)\s+(?:install|remove|purge|update|upgrade|uninstall)\b/i, "changes system packages"],
	[/\b(?:docker|kubectl|helm)\b[^\n]*(?:delete|apply|replace|scale|rollout|restart|exec|run)\b/i, "can affect containers or clusters"],
	[/\b(?:shutdown|reboot|halt|poweroff)\b/i, "can stop or reboot the machine"],
	[/\b(?:systemctl|service)\b[^\n]*(?:start|stop|restart|enable|disable)\b/i, "changes system service state"],
	[/\b(?:psql|mysql|sqlite3|mongosh?)\b[^\n]*(?:-c\s*)?["'][^"']*\b(?:delete|drop|truncate|update|insert|alter)\b/i, "can mutate a database"],
	[/\b(?:perl|ruby|python(?:3)?)\b[^\n]*(?:-pi|-e\s+["'][^"']*(?:open\(|unlink\(|rename\(|rmtree|remove\())/i, "uses a scripting language to mutate files"],
];

const MAX_READ_SNAPSHOTS = 200;

const BLOCKED_PATH_PREFIXES = ["/dev", "/proc", "/sys"];

const SENSITIVE_PATH_PATTERNS = [
	/(^|\/)\.env(?:\..*)?$/i,
	/(^|\/)\.npmrc$/i,
	/(^|\/)\.pypirc$/i,
	/(^|\/)\.netrc$/i,
	/(^|\/)\.ssh(?:\/|$)/i,
	/(^|\/)\.aws\/credentials$/i,
	/(^|\/)\.kube\/config$/i,
	/(^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$/i,
	/(^|\/)(?:secrets?|credentials?|tokens?|api[-_]?keys?)(?:\.[^/]*)?$/i,
	/(^|\/)[^/]*(?:private[-_]?key|secret[-_]?key|access[-_]?token)[^/]*$/i,
];

const PROTECTED_MUTATION_PATH_PATTERNS = [/(^|\/)\.git(?:\/|$)/i];

const GENERATED_MUTATION_PATH_PATTERNS = [
	/(^|\/)node_modules(?:\/|$)/i,
	/(^|\/)(?:dist|build|coverage|\.next|\.nuxt|\.turbo|\.cache)(?:\/|$)/i,
];

const PI_CLIPBOARD_TEMP_FILE_PATTERN = /^pi-clipboard-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.[a-z0-9]+)?$/i;

const TRUSTED_RESOURCE_READ_PATHS = [
	join(getAgentDir(), "extensions"),
	join(getAgentDir(), "skills"),
	join(getAgentDir(), "prompts"),
	join(getAgentDir(), "themes"),
	join(getAgentDir(), "npm", "node_modules"),
	join(getAgentDir(), "git"),
	join(homedir(), ".agents", "skills"),
];

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

function loadUserConfig(): UserConfig {
	try {
		return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as UserConfig;
	} catch {
		return {};
	}
}

function saveUserConfig(config: UserConfig): void {
	mkdirSync(dirname(CONFIG_FILE), { recursive: true });
	writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function normalizeMode(value: unknown): PermissionMode | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, "");
	if (!normalized || normalized === "none" || normalized === "default" || normalized === "manual") return "default";
	if (normalized === "accept" || normalized === "acceptedits" || normalized === "acceptedit" || normalized === "edits") {
		return "acceptEdits";
	}
	if (normalized === "plan" || normalized === "planmode") return "plan";
	if (normalized === "auto" || normalized === "automode") return "auto";
	return undefined;
}

function modeTitle(mode: PermissionMode): string {
	switch (mode) {
		case "default":
			return "none";
		case "acceptEdits":
			return "accept edits";
		case "plan":
			return "plan mode";
		case "auto":
			return "auto mode";
	}
}

function colorModeText(mode: PermissionMode, text: string): string {
	switch (mode) {
		case "acceptEdits":
			return ansi.purple(text);
		case "plan":
			return ansi.cyan(text);
		case "auto":
			return ansi.yellow(text);
		case "default":
			return text;
	}
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "project"
	);
}

function canonicalPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function normalizeToolPath(rawPath: string, cwd: string): string {
	const withoutAt = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	return resolve(cwd, withoutAt);
}

function isPathWithin(basePath: string, targetPath: string): boolean {
	const rel = relative(basePath, targetPath);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function pathStartsWith(targetPath: string, prefix: string): boolean {
	return targetPath === prefix || targetPath.startsWith(`${prefix}/`);
}

function matchesAnyPathPattern(path: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(path));
}

function isPiClipboardTempRead(canonicalPathValue: string): boolean {
	return isPathWithin(canonicalPath(tmpdir()), canonicalPathValue) && PI_CLIPBOARD_TEMP_FILE_PATTERN.test(basename(canonicalPathValue));
}

function isTrustedResourceRead(canonicalPathValue: string): boolean {
	return TRUSTED_RESOURCE_READ_PATHS.some((rootPath) => isPathWithin(canonicalPath(rootPath), canonicalPathValue));
}

function reviewPathSafety(rawPath: string, cwd: string, operation: "read" | "edit" | "write"): SafetyReview {
	const blockReasons: string[] = [];
	const approvalReasons: string[] = [];
	const normalizedPath = rawPath.trim() ? normalizeToolPath(rawPath, cwd) : "";
	let exists = false;
	let canonical = normalizedPath || rawPath;

	if (!rawPath.trim()) {
		blockReasons.push("path is empty");
		return { normalizedPath, canonicalPath: canonical, exists, blockReasons, approvalReasons };
	}

	try {
		exists = existsSync(normalizedPath);
		canonical = exists ? realpathSync(normalizedPath) : resolve(normalizedPath);
	} catch {
		canonical = resolve(normalizedPath);
	}

	if (canonical === "/") blockReasons.push("target is the filesystem root");
	if (BLOCKED_PATH_PREFIXES.some((prefix) => pathStartsWith(canonical, prefix))) {
		blockReasons.push("target is under a virtual/device filesystem");
	}
	if (operation !== "read" && matchesAnyPathPattern(canonical, PROTECTED_MUTATION_PATH_PATTERNS)) {
		blockReasons.push("target is inside .git metadata");
	}

	const allowedOutOfWorkspaceRead = operation === "read" && (isPiClipboardTempRead(canonical) || isTrustedResourceRead(canonical));
	if (!isPathWithin(canonicalPath(cwd), canonical) && !allowedOutOfWorkspaceRead) {
		approvalReasons.push("target is outside the current workspace");
	}
	if (matchesAnyPathPattern(canonical, SENSITIVE_PATH_PATTERNS)) approvalReasons.push("target looks like a secrets/credentials file");
	if (operation !== "read" && matchesAnyPathPattern(canonical, GENERATED_MUTATION_PATH_PATTERNS)) {
		approvalReasons.push("target is in a generated/cache/dependency directory");
	}

	if (exists) {
		try {
			const linkStats = lstatSync(normalizedPath);
			const stats = statSync(normalizedPath);
			if (linkStats.isSymbolicLink()) approvalReasons.push("target is a symlink");
			if (stats.isDirectory()) blockReasons.push("target is a directory");
			if (stats.isBlockDevice() || stats.isCharacterDevice() || stats.isFIFO() || stats.isSocket()) {
				blockReasons.push("target is a device, FIFO, or socket");
			}
		} catch (error) {
			approvalReasons.push(`could not fully inspect target path: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return { normalizedPath, canonicalPath: canonical, exists, blockReasons, approvalReasons };
}

function formatSafetyReasons(reasons: string[]): string {
	return reasons.map((reason) => `- ${reason}`).join("\n");
}

function matchingReasons(command: string, patterns: Array<[RegExp, string]>): string[] {
	return patterns.filter(([pattern]) => pattern.test(command)).map(([, reason]) => reason);
}

function stripSafeRedirects(command: string): string {
	return command
		.replace(/\b[12]?>\s*\/dev\/null\b/g, "")
		.replace(/\b[12]?>\s*&[12]\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function hasUnsafeRedirect(command: string): boolean {
	const stripped = stripSafeRedirects(command);
	return /(^|[^<])>{1,2}(?!&)/.test(stripped);
}

function hasUnsafeShellConstruct(command: string): string[] {
	const reasons: string[] = [];
	if (/<<\s*['"]?EOF/i.test(command)) reasons.push("uses a here-document; review generated content before execution");
	if (/\beval\b/i.test(command)) reasons.push("uses eval");
	if (/\bxargs\b[^\n;|&]*(?:rm|mv|chmod|chown|kill)\b/i.test(command)) reasons.push("pipes generated input into a mutating command");
	return reasons;
}

function analyzeBashCommand(command: string): BashSafetyAnalysis {
	const trimmed = command.trim();
	if (!trimmed) return { level: "blocked", reasons: ["command is empty"] };

	const blockedReasons = matchingReasons(trimmed, BLOCKED_BASH_PATTERNS);
	if (blockedReasons.length > 0) return { level: "blocked", reasons: unique(blockedReasons) };

	const reasons: string[] = [];
	if (hasUnsafeRedirect(trimmed)) reasons.push("writes to a file via shell redirection");
	reasons.push(...matchingReasons(trimmed, HIGH_RISK_BASH_PATTERNS));
	reasons.push(...hasUnsafeShellConstruct(trimmed));

	if (isReadOnlyBashCommand(trimmed)) return { level: "read_only", reasons: [] };

	if (reasons.length > 0 || DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		return { level: "high_risk", reasons: unique(reasons.length > 0 ? reasons : ["matches a mutating shell-command pattern"]) };
	}

	return { level: "needs_approval", reasons: ["not recognized as read-only"] };
}

function hasMutatingBashMarker(command: string): boolean {
	return (
		hasUnsafeRedirect(command) ||
		matchingReasons(command, BLOCKED_BASH_PATTERNS).length > 0 ||
		matchingReasons(command, HIGH_RISK_BASH_PATTERNS).length > 0 ||
		hasUnsafeShellConstruct(command).length > 0 ||
		DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(command))
	);
}

function normalizeShellSegment(segment: string): string {
	return segment
		.trim()
		.replace(/^\(+|\)+$/g, "")
		.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)*/, "")
		.trim();
}

function isReadOnlyBashCommand(command: string): boolean {
	if (!command.trim()) return false;
	if (hasMutatingBashMarker(command)) return false;

	const segments = command
		.split(/\s*(?:&&|\|\||;|\|)\s*/g)
		.map(normalizeShellSegment)
		.filter(Boolean);

	if (segments.length === 0) return false;
	return segments.every((segment) => READ_ONLY_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)));
}

function getTextFromToolResultContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
				return String((part as { text?: unknown }).text ?? "");
			}
			return "";
		})
		.join("\n");
}

function isSubstantivePlan(plan: string): boolean {
	const meaningful = plan
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/^\s*#{1,6}\s+.*$/gm, "")
		.replace(/^\s*[-*]\s*$/gm, "")
		.trim();
	return meaningful.length >= 80;
}

function makePlanInstructions(planFilePath: string, planExists: boolean): string {
	const fileInfo = planExists
		? `A plan file already exists at ${planFilePath}. Read it and make incremental edits with edit/write as needed.`
		: `A plan file has been created at ${planFilePath}. Build your plan there with edit/write.`;

	return `\n\n## Plan mode active\n\nThe user indicated they do not want implementation yet. You MUST NOT make code changes, run non-read-only commands, modify configs, install packages, commit, or otherwise change the system. The only exception is the plan file below.\n\nPlan file: ${planFilePath}\n${fileInfo}\n\nWorkflow:\n1. Explore the codebase with read, grep, find, ls, and read-only bash. Look for existing functions, utilities, and patterns to reuse.\n2. Update the plan file after discoveries; do not wait until the end.\n3. Use AskUserQuestion only for real user decisions you cannot resolve from code. Batch related questions.\n4. The final plan should include context, files to change, the recommended approach, risks/edge cases, and verification.\n5. When ready, call ${EXIT_PLAN_MODE_TOOL_NAME}. Do NOT ask for plan approval in normal text or via AskUserQuestion. ${EXIT_PLAN_MODE_TOOL_NAME} is the approval request.\n\nSafety rules still apply in plan mode: bash must pass the read-only classifier, device/virtual filesystem reads are blocked, and secrets/out-of-workspace reads require approval.\n\nEnd plan-mode turns only by using AskUserQuestion for clarifications or ${EXIT_PLAN_MODE_TOOL_NAME} for approval.`;
}

function makeAutoModeInstructions(): string {
	return `\n\n## Auto mode active\n\nThe user chose autonomous execution. Execute immediately, minimize interruptions, and prefer reasonable assumptions on low-risk work. Do not enter plan mode unless the user explicitly asks or the task has genuine high-impact ambiguity. Auto mode is not permission to destroy data: destructive commands, credential exposure, production/shared-system changes, commits, pushes, package installs, and external posting still require explicit user confirmation. Before modifying an existing file, read it in this session; if it changed since that read, read it again.`;
}

function makeAcceptEditsInstructions(): string {
	return `\n\n## Accept edits mode active\n\nFile edits are auto-approved only after the target file has been read in this session and has not changed since that read. Continue to ask before non-read-only shell commands, destructive actions, credential exposure, out-of-workspace mutations, or meaningful product/architecture decisions that are not clear from the request.`;
}

class ModeCyclingEditor extends CustomEditor {
	private cycling = false;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly onCycleMode: () => Promise<void>,
		private readonly onShowShortcuts: () => void,
		private readonly onHideShortcuts: () => void,
	) {
		super(tui, theme, keybindings);
	}

	override handleInput(data: string): void {
		if (matchesKey(data, "shift+tab")) {
			if (!this.cycling) {
				this.cycling = true;
				void this.onCycleMode().finally(() => {
					this.cycling = false;
				});
			}
			return;
		}

		if ((data === "?" || matchesKey(data, "?") || matchesKey(data, "shift+/")) && this.getText().length === 0) {
			this.onShowShortcuts();
			return;
		}

		this.onHideShortcuts();
		super.handleInput(data);
	}
}

type PermissionDecision =
	| "approve"
	| "approveReadSession"
	| "approveEditSession"
	| "approveBashPrefix"
	| "approveAndAcceptEdits"
	| "approveAndAuto"
	| "deny";
type PermissionDialogOutcome = PermissionDecision | "amend";

type EditReplacement = {
	oldText: string;
	newText: string;
};

type MutationKind = "create" | "modify" | "delete";

type MutationTarget = {
	path: string;
	kind: MutationKind;
	requiresFreshRead: boolean;
};

interface PermissionDialogOption {
	value: PermissionDecision;
	label: string;
}

interface PermissionDialogRequest {
	operationTitle: string;
	actionTitle: string;
	target: string;
	previewLines: string[];
	question: string;
	options: PermissionDialogOption[];
	amendHint?: string;
}

function truncateInline(text: string, maxWidth = 84): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	return truncateToWidth(normalized || "(empty)", maxWidth);
}

function buildNumberedPreview(lines: string[], maxLines = 8): string[] {
	const safeLines = lines.length > 0 ? lines : ["(No content)"];
	const preview = safeLines.slice(0, maxLines).map((line, index) => `${index + 1} ${truncateInline(line || "(blank)")}`);
	if (safeLines.length > maxLines) preview.push(`… +${safeLines.length - maxLines} more lines`);
	return preview;
}

function formatWritePreview(content: string): string[] {
	const normalized = content.replace(/\r\n/g, "\n");
	if (normalized.length === 0) return ["1 (No content)"];
	return buildNumberedPreview(normalized.split("\n"));
}

function formatBashPreview(command: string): string[] {
	const normalized = command.replace(/\r\n/g, "\n");
	if (!normalized.trim()) return ["1 (Empty command)"];
	return buildNumberedPreview(normalized.split("\n"));
}

function formatEditPreview(edits: EditReplacement[]): string[] {
	if (edits.length === 0) return ["0 replacements"];

	const lines = [`${edits.length} replacement${edits.length === 1 ? "" : "s"}`];
	for (const [index, edit] of edits.slice(0, 3).entries()) {
		lines.push(`${index + 1}. replace match`);
		lines.push(`   - old: ${truncateInline(edit.oldText, 76)}`);
		lines.push(`   + new: ${truncateInline(edit.newText, 76)}`);
	}
	if (edits.length > 3) lines.push(`… +${edits.length - 3} more replacements`);
	return lines;
}

function formatPatchPreview(patch: string): string[] {
	const lines = patch.replace(/\r\n/g, "\n").split("\n");
	const headers = lines.filter((line) => /^\*\*\* (?:Add|Delete|Update|Move)/.test(line.trim()));
	return buildNumberedPreview(headers.length > 0 ? headers : lines, 10);
}

function editPreviewFromInput(input: Record<string, unknown>): string[] {
	if (typeof input.patch === "string") return formatPatchPreview(input.patch);

	const edits: EditReplacement[] = [];
	if (typeof input.oldText === "string" && typeof input.newText === "string") {
		edits.push({ oldText: input.oldText, newText: input.newText });
	}
	if (Array.isArray(input.edits)) {
		for (const item of input.edits) {
			if (item && typeof item === "object") {
				const oldText = (item as { oldText?: unknown }).oldText;
				const newText = (item as { newText?: unknown }).newText;
				if (typeof oldText === "string" && typeof newText === "string") edits.push({ oldText, newText });
			}
		}
	}
	if (Array.isArray(input.multi)) {
		for (const item of input.multi) {
			if (item && typeof item === "object") {
				const oldText = (item as { oldText?: unknown }).oldText;
				const newText = (item as { newText?: unknown }).newText;
				if (typeof oldText === "string" && typeof newText === "string") edits.push({ oldText, newText });
			}
		}
	}

	return formatEditPreview(edits);
}

function mutationTargetsFromPatch(patch: string): MutationTarget[] {
	const targets: MutationTarget[] = [];
	const lines = patch.replace(/\r\n/g, "\n").split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith("*** Add File: ")) {
			targets.push({ path: line.slice("*** Add File: ".length).trim(), kind: "create", requiresFreshRead: false });
			continue;
		}
		if (line.startsWith("*** Delete File: ")) {
			targets.push({ path: line.slice("*** Delete File: ".length).trim(), kind: "delete", requiresFreshRead: true });
			continue;
		}
		if (line.startsWith("*** Update File: ")) {
			const path = line.slice("*** Update File: ".length).trim();
			targets.push({ path, kind: "modify", requiresFreshRead: true });
			const next = lines[i + 1]?.trim();
			if (next?.startsWith("*** Move to: ")) {
				targets.push({ path: next.slice("*** Move to: ".length).trim(), kind: "create", requiresFreshRead: false });
			}
		}
	}
	return targets;
}

function mutationTargetsFromEditInput(input: Record<string, unknown>): MutationTarget[] {
	if (typeof input.patch === "string") return mutationTargetsFromPatch(input.patch);

	const targets: MutationTarget[] = [];
	const multiUsesInheritedPath = Array.isArray(input.multi) && input.multi.some((item) => item && typeof item === "object" && typeof (item as { path?: unknown }).path !== "string");
	if (typeof input.path === "string" && (Array.isArray(input.edits) || typeof input.oldText === "string" || multiUsesInheritedPath)) {
		targets.push({ path: input.path, kind: "modify", requiresFreshRead: true });
	}
	if (Array.isArray(input.multi)) {
		for (const item of input.multi) {
			if (item && typeof item === "object") {
				const itemPath = (item as { path?: unknown }).path;
				const inheritedPath = typeof input.path === "string" ? input.path : undefined;
				const path = typeof itemPath === "string" ? itemPath : inheritedPath;
				if (path) targets.push({ path, kind: "modify", requiresFreshRead: true });
			}
		}
	}

	return unique(targets.map((target) => `${target.kind}\0${target.path}`)).map((key) => {
		const [kind, path] = key.split("\0") as [MutationKind, string];
		return { path, kind, requiresFreshRead: kind !== "create" };
	});
}

function appendSafetyPreview(previewLines: string[], reasons: string[]): string[] {
	if (reasons.length === 0) return previewLines;
	return [...previewLines, "", "Safety review:", ...reasons.map((reason) => `! ${truncateInline(reason, 82)}`)];
}

function describeMutationTargets(targets: MutationTarget[]): string {
	if (targets.length === 0) return "(unknown target)";
	if (targets.length === 1) return targets[0].path;
	return `${targets.length} files: ${targets.map((target) => target.path).slice(0, 3).join(", ")}${targets.length > 3 ? ", …" : ""}`;
}

function mutationTargetsFromWriteInput(path: string, cwd: string): MutationTarget[] {
	const review = reviewPathSafety(path, cwd, "write");
	return [{ path, kind: review.exists ? "modify" : "create", requiresFreshRead: review.exists }];
}

function normalizeReadSnapshots(value: unknown): Record<string, FileSnapshot> {
	if (!value || typeof value !== "object") return {};
	const snapshots: Record<string, FileSnapshot> = {};
	for (const [key, snapshot] of Object.entries(value as Record<string, unknown>)) {
		if (!snapshot || typeof snapshot !== "object") continue;
		const data = snapshot as Partial<FileSnapshot>;
		if (typeof data.path !== "string" || typeof data.size !== "number" || typeof data.mtimeMs !== "number" || typeof data.mode !== "number") continue;
		snapshots[key] = {
			path: data.path,
			size: data.size,
			mtimeMs: data.mtimeMs,
			mode: data.mode,
			readAt: typeof data.readAt === "string" ? data.readAt : new Date(0).toISOString(),
			partial: data.partial === true,
		};
	}
	return snapshots;
}

function normalizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return unique(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()));
}

function permissionDirectory(rawPath: string, cwd: string): string {
	const normalized = normalizeToolPath(rawPath, cwd);
	try {
		if (existsSync(normalized) && statSync(normalized).isDirectory()) return canonicalPath(normalized);
	} catch {
		// Fall through to the parent directory.
	}
	return canonicalPath(dirname(normalized));
}

function isPathAllowedByRoots(rawPath: string, cwd: string, roots: string[] | undefined): boolean {
	if (!roots || roots.length === 0) return false;
	const target = canonicalPath(normalizeToolPath(rawPath, cwd));
	return roots.some((root) => isPathWithin(canonicalPath(root), target));
}

function bashRulePrefix(command: string): string | undefined {
	const segment = command
		.split(/\s*(?:&&|\|\||;|\|)\s*/g)
		.map(normalizeShellSegment)
		.find((part) => part && !/^cd\b/i.test(part));
	if (!segment) return undefined;

	const words = segment.match(/(?:"[^"]+"|'[^']+'|\S+)/g)?.map((word) => word.replace(/^['"]|['"]$/g, "")) ?? [];
	const first = words[0];
	if (!first) return undefined;
	const commandName = first.includes("/") ? basename(first) : first;
	const second = words[1];
	const twoWordCommands = new Set(["bun", "bunx", "dotnet", "docker", "gh", "git", "go", "mise", "node", "npm", "npx", "pnpm", "python", "python3", "yarn"]);
	if (second && twoWordCommands.has(commandName)) return `${commandName} ${second}:*`;
	return `${commandName}:*`;
}

function bashCommandMatchesPrefix(command: string, prefix: string): boolean {
	const normalizedPrefix = prefix.trim().replace(/:\*$/, "");
	if (!normalizedPrefix) return false;
	return command
		.split(/\s*(?:&&|\|\||;|\|)\s*/g)
		.map(normalizeShellSegment)
		.some((segment) => segment === normalizedPrefix || segment.startsWith(`${normalizedPrefix} `));
}

function parseEditReplacements(value: unknown): EditReplacement[] {
	if (!Array.isArray(value)) throw new Error("Expected a JSON array of edits.");
	return value.map((item, index) => {
		if (!item || typeof item !== "object") {
			throw new Error(`Edit #${index + 1} must be an object with oldText and newText.`);
		}

		const oldText = (item as { oldText?: unknown }).oldText;
		const newText = (item as { newText?: unknown }).newText;
		if (typeof oldText !== "string" || typeof newText !== "string") {
			throw new Error(`Edit #${index + 1} must have string oldText and newText fields.`);
		}

		return { oldText, newText };
	});
}

class PermissionDialogComponent extends Container {
	private readonly selectList: SelectList;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly request: PermissionDialogRequest,
		private readonly done: (result: PermissionDialogOutcome) => void,
	) {
		super();

		const items = request.options.map((option, index) => ({
			value: option.value,
			label: `${index + 1}. ${option.label}`,
		}));

		this.selectList = new SelectList(items, items.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		this.selectList.onSelect = (item) => this.done(item.value as PermissionDecision);
		this.selectList.onCancel = () => this.done("deny");

		this.addChild(new DynamicBorder((s: string) => theme.fg("borderAccent", s)));
		this.addChild(new Text(theme.fg("toolTitle", `● ${theme.bold(request.operationTitle)}`), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold(request.actionTitle)), 1, 0));
		this.addChild(new Text(theme.fg("muted", request.target), 1, 0));
		this.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
		for (const line of request.previewLines) {
			this.addChild(new Text(theme.fg("text", line), 1, 0));
		}
		this.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("text", request.question), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
		const footerParts = ["Esc to cancel"];
		if (request.amendHint) footerParts.push(request.amendHint);
		this.addChild(new Text(theme.fg("dim", footerParts.join(" · ")), 1, 0));
		this.addChild(new DynamicBorder((s: string) => theme.fg("borderAccent", s)));
	}

	handleInput(data: string): void {
		if (matchesKey(data, "shift+tab") && this.request.options[1]) {
			this.done(this.request.options[1].value);
			return;
		}
		if (matchesKey(data, "tab") && this.request.amendHint) {
			this.done("amend");
			return;
		}
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done("deny");
			return;
		}

		const directChoice = Number.parseInt(data, 10);
		if (Number.isInteger(directChoice) && directChoice >= 1 && directChoice <= this.request.options.length) {
			this.done(this.request.options[directChoice - 1].value);
			return;
		}

		this.selectList.handleInput(data);
		this.tui.requestRender();
	}
}

export default function modesExtension(pi: ExtensionAPI) {
	// Temporarily disabled. Remove this return and run /reload to re-enable modes.
	return;

	let state: ModeState = {
		mode: "default",
		baselineTools: [],
	};
	let shortcutsVisible = false;

	pi.registerFlag("start-in-plan", {
		description: "Start in plan mode",
		type: "boolean",
		default: false,
	});

	pi.registerFlag("permission-mode", {
		description: "Initial permission mode: default|acceptEdits|plan|auto",
		type: "string",
	});

	function existingTools(names: string[]): string[] {
		const all = new Set(pi.getAllTools().map((tool) => tool.name));
		return unique(names).filter((name) => all.has(name));
	}

	function getDefaultTools(): string[] {
		const base = state.baselineTools.length > 0 ? state.baselineTools : pi.getActiveTools();
		const names = new Set(base);
		names.add(ENTER_PLAN_MODE_TOOL_NAME);
		names.delete(EXIT_PLAN_MODE_TOOL_NAME);
		return existingTools([...names]);
	}

	function getToolsForMode(mode: PermissionMode): string[] {
		if (mode === "plan") {
			return existingTools([
				...READ_ONLY_TOOLS,
				"bash",
				...PLAN_FILE_TOOLS,
				...SAFE_PLAN_EXTENSION_TOOLS,
			]);
		}

		const names = new Set(getDefaultTools());
		names.add(ENTER_PLAN_MODE_TOOL_NAME);
		names.delete(EXIT_PLAN_MODE_TOOL_NAME);

		if (mode === "acceptEdits" || mode === "auto") {
			names.add("read");
			names.add("bash");
			names.add("edit");
			names.add("write");
		}

		return existingTools([...names]);
	}

	function persistState(): void {
		const readSnapshots = normalizeReadSnapshots(state.readSnapshots);
		const snapshotEntries = Object.entries(readSnapshots)
			.sort(([, a], [, b]) => Date.parse(b.readAt) - Date.parse(a.readAt))
			.slice(0, MAX_READ_SNAPSHOTS);

		pi.appendEntry<ModeState>(STATE_ENTRY, {
			...state,
			baselineTools: unique(state.baselineTools),
			readSnapshots: Object.fromEntries(snapshotEntries),
			allowedReadRoots: normalizeStringList(state.allowedReadRoots),
			allowedEditRoots: normalizeStringList(state.allowedEditRoots),
			allowedBashPrefixes: normalizeStringList(state.allowedBashPrefixes),
			updatedAt: new Date().toISOString(),
		});
	}

	function restoreState(ctx: ExtensionContext): void {
		const currentTools = pi.getActiveTools();
		state = {
			mode: "default",
			baselineTools: unique(currentTools),
			readSnapshots: {},
			allowedReadRoots: [],
			allowedEditRoots: [],
			allowedBashPrefixes: [],
		};

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
			const data = entry.data as Partial<ModeState> | undefined;
			const restoredMode = normalizeMode(data?.mode);
			if (!data || !restoredMode) continue;
			state = {
				mode: restoredMode,
				prePlanMode: normalizeMode(data.prePlanMode),
				baselineTools: Array.isArray(data.baselineTools) && data.baselineTools.length > 0 ? unique(data.baselineTools) : state.baselineTools,
				planFilePath: typeof data.planFilePath === "string" ? data.planFilePath : undefined,
				readSnapshots: normalizeReadSnapshots(data.readSnapshots),
				allowedReadRoots: normalizeStringList(data.allowedReadRoots),
				allowedEditRoots: normalizeStringList(data.allowedEditRoots),
				allowedBashPrefixes: normalizeStringList(data.allowedBashPrefixes),
				updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
			};
		}
	}

	function ensurePlanFile(ctx: ExtensionContext): string {
		if (state.planFilePath) {
			mkdirSync(dirname(state.planFilePath), { recursive: true });
			if (!existsSync(state.planFilePath)) {
				writeFileSync(state.planFilePath, PLAN_FILE_TEMPLATE, "utf8");
			}
			return state.planFilePath;
		}

		const sessionId = ctx.sessionManager.getSessionId?.() ?? String(Date.now());
		const planDir = join(getAgentDir(), "plans");
		mkdirSync(planDir, { recursive: true });
		const fileName = `${slugify(basename(ctx.cwd))}-${sessionId.slice(0, 12)}.md`;
		const planFilePath = join(planDir, fileName);
		if (!existsSync(planFilePath)) {
			writeFileSync(planFilePath, PLAN_FILE_TEMPLATE, "utf8");
		}
		state.planFilePath = planFilePath;
		return planFilePath;
	}

	function readPlan(ctx: ExtensionContext): { path: string; content: string } {
		const planFilePath = ensurePlanFile(ctx);
		let content = "";
		try {
			content = readFileSync(planFilePath, "utf8");
		} catch {
			content = "";
		}
		return { path: planFilePath, content };
	}

	function writePlan(planFilePath: string, content: string): void {
		mkdirSync(dirname(planFilePath), { recursive: true });
		writeFileSync(planFilePath, content, "utf8");
	}

	function isPlanFile(rawPath: string, ctx: ExtensionContext): boolean {
		if (!state.planFilePath) return false;
		return canonicalPath(normalizeToolPath(rawPath, ctx.cwd)) === canonicalPath(state.planFilePath);
	}

	function storeReadSnapshot(rawPath: string, ctx: ExtensionContext, options: { partial?: boolean } = {}): void {
		const review = reviewPathSafety(rawPath, ctx.cwd, "read");
		if (review.blockReasons.length > 0 || !review.exists) return;

		try {
			const stats = statSync(review.canonicalPath);
			if (!stats.isFile()) return;
			state.readSnapshots = normalizeReadSnapshots(state.readSnapshots);
			state.readSnapshots[review.canonicalPath] = {
				path: review.canonicalPath,
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				mode: stats.mode,
				readAt: new Date().toISOString(),
				partial: options.partial === true,
			};
		} catch {
			return;
		}
	}

	function freshReadReasons(target: MutationTarget, ctx: ExtensionContext): string[] {
		if (!target.requiresFreshRead) return [];
		const review = reviewPathSafety(target.path, ctx.cwd, target.kind === "create" ? "write" : "edit");
		if (!review.exists) return [];

		const snapshot = normalizeReadSnapshots(state.readSnapshots)[review.canonicalPath];
		if (!snapshot) return [`${target.path} has not been read in this session`];
		if (snapshot.partial) return [`${target.path} was only partially read; read the full file before editing`];

		try {
			const stats = statSync(review.canonicalPath);
			const changed = stats.size !== snapshot.size || stats.mtimeMs !== snapshot.mtimeMs || stats.mode !== snapshot.mode;
			if (changed) return [`${target.path} changed since it was last read; read it again before editing`];
		} catch {
			return [`${target.path} could not be checked against the last read snapshot`];
		}

		return [];
	}

	function filterReadApprovalReasons(path: string, reasons: string[], ctx: ExtensionContext): string[] {
		if (!isPathAllowedByRoots(path, ctx.cwd, state.allowedReadRoots)) return reasons;
		return reasons.filter((reason) => reason !== "target is outside the current workspace");
	}

	function filterMutationApprovalReasons(target: MutationTarget, reasons: string[], ctx: ExtensionContext): string[] {
		if (!isPathAllowedByRoots(target.path, ctx.cwd, state.allowedEditRoots)) return reasons;
		return reasons.filter((reason) => reason.includes("secrets/credentials"));
	}

	function reviewMutationTargets(targets: MutationTarget[], ctx: ExtensionContext, operation: "edit" | "write"): { blockReasons: string[]; approvalReasons: string[] } {
		const blockReasons: string[] = [];
		const approvalReasons: string[] = [];

		if (targets.length === 0) approvalReasons.push("could not determine mutation target paths");

		for (const target of targets) {
			const review = reviewPathSafety(target.path, ctx.cwd, operation);
			blockReasons.push(...review.blockReasons.map((reason) => `${target.path}: ${reason}`));
			approvalReasons.push(...filterMutationApprovalReasons(target, review.approvalReasons, ctx).map((reason) => `${target.path}: ${reason}`));
			blockReasons.push(...freshReadReasons(target, ctx));
		}

		return { blockReasons: unique(blockReasons), approvalReasons: unique(approvalReasons) };
	}

	function allowReadRoot(path: string, ctx: ExtensionContext): void {
		state.allowedReadRoots = unique([...normalizeStringList(state.allowedReadRoots), permissionDirectory(path, ctx.cwd)]);
		persistState();
	}

	function allowEditRoot(path: string, ctx: ExtensionContext): void {
		state.allowedEditRoots = unique([...normalizeStringList(state.allowedEditRoots), permissionDirectory(path, ctx.cwd)]);
		persistState();
	}

	function allowBashPrefix(command: string): void {
		const prefix = bashRulePrefix(command);
		if (!prefix) return;
		state.allowedBashPrefixes = unique([...normalizeStringList(state.allowedBashPrefixes), prefix]);
		persistState();
	}

	function isBashAllowedBySession(command: string): boolean {
		return normalizeStringList(state.allowedBashPrefixes).some((prefix) => bashCommandMatchesPrefix(command, prefix));
	}

	function showShortcuts(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		shortcutsVisible = true;
		const dim = (text: string) => ctx.ui.theme.fg("dim", text);
		const rows = [
			["! for shell mode", "shift + tab to cycle modes", "ctrl + _ / ctrl + - to undo"],
			["/ for commands", "shift + enter for newline", "ctrl + z to suspend"],
			["@ for file paths", "ctrl + o for verbose output", "ctrl + v to paste images"],
			["& for background", "ctrl + t to toggle tasks", "alt + p to switch model"],
			["/btw for side question", "alt + t to cycle thinking", "shift + alt + p previous model"],
			["/keybindings to customize", "shift + alt + t toggle thinking", "ctrl + g to edit in $EDITOR"],
			["", "alt + enter for follow-up", ""],
		];
		ctx.ui.setWidget(
			SHORTCUTS_WIDGET_KEY,
			rows.map(([left, middle, right]) => dim(`${left.padEnd(31)}${middle.padEnd(37)}${right}`.trimEnd())),
			{ placement: "belowEditor" },
		);
	}

	function hideShortcuts(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		shortcutsVisible = false;
		ctx.ui.setWidget(SHORTCUTS_WIDGET_KEY, undefined);
	}

	function updateUi(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;

		if (state.mode === "default") {
			ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "? for shortcuts"));
		} else if (state.mode === "acceptEdits") {
			ctx.ui.setStatus(STATUS_KEY, ansi.purple("⏵⏵ accept edits on"));
		} else if (state.mode === "plan") {
			ctx.ui.setStatus(STATUS_KEY, ansi.cyan("⏸ plan mode on"));
		} else {
			ctx.ui.setStatus(STATUS_KEY, ansi.yellow("⏵⏵ auto mode on"));
		}

		if (state.mode === "plan") {
			const planFilePath = ensurePlanFile(ctx);
			ctx.ui.setWidget(PLAN_WIDGET_KEY, [
				`${ctx.ui.theme.fg("warning", "Plan mode")} ${ctx.ui.theme.fg("muted", "read-only except plan file")}`,
				`${ctx.ui.theme.fg("muted", "Plan:")} ${planFilePath}`,
				ctx.ui.theme.fg("dim", `Call ${EXIT_PLAN_MODE_TOOL_NAME} when ready • Shift+Tab cycles modes`),
			]);
		} else {
			ctx.ui.setWidget(PLAN_WIDGET_KEY, undefined);
		}
	}

	function applyModeTools(ctx: ExtensionContext): void {
		const tools = getToolsForMode(state.mode);
		if (tools.length > 0) pi.setActiveTools(tools);
		updateUi(ctx);
	}

	function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
		if (ctx.hasUI) ctx.ui.notify(message, level);
		else if (level === "error") process.stderr.write(`${message}\n`);
		else process.stdout.write(`${message}\n`);
	}

	async function ensureAutoModeOptIn(ctx: ExtensionContext): Promise<boolean> {
		const config = loadUserConfig();
		if (config.autoModeOptIn) return true;
		if (!ctx.hasUI) return true;

		const ok = await ctx.ui.confirm(
			"Enable auto mode?",
			"Auto mode lets the agent proceed with edits and safe commands autonomously. High-risk or destructive shell commands still require confirmation. Enable auto mode for future sessions?",
		);
		if (!ok) {
			notify(ctx, "Auto mode not enabled.", "warning");
			return false;
		}
		saveUserConfig({ ...config, autoModeOptIn: true });
		return true;
	}

	async function setMode(nextMode: PermissionMode, ctx: ExtensionContext, options: { silent?: boolean; source?: string } = {}): Promise<boolean> {
		const previousMode = state.mode;
		if (nextMode === "auto") {
			const ok = await ensureAutoModeOptIn(ctx);
			if (!ok) return false;
		}

		if (nextMode === "plan") {
			try {
				ensurePlanFile(ctx);
			} catch (error) {
				notify(ctx, `Could not create plan file: ${error instanceof Error ? error.message : String(error)}`, "error");
				return false;
			}
			if (previousMode !== "plan") state.prePlanMode = previousMode;
		} else if (previousMode === "plan") {
			state.prePlanMode = undefined;
		}

		state.mode = nextMode;
		applyModeTools(ctx);
		persistState();

		if (!options.silent) {
			if (nextMode === "default") {
				notify(ctx, "? for shortcuts");
			} else {
				const label = `${modeTitle(nextMode)} on`;
				const source = options.source ? ansi.dim(` (${options.source})`) : "";
				notify(ctx, `${colorModeText(nextMode, label)}${source}`);
			}
		}
		return true;
	}

	async function cycleMode(ctx: ExtensionContext): Promise<void> {
		const currentIndex = MODE_ORDER.indexOf(state.mode);
		const nextMode = MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length] ?? "default";
		await setMode(nextMode, ctx, { source: "Shift+Tab" });
	}

	async function showPermissionDialog(
		ctx: ExtensionContext,
		requestFactory: () => PermissionDialogRequest,
		onAmend: () => Promise<void>,
	): Promise<PermissionDecision> {
		if (!ctx.hasUI) return "approve";

		while (true) {
			const result = await ctx.ui.custom<PermissionDialogOutcome>((tui, theme, _keybindings, done) =>
				new PermissionDialogComponent(tui, theme, requestFactory(), done),
			);

			if (result === "amend") {
				await onAmend();
				continue;
			}

			return result;
		}
	}

	async function approvePermissionDecision(ctx: ExtensionContext, decision: PermissionDecision): Promise<boolean> {
		if (decision === "deny") return false;
		if (decision === "approve" || decision === "approveReadSession" || decision === "approveEditSession" || decision === "approveBashPrefix") return true;
		if (decision === "approveAndAcceptEdits") {
			return setMode("acceptEdits", ctx, { silent: true, source: "permission dialog" });
		}
		if (state.mode === "auto") return true;
		return setMode("auto", ctx, { silent: true, source: "permission dialog" });
	}

	function buildReadPermissionRequest(path: string, safetyReasons: string[], ctx: ExtensionContext): PermissionDialogRequest {
		const fileName = basename(path) || path;
		const dirName = basename(permissionDirectory(path, ctx.cwd)) || "this directory";
		return {
			operationTitle: `Read(${fileName})`,
			actionTitle: "Review sensitive read",
			target: path,
			previewLines: appendSafetyPreview([`Read ${path}`], safetyReasons),
			question: `Do you want to read ${path}?`,
			options: [
				{ value: "approve", label: "Yes" },
				{ value: "approveReadSession", label: `Yes, allow reading from ${dirName}/ during this session (shift+tab)` },
				{ value: "deny", label: "No" },
			],
		};
	}

	function buildWritePermissionRequest(path: string, content: string, ctx: ExtensionContext, safetyReasons: string[] = []): PermissionDialogRequest {
		const fileName = basename(path) || path;
		const exists = existsSync(normalizeToolPath(path, ctx.cwd));
		const dirName = basename(permissionDirectory(path, ctx.cwd)) || "this directory";
		return {
			operationTitle: `Write(${fileName})`,
			actionTitle: exists ? "Overwrite file" : "Create file",
			target: path,
			previewLines: appendSafetyPreview(formatWritePreview(content), safetyReasons),
			question: `Do you want to ${exists ? "overwrite" : "create"} ${path}?`,
			options: [
				{ value: "approve", label: "Yes" },
				{ value: "approveEditSession", label: `Yes, allow edits in ${dirName}/ during this session (shift+tab)` },
				{ value: "approveAndAcceptEdits", label: "Yes, allow all edits during this session" },
				{ value: "deny", label: "No" },
			],
			amendHint: "Tab to amend",
		};
	}

	function buildEditPermissionRequest(target: string, previewLines: string[], safetyReasons: string[] = []): PermissionDialogRequest {
		const fileName = basename(target) || target;
		const sessionLabel = target.includes(" files:") ? "Yes, allow edits in these locations during this session (shift+tab)" : "Yes, allow edits in this directory during this session (shift+tab)";
		return {
			operationTitle: `Edit(${fileName})`,
			actionTitle: "Apply edits",
			target,
			previewLines: appendSafetyPreview(previewLines, safetyReasons),
			question: `Do you want to apply edits to ${target}?`,
			options: [
				{ value: "approve", label: "Yes" },
				{ value: "approveEditSession", label: sessionLabel },
				{ value: "approveAndAcceptEdits", label: "Yes, allow all edits during this session" },
				{ value: "deny", label: "No" },
			],
			amendHint: "Tab to amend",
		};
	}

	function buildBashPermissionRequest(command: string, ctx: ExtensionContext, safetyReasons: string[] = [], allowPrefixOption = true): PermissionDialogRequest {
		const modeOptionLabel = state.mode === "auto" ? "Yes, keep auto mode on" : "Yes, enable auto mode";
		const prefix = bashRulePrefix(command);
		const options: PermissionDialogOption[] = [{ value: "approve", label: "Yes" }];
		if (allowPrefixOption && prefix) options.push({ value: "approveBashPrefix", label: `Yes, don't ask again for ${prefix} (shift+tab)` });
		options.push({ value: "approveAndAuto", label: modeOptionLabel }, { value: "deny", label: "No" });
		return {
			operationTitle: "Bash command",
			actionTitle: state.mode === "auto" ? "Approve high-risk command" : "Run command",
			target: ctx.cwd,
			previewLines: appendSafetyPreview(formatBashPreview(command), safetyReasons),
			question: "Do you want to run this command?",
			options,
			amendHint: "Tab to amend",
		};
	}

	async function reviewPlanForApproval(ctx: ExtensionContext): Promise<ExitPlanModeDetails> {
		if (state.mode !== "plan") {
			return {
				status: "not_in_plan",
				mode: state.mode,
				message: "You are not in plan mode. ExitPlanMode is only for requesting approval after planning.",
			};
		}

		const { path: planFilePath, content } = readPlan(ctx);
		if (!isSubstantivePlan(content)) {
			return {
				status: "missing_plan",
				mode: state.mode,
				planFilePath,
				plan: content,
				message: `The plan file is still empty or only contains the skeleton. Write the final plan to ${planFilePath} before calling ${EXIT_PLAN_MODE_TOOL_NAME}.`,
			};
		}

		if (!ctx.hasUI) {
			return {
				status: "error",
				mode: state.mode,
				planFilePath,
				plan: content,
				message: "ExitPlanMode requires an interactive UI so the user can review and approve the plan.",
			};
		}

		const reviewed = await ctx.ui.editor(`Review/edit plan (${planFilePath})`, content);
		if (reviewed === undefined) {
			return {
				status: "cancelled",
				mode: state.mode,
				planFilePath,
				plan: content,
				message: "Plan approval was cancelled. Stay in plan mode and continue planning.",
			};
		}

		const finalPlan = reviewed.trimEnd() + "\n";
		if (finalPlan !== content) writePlan(planFilePath, finalPlan);

		const choices = [
			"Yes, auto-accept edits",
			"Yes, manually approve edits",
			"Yes, use auto mode",
			"No, keep planning",
		];
		const choice = await ctx.ui.select("Ready to code?", choices);

		if (!choice) {
			return {
				status: "cancelled",
				mode: state.mode,
				planFilePath,
				plan: finalPlan,
				message: "Plan approval was cancelled. Stay in plan mode and continue planning.",
			};
		}

		if (choice === "No, keep planning") {
			const feedback = (await ctx.ui.editor("Tell the agent what to change in the plan", ""))?.trim();
			return {
				status: "keep_planning",
				mode: state.mode,
				planFilePath,
				plan: finalPlan,
				feedback,
				message: feedback ? `User wants to keep planning: ${feedback}` : "User wants to keep planning.",
			};
		}

		const approvedMode: PermissionMode = choice === "Yes, manually approve edits" ? "default" : choice === "Yes, use auto mode" ? "auto" : "acceptEdits";
		const changed = await setMode(approvedMode, ctx, { silent: true, source: EXIT_PLAN_MODE_TOOL_NAME });
		if (!changed) {
			return {
				status: "cancelled",
				mode: state.mode,
				planFilePath,
				plan: finalPlan,
				message: "Plan was not approved because the selected permission mode was not enabled.",
			};
		}

		return {
			status: "approved",
			mode: state.mode,
			approvedMode,
			planFilePath,
			plan: finalPlan,
			message: `User approved the plan and selected ${modeTitle(approvedMode)}.`,
		};
	}

	function installShiftTabModeCycler(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new ModeCyclingEditor(
				tui,
				theme,
				keybindings,
				() => cycleMode(ctx),
				() => showShortcuts(ctx),
				() => hideShortcuts(ctx),
			),
		);
	}

	function handleQuestionShortcut(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (ctx.ui.getEditorText().length === 0) {
			if (shortcutsVisible) hideShortcuts(ctx);
			else showShortcuts(ctx);
			return;
		}
		ctx.ui.pasteToEditor("?");
	}

	pi.registerTool<typeof EmptyParamsSchema, EnterPlanModeDetails>({
		name: ENTER_PLAN_MODE_TOOL_NAME,
		label: "Enter Plan Mode",
		description: "Switch to plan mode to explore the codebase and design an approach before coding.",
		promptSnippet: "Request permission to enter plan mode for non-trivial implementation tasks before coding.",
		promptGuidelines: ENTER_PLAN_MODE_GUIDELINES,
		parameters: EmptyParamsSchema,
		executionMode: "sequential",
		prepareArguments() {
			return {};
		},
		async execute(_toolCallId, _params: EmptyParams, _signal, _onUpdate, ctx) {
			if (state.mode === "plan") {
				const planFilePath = ensurePlanFile(ctx);
				const details: EnterPlanModeDetails = {
					status: "already_in_plan",
					mode: state.mode,
					planFilePath,
					message: `Already in plan mode. Continue planning in ${planFilePath}.`,
				};
				return { content: [{ type: "text", text: details.message }], details };
			}

			if (ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"Enter plan mode?",
					"The agent wants to explore the codebase and design an implementation approach before coding. No code changes will be made until you approve the plan.",
				);
				if (!ok) {
					const details: EnterPlanModeDetails = {
						status: "declined",
						mode: state.mode,
						message: "User declined to enter plan mode. Continue without switching modes.",
					};
					return { content: [{ type: "text", text: details.message }], details };
				}
			}

			const ok = await setMode("plan", ctx, { silent: true, source: ENTER_PLAN_MODE_TOOL_NAME });
			if (!ok) {
				const details: EnterPlanModeDetails = {
					status: "error",
					mode: state.mode,
					message: "Could not enter plan mode.",
				};
				return { content: [{ type: "text", text: details.message }], details };
			}

			const planFilePath = ensurePlanFile(ctx);
			const instructions = `Entered plan mode. Focus on exploring the codebase and designing an implementation approach.\n\nPlan file: ${planFilePath}\n\nDO NOT write or edit any files except this plan file. When the plan is ready, call ${EXIT_PLAN_MODE_TOOL_NAME} to request approval.`;
			const details: EnterPlanModeDetails = {
				status: "entered",
				mode: state.mode,
				planFilePath,
				message: instructions,
			};
			return { content: [{ type: "text", text: instructions }], details };
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(ENTER_PLAN_MODE_TOOL_NAME)), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as EnterPlanModeDetails | undefined;
			if (!details) return new Text(getTextFromToolResultContent(result.content), 0, 0);
			const color = details.status === "entered" || details.status === "already_in_plan" ? "warning" : details.status === "declined" ? "muted" : "error";
			const icon = details.status === "entered" || details.status === "already_in_plan" ? "●" : details.status === "declined" ? "○" : "✗";
			let text = `${theme.fg(color as never, icon)} ${theme.fg("muted", details.message)}`;
			if (details.planFilePath) text += `\n${theme.fg("dim", details.planFilePath)}`;
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool<typeof EmptyParamsSchema, ExitPlanModeDetails>({
		name: EXIT_PLAN_MODE_TOOL_NAME,
		label: "Exit Plan Mode",
		description: "Present the plan file for user approval and switch out of plan mode before coding.",
		promptSnippet: "Request approval for the finalized plan and leave plan mode.",
		promptGuidelines: EXIT_PLAN_MODE_GUIDELINES,
		parameters: EmptyParamsSchema,
		executionMode: "sequential",
		prepareArguments() {
			return {};
		},
		async execute(_toolCallId, _params: EmptyParams, _signal, _onUpdate, ctx) {
			const details = await reviewPlanForApproval(ctx);
			let text = details.message;

			if (details.status === "approved") {
				text = `User has approved your plan. You can now start coding. Start with updating TodoWrite if applicable.\n\nYour plan has been saved to: ${details.planFilePath}\n\nImplementation permission mode: ${modeTitle(details.approvedMode ?? details.mode)}\n\n## Approved Plan\n${details.plan ?? ""}`;
			} else if (details.status === "keep_planning") {
				text = `User declined to exit plan mode and wants to keep planning.\n${details.feedback ? `\nFeedback: ${details.feedback}\n` : ""}\nContinue exploring, update the plan file, and call ${EXIT_PLAN_MODE_TOOL_NAME} again when ready.`;
			}

			return { content: [{ type: "text", text }], details };
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(EXIT_PLAN_MODE_TOOL_NAME)), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as ExitPlanModeDetails | undefined;
			if (!details) return new Text(getTextFromToolResultContent(result.content), 0, 0);
			const color = details.status === "approved" ? "success" : details.status === "keep_planning" || details.status === "cancelled" ? "warning" : "error";
			const icon = details.status === "approved" ? "✓" : details.status === "keep_planning" || details.status === "cancelled" ? "↺" : "✗";
			let text = `${theme.fg(color as never, icon)} ${theme.fg("muted", details.message)}`;
			if (details.planFilePath) text += `\n${theme.fg("dim", details.planFilePath)}`;
			return new Text(text, 0, 0);
		},
	});

	pi.registerCommand("mode", {
		description: "Switch permission mode: none/default, accept-edits, plan, or auto.",
		getArgumentCompletions(prefix: string) {
			const items = [
				{ value: "none", label: "none", description: "Manual approval/default mode" },
				{ value: "accept-edits", label: "accept-edits", description: "Auto-approve file edits" },
				{ value: "plan", label: "plan", description: "Read-only planning mode" },
				{ value: "auto", label: "auto", description: "Autonomous execution mode" },
			];
			const normalized = prefix.trimStart().toLowerCase();
			const filtered = items.filter((item) => item.value.startsWith(normalized));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const requested = normalizeMode(args);
			if (requested) {
				await setMode(requested, ctx, { source: "/mode" });
				return;
			}

			if (args.trim()) {
				notify(ctx, `Unknown mode "${args.trim()}". Use none, accept-edits, plan, or auto.`, "warning");
				return;
			}

			if (!ctx.hasUI) {
				process.stdout.write(`Current mode: ${modeTitle(state.mode)}\n`);
				return;
			}

			const choice = await ctx.ui.select("Switch permission mode", [
				`${state.mode === "default" ? "✓ " : ""}none / manual approval`,
				`${state.mode === "acceptEdits" ? "✓ " : ""}accept edits`,
				`${state.mode === "plan" ? "✓ " : ""}plan mode`,
				`${state.mode === "auto" ? "✓ " : ""}auto mode`,
			]);
			const selected = choice?.replace(/^✓\s+/, "");
			const next = selected?.startsWith("none") ? "default" : selected?.startsWith("accept") ? "acceptEdits" : selected?.startsWith("plan") ? "plan" : selected?.startsWith("auto") ? "auto" : undefined;
			if (next) await setMode(next, ctx, { source: "/mode" });
		},
	});

	pi.registerCommand("plan", {
		description: "Enter/edit plan mode. Use /plan exit to review the current plan.",
		getArgumentCompletions(prefix: string) {
			const items = [
				{ value: "edit", label: "edit", description: "Open the plan file editor" },
				{ value: "show", label: "show", description: "Print the plan file path/content" },
				{ value: "exit", label: "exit", description: "Review and approve the plan" },
			];
			const normalized = prefix.trimStart().toLowerCase();
			const filtered = items.filter((item) => item.value.startsWith(normalized));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (!command) {
				if (state.mode !== "plan") await setMode("plan", ctx, { source: "/plan" });
				else notify(ctx, `Already in plan mode. Plan file: ${ensurePlanFile(ctx)}`);
				return;
			}

			if (command === "edit") {
				const { path: planFilePath, content } = readPlan(ctx);
				if (!ctx.hasUI) {
					process.stdout.write(`${planFilePath}\n`);
					return;
				}
				const edited = await ctx.ui.editor(`Edit plan (${planFilePath})`, content);
				if (edited !== undefined) {
					writePlan(planFilePath, edited.trimEnd() + "\n");
					notify(ctx, `Plan saved: ${planFilePath}`);
				}
				return;
			}

			if (command === "show") {
				const { path: planFilePath, content } = readPlan(ctx);
				if (ctx.hasUI) ctx.ui.notify(`Plan file: ${planFilePath}\n\n${content}`, "info");
				else process.stdout.write(`Plan file: ${planFilePath}\n\n${content}\n`);
				return;
			}

			if (command === "exit") {
				const details = await reviewPlanForApproval(ctx);
				notify(ctx, details.message, details.status === "approved" ? "info" : details.status === "keep_planning" || details.status === "cancelled" ? "warning" : "error");
				return;
			}

			notify(ctx, "Usage: /plan [edit|show|exit]", "warning");
		},
	});

	pi.registerCommand("permissions", {
		description: "Alias for /mode.",
		handler: async (args, ctx) => {
			const requested = normalizeMode(args);
			if (requested) {
				await setMode(requested, ctx, { source: "/permissions" });
				return;
			}

			if (args.trim()) {
				notify(ctx, `Unknown mode "${args.trim()}". Use none, accept-edits, plan, or auto.`, "warning");
				return;
			}

			if (!ctx.hasUI) {
				process.stdout.write(`Current mode: ${modeTitle(state.mode)}\n`);
				return;
			}

			const choice = await ctx.ui.select("Switch permission mode", [
				`${state.mode === "default" ? "✓ " : ""}none / manual approval`,
				`${state.mode === "acceptEdits" ? "✓ " : ""}accept edits`,
				`${state.mode === "plan" ? "✓ " : ""}plan mode`,
				`${state.mode === "auto" ? "✓ " : ""}auto mode`,
			]);
			const selected = choice?.replace(/^✓\s+/, "");
			const next = selected?.startsWith("none") ? "default" : selected?.startsWith("accept") ? "acceptEdits" : selected?.startsWith("plan") ? "plan" : selected?.startsWith("auto") ? "auto" : undefined;
			if (next) await setMode(next, ctx, { source: "/permissions" });
		},
	});

	pi.registerShortcut("?", {
		description: "Show shortcuts",
		handler: async (ctx) => {
			handleQuestionShortcut(ctx);
		},
	});

	pi.registerShortcut("shift+/", {
		description: "Show shortcuts",
		handler: async (ctx) => {
			handleQuestionShortcut(ctx);
		},
	});

	pi.registerShortcut("shift+tab", {
		description: "Cycle permission modes",
		handler: async (ctx) => {
			await cycleMode(ctx);
		},
	});


	pi.on("session_start", async (_event, ctx) => {
		restoreState(ctx);

		const flagMode = normalizeMode(pi.getFlag("permission-mode"));
		if (flagMode) state.mode = flagMode;
		if (pi.getFlag("start-in-plan") === true) state.mode = "plan";

		if (state.mode === "plan") ensurePlanFile(ctx);
		applyModeTools(ctx);
		installShiftTabModeCycler(ctx);
		persistState();
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreState(ctx);
		if (state.mode === "plan") ensurePlanFile(ctx);
		applyModeTools(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (event.text === "?") {
			showShortcuts(ctx);
			return { action: "handled" };
		}
		hideShortcuts(ctx);
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (state.mode === "plan") {
			const planFilePath = ensurePlanFile(ctx);
			return { systemPrompt: event.systemPrompt + makePlanInstructions(planFilePath, existsSync(planFilePath)) };
		}
		if (state.mode === "auto") return { systemPrompt: event.systemPrompt + makeAutoModeInstructions() };
		if (state.mode === "acceptEdits") return { systemPrompt: event.systemPrompt + makeAcceptEditsInstructions() };
		return;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (isToolCallEventType("read", event)) {
			const path = String(event.input.path ?? "");
			const review = reviewPathSafety(path, ctx.cwd, "read");
			if (review.blockReasons.length > 0) {
				return {
					block: true,
					reason: `Blocked unsafe read of ${path}:\n${formatSafetyReasons(review.blockReasons)}`,
				};
			}

			const approvalReasons = filterReadApprovalReasons(path, review.approvalReasons, ctx);
			if (approvalReasons.length > 0) {
				const decision = await showPermissionDialog(
					ctx,
					() => buildReadPermissionRequest(path, approvalReasons, ctx),
					async () => {},
				);
				if (decision === "deny") return { block: true, reason: `User denied read of ${path}.` };
				if (decision === "approveReadSession") allowReadRoot(path, ctx);
			}
		}

		if (state.mode === "plan") {
			if (isToolCallEventType("bash", event)) {
				const command = String(event.input.command ?? "");
				const analysis = analyzeBashCommand(command);
				if (analysis.level !== "read_only") {
					return {
						block: true,
						reason: `Plan mode blocked a non-read-only bash command. Only read-only exploration is allowed until the plan is approved.\nCommand: ${command}\n${formatSafetyReasons(analysis.reasons)}`,
					};
				}
				return;
			}

			if (isToolCallEventType("edit", event)) {
				const targets = mutationTargetsFromEditInput(event.input as Record<string, unknown>);
				if (targets.length > 0 && targets.every((target) => isPlanFile(target.path, ctx))) return;
				return {
					block: true,
					reason: `Plan mode only allows editing the plan file: ${state.planFilePath ?? "(not created)"}. Requested: ${describeMutationTargets(targets)}`,
				};
			}

			if (isToolCallEventType("write", event)) {
				if (isPlanFile(event.input.path, ctx)) return;
				return {
					block: true,
					reason: `Plan mode only allows writing the plan file: ${state.planFilePath ?? "(not created)"}.`,
				};
			}

			const allowed = new Set([...READ_ONLY_TOOLS, ...SAFE_PLAN_EXTENSION_TOOLS, "bash", ...PLAN_FILE_TOOLS]);
			if (!allowed.has(event.toolName)) {
				return {
					block: true,
					reason: `Plan mode blocked ${event.toolName}. Use read-only tools and write only to the plan file until the user approves the plan.`,
				};
			}
			return;
		}

		if (isToolCallEventType("edit", event)) {
			const input = event.input as Record<string, unknown>;
			const targets = mutationTargetsFromEditInput(input);
			const review = reviewMutationTargets(targets, ctx, "edit");
			if (review.blockReasons.length > 0) {
				return {
					block: true,
					reason: `Blocked edit until safety issues are resolved:\n${formatSafetyReasons(review.blockReasons)}`,
				};
			}
			if (state.mode !== "default" && review.approvalReasons.length === 0) return;

			const decision = await showPermissionDialog(
				ctx,
				() => buildEditPermissionRequest(describeMutationTargets(mutationTargetsFromEditInput(input)), editPreviewFromInput(input), reviewMutationTargets(mutationTargetsFromEditInput(input), ctx, "edit").approvalReasons),
				async () => {
					const edited = await ctx.ui.editor("Amend edit arguments", JSON.stringify(input, null, 2));
					if (edited === undefined) return;
					try {
						const parsed = JSON.parse(edited) as Record<string, unknown>;
						if (!parsed || typeof parsed !== "object") throw new Error("Expected a JSON object.");
						for (const key of Object.keys(input)) delete input[key];
						Object.assign(input, parsed);
						if (Array.isArray(input.edits)) input.edits = parseEditReplacements(input.edits);
					} catch (error) {
						notify(ctx, `Invalid edit arguments JSON: ${error instanceof Error ? error.message : String(error)}`, "error");
					}
				},
			);
			const finalReview = reviewMutationTargets(mutationTargetsFromEditInput(input), ctx, "edit");
			if (finalReview.blockReasons.length > 0) {
				return {
					block: true,
					reason: `Blocked edit until safety issues are resolved:\n${formatSafetyReasons(finalReview.blockReasons)}`,
				};
			}
			if (decision === "approveEditSession") {
				for (const target of mutationTargetsFromEditInput(input)) allowEditRoot(target.path, ctx);
			}
			const ok = await approvePermissionDecision(ctx, decision);
			if (!ok) return { block: true, reason: `User denied edit to ${describeMutationTargets(mutationTargetsFromEditInput(input))}.` };
			return;
		}

		if (isToolCallEventType("write", event)) {
			const targets = mutationTargetsFromWriteInput(event.input.path, ctx.cwd);
			const review = reviewMutationTargets(targets, ctx, "write");
			if (review.blockReasons.length > 0) {
				return {
					block: true,
					reason: `Blocked write until safety issues are resolved:\n${formatSafetyReasons(review.blockReasons)}`,
				};
			}
			if (state.mode !== "default" && review.approvalReasons.length === 0) return;

			const decision = await showPermissionDialog(
				ctx,
				() => buildWritePermissionRequest(event.input.path, String(event.input.content ?? ""), ctx, reviewMutationTargets(mutationTargetsFromWriteInput(event.input.path, ctx.cwd), ctx, "write").approvalReasons),
				async () => {
					const edited = await ctx.ui.editor(`Amend write content (${event.input.path})`, String(event.input.content ?? ""));
					if (edited !== undefined) event.input.content = edited;
				},
			);
			if (decision === "approveEditSession") allowEditRoot(event.input.path, ctx);
			const ok = await approvePermissionDecision(ctx, decision);
			if (!ok) return { block: true, reason: `User denied write to ${event.input.path}.` };
			return;
		}

		if (isToolCallEventType("bash", event)) {
			const command = String(event.input.command ?? "");
			const analysis = analyzeBashCommand(command);
			if (analysis.level === "blocked") {
				return {
					block: true,
					reason: `Blocked unsafe bash command:\n${formatSafetyReasons(analysis.reasons)}\nCommand: ${command}`,
				};
			}
			if (analysis.level === "read_only") return;
			if (analysis.level !== "high_risk" && isBashAllowedBySession(command)) return;

			if (state.mode === "auto" && analysis.level !== "high_risk") return;

			const decision = await showPermissionDialog(
				ctx,
				() => {
					const currentCommand = String(event.input.command ?? "");
					const currentAnalysis = analyzeBashCommand(currentCommand);
					return buildBashPermissionRequest(currentCommand, ctx, currentAnalysis.reasons, currentAnalysis.level !== "high_risk");
				},
				async () => {
					const edited = await ctx.ui.editor("Amend bash command", String(event.input.command ?? ""));
					if (edited !== undefined) event.input.command = edited;
				},
			);
			const finalAnalysis = analyzeBashCommand(String(event.input.command ?? ""));
			if (finalAnalysis.level === "blocked") {
				return {
					block: true,
					reason: `Blocked unsafe bash command:\n${formatSafetyReasons(finalAnalysis.reasons)}\nCommand: ${String(event.input.command ?? "")}`,
				};
			}
			if (decision === "approveBashPrefix") allowBashPrefix(String(event.input.command ?? ""));
			const ok = await approvePermissionDecision(ctx, decision);
			if (!ok) return { block: true, reason: `User denied bash command: ${String(event.input.command ?? "")}` };
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read" || event.isError) return;
		const path = typeof event.input.path === "string" ? event.input.path : "";
		if (!path) return;

		const truncation = event.details && typeof event.details === "object" ? (event.details as { truncation?: { truncated?: boolean } }).truncation : undefined;
		storeReadSnapshot(path, ctx, {
			partial: event.input.offset !== undefined || event.input.limit !== undefined || truncation?.truncated === true,
		});
		persistState();
	});
}
