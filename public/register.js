import { generateKeyPair, savePrivateKey } from "./encryption.js";

const form = document.getElementById("registerForm");
const statusEl = document.getElementById("status");
const registerBtn = document.getElementById("registerBtn");

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#1E3A8A";
}

function setBusy(busy, label = "Creating account...") {
  if (!registerBtn) return;
  registerBtn.disabled = busy;
  registerBtn.textContent = busy ? label : "Create Account";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (!username || !password) {
    setStatus("Please enter username and password", true);
    return;
  }

  if (password !== confirm) {
    setStatus("Passwords do not match", true);
    return;
  }
    const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (!turnstileToken) {
      setStatus("Please complete the security check.", true);
      return;
    }

  setBusy(true, "Generating keys...");
  setStatus("Generating encryption keys (this can take a few seconds)...");

  let publicKey, privateKey;
  try {
    const keys = await generateKeyPair();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  } catch (err) {
    setStatus("Failed to generate keys. Your browser may not support WebCrypto.", true);
    setBusy(false);
    return;
  }

  setStatus("Connecting to server...");
  setBusy(true, "Registering...");

  let ws;
  try {
    ws = new WebSocket(window.SecureChatConfig.wsUrl);
  } catch (err) {
    setStatus("Could not start connection.", true);
    setBusy(false);
    return;
  }

  const connectTimeout = setTimeout(() => {
    setStatus("Server is taking too long to respond.", true);
    setBusy(false);
    try { ws.close(); } catch {}
  }, 10000);

  ws.addEventListener("open", () => {
    clearTimeout(connectTimeout);
    ws.send(JSON.stringify({
      type: "register",
      username,
      password,
      publicKey,
      turnstileToken
    }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      setStatus("Bad server response", true);
      setBusy(false);
      try { ws.close(); } catch {}
      return;
    }

    if (msg.type === "register_fail" || msg.type === "auth_fail" || msg.type === "error") {
      setStatus(msg.message || "Registration failed", true);
      setBusy(false);
      try { ws.close(); } catch {}
      return;
    }

    if (msg.type === "auth_ok" || msg.type === "register_ok") {
      sessionStorage.setItem("username", msg.username || username);
      sessionStorage.setItem("password", password);
      savePrivateKey(username, privateKey);
      if (msg.token) sessionStorage.setItem("token", msg.token);
      try { ws.close(); } catch {}
      window.location.href = "Chat_Interface.html";
    }
  });

  ws.addEventListener("error", () => {
    clearTimeout(connectTimeout);
    setStatus("Could not reach server. Is it online?", true);
    setBusy(false);
  });
});