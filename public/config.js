// To run locally for testing, leave BACKEND_HOST empty - it falls back to
// the same host that served this page

const BACKEND_HOST = "securechat-group5.onrender.com"; //

// ---- Do not edit below this line ----

const SecureChatConfig = (() => {
  return {
    wsUrl: "wss://securechat-group5.onrender.com",
    apiBase: "https://securechatservice.42web.io/api",
  };
})();

window.SecureChatConfig = SecureChatConfig;