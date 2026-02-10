const USERS = {
  alice: "1234",
  bob: "1234",
  admin: "admin",
};

function validateCredentials(username, password) {
  if (!username || !password) return false;
  return USERS[username] === password;
}

module.exports = { validateCredentials };