document.querySelector("form").addEventListener("submit", (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${scheme}://${location.host}`);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "auth", username, password }));
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

    if (msg.type === "auth_fail" || msg.type === "error") {
      alert(msg.message || "Login failed");
      ws.close();
      return;
    }

    if (msg.type === "auth_ok") {
      sessionStorage.setItem("username", msg.username || username);

      sessionStorage.setItem("password", password);

      try { ws.close(); } catch {}
      window.location.href = "Chat_Interface.html";
    }
  });
});