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

module.exports = { setUser, getUser, getUsername, clearUser, isAuthed };