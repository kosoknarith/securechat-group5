const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { validateCredentials, register } = require("./auth/authService");
const { setUser, getUsername, clearUser, isAuthed, listOnlineUsers, getSocketsByUsername } = require("./auth/sessionStore");
const { validateUsername, getPublicKey } = require("./auth/userStore");
const publicDir = path.join(__dirname, "../../public");

const PORT = process.env.PORT || 8080;

/*Security limits*/
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FRAME_BYTES = 8 * 1024 * 1024; // Max bytes per incoming message
const MAX_CHAT_CHARS = 500; // Max characters for chat text
const HEARTBEAT_MS = 30_000; // Ping interval

/*Rate limit settings*/
const CHAT_WINDOW_MS = 10_000; // Chat window time
const CHAT_MAX_MSGS = 10; // Chat max messages per window
const AUTH_WINDOW_MS = 60_000; // Auth window time
const AUTH_MAX_TRIES = 5; // Auth max attempts per window

const AUTH_USER_WINDOW_MS = 15 * 60_000; // 15 minutes
const AUTH_USER_MAX_TRIES = 8; // per-username attempts/window
const LOCKOUT_MS = 5 * 60_000; // 5 minutes locked after too many failures

const chatRate = new Map();
const authRate = new Map();
const authUserRate = new Map();   // based on the username being attacked
const lockedUsers = new Map();    // locked until timestamp

/* Render HTTP server */
const server = http.createServer((request, response) => {
  // Allow InfinityFree frontend to call Render backend API
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight request
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    return response.end();
  }

  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);

  // Public key lookup for encrypted DM
  if (request.method === "GET" && parsedUrl.pathname === "/public-key") {
    const targetUsername = parsedUrl.searchParams.get("username");

    if (!targetUsername || !validateUsername(targetUsername)) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      return response.end(JSON.stringify({
        message: "Invalid username"
      }));
    }

    const publicKey = getPublicKey(targetUsername);

    if (!publicKey) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json");
      return response.end(JSON.stringify({
        message: "Public key not found"
      }));
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    return response.end(JSON.stringify({
      publicKey
    }));
  }

  let filePath = path.join(
    publicDir,
    parsedUrl.pathname === "/" ? "login.html" : parsedUrl.pathname
  );

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
});


const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_FRAME_BYTES,
});

server.listen(PORT, () => {
  console.log(`SecureChat server running on port ${PORT}`);
});

/*Get client IP*/
function getClientIp(req, ws) {
  return req?.socket?.remoteAddress || ws?._socket?.remoteAddress || "unknown";
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
// Updates User list for all clients
function broadcastUserList() {
  broadcast({ type: "user_list", users: listOnlineUsers() });
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
    if (now - entry.windowStart > AUTH_WINDOW_MS * 3) authRate.delete(key);
  }

  for (const [key, entry] of authUserRate.entries()) {
    if (now - entry.windowStart > AUTH_USER_WINDOW_MS * 3) authUserRate.delete(key);
  }

  for (const [u, until] of lockedUsers.entries()) {
    if (now >= until) lockedUsers.delete(u);
  }
}, 60_000);

