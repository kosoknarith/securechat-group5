import { generateKeyPair, savePrivateKey } from "./encryption.js";

const form = document.getElementById("registerForm");
const statusEl = document.getElementById("status");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "crimson" : "inherit";
}

function wsUrl() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  if (password !== confirm) {
    alert("Passwords do not match");
    return;
  }
  // Generate key pair for new user
  const { publicKey, privateKey } = await generateKeyPair();
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${scheme}://${location.host}`);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "register", username, password, publicKey }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      alert("Bad server response");
      ws.close();
      return;
    }

    if (msg.type === "register_fail" || msg.type === "auth_fail" || msg.type === "error") {
      alert(msg.message || "Registration failed");
      ws.close();
      return;
    }

    if (msg.type === "auth_ok" || msg.type === "register_ok") {
      sessionStorage.setItem("username", msg.username || username);
      sessionStorage.setItem("password", password);
      savePrivateKey(username, privateKey);
      // If server ever sends token
      if (msg.token) sessionStorage.setItem("token", msg.token);

      ws.close();
      window.location.href = "Chat_Interface.html";
    }
  });

  ws.addEventListener("error", () => {
    alert(
      "Error connecting to server."
    );
  });
});