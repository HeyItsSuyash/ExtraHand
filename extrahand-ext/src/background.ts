// background.js - Background Service Worker

import { LLMProvider } from './utils/llm.js';
import { TriggerManager } from './utils/triggerManager.js';
import { MarkItDown } from 'markitdown-ts';

// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  console.log("Snorlax Automation Agent installed.");
  chrome.storage.local.get(['provider_config', 'autonomy_mode'], (result) => {
    if (!result.provider_config) {
      chrome.storage.local.set({ 
        provider_config: {
          openai: { key: '', model: 'gpt-4o' }
        },
        autonomy_mode: 'ask_always',
        executionContext: 'notify'
      });
    }
  });
});

import { generateAndStoreKeyPair } from './utils/crypto';
import { syncPublicKeyToSupabase } from './utils/supabase';

// Listen for messages from the web app (Auth Token)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRA_HAND_AUTH") {
    chrome.storage.local.set({ auth_token: request.token }, async () => {
      try {
        const jwk = await generateAndStoreKeyPair();
        await syncPublicKeyToSupabase(request.token, jwk);
        console.log("Successfully synced public key to Supabase");
        sendResponse({ status: "success" });
      } catch (err) {
        console.error("Failed to sync key:", err);
        sendResponse({ status: "error", message: err.message });
      }
    });
    return true; // Keep channel open for async response
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// The core Action Loop state
let activeTask = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_AGENT_LOOP") {
    startOrchestratorLoop(request.prompt, request.provider, request.model, null, request.dryRun, request.attachments);
    sendResponse({ status: "Loop started" });
  } else if (request.type === "MAGIC_FILL") {
    handleMagicFill(request.prompt).then(sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.type === "CAPTURE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  } else if (request.type === "CONSENT_RESPONSE") {
    handleConsentResponse(request.approved);
    sendResponse({ status: "Acknowledged" });
  } else if (request.type === "STOP_AGENT") {
    activeTask = null;
    sendResponse({ status: "Agent stopped" });
  }
  return true; 
});

// --- TRIGGER EVENT LISTENERS ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const triggers = await TriggerManager.getTriggers();
  const trigger = triggers.find(t => t.id === alarm.name);
  if (trigger) {
    executeTrigger(trigger);
  }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame
  const triggers = await TriggerManager.getTriggers();
  const urlTriggers = triggers.filter(t => t.type === 'navigation');
  
  for (const trigger of urlTriggers) {
    if (details.url.includes(trigger.urlContains)) {
      executeTrigger(trigger, details.tabId);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const triggers = await TriggerManager.getTriggers();
  const launchTriggers = triggers.filter(t => t.type === 'browser_launch');
  for (const trigger of launchTriggers) {
    executeTrigger(trigger);
  }
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle') {
    const triggers = await TriggerManager.getTriggers();
    const idleTriggers = triggers.filter(t => t.type === 'idle_timeout');
    for (const trigger of idleTriggers) {
      executeTrigger(trigger);
    }
  }
});

async function executeTrigger(trigger, targetTabId = null) {
  const result = await chrome.storage.local.get(['executionContext']);
  const context = result.executionContext || 'notify';

  if (context === 'notify') {
    chrome.notifications.create(trigger.id, {
      type: 'basic',
      iconUrl: 'assets/logo.png', // Must exist in assets
      title: 'Snorlax Automation Triggered',
      message: `Rule matches. Do you want to run: "${trigger.prompt}"?`,
      buttons: [{ title: 'Run in background' }, { title: 'Cancel' }],
      requireInteraction: true
    });
  } else {
    runHeadlessAgent(trigger.prompt, targetTabId);
  }
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) { // 'Run in background'
    const triggers = await TriggerManager.getTriggers();
    const trigger = triggers.find(t => t.id === notificationId);
    if (trigger) {
      runHeadlessAgent(trigger.prompt);
    }
  }
  chrome.notifications.clear(notificationId);
});

async function runHeadlessAgent(prompt, targetTabId = null) {
  let tabId = targetTabId;
  if (!tabId) {
    const tab = await chrome.tabs.create({ url: 'https://google.com', active: false });
    tabId = tab.id;
    // Wait for basic load
    await new Promise(r => setTimeout(r, 2000)); 
  }
  
  // Read config to get default model/provider for headless runs
  const config = await chrome.storage.local.get(['provider_config']);
  const provider = config.provider_config?.openai?.key ? 'openai' : 'groq';
  
  startOrchestratorLoop(prompt, provider, null, tabId);
}