/*Handle new WebSocket connection*/
wss.on("connection", (ws, req) => {
  const ip = getClientIp(req, ws);
  ws._loggedIn = false;

  /*Heartbeat init*/
  ws.isAlive = true;
  /*Heartbeat pong*/
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  /*Handle incoming message*/
  ws.on("message", async (data, isBinary) => {
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
    if (type !== "auth" && type !== "register" && type !== "chat" && type !== "file") {
      return safeSend(ws, { type: "error", message: "Unknown message type" });
    }

    /*AUTH + REGISTER*/
    if (type === "auth" || type === "register") {
      const authKey = `ip:${ip}`;
      const authRL = checkRateLimit(authRate, authKey, AUTH_WINDOW_MS, AUTH_MAX_TRIES,);

      // If too many auth tries
      if (authRL.limited) {
        return safeSend(ws, {
          type: "auth_fail",
          message: `Too many attempts. Try again in ${Math.ceil(authRL.retryInMs / 1000)}s.`,
        });
      }

      const username = typeof msg.username === "string" ? msg.username.trim() : "";
      const password = typeof msg.password === "string" ? msg.password : "";
      const publicKey = typeof msg.publicKey === "string" ? msg.publicKey.trim() : "";


      // If bad username
      if (!username || username.length > 32) {
        return safeSend(ws, {type: "auth_fail",
          message: "Authentication failed",
        });
      }

      // If bad password
      if (!password || password.length > 128) {
        return safeSend(ws, { type: "auth_fail", message: "Authentication failed" });
      }

      // If already authed
      if (isAuthed(ws)) {
        return safeSend(ws, {
          type: "error",
          message: "Already authenticated",
        });
      }

      // REGISTER
      if (type === "register") {
        if (!publicKey) {
          return safeSend(ws, {
            type: "register_fail",
            message: "Missing public key",
          });
        }

        const result = await register(username, password, publicKey);
        if (!result?.ok) {
          return safeSend(ws, {
            type: "register_fail",
            message: result?.message || "Registration failed",
          });
        }

        setUser(ws, username);
        if (!ws._loggedIn) {
          ws._loggedIn = true;
          console.log("Client connected");
        }
        safeSend(ws, {
          type: "auth_ok",
          message: `Welcome ${username}`,
          username,
          registered: true,
        });
        broadcast({ type: "System", message: `${username} joined` });
        broadcastUserList();
        return;
      }

      // LOGIN
      const ok = await validateCredentials(username, password);

      // If login fails
      if (!ok) {
        return safeSend(ws, {type: "auth_fail",message: "Authentication failed",
        });
      }

      setUser(ws, username);
      safeSend(ws, { type: "auth_ok", message: `Welcome ${username}`,username });
      broadcast({ type: "System", message: `${username} joined` });
      broadcastUserList();
      return;
    }

    /*AUTH REQUIRED*/
    // If not logged in
    if (!isAuthed(ws)) {
      return safeSend(ws, { type: "error", message: "Not authenticated" });
    }

    /*CHAT*/
    if (type === "chat") {
      const from = getUsername(ws);
      const chatKey = from ? `user:${from}` : `ip:${ip}`;

      const chatRL = checkRateLimit(chatRate, chatKey, CHAT_WINDOW_MS, CHAT_MAX_MSGS);

      // If too many chat messages
      if (chatRL.limited) {
        return safeSend(ws, {
          type: "error",
          message: `Rate limit: slow down. Try again in ${Math.ceil(chatRL.retryInMs / 1000)}s.`,
        });
      }

      const text = msg.message;

      // If empty chat
      if (text === undefined || text === null || text === "" ||
      (typeof text === "object" && Object.keys(text).length === 0)) {
        return;
      }
      
      // Only check length for plain string messages
      if (typeof text === "string" && text.length > MAX_CHAT_CHARS) {
        return safeSend(ws, { type: "error", message: "Message too long" });
      }

      const scope = msg.scope === "dm" ? "dm" : "general";

      if (scope === "general") {
        broadcast({ type: "chat", scope: "general", from, message: text });
        return;
      }

      // DM
      const to = typeof msg.to === "string" ? msg.to.trim() : "";
      if (!validateUsername(to) || to === from) {
        return safeSend(ws, { type: "error", message: "Invalid DM target" });
      }

      const toSockets = getSocketsByUsername(to);

      if (!toSockets || toSockets.size === 0) {
        return safeSend(ws, { type: "error", message: "User is offline" });
      }

      const payload = { type: "chat", scope: "dm", from, to, message: text };

      safeSend(ws, payload);
      sendToSockets(toSockets, payload);
      return;
    }
  if (type === "file") {
  const from = getUsername(ws);

  // Must be authenticated
  if (!from) {
    return safeSend(ws, { type: "error", message: "Not authenticated" });
  }

  // Only allow DM file sharing
  if (msg.scope !== "dm") {
    return safeSend(ws, { type: "error", message: "File sharing is DM only" });
  }

  // Validate recipient
  const to = typeof msg.to === "string" ? msg.to.trim() : "";
  if (!validateUsername(to) || to === from) {
    return safeSend(ws, { type: "error", message: "Invalid file target" });
  }

  // Validate file info
  if (typeof msg.fileName !== "string" || !msg.fileName.trim()) {
    return safeSend(ws, { type: "error", message: "Invalid file name" });
  }

  if (typeof msg.fileType !== "string") {
    return safeSend(ws, { type: "error", message: "Invalid file type" });
  }

  if (typeof msg.fileSize !== "number" || msg.fileSize <= 0) {
    return safeSend(ws, { type: "error", message: "Invalid file size" });
  }

  // Validate encrypted payload
  if (
    !msg.payload ||
    typeof msg.payload.encryptedFile !== "string" ||
    typeof msg.payload.encryptedKey !== "string" ||
    typeof msg.payload.iv !== "string"
  ) {
    return safeSend(ws, { type: "error", message: "Invalid file payload" });
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  if (msg.fileSize > MAX_FILE_SIZE) {
    return safeSend(ws, { type: "error", message: "File too large" });
  }

  const toSockets = getSocketsByUsername(to);

  if (!toSockets || toSockets.size === 0) {
    return safeSend(ws, { type: "error", message: "User is offline" });
  }

  const payload = {
    type: "file",
    scope: "dm",
    from,
    to,
    fileName: msg.fileName,
    fileType: msg.fileType,
    fileSize: msg.fileSize,
    payload: msg.payload,
  };

  // optional echo to sender
  safeSend(ws, payload);

  // send to recipient
  sendToSockets(toSockets, payload);
  return;
 }
  
});
  

/*Handle disconnect*/
ws.on("close", () => {
  const username = getUsername(ws);

  clearUser(ws);

  let noSocketsLeft = false;

  if (ws._loggedIn && username) {
    const remainingSockets = getSocketsByUsername(username);
    noSocketsLeft = !remainingSockets || remainingSockets.size === 0;

    if (noSocketsLeft) {
      console.log("Client disconnected");
    }
  }

  // If had username
  if (username) {
    broadcastUserList();

    // Only announce left if this was the last socket
    if (noSocketsLeft) {
      broadcast({ type: "System", message: `${username} left` });
    }
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

function sendToSockets(sockets, payload) {
  for (const s of sockets) safeSend(s, payload);
}