// AllerGerald trial signup endpoint — Netlify Function.
// POST { name, restaurant, email } (site also sends product + startedAt)
// Fire-and-forget from the site: always answer 200 quickly, never block the trial.
// Notifies the owner on Telegram. Secrets come from Netlify env vars only —
// BOT_TOKEN and OWNER_CHAT_ID. No token or key value is stored in this file.

const OWNER_CHAT_ID_FALLBACK = 7498186985;

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

exports.handler = async (event) => {
  const method = event.httpMethod || "GET";
  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST", "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  let body = event.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const name = String(body.name || "").trim();
  const restaurant = String(body.restaurant || "").trim();
  const email = String(body.email || "").trim();

  if (!name || !restaurant || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "name, restaurant and a valid email are required" }),
    };
  }

  const token = process.env.BOT_TOKEN;
  const ownerChatId = process.env.OWNER_CHAT_ID || OWNER_CHAT_ID_FALLBACK;
  if (token) {
    const text =
      "🛡️ <b>New AllerGerald trial started</b>\n\n" +
      "<b>Name:</b> " + escapeHtml(name) + "\n" +
      "<b>Restaurant:</b> " + escapeHtml(restaurant) + "\n" +
      "<b>Email:</b> " + escapeHtml(email) + "\n" +
      (body.startedAt ? "<b>Started:</b> " + escapeHtml(body.startedAt) + "\n" : "") +
      "\nI checked it twice. Promise.";
    try {
      await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: ownerChatId, text, parse_mode: "HTML" }),
      });
    } catch (e) {
      // Signup still counts as started on the site; never fail the request
      // because the owner notification failed.
      console.error("AllerGerald signup notify failed:", e && e.message ? e.message : e);
    }
  } else {
    console.error("AllerGerald signup: BOT_TOKEN not set, owner notification skipped.");
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
