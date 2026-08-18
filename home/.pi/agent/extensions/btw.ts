import {
  buildSessionContext,
  createAgentSession,
  createExtensionRuntime,
  getMarkdownTheme,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type ResourceLoader,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import {
  Key,
  Markdown,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type OverlayHandle,
  type TUI,
} from "@earendil-works/pi-tui";

const BTW_STATUS_KEY = "btw";

const BTW_SYSTEM_PROMPT = [
  "You are BTW, a side-channel assistant embedded in the user's coding agent.",
  "You can see the main conversation context, but your answer is not part of that conversation.",
  "Answer the user's side question directly in a single response.",
  "You have no tools: do not claim that you will inspect files, run commands, search, or change anything.",
  "If the answer is not knowable from the visible context and general knowledge, say so plainly.",
  "Do not frame the answer as an interruption of the main agent; just answer the side question.",
].join(" ");

const BTW_USER_REMINDER = `<system-reminder>This is a quick /btw side question from the user.

IMPORTANT:
- The main agent is not interrupted and this exchange is not added to the main conversation.
- You share the main conversation context only as background.
- You have no tools available and this is one response only.
- Do not say "I'll check", "let me inspect", or promise any action.
- If you do not know from the available context, say so.

Answer the side question directly.</system-reminder>`;

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const mdTheme = getMarkdownTheme();

type ActiveRun = {
  handle?: OverlayHandle;
  requestRender?: () => void;
  abort: () => void;
};

type BtwState = {
  question: string;
  modelLabel: string;
  answer: string;
  error: string | null;
  status: string;
  loading: boolean;
  frame: number;
  scrollFromBottom: number;
};

function stripDynamicSystemPromptFooter(systemPrompt: string): string {
  return systemPrompt
    .replace(/\nCurrent date and time:[^\n]*(?:\nCurrent working directory:[^\n]*)?$/u, "")
    .replace(/\nCurrent working directory:[^\n]*$/u, "")
    .trim();
}

function createBtwResourceLoader(ctx: ExtensionContext): ResourceLoader {
  const extensionsResult = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  const systemPrompt = stripDynamicSystemPromptFooter(ctx.getSystemPrompt());

  return {
    getExtensions: () => extensionsResult,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [BTW_SYSTEM_PROMPT],
    extendResources: () => {},
    reload: async () => {},
  };
}

function buildSeedMessages(ctx: ExtensionContext): Message[] {
  try {
    const context = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
    return context.messages.filter((message): message is Message => {
      if (!message || typeof message !== "object") return false;
      const role = (message as { role?: unknown }).role;
      return role === "user" || role === "assistant" || role === "toolResult";
    });
  } catch {
    return [];
  }
}

function extractText(parts: AssistantMessage["content"]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractEventAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const maybeMessage = message as { role?: unknown; content?: unknown };
  if (maybeMessage.role !== "assistant" || !Array.isArray(maybeMessage.content)) return "";

  return maybeMessage.content
    .filter((part): part is { type: "text"; text: string } => {
      return !!part && typeof part === "object" && (part as { type?: unknown }).type === "text";
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function getLastAssistantMessage(session: AgentSession): AssistantMessage | null {
  for (let i = session.state.messages.length - 1; i >= 0; i--) {
    const message = session.state.messages[i];
    if (message.role === "assistant") return message as AssistantMessage;
  }
  return null;
}

function modelLabel(ctx: ExtensionContext): string {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no model";
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

function padVisible(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width), "…");
  const missing = width - visibleWidth(clipped);
  return `${clipped}${missing > 0 ? " ".repeat(missing) : ""}`;
}

function wrapPlain(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/u).filter(Boolean);
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
        lines.push(truncateToWidth(current, width, "…"));
        current = word;
      }
    }
    if (current) lines.push(truncateToWidth(current, width, "…"));
  }
  return lines.length > 0 ? lines : [""];
}

function renderMarkdownLines(text: string, width: number): string[] {
  if (!text.trim()) return [];
  try {
    const md = new Markdown(text, 0, 0, mdTheme);
    return md.render(width).map((line) => truncateToWidth(line, width, ""));
  } catch {
    return wrapPlain(text, width);
  }
}

