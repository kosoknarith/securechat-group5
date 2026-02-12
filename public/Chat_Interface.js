
const username = sessionStorage.getItem("username");
const password = sessionStorage.getItem("password");

// If user didn't login, go back
if (!username || !password) {
  window.location.href = "login.html";
}

window.addEventListener("beforeunload", () => {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("password");
});

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

let authed = false;
let didAuth = false;

function addLine(text) {
  const div = document.createElement("div");
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

const ws = new WebSocket("wss://localhost:8080");


const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    addLine("Logging out...");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
  });
}
ws.onopen = () => {
  addLine("Connected");
  ws.send(JSON.stringify({ type: "auth", username, password }));
};

ws.onmessage = (e) => {
  let msg;
  try { msg = JSON.parse(e.data); } catch { return addLine("RAW: " + e.data); }

  if (msg.type === "auth_ok") {
    authed = true;
    didAuth = true;
    addLine("Logged in as " + username);
    return;
  }

  if (msg.type === "auth_fail") {
    addLine("Login failed. Redirecting...");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    try { ws.close(); } catch {}
    window.location.href = "login.html";
    return;
  }

  if (msg.type === "chat") {
    addLine(`${msg.from}: ${msg.message}`);
    return;
  }

  // system / error / auth_required
  addLine(`${msg.type}: ${msg.message ?? ""}`);
};

ws.onclose = () => {
  addLine("Disconnected - logging out.");
  if (didAuth){
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    window.location.href = "login.html";
  }
};

ws.onerror = () => {
  addLine("Connection error - logging out.");
  if (didAuth) {
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("password");
    window.location.href = "login.html";
  } 
};

function sendChat() {
  if (!authed) return addLine("Not authenticated yet.");
  const text = inputEl.value.trim();
  if (!text) return;

  ws.send(JSON.stringify({ type: "chat", message: text }));
  inputEl.value = "";
}

sendBtn.addEventListener("click", sendChat);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
