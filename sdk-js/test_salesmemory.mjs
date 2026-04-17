// Test the JS SDK against SalesmemoryAgent project
// Run: node test_salesmemory.mjs

import agentloop from "./dist/index.js";

agentloop.configure({
  apiKey: "alp_live_mKCacIJyquHiGd4lrXV3aCIc2wMe4FUqJU7XlmK9td4",
  apiUrl: "http://localhost:8000/api/v1",
  debug: true,
});

// ── Mock LLM client (mirrors OpenAI SDK response shape) ──────────────────────
const mockOpenAI = {
  chat: {
    completions: {
      create: async ({ model, messages }) => {
        // Simulate latency
        await new Promise((r) => setTimeout(r, 100));
        const lastMsg = messages[messages.length - 1]?.content ?? "";
        return {
          id: `chatcmpl-${Date.now()}`,
          model,
          choices: [{ message: { role: "assistant", content: `AI response to: "${lastMsg.slice(0, 40)}..."` } }],
          usage: { prompt_tokens: 380, completion_tokens: 140 },
        };
      },
    },
  },
};

// Wrap once — all calls inside a session are auto-traced
const openai = agentloop.wrapOpenAI(mockOpenAI);

console.log("\n=== Test 1: Successful session (JS SDK + wrapOpenAI) ===");
await agentloop.session(
  "salesmemory-js-agent",
  async (sid) => {
    console.log(`  session_id: ${sid}`);

    // This is automatically traced — no manual span needed
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a sales AI agent." },
        { role: "user", content: "Qualify this lead: Acme Corp, 200 employees, budget $30k." },
      ],
    });
    console.log(`  LLM response: ${res.choices[0].message.content}`);

    // Manual tool span
    await agentloop.span("tool", "crm_write", async (s) => {
      await new Promise((r) => setTimeout(r, 50));
      s.setAttribute("action", "upsert_contact");
      s.setAttribute("company", "Acme Corp");
    });

    // Another LLM call — auto-traced
    await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Draft a follow-up email for Acme Corp." }],
    });
  },
  {
    userId: "js_user_001",
    userEmail: "eve@techco.com",
    tags: ["prod", "js-sdk"],
    agentVersion: "1.0.0",
  },
);
console.log("  ✓ Done\n");

console.log("=== Test 2: Failed session ===");
try {
  await agentloop.session(
    "salesmemory-js-agent",
    async (sid) => {
      console.log(`  session_id: ${sid}`);
      await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Research competitor pricing." }],
      });
      await agentloop.span("tool", "competitor_api", async (s) => {
        throw new Error("API rate limit exceeded: 429");
      });
    },
    { userEmail: "frank@startup.io", tags: ["prod", "js-sdk"], agentVersion: "1.0.0" },
  );
} catch {
  // expected
}
console.log("  ✓ Done\n");

console.log("All JS SDK tests complete!");
console.log("Open http://localhost:3000/sessions to see the results.");
