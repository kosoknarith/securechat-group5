
document.querySelector("form").addEventListener("submit", (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  sessionStorage.setItem("username", username);
  sessionStorage.setItem("password", password);

  window.location.href = "Chat_Interface.html";
});