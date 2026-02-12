const WebSocket = require("ws");
const https = require("https");
const fs = require("fs");
const path = require("path"); 
const { validateCredentials } = require("./auth/authService");
const publicDir = path.join(__dirname, "../../public");

const sessions = new Map(); // ws key, value has username
const PORT = 8080;

/*Security limits*/
const MAX_FRAME_BYTES = 8 * 1024; // Max bytes per incoming message
const MAX_CHAT_CHARS = 500; // Max characters for chat text
const HEARTBEAT_MS = 30_000; // Ping interval

/*Rate limit settings*/
const CHAT_WINDOW_MS = 10_000; // Chat window time
const CHAT_MAX_MSGS = 10; // Chat max messages per window
const AUTH_WINDOW_MS = 60_000; // Auth window time
const AUTH_MAX_TRIES = 5; // Auth max attempts per window

const chatRate = new Map();
const authRate = new Map();

/* Create HTTPS server */
const httpsServer = https.createServer(
  {
    // loads self-signed cert and key from file
    cert: fs.readFileSync(path.join(__dirname, "/server.cert")),
    key: fs.readFileSync(path.join(__dirname, "/server.key")),
  },
  (request, response) => {

    let filePath = path.join(publicDir, request.url);
  

  // if connecting to http://localhost:8080/ will land on login page
  if (request.url === "/") {
  filePath = path.join(publicDir, "login.html");
  }

    // reads requested file
    fs.readFile(filePath, (err, data) => {
      // error if file not found
      if (err) {
        response.statusCode = 404;
        return response.end("Not Found");
      }

      // Sets content type
      const ext = path.extname(filePath);
      
      // only handles html, css, js
      if (ext === ".html") response.setHeader("Content-Type", "text/html");
      if (ext === ".css") response.setHeader("Content-Type", "text/css");
      if (ext === ".js") response.setHeader("Content-Type", "application/javascript");

      response.end(data);
    });
  }
);


const wss = new WebSocket.Server({
  server: httpsServer,
  maxPayload: MAX_FRAME_BYTES,
});

httpsServer.listen(PORT, () => {
  console.log(`WebSocket server running on wss://localhost:${PORT}`);
});

/*Get client IP*/
function getClientIp(req, ws) {
  return req?.socket?.remoteAddress || ws?._socket?.remoteAddress || "unknown";
}

/*Get username from session, or null*/
function getUsername(ws) {
  return sessions.get(ws)?.username ?? null;
}

/*Check if user is authenticated*/
function isAuthed(ws) {
  return sessions.has(ws);
}

/*Send JSON safely to one client*/
function safeSend(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}

/*Send JSON to all connected clients*/
function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {}
    }
  }
}

/*Send error then close the connection*/
function closeWithError(ws, message, code = 1008) {
  safeSend(ws, { type: "error", message });
  try {
    ws.close(code, message);
  } catch {}
}

/*Fixed window rate limit check*/
function checkRateLimit(map, key, windowMs, maxCount) {
  const now = Date.now();
  const entry = map.get(key);

  // If first request
  if (!entry) {
    map.set(key, { windowStart: now, count: 1 });
    return { limited: false };
  }

  // If window expired
  if (now - entry.windowStart >= windowMs) {
    entry.windowStart = now;
    entry.count = 1;
    return { limited: false };
  }

  // If same window
  entry.count += 1;

  // If over limit
  if (entry.count > maxCount) {
    const retryInMs = windowMs - (now - entry.windowStart);
    return { limited: true, retryInMs };
  }

  // If under limit
  return { limited: false };
}

/*Cleanup old rate limit entries*/
setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of chatRate.entries()) {
    // If entry too old
    if (now - entry.windowStart > CHAT_WINDOW_MS * 3) {
      chatRate.delete(key);
    }
  }

  for (const [key, entry] of authRate.entries()) {
    // If entry too old
    if (now - entry.windowStart > AUTH_WINDOW_MS * 3) {
      authRate.delete(key);
    }
  }
}, 60_000);

