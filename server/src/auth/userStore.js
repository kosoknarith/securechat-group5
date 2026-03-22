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

async function createUser(username, password) {
  const u = (username || "").trim();

  if (!validateUsername(u) || !validatePassword(password)) {
    return { ok: false, message: "Invalid username or password format" };
  }
  if (users.has(u)) {
    return { ok: false, message: "Username already exists" };
  }

  const passwordHash = await bcrypt.hash(password + PASSWORD_PEPPER, SALT_ROUNDS);

  users.set(u, { passwordHash, createdAt: Date.now() });
  return { ok: true };
}

async function verifyUser(username, password) {
  const u = (username || "").trim();
  const record = users.get(u);
  if (!record) return false;

  return await bcrypt.compare(password + PASSWORD_PEPPER, record.passwordHash);
}

module.exports = { createUser, verifyUser };