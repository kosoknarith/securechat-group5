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

let authed = false;
let didAuth = false;
let typingTimeout;

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
};

// Handle messages
ws.onmessage = (e) => {
  let msg;
  try {
    msg = JSON.parse(e.data);
  } catch {
    return addLine("RAW: " + e.data, "other");
  }

  if (msg.type === "auth_ok") {
    authed = true;
    didAuth = true;
    addLine("Logged in as " + username, "other");
    return;
  }

  if (msg.type === "auth_fail") {
    addLine("Login failed. Redirecting...", "other");
    sessionStorage.removeItem("username");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
    return;
  }

  if (msg.type === "chat") {
    addLine(msg.message, "other");
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

// Send message
function sendChat() {
  const text = inputEl.value.trim();
  if (!text) return;

  // Send message
  addLine(text, "me");

  // Only send if authenticated
  if (authed) {
    ws.send(JSON.stringify({ type: "chat", message: text }));
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