// Map websocket to username

const sessions = new Map();

function setUser(ws, username) {
  sessions.set(ws, username);
}

function getUser(ws) {
  return sessions.get(ws);
}

function clearUser(ws) {
  sessions.delete(ws);
}

function isAuthed(ws) {
  return sessions.has(ws);
}

module.exports = { setUser, getUser, clearUser, isAuthed };