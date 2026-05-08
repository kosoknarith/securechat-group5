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
  const turnstileToken = document.querySelector(
    '[name="cf-turnstile-response"]',
  )?.value;

  if (!username || !password) {
    setStatus("Please enter username and password", true);
    return;
  }

  if (password !== confirm) {
    setStatus("Passwords do not match", true);
    return;
  }

  if (!turnstileToken) {
    setStatus("Please complete the security check.", true);
    return;
  }

  setBusy(true, "Generating keys...");
  setStatus("Generating encryption keys...");

  let publicKey, privateKey;

  try {
    const keys = await generateKeyPair();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  } catch (err) {
    console.error(err);
    setStatus("Failed to generate encryption keys.", true);
    setBusy(false);
    return;
  }

  setBusy(true, "Registering...");
  setStatus("Creating account...");

  try {
    const url = `${window.SecureChatConfig.apiBase}/register.php`;
    console.log("Register URL:", url);

    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
        publicKey,
        turnstileToken,
      }),
    });

    const raw = await res.text();
    console.log("Register status:", res.status);
    console.log("Register raw response:", raw);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Register API did not return JSON: " + raw);
    }

    if (!res.ok || !data.success) {
      setStatus(data.error || "Registration failed", true);
      setBusy(false);
      return;
    }

    savePrivateKey(username, privateKey);
    window.location.href = "login.html";
  } catch (err) {
    console.error(err);
    setStatus("Could not reach InfinityFree register API.", true);
    setBusy(false);
  }
});