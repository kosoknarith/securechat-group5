const { createUser, verifyUser } = require("./userStore");

async function register(username, password) {
  return createUser(username, password);
}

async function validateCredentials(username, password) {
  if (!username || !password) return false;
  return verifyUser(username, password);
}

module.exports = { register, validateCredentials };