// --- MAGIC FILL ---
async function handleMagicFill(userPrompt) {
  try {
    const provider = new LLMProvider('openai', (await chrome.storage.local.get(['provider_config'])).provider_config?.openai?.key, 'gpt-4o');
    const sysPrompt = `You are an automation rule parser. The user wants to create a browser automation.
Return ONLY valid JSON matching this schema:
{
  "type": "time" | "navigation" | "browser_launch" | "idle_timeout",
  "condition": "string" (if time, minutes as string. if navigation, partial url. else empty),
  "prompt": "string" (the action the agent should perform)
}`;
    const result = await provider.prompt(sysPrompt, [{ role: 'user', content: userPrompt }], []);
    let text = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return { status: "success", rule: JSON.parse(text) };
  } catch (e) {
    console.error(e);
    return { status: "error", message: e.message };
  }
}

import { getEncryptedApiKeys } from './utils/supabase';
import { decryptData } from './utils/crypto';

// --- ORCHESTRATOR ---

async function runMockAgent(userPrompt, tabId) {
  notifyUI("Analyzing request using mock fallback agent...", 'agent_stream_start');
  const mockThinking = [
    "Thinking: No valid API key found. I will simulate the process.",
    "Thinking: Analyzing page context...",
    "Thinking: Identifying target elements...",
    "Thinking: I'm unable to take real actions without a valid LLM connection, but the UI flow is working perfectly!"
  ];
  
  for (const thought of mockThinking) {
    notifyUI(thought, 'agent_stream_chunk');
    await new Promise(r => setTimeout(r, 800));
  }
  
  notifyUI("Mock execution completed. Please configure a valid API key in the dashboard to enable actual automation.", 'agent_stream_chunk');
  activeTask.active = false;
  notifyUI("Task completed (Mocked).", 'agent');
}

async function parseAttachments(attachments) {
  if (!attachments || attachments.length === 0) return '';
  let mdContent = '\n\n--- Attached Context ---\n';
  const markitdown = new MarkItDown();
  
  for (const att of attachments) {
    mdContent += `\n**Attachment: ${att.name}**\n`;
    try {
      if (att.dataUrl) {
        // Fetch blob from dataURL to pass to MarkItDown
        const res = await fetch(att.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], att.name, { type: att.mimeType });
        const result = await markitdown.convertFile(file);
        mdContent += result.textContent + '\n';
      } else {
        mdContent += "[Attachment has no dataUrl]\n";
      }
    } catch (e) {
      console.error("MarkItDown parsing error:", e);
      mdContent += `[Failed to parse: ${e.message}]\n`;
    }
  }
  mdContent += '------------------------\n';
  return mdContent;
}

async function startOrchestratorLoop(userPrompt, selectedProvider = 'openai', selectedModel = 'gpt-4o', targetTabId = null, dryRun = false, attachments = []) {
  activeTask = { prompt: userPrompt, active: true };
  
  let tabId = targetTabId;
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    tabId = tab.id;
  }

  const { auth_token } = await chrome.storage.local.get(['auth_token']);
  if (!auth_token) {
    notifyUI("Error: Not authenticated. Please sign in via the dashboard.", 'error');
    return;
  }

  let apiKey;
  try {
    const encryptedData = await getEncryptedApiKeys(auth_token);
    if (!encryptedData || (!encryptedData.openai_key_encrypted && !encryptedData.openrouter_key_encrypted)) {
      notifyUI('MISSING_API', 'error');
      return;
    }

    if (selectedProvider === 'openai') {
      apiKey = await decryptData(encryptedData.openai_key_encrypted);
    } else if (selectedProvider === 'openrouter') {
      apiKey = await decryptData(encryptedData.openrouter_key_encrypted);
    } else {
      apiKey = await decryptData(encryptedData.openai_key_encrypted); // Fallback
    }
  } catch (err) {
    console.error("Decryption failed:", err);
    notifyUI(`Error decrypting API keys: ${err.message}`, 'error');
    return;
  }
  
  // Use the model provided by the UI, or fallback to config/default
  const modelToUse = selectedModel || (selectedProvider === 'openai' ? 'gpt-4o' : 'llama3-70b-8192');
  const llm = new LLMProvider(selectedProvider, apiKey, modelToUse);

  // Connection Test
  try {
    // Quick test prompt
    await llm.prompt("Test connection. Reply 'OK'.", [], []);
  } catch (e) {
    console.warn("API Connection failed, falling back to mock mode:", e);
    return runMockAgent(userPrompt, tabId);
  }

  const parsedAttachments = await parseAttachments(attachments);
  const finalPrompt = userPrompt + parsedAttachments;

  let history = [
    { role: 'user', content: `Task: ${finalPrompt}\nUse the 'get_current_state' tool to see the page, then plan and act.` }
  ];

  notifyUI("I am starting the task...", 'agent_stream_start');

  while (activeTask && activeTask.active) {
    try {
      const onChunk = (chunk) => {
        if (chunk.type === 'text') {
          notifyUI(chunk.content, 'agent_stream_chunk');
        }
      };

      const response = await llm.prompt(getSystemPrompt(), history, getToolsSchema(), onChunk);
      
      if (response.text) {
        history.push({ role: 'assistant', content: response.text });
      }

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const call of response.tool_calls) {
          if (!activeTask || !activeTask.active) break;
          
          history.push({ role: 'assistant', tool_calls: [call] });

          if (call.name === 'finish') {
            activeTask.active = false;
            notifyUI("Task completed.", 'agent');
            return;
          }

          if (call.name === 'get_current_state') {
            notifyUI("Analyzing page...", 'agent');
            const snapshot = await getPageSnapshot(tabId);
            history.push({ role: 'tool', tool_call_id: call.id, content: snapshot.dom });
            continue;
          }

          if (call.name === 'list_tabs') {
            const tabs = await chrome.tabs.query({});
            const tabList = tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
            history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(tabList) });
            continue;
          }

          if (call.name === 'switch_tab') {
            const newTabId = call.arguments.tab_id;
            await chrome.tabs.update(newTabId, { active: true });
            tabId = newTabId; // Update active tab for future actions
            history.push({ role: 'tool', tool_call_id: call.id, content: `Switched to tab ${tabId}` });
            continue;
          }

          if (call.name === 'open_tab') {
            const newTab = await chrome.tabs.create({ url: call.arguments.url, active: true });
            tabId = newTab.id;
            await new Promise(r => setTimeout(r, 2000)); // wait for basic load
            history.push({ role: 'tool', tool_call_id: call.id, content: `Opened and switched to new tab ${tabId}` });
            continue;
          }

          notifyUI(`Action: ${call.name}`, 'action', call);
          
          let result;
          if (dryRun && (call.name === 'click' || call.name === 'type' || call.name === 'double_click' || call.name === 'right_click')) {
            // Intercept action for dry run
            await new Promise((res) => chrome.tabs.sendMessage(tabId, { type: "DRY_RUN_HIGHLIGHT", action: call.arguments }, res));
            result = { status: "success", message: "DRY RUN: Action simulated." };
          } else {
            result = await executeActionOnTab(tabId, call.arguments);
          }
          
          if (result.status === "CONSENT_REQUIRED") {
            notifyUI(`Consent Required: ${result.reason}`, 'consent', result.actionPayload);
            const approved = await waitForUserConsent();
            if (approved) {
              result.actionPayload.forceApprove = true;
              result = await executeActionOnTab(tabId, result.actionPayload);
            } else {
              result = { status: "error", message: "User denied the action." };
            }
          }

          history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
      } else {
        break; // No tool calls, loop terminates
      }
    } catch (err) {
      console.error(err);
      notifyUI(`Error: ${err.message}`, 'error');
      activeTask.active = false;
    }
  }
}

