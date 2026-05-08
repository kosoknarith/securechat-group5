const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { setUser, getUsername, clearUser, isAuthed, listOnlineUsers, getSocketsByUsername } = require("./auth/sessionStore");
const publicDir = path.join(__dirname, "../../public");

const PORT = process.env.PORT || 8080;

/* database + auth */
const pool = require("./db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/*Security limits*/
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FRAME_BYTES = 8 * 1024 * 1024; // Max bytes per incoming message
const MAX_CHAT_CHARS = 500; // Max characters for chat text
const HEARTBEAT_MS = 30_000; // Ping interval

/*Rate limit settings*/
const CHAT_WINDOW_MS = 10_000; // Chat window time
const CHAT_MAX_MSGS = 10; // Chat max messages per window

const chatRate = new Map();

async function verifyTurnstile(token) {

  if (!token || !process.env.TURNSTILE_SECRET) {
    return false;
  }

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET,
          response: token,
        }),
      },
    );

    const data = await res.json();

    return data.success === true;
  } catch (err) {
    return false;
  }
}

async function handleLogin(request, response) {
  let body = "";
  request.on("data", (chunk) => (body += chunk));

  request.on("end", async () => {
    try {
      const data = JSON.parse(body);

      const username = (data.username ?? "").trim();
      const password = data.password ?? "";
      const turnstileToken = data.turnstileToken ?? "";

      if (!username || !password) {
        response.statusCode = 400;
        return response.end(
          JSON.stringify({ error: "Username and password required" }),
        );
      }

      // Verify turnstile token
      if (!(await verifyTurnstile(turnstileToken))) {
        response.statusCode = 403;
        return response.end(JSON.stringify({ error: "Security check failed" }));
      }

      // Rate limit of 5 login attempts per minute per username
      const allowed = await checkDbRateLimit(
        "login",
        `login:${username.toLowerCase()}`,
        5,
        60,
      );

      if (!allowed) {
        response.statusCode = 429;
        return response.end(
          JSON.stringify({ error: "Too many attempts. Try again later." }),
        );
      }

      // Grabs user from DB
      const result = await pool.query(
        "SELECT id, username, password_hash, public_key FROM users WHERE username = $1",
        [username],
      );

      const user = result.rows[0];

      // Checks if user exists and password matches
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        response.statusCode = 401;
        return response.end(
          JSON.stringify({ error: "Invalid username or password" }),
        );
      }

      // Generate session token
      const token = crypto.randomBytes(32).toString("hex");

      // Session expires in 24 hours
      const expires = new Date(Date.now() + 86400000);
      await pool.query(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [user.id, token, expires],
      );

      response.end(
        JSON.stringify({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            publicKey: user.public_key,
          },
        }),
      );
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      response.statusCode = 500;
      response.end(
        JSON.stringify({
          error: "Server error",
          details: err.message,
        }),
      );
    }
  });
}

// Basically the same as handleLogin but with different rate limit and DB queries
async function handleRegister(request, response) {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const username = (data.username ?? "").trim();
      const password = data.password ?? "";
      const publicKey = data.publicKey ?? "";
      const turnstileToken = data.turnstileToken ?? "";

      if (!username || !password) {
        response.statusCode = 400;
        return response.end(
          JSON.stringify({ error: "Username and password required" }),
        );
      }

      if (!(await verifyTurnstile(turnstileToken))) {
        response.statusCode = 403;
        return response.end(JSON.stringify({ error: "Security check failed" }));
      }

      const allowed = await checkDbRateLimit(
        "register",
        `register:${username.toLowerCase()}`,
        3,
        300,
      );
      if (!allowed) {
        response.statusCode = 429;
        return response.end(
          JSON.stringify({ error: "Too many attempts. Try again later." }),
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);

      try {
        await pool.query(
          "INSERT INTO users (username, password_hash, public_key) VALUES ($1, $2, $3)",
          [username, passwordHash, publicKey],
        );
        response.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("REGISTER INSERT ERROR:", err);

        response.statusCode = 400;
        response.end(
          JSON.stringify({
            error: "Registration failed",
            details: err.message,
            code: err.code,
          }),
        );
      }
    } catch {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: "Server error" }));
    }
  });
}

