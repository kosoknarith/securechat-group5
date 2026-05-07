const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function validateUsername(username) {
  return typeof username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(username);
}

function getUser(username) {
  const users = loadUsers();
  return users[username] || null;
}

function userExists(username) {
  return !!getUser(username);
}

function addUser(username, userData) {
  const users = loadUsers();

  if (users[username]) {
    return false;
  }

  users[username] = userData;
  saveUsers(users);
  return true;
}

function getPublicKey(username) {
  const user = getUser(username);
  return user?.publicKey || null;
}

module.exports = {
  loadUsers,
  saveUsers,
  validateUsername,
  getUser,
  userExists,
  addUser,
  getPublicKey,
};