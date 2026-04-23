export interface WizardAnswers {
  language: "python" | "typescript" | "javascript" | "other";
  framework: "langchain" | "llamaindex" | "crewai" | "openai" | "anthropic" | "autogen" | "other";
  llm_providers: string[];   // multi-select
  agent_type: "single" | "multi" | "rag" | "workflow" | "chatbot";
  tool_types: string[];      // multi-select
  codebase_context: string;  // freeform paste
}

const SDK_INSTALL: Record<WizardAnswers["language"], string> = {
  python:     "pip install dottle-sdk",
  typescript: "npm install dottle-js-sdk",
  javascript: "npm install dottle-js-sdk",
  other:      "pip install dottle-sdk   # or npm install dottle-js-sdk",
};

const FRAMEWORK_INSTRUCTIONS: Record<WizardAnswers["framework"], string> = {
  langchain: `
### LangChain instrumentation (use the built-in callback handler — zero manual spans needed)

\`\`\`python
from dottle.integrations.langchain import DottleCallbackHandler
handler = DottleCallbackHandler()

# Attach to your LLM
llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])

# Attach to your AgentExecutor / chain
agent_executor = AgentExecutor(agent=agent, tools=tools, callbacks=[handler])

# Wrap the top-level invocation in a Dottle session
with dottle.session("agent-name", user_id="optional-user-id") as sid:
    result = agent_executor.invoke({"input": user_query})
\`\`\`

The handler automatically tracks every LLM call (tokens, cost, latency) and every tool call (input, output, errors).
For LangGraph: pass \`{"callbacks": [handler]}\` as the config argument to \`app.invoke()\`.`,

  llamaindex: `
### LlamaIndex instrumentation

\`\`\`python
import dottle

with dottle.session("llamaindex-agent") as sid:

    # Track query engine calls
    with dottle.span("retrieval", "vector_query") as s:
        nodes = retriever.retrieve(query)

    # Track LLM synthesis
    with dottle.span("llm", "gpt-4o-synthesis") as s:
        response = query_engine.query(query)
        # If you have token access: s.record_tokens(input_tokens, output_tokens, "gpt-4o")
\`\`\``,

  crewai: `
### CrewAI instrumentation

\`\`\`python
import dottle

with dottle.session("crewai-run", metadata={"crew": "research-crew"}) as sid:

    # Wrap each agent task execution
    with dottle.span("agent", "researcher_agent") as s:
        result = crew.kickoff(inputs={"topic": topic})

    # If you access LLM directly, track it too
    with dottle.span("llm", "gpt-4o") as s:
        response = llm.call(messages)
        s.record_tokens(response.usage.prompt_tokens, response.usage.completion_tokens, "gpt-4o")
\`\`\``,

  autogen: `
### AutoGen instrumentation

\`\`\`python
import dottle

with dottle.session("autogen-conversation") as sid:
    # Wrap the initiate_chat call
    with dottle.span("agent", "multi-agent-chat") as s:
        result = user_proxy.initiate_chat(
            assistant,
            message=user_message,
            max_turns=10,
        )
\`\`\``,

  openai: `
### OpenAI API instrumentation

\`\`\`python
import dottle

with dottle.session("agent-name", user_id="optional-user-id") as sid:

    # Wrap every completion call
    with dottle.span("llm", "gpt-4o") as s:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
        )
        s.record_tokens(
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            "gpt-4o",
        )

    # Wrap every tool call
    with dottle.span("tool", "tool_name") as s:
        result = my_tool(args)
\`\`\``,

  anthropic: `
### Anthropic API instrumentation

\`\`\`python
import dottle

with dottle.session("claude-agent", user_id="optional-user-id") as sid:

    with dottle.span("llm", "claude-3-5-sonnet") as s:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=messages,
        )
        s.record_tokens(
            response.usage.input_tokens,
            response.usage.output_tokens,
            "claude-3-5-sonnet-20241022",
        )

    with dottle.span("tool", "tool_name") as s:
        result = my_tool(args)
\`\`\``,

  other: `
### Manual instrumentation

\`\`\`python
import dottle

with dottle.session("agent-name") as sid:

    with dottle.span("llm", "model-name") as s:
        response = your_llm_call(prompt)
        s.record_tokens(input_tokens, output_tokens, "model-name")

    with dottle.span("tool", "tool-name") as s:
        result = your_tool(args)

    with dottle.span("retrieval", "vector-search") as s:
        docs = your_vector_db.query(embedding)
\`\`\``,
};

const JS_FRAMEWORK_NOTE = `
### JavaScript / TypeScript instrumentation

\`\`\`typescript
import dottle from "dottle-js-sdk";

dottle.configure({ apiKey: process.env.DOTTLE_API_KEY });

const sessionId = await dottle.startSession("agent-name", {
  userId: "optional-user-id",
});

try {
  const span = await dottle.startSpan(sessionId, "llm", "gpt-4o");
  const response = await openai.chat.completions.create({ model: "gpt-4o", messages });
  await dottle.endSpan(span.id, {
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    model: "gpt-4o",
  });
} finally {
  await dottle.endSession(sessionId, { status: "completed" });
}
\`\`\``;

