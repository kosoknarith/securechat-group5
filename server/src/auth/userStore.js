const bcrypt = require("bcryptjs");

const users = new Map();

const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";
const SALT_ROUNDS = Math.min(
  14,
  Math.max(10, parseInt(process.env.BCRYPT_COST || "12", 10) || 12)
);

const MIN_PASSWORD_LENGTH = 8;

function validateUsername(u) {
  return typeof u === "string" && /^[A-Za-z0-9_]{3,32}$/.test(u);
}

function validatePassword(p) {
  if (typeof p !== "string") return false;
  if (p.length < MIN_PASSWORD_LENGTH) return false;
  if (Buffer.byteLength(p, "utf8") > 72) return false; // bcrypt max password length
  return true;
}

// Create user and store public key
async function createUser(username, password, publicKey) {
  const u = (username || "").trim();

  if (!validateUsername(u) || !validatePassword(password)) {
    return { ok: false, message: "Invalid username or password format" };
  }

  if (!publicKey || typeof publicKey !== "string") {
    return { ok: false, message: "Missing public key" };
  }

  if (users.has(u)) {
    return { ok: false, message: "Username already exists" };
  }

  const passwordHash = await bcrypt.hash(password + PASSWORD_PEPPER, SALT_ROUNDS);

  users.set(u, {
    passwordHash,
    publicKey,
    createdAt: Date.now()
  });

  return { ok: true };
}

async function verifyUser(username, password) {
  const u = (username || "").trim();
  const record = users.get(u);
  if (!record) return false;

  return await bcrypt.compare(password + PASSWORD_PEPPER, record.passwordHash);
}

function getPublicKey(username) {
  const u = (username || "").trim();
  const record = users.get(u);
  return record ? record.publicKey : null;
}

module.exports = { createUser, verifyUser, validateUsername, getPublicKey };