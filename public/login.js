const form = document.getElementById("loginForm");
const statusEl = document.getElementById("status");
const loginBtn = document.getElementById("loginBtn");

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#1E3A8A";
}

function setBusy(busy) {
  if (!loginBtn) return;
  loginBtn.disabled = busy;
  loginBtn.textContent = busy ? "Signing in..." : "Sign In";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    setStatus("Please enter username and password", true);
    return;
  }

  setStatus("Connecting to server...");
  setBusy(true);

  //Connect to the WebSocket server using the configured URL.
  let ws;
  try {
    ws = new WebSocket(window.SecureChatConfig.wsUrl);
  } catch (err) {
    setStatus("Could not start connection. Check the server URL.", true);
    setBusy(false);
    return;
  }

  // If the connection takes too long, give up so the user is not stuck.
  const connectTimeout = setTimeout(() => {
    setStatus("Server is taking too long to respond. Try again in a moment.", true);
    setBusy(false);
    try { ws.close(); } catch {}
  }, 10000);

  ws.addEventListener("open", () => {
    clearTimeout(connectTimeout);
    setStatus("Authenticating...");
    ws.send(JSON.stringify({ type: "auth", username, password }));
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

    if (msg.type === "auth_fail" || msg.type === "error") {
      setStatus(msg.message || "Login failed", true);
      setBusy(false);
      try { ws.close(); } catch {}
      return;
    }

    if (msg.type === "auth_ok") {
      sessionStorage.setItem("username", msg.username || username);
      sessionStorage.setItem("password", password);
      try { ws.close(); } catch {}
      window.location.href = "Chat_Interface.html";
    }
  });

  ws.addEventListener("error", () => {
    clearTimeout(connectTimeout);
    setStatus("Could not reach server. Is it online?", true);
    setBusy(false);
  });

  ws.addEventListener("close", (ev) => {
    clearTimeout(connectTimeout);
    // If we never authenticated, surface the reason
    if (loginBtn.disabled) {
      setStatus("Connection closed before login completed", true);
      setBusy(false);
    }
  });
});