function toolInstructions(tools: string[]): string {
  const map: Record<string, string> = {
    web_search:     "web search calls (e.g. Tavily, SerpAPI, Exa)",
    database:       "database queries (SQL queries, ORM calls)",
    file_system:    "file system operations (read/write files)",
    external_apis:  "external API calls (HTTP requests to third-party services)",
    code_execution: "code execution (e.g. Python REPL, subprocess calls)",
    email_slack:    "messaging/email sends (Slack, email, webhooks)",
  };
  const selected = tools.filter(t => t in map).map(t => map[t]);
  if (!selected.length) return "";
  return `\nTrack these specific tool calls with \`dottle.span("tool", "tool_name")\`:\n${selected.map(t => `- ${t}`).join("\n")}`;
}

function multiAgentNote(agentType: string): string {
  if (agentType !== "multi") return "";
  return `\n
### Multi-agent system
For each sub-agent, open a child span with type \`"agent"\`:
\`\`\`python
with dottle.span("agent", "sub-agent-name") as s:
    result = sub_agent.run(task)
\`\`\`
This creates a nested trace so you can see which agent triggered which LLM call.`;
}

function ragNote(agentType: string): string {
  if (agentType !== "rag") return "";
  return `\n
### RAG pipeline
Always track retrieval steps separately so latency is attributed correctly:
\`\`\`python
with dottle.span("retrieval", "vector_search") as s:
    docs = vector_db.query(embedding, top_k=5)
    s.set_attribute("num_docs", len(docs))
\`\`\``;
}

export function generatePrompt(answers: WizardAnswers, apiKey: string): string {
  const isJS = answers.language === "typescript" || answers.language === "javascript";
  const install = SDK_INSTALL[answers.language];
  const framework = isJS ? JS_FRAMEWORK_NOTE : FRAMEWORK_INSTRUCTIONS[answers.framework];
  const toolNote = isJS ? "" : toolInstructions(answers.tool_types);
  const multiNote = isJS ? "" : multiAgentNote(answers.agent_type);
  const ragNote2 = isJS ? "" : ragNote(answers.agent_type);

  const contextSection = answers.codebase_context.trim()
    ? `\n## Codebase / Agent Details (provided by the developer)\n\n${answers.codebase_context.trim()}\n`
    : "";

  return `# Task: Add Dottle AI Observability to This Codebase

You are an expert software engineer. Your job is to integrate the Dottle SDK into this AI agent codebase so that every LLM call, tool call, and agent session is automatically tracked in the Dottle dashboard.

## Developer's stack
- Language: ${answers.language}
- AI Framework: ${answers.framework}
- LLM provider(s): ${answers.llm_providers.join(", ")}
- Agent type: ${answers.agent_type}
- Tools used: ${answers.tool_types.length ? answers.tool_types.join(", ") : "none specified"}
${contextSection}
## Step 1 — Install the SDK

\`\`\`bash
${install}
\`\`\`

## Step 2 — Add the API key to environment

Add this to \`.env\` (or your secrets manager):
\`\`\`
DOTTLE_API_KEY=${apiKey}
\`\`\`

${isJS ? "" : `## Step 3 — Configure Dottle at startup

Find the main entry point (e.g. \`main.py\`, \`agent.py\`, \`run.py\`) and add at the top:

\`\`\`python
import os
import dottle

dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])
\`\`\`

Only call \`dottle.configure()\` once, at application startup — not inside a loop or per-request function.

`}## ${isJS ? "Step 3" : "Step 4"} — Add instrumentation
${framework}
${toolNote}
${multiNote}
${ragNote2}

## ${isJS ? "Step 4" : "Step 5"} — What to look for when reading the codebase

1. Find the main agent entry point — the function that orchestrates the agent run
2. Find every place an LLM is called (look for \`create()\`, \`invoke()\`, \`generate()\`, \`complete()\`, \`stream()\`)
3. Find every tool/function call that accesses external services
4. Find any vector DB or retrieval calls
5. Check for existing session/context management that the Dottle session should wrap

## Rules
- Keep changes **minimal** — don't restructure existing code, only add Dottle wrapping
- Do NOT mock or stub Dottle calls — use the real SDK
- If a function already has try/except, add Dottle inside it
- For async code, all Dottle context managers work with \`async with\` too
- Test with \`dottle.configure(debug=True)\` to see flush logs in the terminal

## Verify it works

After making changes, run the agent once and check:
- Terminal shows \`Flushed N spans\` (with debug=True)
- Dashboard shows the session at https://app.dottle.dev/sessions

That's it — the instrumentation should now be live.`;
}
