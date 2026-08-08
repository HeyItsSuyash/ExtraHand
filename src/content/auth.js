// auth.js - Content script to relay auth tokens from Web App to Extension

window.addEventListener("message", (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type && (event.data.type === "EXTRA_HAND_AUTH")) {
    console.log("Extra Hand: Received Auth Token from Web App, relaying to background...");
    chrome.runtime.sendMessage({
      type: "EXTRA_HAND_AUTH",
      token: event.data.token
    }, (response) => {
      console.log("Extra Hand: Auth Token saved.", response);
    });
  }
});
