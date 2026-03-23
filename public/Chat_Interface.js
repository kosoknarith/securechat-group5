import { encryptMessage, decryptMessage } from "./encryption.js";

// log test
const publicKeys = {
  user1: `
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAk2E49breU0p+LVKbUHB/
eKbzDkADes37mJJI8On3KoSlXdmZx2jV/uXLLyWnNhiSsI4pUBKMZzYzg+9M0yXT
LZW6j50770KyZdLQwC+yz1koUiYpGo6XAhVsWm42NWqXmxgsRhQ8iJsJPmb0cS5n
5Lssmu8LDUPzprtj1xzYcAiivUvgxg4/+zFASEAPLUhw/IhcDz4jzMGpXCXNQSOs
XpRmmtUlr9npb0l/AvYnFCsPu11n8Tssrgq3MV9EkCSUnEDaxcdxib1Y+ikGonhg
6PwqaZXa4bKQZK3hUFAcdZj9EKU0IrJ2C9yeCzvMkJIEqi6ZNBcZY+srv0UzGFqT
BRzjTcLcudjeCCcoV2SWy/5xlBRrxNiO3dEtQXIsrXSY430F0DtT9+3GffmUK9dD
RUV6SCV1S1jzOto95ajAV18+9e6J0o3arc6acru5BsoW27wAKHX9QSfPXEUqYN1l
WpL965VJW+JtPOsYH+DYxdlVJV2Qz3Twully79FZwWnJETCirtmNGGunPu3p8vYm
yWOZAfbyWaH16TktZ7ClRRIIsE/biIbnGRPSRjYTL95YVE2sFzTbSfzkGWbNcbsW
BK+0EwWQCjuUYI5puCCyPQDqRu6fzLcvXibOMpmB0CSMq657qDn8/cUBCg7jqkNC
GCcgCCbkpH6O1PLAdFOCZMECAwEAAQ==
`,
  user2: `
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA95QpSozg1l3Ep2fChOPt
CLt+fW4TqYGilzxNoHs9dgXP4CdkU5UjPBPYJtPIt6QD/y+rH1cOkvAM+fg56KeY
W3VFv5M764zuOTzCqQEUy1EBAKcPmMVYrjLLs/Om/fBqe4rSZcqekRMODkhdk++y
GMjI2H+t+DeAn5EBxa9cYpDl9ukIRK3CNduJWPxzp9rbhnm0R7BzK0tJp6t/rD81
Xx7cmeDwvdmR5liaVU0vEXlgkDZXvA6mewd04pD8zpKJGwHXgCTKxRAikpkecTR+
AT93ROxWMCtbyenvjfOss3JvLfMx6TMFwBTx0KyIJ/LzICRZBrjcJyCZAyGdHtFA
rsSuXfeKjlTwqAl+2BRj7193nURJ5kOyo4SMY5FcuDhu71QSrbb9jDEgda+8pTS8
ClcDfFKJddGVsjYrOtPtag6JEgXyc0pzF+5clOA1i/KMC7f5txjWdoXXNApjANtY
pp7u71+R2DhrwkCY1nD9MVfJlLZLknSfPRN9Hlr3ukrEi1tZc/L+pTodZxifcMc/
hvLih+Qhegd6nAEhZhoa2wJzyzvAnsHZ/+ok1YCrxs2NCUuhV66zbpNsP/B8gcEp
mF1teF1igtlDkt6UFmFCB+nXKdn2T5BF+XB1cvc94uPSc4pN0OkN7sAF8D+x/Kj+
PflNJdKbBNZmututHXvRrAsCAwEAAQ==
`
}
const privateKeys = {
  user1: `
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
Q+sT7k8pC8nIuGBzbVvOEPULmNNINQ==
`,

  user2: `
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
eGJoSBcHxVs5fVWKKbMdpL4Z78R2LY8=
`
};

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

// conversationKey
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

// Handle messages and add async
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
    const myPrivateKey = privateKeys[username];

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

    // DM: store under the other user's name
    const other = from === username ? msg.to : from;
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

// Send async message 
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
      // DM encrypt message here
      const recipientPublicKey = publicKeys[activeChat];

      // Stop if no key found
      if (!recipientPublicKey) {
        console.error("No public key found for user:", activeChat);
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