/*Handle new WebSocket connection*/
wss.on("connection", (ws, req) => {
  const ip = getClientIp(req, ws);
  console.log("Client connected");

  /*Heartbeat init*/
  ws.isAlive = true;
  /*Heartbeat pong*/
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  /*Handle incoming message*/
  ws.on("message", (data, isBinary) => {
    // If binary message
    if (isBinary) {
      return closeWithError(ws, "Binary messages not allowed");
    }

    const raw = data.toString("utf8");

    // If message too large
    if (raw.length > MAX_FRAME_BYTES) {
      return closeWithError(ws, "Message too large");
    }

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return safeSend(ws, { type: "error", message: "Invalid JSON" });
    }

    // If bad message object
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      return safeSend(ws, { type: "error", message: "Invalid message format" });
    }

    const type = msg.type;

    // If missing type
    if (typeof type !== "string") {
      return safeSend(ws, { type: "error", message: "Missing message type" });
    }

    // If unknown type
    if (type !== "auth" && type !== "chat") {
      return safeSend(ws, { type: "error", message: "Unknown message type" });
    }

    /*AUTH*/
    if (type === "auth") {
      const authKey = `ip:${ip}`;
      const authRL = checkRateLimit(authRate, authKey, AUTH_WINDOW_MS, AUTH_MAX_TRIES);

      // If too many auth tries
      if (authRL.limited) {
        return safeSend(ws, {
          type: "auth_fail",
          message: `Too many attempts. Try again in ${Math.ceil(authRL.retryInMs / 1000)}s.`,
        });
      }

      const username = typeof msg.username === "string" ? msg.username.trim() : "";
      const password = typeof msg.password === "string" ? msg.password : "";

      // If bad username
      if (!username || username.length > 32) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      // If bad password
      if (!password || password.length > 128) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      // If already authed
      if (isAuthed(ws)) {
        return safeSend(ws, { type: "error", message: "Already authenticated" });
      }

      const ok = validateCredentials(username, password);

      // If login fails
      if (!ok) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      sessions.set(ws, { username });
      safeSend(ws, { type: "auth_ok", message: `Welcome ${username}` });
      broadcast({ type: "System", message: `${username} joined` });
      return;
    }

    /*AUTH REQUIRED*/
    // If not logged in
    if (!isAuthed(ws)) {
      return safeSend(ws, { type: "error", message: "Not authenticated" });
    }

    /*CHAT*/
    if (type === "chat") {
      const username = getUsername(ws);
      const chatKey = username ? `user:${username}` : `ip:${ip}`;

      const chatRL = checkRateLimit(chatRate, chatKey, CHAT_WINDOW_MS, CHAT_MAX_MSGS);

      // If too many chat messages
      if (chatRL.limited) {
        return safeSend(ws, {
          type: "error",
          message: `Rate limit: slow down. Try again in ${Math.ceil(chatRL.retryInMs / 1000)}s.`,
        });
      }

      const text = typeof msg.message === "string" ? msg.message.trim() : "";

      // If empty chat
      if (!text) return;

      // If chat too long
      if (text.length > MAX_CHAT_CHARS) {
        return safeSend(ws, { type: "error", message: "Message too long" });
      }

      const from = getUsername(ws);
      broadcast({ type: "chat", from, message: text, ts: Date.now() });
    }
  });

  /*Handle disconnect*/
  ws.on("close", () => {
    const username = getUsername(ws);
    sessions.delete(ws);
    console.log("Client disconnected");

    // If had username
    if (username) {
      broadcast({ type: "System", message: `${username} left` });
    }
  });

  /*Handle socket error*/
  ws.on("error", (err) => {
    console.error("Socket error:", err.message);
  });
});

/*Heartbeat loop*/
setInterval(() => {
  for (const client of wss.clients) {
    // If no pong
    if (client.isAlive === false) {
      try { client.terminate(); } catch {}
      continue;
    }

    // Send ping
    client.isAlive = false;
    try { client.ping(); } catch {}
  }
}, HEARTBEAT_MS);