class BtwOverlay implements Component {
  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly state: BtwState,
    private readonly onDismiss: () => void,
  ) {}

  handleInput(data: string): void {
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.enter) ||
      matchesKey(data, Key.space) ||
      matchesKey(data, Key.ctrl("c")) ||
      matchesKey(data, Key.ctrl("d"))
    ) {
      this.onDismiss();
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p"))) {
      this.state.scrollFromBottom += 3;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n"))) {
      this.state.scrollFromBottom = Math.max(0, this.state.scrollFromBottom - 3);
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const dialogWidth = Math.max(20, Math.min(width, 100));
    const innerWidth = Math.max(1, dialogWidth - 2);
    const terminalRows = process.stdout.rows ?? 30;
    const dialogHeight = Math.max(12, Math.min(28, Math.floor(terminalRows * 0.72)));
    const viewportHeight = Math.max(4, dialogHeight - 8);

    const content = this.contentLines(innerWidth);
    const maxStart = Math.max(0, content.length - viewportHeight);
    const start = Math.max(0, maxStart - this.state.scrollFromBottom);
    const visible = content.slice(start, start + viewportHeight);
    const hiddenAbove = start > 0;
    const hiddenBelow = start + viewportHeight < content.length;

    const row = (content: string) => `${this.theme.fg("borderMuted", "│")}${padVisible(content, innerWidth)}${this.theme.fg("borderMuted", "│")}`;
    const border = (left: string, fill: string, right: string) => this.theme.fg("borderMuted", `${left}${fill.repeat(innerWidth)}${right}`);

    const question = truncateToWidth(this.state.question.replace(/\s+/gu, " "), Math.max(10, innerWidth - 7), "…");
    const title = `${this.theme.fg("warning", "/btw ")}${this.theme.fg("muted", question)}`;
    const subtitle = this.theme.fg("dim", "Side answer only — not saved to the main conversation.");
    const scrollHint = hiddenAbove || hiddenBelow ? this.theme.fg("dim", `${hiddenAbove ? "↑ more" : "      "}${hiddenBelow ? " · ↓ more" : ""}`) : "";
    const status = `${this.statusIcon()} ${this.state.status}${scrollHint ? `  ${scrollHint}` : ""}`;
    const help = this.state.loading ? "Esc/Ctrl-C aborts · ↑↓ scroll" : "Space/Enter/Esc dismiss · ↑↓ scroll";

    const lines = [border("┌", "─", "┐"), row(title), row(subtitle), border("├", "─", "┤")];
    for (const line of visible) lines.push(row(line));
    for (let i = visible.length; i < viewportHeight; i++) lines.push(row(""));
    lines.push(border("├", "─", "┤"));
    lines.push(row(this.theme.fg(this.state.error ? "error" : this.state.loading ? "warning" : "success", status)));
    lines.push(row(this.theme.fg("dim", `${help} · ${this.state.modelLabel}`)));
    lines.push(border("└", "─", "┘"));
    return lines;
  }

  invalidate(): void {}
  dispose(): void {}

  private statusIcon(): string {
    if (this.state.error) return "✗";
    if (this.state.loading) return SPINNER[this.state.frame % SPINNER.length] ?? "…";
    return "✓";
  }

  private contentLines(width: number): string[] {
    if (this.state.error) {
      return wrapPlain(`Error: ${this.state.error}`, width).map((line) => this.theme.fg("error", line));
    }

    if (!this.state.answer.trim()) {
      if (this.state.loading) return [this.theme.fg("warning", `${this.statusIcon()} Answering…`)];
      return [this.theme.fg("dim", "No text response.")];
    }

    const lines = renderMarkdownLines(this.state.answer, width);
    if (this.state.loading) {
      lines.push("", this.theme.fg("warning", `${this.statusIcon()} Answering…`));
    }
    return lines;
  }
}

async function createSideSession(ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<AgentSession> {
  if (!ctx.model) throw new Error("No active model selected.");

  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    sessionManager: SessionManager.inMemory(),
    model: ctx.model,
    modelRegistry: ctx.modelRegistry,
    thinkingLevel: pi.getThinkingLevel() as never,
    tools: [],
    resourceLoader: createBtwResourceLoader(ctx),
  });

  const seedMessages = buildSeedMessages(ctx);
  if (seedMessages.length > 0) {
    session.agent.state.messages = seedMessages as typeof session.agent.state.messages;
  }

  return session;
}

async function answerSideQuestion(
  question: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  state: BtwState,
  refresh: () => void,
  isDismissed: () => boolean,
  setAbort: (abort: () => void) => void,
): Promise<void> {
  const model = ctx.model;
  if (!model) throw new Error("No active model selected.");

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (auth.ok === false) throw new Error(auth.error);

  let session: AgentSession | null = null;
  let unsubscribe: (() => void) | undefined;

  try {
    session = await createSideSession(ctx, pi);
    setAbort(() => {
      void session?.abort();
    });

    unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (isDismissed()) return;
      if (event.type === "message_update" || event.type === "message_end" || event.type === "message_start") {
        const streamed = extractEventAssistantText(event.message);
        if (streamed) {
          state.answer = streamed;
          state.error = null;
          state.status = event.type === "message_end" ? "Finalizing side answer…" : "Answering…";
          refresh();
        }
      }
    });

    state.status = "Answering…";
    refresh();

    await session.prompt(`${BTW_USER_REMINDER}\n\n${question}`, {
      source: "extension",
      expandPromptTemplates: false,
    });

    const response = getLastAssistantMessage(session);
    if (!response) throw new Error("BTW request finished without a response.");
    if (response.stopReason === "aborted") throw new Error("BTW request aborted.");
    if (response.stopReason === "error") throw new Error(response.errorMessage || "BTW request failed.");

    state.answer = extractText(response.content) || state.answer || "(No text response)";
    state.status = "Done — side answer not saved.";
  } finally {
    unsubscribe?.();
    if (session) {
      try {
        await session.abort();
      } catch {
        // Ignore abort errors during cleanup.
      }
      session.dispose();
    }
    state.loading = false;
    refresh();
  }
}

