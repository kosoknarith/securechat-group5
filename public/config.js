// To run locally for testing, leave BACKEND_HOST empty - it falls back to
// the same host that served this page 

const BACKEND_HOST = "securechat-group5.onrender.com"; // 

// ---- Do not edit below this line ----

const SecureChatConfig = (() => {
  const useLocal = !BACKEND_HOST || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const host = useLocal ? location.host : BACKEND_HOST;

  const wsScheme = (location.protocol === "https:" || !useLocal) ? "wss" : "ws";
  const httpScheme = (location.protocol === "https:" || !useLocal) ? "https" : "http";

  return {
    wsUrl: `${wsScheme}://${host}`,
    apiBase: `${httpScheme}://${host}`,
    isLocal: useLocal,
  };
})();

// Make available everywhere as a global 
window.SecureChatConfig = SecureChatConfig;