async function getPageSnapshot(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_SNAPSHOT" }, (response) => {
      resolve(response?.snapshot || { dom: "Error getting snapshot" });
    });
  });
}

async function executeActionOnTab(tabId, actionPayload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTION", action: actionPayload }, (response) => {
      resolve(response || { status: "error", message: "No response from tab" });
    });
  });
}

let consentResolver = null;
function waitForUserConsent() {
  return new Promise((resolve) => {
    consentResolver = resolve;
  });
}
function handleConsentResponse(approved) {
  if (consentResolver) {
    consentResolver(approved);
    consentResolver = null;
  }
}

function notifyUI(text, type = 'agent', payload = null) {
  chrome.runtime.sendMessage({ 
    type: "UI_UPDATE", 
    message: { text, type, payload } 
  }).catch(() => { /* side panel might be closed */ });
}

function getSystemPrompt() {
  return `You are a browser automation agent. Break complex tasks down into single, sequential actions. 
You can only interact with elements that have a [id=X] in the provided snapshot.
Always call get_current_state after an action that changes the DOM (like click, type, or navigate) to see the new page state.
When you are done, call the 'finish' tool.`;
}

function getToolsSchema() {
  return [
    { name: 'get_current_state', description: 'Get the latest accessibility tree.' },
    { name: 'list_tabs', description: 'List all open browser tabs (returns id, title, url).' },
    { name: 'switch_tab', description: 'Switch focus to a specific tab ID.', parameters: { tab_id: 'number' } },
    { name: 'open_tab', description: 'Open a new tab with a specific URL.', parameters: { url: 'string' } },
    { name: 'click', description: 'Click an element.', parameters: { ref_id: 'number' } },
    { name: 'double_click', description: 'Double click an element.', parameters: { ref_id: 'number' } },
    { name: 'right_click', description: 'Right click an element.', parameters: { ref_id: 'number' } },
    { name: 'type', description: 'Type text into an input field.', parameters: { ref_id: 'number', text: 'string' } },
    { name: 'hold', description: 'Hold down on an element (mousedown).', parameters: { ref_id: 'number' } },
    { name: 'scroll', description: 'Scroll the page or element.', parameters: { ref_id: 'number (optional)', options: { x: 'number', y: 'number' } } },
    { name: 'navigate', description: 'Navigate to a URL.', parameters: { url: 'string' } },
    { name: 'finish', description: 'Complete the task.', parameters: { summary: 'string' } }
  ];
}
