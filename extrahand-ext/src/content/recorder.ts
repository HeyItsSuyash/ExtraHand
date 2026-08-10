// src/content/recorder.js

let isRecording = false;
let macroSteps = [];

// Simple helper to generate a unique CSS selector
function getSelector(el) {
  if (el.tagName.toLowerCase() === "html") return "HTML";
  let str = el.tagName.toLowerCase();
  str += (el.id !== "") ? "#" + el.id : "";
  if (el.className) {
    let classes = el.className.trim().split(/\s+/).join(".");
    str += "." + classes;
  }
  return str;
}

document.addEventListener('click', (e) => {
  if (!isRecording) return;
  const target = e.target;
  const selector = getSelector(target);
  macroSteps.push({ action: 'click', target: selector, timestamp: Date.now() });
  
  // Send state back to sidepanel or background
  chrome.runtime.sendMessage({ type: "MACRO_RECORDED_STEP", step: macroSteps[macroSteps.length - 1] });
}, true);

document.addEventListener('input', (e) => {
  if (!isRecording) return;
  const target = e.target;
  const selector = getSelector(target);
  macroSteps.push({ action: 'type', target: selector, value: target.value, timestamp: Date.now() });
  
  chrome.runtime.sendMessage({ type: "MACRO_RECORDED_STEP", step: macroSteps[macroSteps.length - 1] });
}, true);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_RECORDING") {
    isRecording = true;
    macroSteps = [];
    sendResponse({ status: "Recording started" });
  } else if (request.type === "STOP_RECORDING") {
    isRecording = false;
    sendResponse({ status: "Recording stopped", steps: macroSteps });
  } else if (request.type === "DRY_RUN_HIGHLIGHT") {
    // Highlight element for dry run
    const el = document.querySelector(`[ref="${request.action.ref_id}"]`);
    if (el) {
      const oldBorder = el.style.border;
      el.style.border = "3px dashed yellow";
      setTimeout(() => { el.style.border = oldBorder; }, 3000);
    }
    sendResponse({ status: "Highlighted" });
  }
});
