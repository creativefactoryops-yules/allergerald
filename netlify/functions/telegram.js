// AllerGerald Telegram webhook — Netlify Function.
// Port of the Gemini bot (allergerald-1_35_wwta.py, Gemini 2.5-flash).
// Polling removed: Telegram delivers updates here via webhook POST.
// Webhook target:
//   https://allergen-freebot.netlify.app/.netlify/functions/telegram
// Secrets come from Netlify env vars only — BOT_TOKEN and GEMINI_API_KEY.
// No token or key value is stored in this file.
//
// Netlify Functions format: exports.handler = async (event, context) => ...
// NOTE: serverless functions are stateless, so /myallergies profiles live in
// an in-memory Map that may not survive across invocations. Treat a saved
// profile as best-effort; always ask for allergens again when unsure.

const SYSTEM = `You are Allergerald, an expert AI food allergy safety coordinator \
and allergen-free dining consultant operating in Telegram as @Allergenfreebot.

Your mission: remove anxiety and risk from dining with food allergies by acting \
as the intelligent intermediary between guests, restaurant staff, and kitchen teams.

WHO YOU SERVE:
1. DINERS — identify safe menu items, draft allergy cards, understand \
cross-contamination risks, prep for restaurant conversations.
2. RESTAURANT TEAMS — build allergy protocols, train staff, create allergen \
menus, handle guest requests safely.

PERSONALITY: Warm, calm, reassuring but thorough. Like a knowledgeable friend \
not a clinical form. Direct and practical. Slightly neurotic in the best way — \
you always double-check. Catchphrase: "I checked it twice. Promise."

THE 14 MAJOR ALLERGENS (EU/UK Natasha's Law):
milk, eggs, fish, shellfish, tree nuts, peanuts, wheat/gluten, soybeans, \
sesame, mustard, celery, lupin, molluscs, sulphites

SAFETY RULES (CRITICAL):
- Always recommend users verify directly with restaurant staff regardless of \
what you advise.
- Never claim certainty about cross-contamination — always caveat.
- For life-threatening reactions: immediately tell user to call emergency \
services / use EpiPen. Do not attempt to diagnose or treat.
- You are an informational tool, not medical advice.

Keep responses under 300 words. Use bullet points where helpful. \
Use these emoji for clarity: 🛡️ safety, ✅ safe, ❌ danger, ⚠️ caution.`;

// Best-effort per-user allergy profiles (see note above).
const allergyProfiles = new Map();

async function askGemini(userMessage) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return "⚠️ Allergerald isn't fully set up yet — the bot owner still needs to add the Gemini API key. (I checked it twice. Promise.)";
  }
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: SYSTEM + "\n\nUser: " + userMessage }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
        }),
      }
    );
    const data = await r.json();
    const text = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) throw new Error("Empty Gemini response: " + JSON.stringify(data).slice(0, 300));
    return text.trim();
  } catch (e) {
    console.error("Gemini API error:", e && e.message ? e.message : e);
    return "⚠️ Allergerald hit a snag — please try again in a moment. (I double-checked and it's still acting up, sorry!)";
  }
}

async function sendMessage(chatId, text, parseMode) {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN not set, cannot reply to Telegram chat", chatId);
    return;
  }
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  try {
    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Telegram sendMessage failed:", e && e.message ? e.message : e);
  }
}

