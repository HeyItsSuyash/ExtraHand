// content.js - Injected into every page

import { buildAccessibilityTree, getElementByRefId } from './utils/accessibilityTree.js';
import { checkGuardedAction } from './utils/guardChecker.js';

console.log("Browser Automation Agent content script loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_SNAPSHOT") {
    const markdownTree = buildAccessibilityTree(document.body);
    const snapshot = {
      url: window.location.href,
      dom: markdownTree
    };
    sendResponse({ snapshot });
  } else if (request.type === "EXECUTE_ACTION") {
    handleAction(request.action).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ status: "error", message: err.message });
    });
    return true; // Keep channel open for async response
  }
  return true;
});

async function handleAction(action) {
  const { type, ref_id, text, options } = action;
  
  const element = getElementByRefId(ref_id);
  
  if (!element && type !== 'navigate' && type !== 'scroll') {
    return { status: "error", message: `Element with ref_id ${ref_id} not found.` };
  }

  // Check for Guarded Actions
  if (element) {
    const guardCheck = checkGuardedAction(element, type);
    if (guardCheck.isGuarded && !action.forceApprove) {
      return { 
        status: "CONSENT_REQUIRED", 
        reason: guardCheck.reason,
        actionPayload: action 
      };
    }
  }

  console.log(`Executing ${type} on ref ${ref_id}...`);

  switch (type) {
    case 'click':
      element.click();
      break;
    case 'double_click':
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      break;
    case 'right_click':
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      break;
    case 'type':
      element.value = ''; // clear first
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    case 'hold':
      // Simulate mousedown and don't immediately mouseup
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      // In a real scenario, this might need a duration or a separate release action
      break;
    case 'scroll':
      // Scroll window or element
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: options?.y || 500, left: options?.x || 0, behavior: 'smooth' });
      }
      break;
    case 'navigate':
      window.location.href = action.url;
      break;
    default:
      return { status: "error", message: `Unknown action type: ${type}` };
  }

  // Give DOM time to settle before resolving
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return { status: "success" };
}
