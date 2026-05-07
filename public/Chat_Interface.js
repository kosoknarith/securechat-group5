import {
  encryptMessage,
  decryptMessage,
  encryptFile,
  decryptFile,
  loadPrivateKey
} from "./encryption.js";

// Get user info
const username = sessionStorage.getItem("username");
const password = sessionStorage.getItem("password");

// Redirect if not logged in
if (!username || !password) {
  window.location.href = "login.html";
}

// DOM refs
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");
const typingEl = document.getElementById("typingIndicator");
const usersListEl = document.getElementById("usersList");
const chatTitleEl = document.getElementById("chatTitle");
const connStatusEl = document.getElementById("connStatus");
const fileNameEl = document.getElementById("fileName");
const meLabelEl = document.getElementById("meLabel");

if (meLabelEl) {
  meLabelEl.textContent = `Signed in as ${username}`;
}

let authed = false;
let onlineUsers = [];
let activeChat = "general";
let typingTimeout;

// Reconnect state
let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let manualClose = false;
let hasEverConnected = false;

// Conversation history
const conversations = new Map([["general", []]]);

function getConversation(key) {
  if (!conversations.has(key)) conversations.set(key, []);
  return conversations.get(key);
}

// ---- Connection status bar ----

function setConnStatus(state, label) {
  if (!connStatusEl) return;
  connStatusEl.classList.remove("conn-connecting", "conn-online", "conn-offline");
  connStatusEl.classList.add(`conn-${state}`);
  connStatusEl.textContent = label;
}

// ---- Rendering ----

function chatTitleFor(key) {
  return key === "general" ? "General" : key;
}

function setActiveChat(key) {
  if (activeChat === key) return;
  activeChat = key;
  if (chatTitleEl) chatTitleEl.textContent = chatTitleFor(key);
  renderSidebar();
  renderMessages();
}

function renderSidebar() {
  if (!usersListEl) return;
  usersListEl.innerHTML = "";

  const generalLi = document.createElement("li");
  generalLi.dataset.chat = "general";
  generalLi.classList.toggle("active", activeChat === "general");
  generalLi.innerHTML = `<span class="status online"></span> General`;
  generalLi.addEventListener("click", () => setActiveChat("general"));
  usersListEl.appendChild(generalLi);

  const others = onlineUsers.filter((u) => u && u !== username);

  for (const u of others) {
    const li = document.createElement("li");
    li.dataset.chat = u;
    li.classList.toggle("active", activeChat === u);
    li.innerHTML = `<span class="status online"></span> ${u}`;
    li.addEventListener("click", () => setActiveChat(u));
    usersListEl.appendChild(li);
  }

  if (activeChat !== "general" && !others.includes(activeChat)) {
    setActiveChat("general");
  }
}