async function sendChatAction(chatId, action) {
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  try {
    await fetch("https://api.telegram.org/bot" + token + "/sendChatAction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (e) { /* typing indicator is best-effort */ }
}

const HELP_TEXT =
  "🆘 *Allergerald Commands*\n\n" +
  "*For diners*\n" +
  "/start — Meet Allergerald\n" +
  "/myallergies — Save your allergy profile\n" +
  "/diningcard — Generate your dining allergy card\n" +
  "/kitchenticket — Make a kitchen alert card\n" +
  "/findsafe — Tips for finding allergy-aware restaurants\n\n" +
  "*For restaurants*\n" +
  "/protocol — Build an allergen-free service protocol\n" +
  "/audit — Run a safety audit checklist\n\n" +
  "*Other*\n" +
  "/donate — Support Allergerald\n" +
  "/help — This message\n\n" +
  "Or just type any allergy question! 🛡️";

async function handleCommand(chatId, userId, command, args, firstName) {
  firstName = firstName || "friend";
  switch (command) {
    case "start": {
      await sendMessage(
        chatId,
        "Hey " + firstName + "! Allergerald here. 🛡️\n\n" +
          "Your personal food allergy safety companion.\n\n" +
          "I can help you:\n" +
          "✅ Check menus for your allergens\n" +
          "✅ Write your dining allergy card\n" +
          "✅ Prep scripts for talking to kitchen staff\n" +
          "✅ Build restaurant allergy protocols\n\n" +
          "Are you a *diner* or part of a *restaurant team*? " +
          "Just tell me, or type /help to see all commands.\n\n" +
          "_I checked it twice. Promise._ 🧷",
        "Markdown"
      );
      await sendMessage(
        chatId,
        "⚠️ Quick note: I'm an informational tool, not a medical professional. " +
          "Always verify allergen info directly with restaurant staff. " +
          "In an emergency, call emergency services immediately."
      );
      return;
    }
    case "help":
      await sendMessage(chatId, HELP_TEXT, "Markdown");
      return;
    case "myallergies": {
      if (args) {
        allergyProfiles.set(userId, args);
        await sendMessage(
          chatId,
          "✅ Got it — saved your allergy profile:\n*" + args + "*\n\n" +
            "I'll use this for /diningcard and /kitchenticket. " +
            "I checked it twice. Promise. 🧷",
          "Markdown"
        );
      } else {
        const saved = allergyProfiles.get(userId);
        if (saved) {
          await sendMessage(
            chatId,
            "Your saved allergy profile:\n*" + saved + "*\n\n" +
              "To update: /myallergies severe peanut, mild dairy",
            "Markdown"
          );
        } else {
          await sendMessage(
            chatId,
            "No allergy profile saved yet.\n\n" +
              "Send it like this:\n" +
              "/myallergies severe peanut, mild dairy, anaphylactic shellfish"
          );
        }
      }
      return;
    }
    case "diningcard": {
      const allergies = allergyProfiles.get(userId) || "";
      const prompt =
        "Generate a clear dining allergy card for someone to screenshot and " +
        "show to restaurant staff. " +
        (allergies
          ? "Their allergy profile: " + allergies + "."
          : "Ask them for their allergens and severity first, then generate the card.");
      await sendChatAction(chatId, "typing");
      const reply = await askGemini(prompt);
      await sendMessage(chatId, "🍽️ *Dining Allergy Card*\n\n" + reply, "Markdown");
      return;
    }
    case "kitchenticket": {
      const allergies = args || allergyProfiles.get(userId) || "";
      if (!allergies) {
        await sendMessage(
          chatId,
          "I need your allergy info first!\n\n" +
            "Either run /myallergies first, or:\n" +
            "/kitchenticket severe shellfish, mild gluten"
        );
        return;
      }
      const prompt =
        "Generate a clear kitchen allergy alert ticket for: " + allergies + ". " +
        "Format it for easy reading by kitchen staff — flag life-threatening " +
        "allergens prominently, note cross-contamination risks. Keep it concise.";
      await sendChatAction(chatId, "typing");
      const reply = await askGemini(prompt);
      await sendMessage(chatId, "🚨 *Kitchen Alert Ticket*\n\n" + reply, "Markdown");
      return;
    }
    case "findsafe": {
      const allergies = allergyProfiles.get(userId) || "";
      const prompt =
        "Help someone find an allergy-aware restaurant. " +
        (args ? "They're looking for: " + args + ". " : "") +
        (allergies ? "Their allergy profile: " + allergies + ". " : "") +
        "Give them: (1) questions to ask when calling ahead, " +
        "(2) red and green flags to look for, (3) practical tips. " +
        "Keep it concise.";
      await sendChatAction(chatId, "typing");
      await sendMessage(chatId, await askGemini(prompt));
      return;
    }
    case "protocol": {
      const venue = args || "a general restaurant";
      const prompt =
        "Build a numbered allergen-free service protocol for: " + venue + ". " +
        "Cover cross-contamination prevention, ingredient checking, " +
        "communication chain from server to kitchen to manager, " +
        "and what to do if a mistake happens. Keep it concise and actionable.";
      await sendChatAction(chatId, "typing");
      const reply = await askGemini(prompt);
      await sendMessage(chatId, "📐 *Allergen-Free Service Protocol*\n\n" + reply, "Markdown");
      return;
    }
    case "audit": {
      const venue = args || "a general restaurant";
      const prompt =
        "Create a self-audit checklist for allergy safety at: " + venue + ". " +
        "Format as a checklist covering kitchen practices, staff training, " +
        "labeling, and guest communication. Keep it concise and actionable.";
      await sendChatAction(chatId, "typing");
      const reply = await askGemini(prompt);
      await sendMessage(chatId, "✅ *Allergy Safety Audit*\n\n" + reply, "Markdown");
      return;
    }
    case "donate":
      await sendMessage(
        chatId,
        "Love Allergerald? Keep it running! 🧷\n\n" +
          "Ko-fi: https://ko-fi.com/creativefactory\n\n" +
          "Even $3 covers server costs. Thank you!\n" +
          "Built with love by CreativeFactory.studio"
      );
      return;
    default:
      await sendMessage(chatId, HELP_TEXT, "Markdown");
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod || "GET";

  // Health check: GET returns plain ok so the endpoint can be verified live.
  if (method === "GET") {
    return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "ok" };
  }
  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "GET, POST", "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  let update = event.body;
  if (typeof update === "string") {
    try { update = JSON.parse(update); } catch (e) { update = {}; }
  }
  update = update || {};

  // Always ack Telegram fast; work continues after the ack is returned.
  // (Netlify Functions don't support background work after return, so the
  // reply work runs before we return — unlike the Vercel version.)
  try {
    const message = (update && update.message) || {};
    const chatId = message.chat && message.chat.id;
    const userId = message.from && message.from.id;
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (chatId && text) {
      if (text.startsWith("/")) {
        const parts = text.split(/\s+/);
        const command = parts[0].replace(/^\//, "").split("@")[0].toLowerCase();
        const args = parts.slice(1).join(" ").trim();
        const firstName = (message.from && message.from.first_name) || "friend";
        await handleCommand(chatId, userId, command, args, firstName);
      } else {
        const allergies = allergyProfiles.get(userId) || "";
        const prompt = (allergies ? "(User allergy profile: " + allergies + ")\n\n" : "") + text;
        await sendChatAction(chatId, "typing");
        await sendMessage(chatId, await askGemini(prompt));
      }
    }
  } catch (e) {
    console.error("AllerGerald webhook error:", e && e.message ? e.message : e);
  }

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
};
