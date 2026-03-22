// Map websocket to session record { username }

const sessions = new Map();

function setUser(ws, username) {
  sessions.set(ws, { username });
}

function getUser(ws) {
  return sessions.get(ws);
}

function getUsername(ws) {
  return sessions.get(ws)?.username ?? null;
}

function clearUser(ws) {
  sessions.delete(ws);
}

function isAuthed(ws) {
  return sessions.has(ws);
}

function listOnlineUsers() {
  const names = new Set();
  for (const { username } of sessions.values()) {
    if (username) names.add(username);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function getSocketsByUsername(username) {
  const set = new Set();
  for (const [ws, session] of sessions.entries()) {
    if (session?.username === username) set.add(ws);
  }
  return set;
}

module.exports = { setUser, getUser, getUsername, clearUser, isAuthed, listOnlineUsers, getSocketsByUsername };