function isLegacyBtwNoteMessage(message: unknown): boolean {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "custom" &&
    (message as { customType?: unknown }).customType === "btw-note"
  );
}

export default function (pi: ExtensionAPI) {
  let activeRun: ActiveRun | null = null;

  function focusActive(ctx: ExtensionContext): boolean {
    if (!activeRun) return false;
    activeRun.handle?.setHidden(false);
    activeRun.handle?.focus();
    activeRun.requestRender?.();
    notify(ctx, "BTW is already open.", "warning");
    return true;
  }

  pi.registerCommand("btw", {
    description: "Ask a quick side question without adding it to the main conversation. Usage: /btw <question>",
    handler: async (args, ctx) => {
      if (focusActive(ctx)) return;

      let question = args.trim();
      if (!question) {
        if (!ctx.hasUI) {
          process.stderr.write("Usage: /btw <question>\n");
          return;
        }
        const input = await ctx.ui.input("BTW side question", "Ask without adding to the main conversation…");
        question = input?.trim() ?? "";
        if (!question) return;
      }

      if (!ctx.model) {
        notify(ctx, "No active model selected.", "error");
        return;
      }

      const state: BtwState = {
        question,
        modelLabel: modelLabel(ctx),
        answer: "",
        error: null,
        status: "Starting BTW…",
        loading: true,
        frame: 0,
        scrollFromBottom: 0,
      };

      if (!ctx.hasUI) {
        let abortSide = () => {};
        activeRun = { abort: () => abortSide() };
        try {
          await answerSideQuestion(
            question,
            ctx,
            pi,
            state,
            () => {},
            () => false,
            (abort) => {
              abortSide = abort;
              if (activeRun) activeRun.abort = abort;
            },
          );
          process.stdout.write(`${state.answer}\n`);
        } catch (error) {
          process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        } finally {
          activeRun = null;
        }
        return;
      }

      let dismissed = false;
      let abortSide = () => {};
      let finishOverlay: (() => void) | undefined;
      let animation: ReturnType<typeof setInterval> | undefined;

      activeRun = {
        abort: () => abortSide(),
      };

      const refresh = () => activeRun?.requestRender?.();
      const close = () => {
        if (dismissed) return;
        dismissed = true;
        if (state.loading) abortSide();
        finishOverlay?.();
      };

      ctx.ui.setStatus(BTW_STATUS_KEY, "BTW answering…");

      const overlayPromise = ctx.hasUI
        ? ctx.ui.custom<void>(
            (tui, theme, _keybindings, done) => {
              finishOverlay = done;
              const overlay = new BtwOverlay(tui, theme, state, close);
              activeRun!.requestRender = () => tui.requestRender();
              return overlay;
            },
            {
              overlay: true,
              overlayOptions: {
                width: "88%",
                minWidth: 60,
                maxHeight: "78%",
                anchor: "top-center",
                margin: { top: 1, left: 2, right: 2 },
              },
              onHandle: (handle) => {
                if (activeRun) activeRun.handle = handle;
                handle.focus();
              },
            },
          )
        : Promise.resolve();

      animation = setInterval(() => {
        if (!state.loading) return;
        state.frame += 1;
        refresh();
      }, 90);

      try {
        await answerSideQuestion(
          question,
          ctx,
          pi,
          state,
          refresh,
          () => dismissed,
          (abort) => {
            abortSide = abort;
            if (activeRun) activeRun.abort = abort;
          },
        );
      } catch (error) {
        state.loading = false;
        state.error = error instanceof Error ? error.message : String(error);
        state.status = "BTW failed.";
        if (!dismissed) notify(ctx, state.error, "error");
        refresh();
      } finally {
        if (animation) clearInterval(animation);
        ctx.ui.setStatus(BTW_STATUS_KEY, undefined);
      }

      await overlayPromise.catch((error) => {
        notify(ctx, error instanceof Error ? error.message : String(error), "error");
      });

      if (activeRun?.handle) activeRun.handle.hide();
      activeRun = null;
    },
  });

  // If the older pi-btw package ever saved visible BTW notes, keep them out of
  // future model context now that this lightweight /btw owns the command.
  pi.on("context", (event) => {
    return { messages: event.messages.filter((message) => !isLegacyBtwNoteMessage(message)) };
  });

  pi.on("session_shutdown", async () => {
    activeRun?.abort();
    activeRun?.handle?.hide();
    activeRun = null;
  });
}
