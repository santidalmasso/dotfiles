//! A pane whose `owner` metadata token names another live agent is that agent's
//! subagent. It stays out of the human queue while the owner is working, or is
//! itself blocked and so already escalating. An orphan, whose owner is idle,
//! done, or gone, is promoted back to the human.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::error::Error;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

const OWNER_TOKEN: &str = "owner";
const VIEW_SOURCE: &str = "plugin:santi.attention-router";

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
enum AgentStatus {
    Idle,
    Working,
    Blocked,
    Done,
    Unknown,
}

impl AgentStatus {
    fn attention_rank(self) -> Option<u8> {
        match self {
            AgentStatus::Blocked => Some(0),
            AgentStatus::Done => Some(1),
            AgentStatus::Idle | AgentStatus::Working | AgentStatus::Unknown => None,
        }
    }

    fn handles_own_subagents(self) -> bool {
        matches!(self, AgentStatus::Working | AgentStatus::Blocked)
    }
}

#[derive(Deserialize, Debug)]
struct Agent {
    pane_id: String,
    agent_status: AgentStatus,
    focused: bool,
    state_change_seq: u64,
    #[serde(default)]
    tokens: HashMap<String, String>,
}

#[derive(Deserialize)]
struct AgentList {
    agents: Vec<Agent>,
}

struct HumanQueue<'a> {
    hidden_pane_ids: Vec<&'a str>,
    needing_human: Vec<&'a Agent>,
}

fn herdr_request(method: &str, params: Value) -> Result<Value, Box<dyn Error>> {
    let socket_path = std::env::var("HERDR_SOCKET_PATH")?;
    let mut stream = UnixStream::connect(socket_path)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    writeln!(
        stream,
        "{}",
        json!({ "id": method, "method": method, "params": params })
    )?;
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line)?;
    let mut reply: Value = serde_json::from_str(&line)?;
    if let Some(error) = reply.get("error") {
        return Err(format!("{method} failed: {error}").into());
    }
    match reply.get_mut("result") {
        Some(result) => Ok(result.take()),
        None => Err(format!("{method}: malformed reply").into()),
    }
}

fn list_agents() -> Result<Vec<Agent>, Box<dyn Error>> {
    let list: AgentList = serde_json::from_value(herdr_request("agent.list", json!({}))?)?;
    Ok(list.agents)
}

fn owner_handles_pane(agent: &Agent, agents_by_pane: &HashMap<&str, &Agent>) -> bool {
    agent
        .tokens
        .get(OWNER_TOKEN)
        .and_then(|owner_pane_id| agents_by_pane.get(owner_pane_id.as_str()))
        .is_some_and(|owner| owner.agent_status.handles_own_subagents())
}

fn human_queue(agents: &[Agent]) -> HumanQueue<'_> {
    let agents_by_pane: HashMap<&str, &Agent> = agents
        .iter()
        .map(|agent| (agent.pane_id.as_str(), agent))
        .collect();
    let hidden_pane_ids: Vec<&str> = agents
        .iter()
        .filter(|agent| owner_handles_pane(agent, &agents_by_pane))
        .map(|agent| agent.pane_id.as_str())
        .collect();
    let mut needing_human: Vec<&Agent> = agents
        .iter()
        .filter(|agent| !hidden_pane_ids.contains(&agent.pane_id.as_str()))
        .filter(|agent| agent.agent_status.attention_rank().is_some())
        .collect();
    needing_human.sort_by_key(|agent| {
        (
            agent.agent_status.attention_rank(),
            std::cmp::Reverse(agent.state_change_seq),
        )
    });
    HumanQueue {
        hidden_pane_ids,
        needing_human,
    }
}

fn apply_agent_view(hidden_pane_ids: &[&str]) -> Result<(), Box<dyn Error>> {
    let mut params = json!({ "source": VIEW_SOURCE, "label": "attention" });
    if !hidden_pane_ids.is_empty() {
        params["filter"] = json!({
            "op": "not",
            "filter": { "op": "in", "field": "pane_id", "values": hidden_pane_ids },
        });
    }
    herdr_request("agent.view.set", params)?;
    Ok(())
}

fn focus_agent(agent: &Agent) -> Result<(), Box<dyn Error>> {
    herdr_request("agent.focus", json!({ "target": agent.pane_id }))?;
    Ok(())
}

fn focus_next(_agents: &[Agent], needing_human: &[&Agent]) -> Result<(), Box<dyn Error>> {
    match needing_human.first() {
        Some(agent) => focus_agent(agent),
        None => Ok(()),
    }
}

fn sync_after_status_change(
    agents: &[Agent],
    needing_human: &[&Agent],
) -> Result<(), Box<dyn Error>> {
    let human_is_waiting_on_focused = agents
        .iter()
        .any(|agent| agent.focused && agent.agent_status == AgentStatus::Working);
    match needing_human.first() {
        Some(agent) if human_is_waiting_on_focused => focus_agent(agent),
        _ => Ok(()),
    }
}

fn run(command: Option<&str>) -> Result<(), Box<dyn Error>> {
    let command = match command {
        Some("next") => focus_next,
        Some("sync") => sync_after_status_change,
        _ => return Err("usage: attention-router next|sync".into()),
    };
    let agents = list_agents()?;
    let queue = human_queue(&agents);
    apply_agent_view(&queue.hidden_pane_ids)?;
    command(&agents, &queue.needing_human)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Err(error) = run(args.get(1).map(String::as_str)) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
