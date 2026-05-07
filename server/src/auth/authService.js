const bcrypt = require("bcryptjs");
const {
  validateUsername,
  userExists,
  addUser,
  getUser,
} = require("./userStore");

function getPepper() {
  return process.env.PASSWORD_PEPPER || "";
}

function getBcryptCost() {
  const cost = Number(process.env.BCRYPT_COST || 12);

  if (!Number.isInteger(cost) || cost < 8 || cost > 15) {
    return 12;
  }

  return cost;
}

async function register(username, password, publicKey) {
  if (!validateUsername(username)) {
    return {
      ok: false,
      message: "Invalid username",
    };
  }

  if (!password || typeof password !== "string" || password.length > 128) {
    return {
      ok: false,
      message: "Invalid password",
    };
  }

  if (!publicKey || typeof publicKey !== "string") {
    return {
      ok: false,
      message: "Missing public key",
    };
  }

  if (userExists(username)) {
    return {
      ok: false,
      message: "Username already exists",
    };
  }

  const passwordHash = await bcrypt.hash(password + getPepper(), getBcryptCost());

  const created = addUser(username, {
    username,
    passwordHash,
    publicKey,
    createdAt: new Date().toISOString(),
  });

  if (!created) {
    return {
      ok: false,
      message: "Username already exists",
    };
  }

  return {
    ok: true,
  };
}

async function validateCredentials(username, password) {
  if (!validateUsername(username)) {
    return false;
  }

  if (!password || typeof password !== "string") {
    return false;
  }

  const user = getUser(username);

  if (!user || !user.passwordHash) {
    return false;
  }

  return bcrypt.compare(password + getPepper(), user.passwordHash);
}

module.exports = {
  register,
  validateCredentials,
};