async function checkDbRateLimit(
  action,
  identifier,
  maxAttempts,
  windowSeconds,
) {

  // Deletes old entries
  await pool.query(
    "DELETE FROM rate_limits WHERE created_at < (NOW() - ($1 * INTERVAL '1 second'))",
    [windowSeconds],
  );

  // Count recent tries
  const result = await pool.query(
    `SELECT COUNT(*) AS attempts FROM rate_limits
     WHERE action = $1 AND identifier = $2
     AND created_at >= (NOW() - ($3 * INTERVAL '1 second'))`,
    [action, identifier, windowSeconds],
  );

  // if too many attempts, block
  if (parseInt(result.rows[0].attempts, 10) >= maxAttempts) return false;

  await pool.query(
    "INSERT INTO rate_limits (action, identifier) VALUES ($1, $2)",
    [action, identifier],
  );
  return true;
}

// Validate session token
async function handleValidateToken(request, response) {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", async () => {
    try {
      const { token } = JSON.parse(body);
      if (!token) {
        response.statusCode = 400;
        return response.end(JSON.stringify({ valid: false }));
      }
      // Checks session validity
      const result = await pool.query(
        `SELECT u.username FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token],
      );

      const rows = result.rows;
      if (!rows.length) {
        response.statusCode = 401;
        return response.end(JSON.stringify({ valid: false }));
      }
      response.end(JSON.stringify({ valid: true, username: rows[0].username }));
    } catch {
      response.statusCode = 500;
      response.end(JSON.stringify({ valid: false }));
    }
  });
}

// Get public key for a username
async function handlePublicKey(request, response, parsedUrl) {
  const username = (parsedUrl.searchParams.get("username") ?? "").trim();

  if (!username) {
    response.statusCode = 400;
    return response.end(JSON.stringify({ error: "Username required" }));
  }

  try {
    // Grabs user's public key from DB
    const result = await pool.query(
      "SELECT public_key FROM users WHERE username = $1",
      [username],
    );

    const user = result.rows[0];

    if (!user?.public_key) {
      response.statusCode = 404;
      return response.end(JSON.stringify({ error: "Public key not found" }));
    }

    response.end(
      JSON.stringify({
        success: true,
        publicKey: user.public_key,
      }),
    );
  } catch (err) {
    console.error("PUBLIC KEY ERROR:", err);

    response.statusCode = 500;
    response.end(
      JSON.stringify({
        error: "Server error",
        details: err.message,
      }),
    );
  }
}
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

function validateUsername(username) {
  return typeof username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(username);
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
    if (type !== "auth" && type !== "chat" && type !== "file") {
      return safeSend(ws, { type: "error", message: "Unknown message type" });
    }
    if (type === "auth") {
      const token = typeof msg.token === "string" ? msg.token : "";

      if (!token) {
        return safeSend(ws, { type: "auth_fail", message: "Missing token" });
      }

      try {
        const result = await pool.query(
          `SELECT u.username FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token = $1 AND s.expires_at > NOW()`,
          [token],
        );

        const rows = result.rows;

        if (!rows.length) {
          return safeSend(ws, { type: "auth_fail", message: "Invalid token" });
        }

        const username = rows[0].username;

        setUser(ws, username);
        ws._loggedIn = true;

        safeSend(ws, {
          type: "auth_ok",
          username,
        });

        broadcast({
          type: "System",
          message: `${username} joined`,
          timestamp: Date.now(),
        });

        broadcastUserList();
      } catch (err) {
        console.error("Auth error:", err);
        return safeSend(ws, { type: "auth_fail", message: "Auth server error" });
      }

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
        broadcast({ type: "chat", scope: "general", from, message: text, timestamp: Date.now() });
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

      const payload = { type: "chat", scope: "dm", from, to, message: text, timestamp: Date.now() };

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
      broadcast({ type: "System", message: `${username} left`, timestamp: Date.now() });
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