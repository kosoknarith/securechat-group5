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

form.addEventListener("submit", (e) => {
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

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${scheme}://${location.host}`);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "register", username, password }));
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

      // If you are NOT using tokens/resume, Chat_Interface.js needs this to auth again:
      sessionStorage.setItem("password", password);

      // If server ever sends token, keep it (doesn't hurt)
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