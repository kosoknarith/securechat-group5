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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const turnstileToken = document.querySelector(
    '[name="cf-turnstile-response"]',
  )?.value;

  if (!username || !password) {
    setStatus("Please enter username and password", true);
    return;
  }

  if (!turnstileToken) {
    setStatus("Please complete the security check", true);
    return;
  }

  setStatus("Logging in...");
  setBusy(true);

  try {
    const res = await fetch(`${window.SecureChatConfig.apiBase}/login.php`, {
      method: "POST",
      body: new URLSearchParams({
        username,
        password,
        turnstileToken,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setStatus(data.error || "Login failed", true);
      setBusy(false);
      return;
    }

    sessionStorage.setItem("username", data.user.username);
    sessionStorage.setItem("userId", data.user.id);
    sessionStorage.setItem("token", data.token);

    window.location.href = "Chat_Interface.html";
  } catch (err) {
    console.error(err);
    setStatus("Could not reach InfinityFree login API.", true);
    setBusy(false);
  }
});
