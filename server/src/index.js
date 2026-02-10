const WebSocket = require("ws");
const { validateCredentials } = require("./auth/authService");
const sessions = new Map(); // ws -> { username }
const PORT = 8080;

// Hard limits (security)
const MAX_FRAME_BYTES = 8 * 1024; // 8KB max per incoming WS message
const MAX_CHAT_CHARS = 500;

const wss = new WebSocket.Server({
  port: PORT,
  maxPayload: MAX_FRAME_BYTES, // ws will reject oversized frames
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);

function safeSend(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // Don't crash server if send fails
  }
}

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // ignore send failures
      }
    }
  }
}

function getUsername(ws) {
  return sessions.get(ws)?.username ?? null;
}

function isAuthed(ws) {
  return sessions.has(ws);
}

function closeWithError(ws, message, code = 1008) {
  // 1008 = Policy Violation (good for security rejects)
  safeSend(ws, { type: "error", message });
  try {
    ws.close(code, message);
  } catch {}
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (data, isBinary) => {
    // Reject binary frames for this assignment (keep protocol simple + safer)
    if (isBinary) {
      return closeWithError(ws, "Binary messages not allowed");
    }

    const raw = data.toString("utf8");

    // Extra sanity check (even though maxPayload exists)
    if (raw.length > MAX_FRAME_BYTES) {
      return closeWithError(ws, "Message too large");
    }

    // Parse JSON safely
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return safeSend(ws, { type: "error", message: "Invalid JSON" });
    }

    // Validate envelope
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      return safeSend(ws, { type: "error", message: "Invalid message format" });
    }

    const type = msg.type;
    if (typeof type !== "string") {
      return safeSend(ws, { type: "error", message: "Missing message type" });
    }

    // Allowlist message types
    if (type !== "auth" && type !== "chat") {
      return safeSend(ws, { type: "error", message: "Unknown message type" });
    }

    // 1) AUTH
    if (type === "auth") {
      const username = typeof msg.username === "string" ? msg.username.trim() : "";
      const password = typeof msg.password === "string" ? msg.password : "";

      // Basic input validation
      if (!username || username.length > 32) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }
      if (!password || password.length > 128) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      // If already authed, do not re-auth (prevents session confusion)
      if (isAuthed(ws)) {
        return safeSend(ws, { type: "error", message: "Already authenticated" });
      }

      const ok = validateCredentials(username, password);
      if (!ok) {
        // Do not reveal whether username exists
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      sessions.set(ws, { username });
      safeSend(ws, { type: "auth_ok", message: `Welcome ${username}` });
      broadcast({ type: "System", message: `${username} joined` });
      return;
    }

    // 2) Block chat until authenticated
    if (!isAuthed(ws)) {
      return safeSend(ws, { type: "error", message: "Not authenticated" });
    }

    // 3) CHAT
    if (type === "chat") {
      const text = typeof msg.message === "string" ? msg.message.trim() : "";
      if (!text) return; // ignore empty
      if (text.length > MAX_CHAT_CHARS) {
        return safeSend(ws, { type: "error", message: "Message too long" });
      }

      const from = getUsername(ws);
      broadcast({ type: "chat", from, message: text, ts: Date.now() });
    }
  });

  ws.on("close", () => {
    const username = getUsername(ws);
    sessions.delete(ws);
    console.log("Client disconnected");
    if (username) {
      broadcast({ type: "System", message: `${username} left` });
    }
  });

  ws.on("error", () => {
    
  });
});