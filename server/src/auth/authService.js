const { createUser, verifyUser } = require("./userStore");

// Register new user and save public key
async function register(username, password, publicKey) {
  return createUser(username, password, publicKey);
}

// Check login username and password
async function validateCredentials(username, password) {
  if (!username || !password) return false;
  return verifyUser(username, password);
}

module.exports = { register, validateCredentials };