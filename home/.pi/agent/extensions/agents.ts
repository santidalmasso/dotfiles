/**
 * Session agents for pi, in the shape of Grok's agent definitions.
 *
 * An agent is a Markdown file with frontmatter in `~/.pi/agent/agents/` or the
 * project's `.pi/agents/`. It configures the whole session: system prompt body,
 * model, thinking level, and active tools. Pick one with `--agent <name>`,
 * `PI_AGENT=<name>`, a saved default, or `/agent` while running.
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, parseFrontmatter, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

interface AgentDefinition {
  name: string;
  description: string;
  filePath: string;
  model: { provider: string; id: string } | undefined;
  thinking: ThinkingLevel | undefined;
  tools: string[] | undefined;
  promptMode: "append" | "replace";
  prompt: string;
}

const DEFAULT_AGENT_FILE = join(getAgentDir(), "agents", ".default");
const STATUS_KEY = "agent";

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

function parseAgentFile(filePath: string): AgentDefinition {
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(readFileSync(filePath, "utf8"));
  const { name, description, model, thinking, tools, prompt_mode } = frontmatter;
  const modelParts = typeof model === "string" && model !== "inherit" ? model.split("/") : [];
  return {
    name: typeof name === "string" && name.trim() ? name.trim() : basename(filePath, ".md"),
    description: typeof description === "string" ? description.trim() : "",
    filePath,
    model: modelParts.length >= 2 ? { provider: modelParts[0], id: modelParts.slice(1).join("/") } : undefined,
    thinking: isThinkingLevel(thinking) ? thinking : undefined,
    tools: Array.isArray(tools) ? tools.filter((tool): tool is string => typeof tool === "string") : undefined,
    promptMode: prompt_mode === "replace" ? "replace" : "append",
    prompt: body.trim(),
  };
}

function loadAgentDefinitions(cwd: string): AgentDefinition[] {
  const agentsByName = new Map<string, AgentDefinition>();
  for (const dir of [join(getAgentDir(), "agents"), join(cwd, ".pi", "agents")]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const agent = parseAgentFile(join(dir, entry));
      agentsByName.set(agent.name, agent);
    }
  }
  return [...agentsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readDefaultAgentName(): string | undefined {
  return existsSync(DEFAULT_AGENT_FILE) ? readFileSync(DEFAULT_AGENT_FILE, "utf8").trim() || undefined : undefined;
}

export default function sessionAgents(pi: ExtensionAPI) {
  let active: AgentDefinition | undefined;
  let toolsBeforeAgent: string[] | undefined;

  pi.registerFlag("agent", { type: "string", description: "Start the session as this agent (from ~/.pi/agent/agents or .pi/agents)" });

  async function activate(agent: AgentDefinition, ctx: ExtensionContext): Promise<void> {
    toolsBeforeAgent ??= pi.getActiveTools();
    if (agent.model) {
      const model = ctx.modelRegistry.find(agent.model.provider, agent.model.id);
      if (!model) ctx.ui.notify(`Agent ${agent.name}: model ${agent.model.provider}/${agent.model.id} is not available`, "warning");
      else if (!(await pi.setModel(model))) ctx.ui.notify(`Agent ${agent.name}: no credentials for ${agent.model.provider}`, "warning");
    }
    if (agent.thinking) pi.setThinkingLevel(agent.thinking);
    if (agent.tools) pi.setActiveTools(agent.tools);
    active = agent;
    ctx.ui.setStatus(STATUS_KEY, agent.name);
  }

  function deactivate(ctx: ExtensionContext): void {
    if (toolsBeforeAgent) pi.setActiveTools(toolsBeforeAgent);
    active = undefined;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  pi.on("session_start", async (_event, ctx) => {
    const flag = pi.getFlag("agent");
    const wanted = (typeof flag === "string" && flag) || process.env.PI_AGENT || readDefaultAgentName();
    if (!wanted) return;
    const agent = loadAgentDefinitions(ctx.cwd).find((candidate) => candidate.name === wanted);
    if (!agent) {
      ctx.ui.notify(`Agent "${wanted}" not found in ~/.pi/agent/agents or .pi/agents`, "error");
      return;
    }
    await activate(agent, ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (!active || !active.prompt) return;
    return { systemPrompt: active.promptMode === "replace" ? active.prompt : `${event.systemPrompt}\n\n${active.prompt}` };
  });

  pi.registerCommand("agent", {
    description: "Switch the session agent: /agent [name|off|default <name>|default off]",
    handler: async (args, ctx) => {
      const agents = loadAgentDefinitions(ctx.cwd);
      const [verb, target] = (args ?? "").trim().split(/\s+/);

      if (verb === "default") {
        if (target === "off") {
          if (existsSync(DEFAULT_AGENT_FILE)) unlinkSync(DEFAULT_AGENT_FILE);
          ctx.ui.notify("Default agent cleared", "info");
        } else if (agents.some((agent) => agent.name === target)) {
          writeFileSync(DEFAULT_AGENT_FILE, `${target}\n`);
          ctx.ui.notify(`Default agent set to ${target}`, "info");
        } else {
          ctx.ui.notify(`Usage: /agent default <name>|off. Known agents: ${agents.map((agent) => agent.name).join(", ")}`, "error");
        }
        return;
      }

      let chosen: string | undefined = verb || undefined;
      if (chosen === undefined) {
        if (!ctx.hasUI) {
          ctx.ui.notify("Usage: /agent <name>|off", "error");
          return;
        }
        const picked = await ctx.ui.select("Session agent", ["off", ...agents.map((agent) => `${agent.name}  ${agent.description.split(". ")[0]}`.trimEnd())]);
        if (picked === undefined) return;
        chosen = picked.split("  ")[0];
      }

      if (chosen === "off") {
        deactivate(ctx);
        ctx.ui.notify("Session agent off", "info");
        return;
      }
      const agent = agents.find((candidate) => candidate.name === chosen);
      if (!agent) {
        ctx.ui.notify(`Unknown agent "${chosen}". Known: ${agents.map((candidate) => candidate.name).join(", ")}`, "error");
        return;
      }
      await activate(agent, ctx);
      ctx.ui.notify(`Session agent: ${agent.name}`, "info");
    },
  });
}