function addLine(text, type = "other") {
  const div = document.createElement("div");
  div.classList.add("msg", type);

  const message = document.createElement("div");
  message.textContent = text;

  const time = document.createElement("div");
  time.classList.add("time");
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  div.appendChild(message);
  div.appendChild(time);

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addFileLine(downloadUrl, fileName, type = "other") {
  const div = document.createElement("div");
  div.classList.add("msg", type);

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  link.textContent = `Download ${fileName}`;
  link.style.display = "block";
  link.style.fontWeight = "bold";

  const time = document.createElement("div");
  time.classList.add("time");
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  div.appendChild(link);
  div.appendChild(time);

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessages() {
  messagesEl.innerHTML = "";
  const list = getConversation(activeChat);

  for (const m of list) {
    if (m.kind === "system") {
      addLine(m.message, "other");
      continue;
    }

    if (m.kind === "file") {
      const isMe = m.from === username;
      addFileLine(m.downloadUrl, m.fileName, isMe ? "me" : "other");
      continue;
    }

    const isMe = m.from === username;
    let text = typeof m.message === "string" ? m.message : "[Encrypted message]";
    let type = "me";
    if (!isMe) {
      text = m.from + ": " + text;
      type = "other";
    }
    addLine(text, type);
  }
}

// ---- Public key fetch (uses configured backend) ----

async function fetchPublicKey(targetUsername) {
  const url = `${window.SecureChatConfig.apiBase}/public-key?username=${encodeURIComponent(targetUsername)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.publicKey) {
    throw new Error(data.message || "Public key not found");
  }
  return data.publicKey;
}

// ---- WebSocket lifecycle with auto-reconnect ----

function connect() {
  setConnStatus("connecting", reconnectAttempts === 0 ? "connecting..." : "reconnecting...");

  try {
    ws = new WebSocket(window.SecureChatConfig.wsUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    if (!hasEverConnected) {
      addLine("Connected to server", "other");
      hasEverConnected = true;
    }
    setConnStatus("online", "online");
    ws.send(JSON.stringify({ type: "auth", username, password }));

    if (chatTitleEl) chatTitleEl.textContent = chatTitleFor(activeChat);
    renderSidebar();
  };

  ws.onmessage = handleMessage;

  ws.onclose = () => {
    if (manualClose) return;

    setConnStatus("offline", "offline - reconnecting...");
    authed = false;

    if (!sessionStorage.getItem("username")) {
      window.location.href = "login.html";
      return;
    }
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose runs after this and handles reconnect
  };
}

function scheduleReconnect() {
  if (manualClose) return;
  if (reconnectTimer) return;

  // Exponential backoff capped at 30s: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function handleMessage(e) {
  let msg;
  try {
    msg = JSON.parse(e.data);
  } catch {
    return addLine("RAW: " + e.data, "other");
  }

  if (msg.type === "auth_ok") {
    authed = true;
    setConnStatus("online", "online");

    // Only show login banner the first time
    const general = getConversation("general");
    const alreadyLoggedBanner = general.some(
      (m) => m.kind === "system" && m.message === `Logged in as ${username}`
    );
    if (!alreadyLoggedBanner) {
      general.push({ kind: "system", message: "Logged in as " + username });
    } else {
      general.push({ kind: "system", message: "Reconnected" });
    }
    if (activeChat === "general") renderMessages();
    return;
  }

  if (msg.type === "auth_fail") {
    addLine("Login failed. Redirecting...", "other");
    manualClose = true;
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
    return;
  }

  if (msg.type === "user_list" && Array.isArray(msg.users)) {
    onlineUsers = msg.users;
    renderSidebar();
    return;
  }

  if (msg.type === "System") {
    getConversation("general").push({ kind: "system", message: msg.message || "" });
    if (activeChat === "general") renderMessages();
    return;
  }

  if (msg.type === "chat") {
    const scope = msg.scope === "dm" ? "dm" : "general";
    const from = typeof msg.from === "string" ? msg.from : "";
    let message = msg.message;

    if (!from) return;

    if (scope === "general") {
      getConversation("general").push({ kind: "chat", from, message });
      if (activeChat === "general") renderMessages();
      return;
    }

    // DM: decrypt if encrypted payload object
    if (message && typeof message === "object" && from !== username) {
      const myPrivateKey = loadPrivateKey(username);
      if (!myPrivateKey) {
        console.error("No private key for:", username);
        return;
      }
      try {
        message = await decryptMessage(message, myPrivateKey);
      } catch (err) {
        console.error("Failed to decrypt DM:", err);
        message = "[Unable to decrypt message]";
      }
    }

    if (from === username) return;

    getConversation(from).push({
      kind: "chat",
      from,
      to: msg.to || "",
      message,
    });
    if (activeChat === from) renderMessages();
    return;
  }

  if (msg.type === "file" && msg.scope === "dm") {
    const from = typeof msg.from === "string" ? msg.from : "";
    if (!from || from === username) return;

    const myPrivateKey = loadPrivateKey(username);
    if (!myPrivateKey) {
      console.error("No private key for:", username);
      return;
    }

    try {
      const decryptedBuffer = await decryptFile(msg.payload, myPrivateKey);
      const blob = new Blob([decryptedBuffer], {
        type: msg.fileType || "application/octet-stream",
      });
      const downloadUrl = URL.createObjectURL(blob);

      getConversation(from).push({
        kind: "file",
        from,
        to: msg.to || "",
        fileName: msg.fileName,
        downloadUrl,
      });
      if (activeChat === from) renderMessages();
    } catch (err) {
      console.error("Failed to decrypt file:", err);
    }
    return;
  }

  addLine(msg.type + ": " + (msg.message || ""), "other");
}

// ---- Send actions ----

async function sendChat() {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!authed) {
    addLine("Not connected. Please wait...", "other");
    return;
  }

  if (activeChat === "general") {
    ws.send(JSON.stringify({ type: "chat", scope: "general", message: text }));
  } else {
    let recipientPublicKey;
    try {
      recipientPublicKey = await fetchPublicKey(activeChat);
    } catch (err) {
      console.error("Failed to get public key:", err);
      addLine("Could not fetch recipient public key.", "other");
      return;
    }

    const encryptedPayload = await encryptMessage(text, recipientPublicKey);
    ws.send(JSON.stringify({
      type: "chat",
      scope: "dm",
      to: activeChat,
      message: encryptedPayload,
    }));

    getConversation(activeChat).push({
      kind: "chat",
      from: username,
      to: activeChat,
      message: text,
    });
    renderMessages();
  }

  inputEl.value = "";
}

async function sendFile() {
  const file = fileInput.files[0];
  if (!file) {
    addLine("Please choose a file first.", "other");
    return;
  }
  if (!authed) {
    addLine("Not connected. Please wait...", "other");
    return;
  }
  if (activeChat === "general") {
    addLine("File sharing is only for direct messages.", "other");
    return;
  }

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    addLine("File too large. Max 5MB.", "other");
    return;
  }

  let recipientPublicKey;
  try {
    recipientPublicKey = await fetchPublicKey(activeChat);
  } catch (err) {
    console.error("Failed to get public key:", err);
    addLine("Could not fetch recipient public key.", "other");
    return;
  }

  try {
    const fileBuffer = await file.arrayBuffer();
    const encryptedPayload = await encryptFile(fileBuffer, recipientPublicKey);

    ws.send(JSON.stringify({
      type: "file",
      scope: "dm",
      to: activeChat,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      payload: encryptedPayload,
    }));

    const localUrl = URL.createObjectURL(file);
    getConversation(activeChat).push({
      kind: "file",
      from: username,
      to: activeChat,
      fileName: file.name,
      downloadUrl: localUrl,
    });
    renderMessages();

    if (fileInput) fileInput.value = "";
    if (fileNameEl) fileNameEl.textContent = "No file chosen";
  } catch (err) {
    console.error("Failed to encrypt/send file:", err);
    addLine("Failed to send file.", "other");
  }
}

// ---- Wire up UI ----

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    manualClose = true;
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    try { ws && ws.close(); } catch {}
    window.location.href = "login.html";
  });
}

sendBtn.addEventListener("click", sendChat);
if (sendFileBtn) sendFileBtn.addEventListener("click", sendFile);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

if (fileInput && fileNameEl) {
  fileInput.addEventListener("change", () => {
    fileNameEl.textContent = fileInput.files[0]
      ? fileInput.files[0].name
      : "No file chosen";
  });
  // Initial state
  fileInput.value = "";
  fileNameEl.textContent = "No file chosen";
}

// ---- Emoji picker ----
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");

const EMOJIS = [
  "😀", "😂", "😊", "😍", "😎", "🤔", "😢", "😭", "😡", "😴",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "🔥", "✨", "🎉",
  "❤️", "💔", "💯", "✅", "❌", "⭐", "☀️", "🌙", "☕", "🍕",
];

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  // Move cursor to just after the inserted emoji
  const newPos = start + text.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
}

if (emojiBtn && emojiPicker) {
  // Build the grid once
  for (const e of EMOJIS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-cell";
    btn.textContent = e;
    btn.addEventListener("click", () => {
      insertAtCursor(inputEl, e);
      emojiPicker.hidden = true;
    });
    emojiPicker.appendChild(btn);
  }

  // Toggle picker
  emojiBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    emojiPicker.hidden = !emojiPicker.hidden;
  });

  // Click outside to close
  document.addEventListener("click", (ev) => {
    if (emojiPicker.hidden) return;
    if (ev.target === emojiBtn || emojiPicker.contains(ev.target)) return;
    emojiPicker.hidden = true;
  });

  // Escape to close
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") emojiPicker.hidden = true;
  });
}

inputEl.addEventListener("input", () => {
  if (!typingEl) return;
  typingEl.style.display = "block";
  typingEl.textContent = "Typing...";
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingEl.style.display = "none";
  }, 1500);
});

// Clear creds on full page close 
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) {
    // browser is unloading; we leave session for back-button restore
  }
});

// Start
connect();