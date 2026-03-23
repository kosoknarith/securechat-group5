import { encryptMessage, decryptMessage, loadPrivateKey } from "./encryption.js";

// Get user info
const username = sessionStorage.getItem("username");
const password = sessionStorage.getItem("password");

// Redirect if not logged in
if (!username || !password) {
  window.location.href = "login.html";
}

// Clear session on refresh/close
window.addEventListener("beforeunload", () => {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("password");
});

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingEl = document.getElementById("typingIndicator");
const usersListEl = document.getElementById("usersList");
const chatTitleEl = document.getElementById("chatTitle");

let authed = false;
let didAuth = false;
let typingTimeout;
let onlineUsers = [];
let activeChat = "general";

// Store chat history by conversation key
// message kinds: system, chat
const conversations = new Map([["general", []]]);

function getConversation(key) {
  if (!conversations.has(key)) conversations.set(key, []);
  return conversations.get(key);
}

function renderMessages() {
  messagesEl.innerHTML = "";
  const list = getConversation(activeChat);

  for (const m of list) {
    if (m.kind === "system") {
      addLine(m.message, "other");
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

function chatTitleFor(key) {
  return key === "general" ? "General" : "DM: " + key;
}

function setActiveChat(key) {
  if (activeChat === key) {
    return;
  }

  activeChat = key;

  if (chatTitleEl) {
    chatTitleEl.textContent = chatTitleFor(key);
  }

  renderMessages();
}

function renderSidebar() {
  if (!usersListEl) {
    return;
  }

  usersListEl.innerHTML = "";

  // General
  const generalLi = document.createElement("li");
  generalLi.dataset.chat = "general";
  generalLi.classList.toggle("active", activeChat === "general");
  generalLi.innerHTML = `<span class="status online"></span> General`;
  generalLi.addEventListener("click", () => setActiveChat("general"));
  usersListEl.appendChild(generalLi);

  // remove self from online user list
  const others = onlineUsers.filter((u) => u && u !== username);

  for (const u of others) {
    const li = document.createElement("li");
    li.dataset.chat = u;
    li.classList.toggle("active", activeChat === u);
    li.innerHTML = `<span class="status online"></span> ${u}`;
    li.addEventListener("click", () => setActiveChat(u));
    usersListEl.appendChild(li);
  }

  // Fallback to general if DM user disconnects
  if (activeChat !== "general" && !others.includes(activeChat)) {
    setActiveChat("general");
  }
}

// Chat bubble
function addLine(text, type = "other") {
  const div = document.createElement("div");
  div.classList.add("msg", type);

  const message = document.createElement("div");
  message.textContent = text;

  const time = document.createElement("div");
  time.classList.add("time");

  const now = new Date();
  time.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  div.appendChild(message);
  div.appendChild(time);

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// WebSocket
const scheme = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${scheme}://${location.host}`);

// Logout button
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
  });
}

// Connection opened
ws.onopen = () => {
  addLine("Connected to server", "other");
  ws.send(JSON.stringify({ type: "auth", username, password }));

  if (chatTitleEl) {
    chatTitleEl.textContent = "General";
  }
  renderSidebar();
};

// Handle incoming messages
ws.onmessage = async (e) => {
  let msg;
  try {
    msg = JSON.parse(e.data);
  } catch {
    return addLine("RAW: " + e.data, "other");
  }

  if (msg.type === "auth_ok") {
    authed = true;
    didAuth = true;

    // Login message in general chat
    getConversation("general").push({
      kind: "system",
      message: "Logged in as " + username,
    });
    if (activeChat === "general") {
      renderMessages();
    }
    return;
  }

  if (msg.type === "auth_fail") {
    addLine("Login failed. Redirecting...", "other");
    sessionStorage.removeItem("username");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
    return;
  }

  // Online users list for sidebar
  if (msg.type === "user_list" && Array.isArray(msg.users)) {
    onlineUsers = msg.users;
    renderSidebar();
    return;
  }

  // Server system messages
  if (msg.type === "System") {
    getConversation("general").push({ kind: "system", message: msg.message || "" });
    if (activeChat === "general") {
      renderMessages();
    }
    return;
  }

  // Chat messages
  if (msg.type === "chat") {
    const scope = msg.scope === "dm" ? "dm" : "general";

    const from = typeof msg.from === "string" ? msg.from : "";
    let message = msg.message;

    // If server didn't provide a sender, ignore this message
    if (!from) {
      return;
    }

    if (scope === "general") {
      getConversation("general").push({
        kind: "chat",
        from,
        message,
      });

      if (activeChat === "general") renderMessages();
      return;
    }

    // DM only: decrypt if payload object
    if (message && typeof message === "object" && from !== username) {
      const myPrivateKey = loadPrivateKey(username);

    if (!myPrivateKey) {
      console.error("No private key found for logged-in user:", username);
      return;
    }

    try {
      message = await decryptMessage(message, myPrivateKey);
    } catch (err) {
      console.error("Failed to decrypt DM:", err);
      message = "[Unable to decrypt message]";
    }
  }
  
  // Ignore encrypted DM echoed back from server
  if (from === username) {
    return;
  }

    // DM: store under sender username
    const other = from;
    if (!other) {
      return;
    }

    getConversation(other).push({
      kind: "chat",
      from,
      to: msg.to || "",
      message,
    });

    if (activeChat === other) renderMessages();
    return;
  }

  addLine(msg.type + ": " + (msg.message || ""), "other");
};

// Connection closed
ws.onclose = () => {
  if (didAuth) {
    addLine("Disconnected", "other");
    sessionStorage.clear();
    window.location.href = "login.html";
  }
};

// Error
ws.onerror = () => {
  if (didAuth) {
    addLine("Connection error", "other");
    sessionStorage.clear();
    window.location.href = "login.html";
  }
};

async function fetchPublicKey(targetUsername) {
  const res = await fetch(`/public-key?username=${encodeURIComponent(targetUsername)}`);
  const data = await res.json();

  if (!res.ok || !data.publicKey) {
    throw new Error(data.message || "Public key not found");
  }

  return data.publicKey;
}

// Send message 
async function sendChat() {
  const text = inputEl.value.trim();
  if (!text) {
    return;
  }
  // Only send if authenticated
  // added scopes for general and DM
  if (authed) {
    if (activeChat === "general") {
      ws.send(JSON.stringify({ type: "chat", scope: "general", message: text }));
    } else {
      // DM encrypt message
      let recipientPublicKey;

      try {
        recipientPublicKey = await fetchPublicKey(activeChat);
      } catch (err) {
        console.error("Failed to get public key:", err);
        return;
      }
      const encryptedPayload = await encryptMessage(text, recipientPublicKey);

      console.log("DM plaintext:", text);
      console.log("DM encrypted payload:", encryptedPayload);

      ws.send(JSON.stringify({ type: "chat", scope: "dm", to: activeChat, message: encryptedPayload }));
      
      // Show own plain text message in chat
      getConversation(activeChat).push({
        kind: "chat",
        from: username,
        to: activeChat,
        message: text
      });
      renderMessages();
    }
  }

  inputEl.value = "";
}

// Send button
sendBtn.addEventListener("click", sendChat);

// Enter key
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

// Typing indicator behavior
inputEl.addEventListener("input", () => {
  if (!typingEl) return;

  typingEl.style.display = "block";
  typingEl.textContent = "Typing...";

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingEl.style.display = "none";
  }, 1500);
});