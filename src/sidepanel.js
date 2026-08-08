// src/sidepanel.js - Logic for the Side Panel UI

document.addEventListener('DOMContentLoaded', () => {
  console.log("Side Panel loaded.");

  const input = document.querySelector('textarea');
  const chatContainer = document.querySelector('.overflow-y-auto');

  const actualSendBtn = document.getElementById('send-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const onboardingOverlay = document.getElementById('onboarding-overlay');
  const attachBtn = document.getElementById('attach-btn');
  
  // Onboarding Logic
  const slideContainer = document.getElementById('slide-container');
  const dot1 = document.getElementById('dot-1');
  const dot2 = document.getElementById('dot-2');
  const dot3 = document.getElementById('dot-3');
  
  function goToSlide(index) {
    if(slideContainer) {
      slideContainer.style.transform = `translateX(-${index * 33.333}%)`;
      [dot1, dot2, dot3].forEach((d, i) => {
        if(d) d.className = i === index ? 'w-2 h-2 rounded-full bg-[#a8ff53] transition-colors' : 'w-2 h-2 rounded-full bg-gray-600 transition-colors';
      });
    }
  }

  document.getElementById('next-slide-1')?.addEventListener('click', () => goToSlide(1));
  document.getElementById('next-slide-2')?.addEventListener('click', () => goToSlide(2));
  document.getElementById('finish-onboarding')?.addEventListener('click', () => {
    if(onboardingOverlay) {
      onboardingOverlay.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => onboardingOverlay.remove(), 300);
      chrome.storage.local.set({ hasSeenOnboarding: true });
    }
  });

  // Check if user has seen onboarding
  chrome.storage.local.get(['hasSeenOnboarding'], (res) => {
    if (res.hasSeenOnboarding && onboardingOverlay) {
      onboardingOverlay.remove();
    }
  });

  const fileUpload = document.getElementById('file-upload');
  const moreBtn = document.getElementById('more-options-btn');
  const moreMenu = document.getElementById('more-options-menu');
  
  const recordBtn = document.getElementById('menu-record-btn');
  const dryRunToggle = document.getElementById('menu-dry-run-toggle');
  const screenshotBtn = document.getElementById('menu-screenshot-btn');
  const selectAreaBtn = document.getElementById('menu-select-btn');
  
  let isRecording = false;

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  if (cropBtn) {
    cropBtn.addEventListener('click', () => {
      appendAgentBubble("The screenshot tool is coming in the next phase! Stay tuned.");
    });
  }

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('hidden');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
        moreMenu.classList.add('hidden');
      }
    });
  }

  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', () => {
      moreMenu.classList.add('hidden');
      chrome.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT" }, (res) => {
        if (res && res.dataUrl) {
           appendAgentBubble(`<img src="${res.dataUrl}" style="max-width: 100%; border-radius: 4px;" alt="Screenshot"/>`);
        }
      });
    });
  }

  if (attachBtn && fileUpload) {
    attachBtn.addEventListener('click', () => {
      fileUpload.click();
    });
    
    fileUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        appendAgentBubble(`Attached ${file.name} <br> <img src="${dataUrl}" style="max-width: 100%; max-height: 100px; border-radius: 4px; margin-top: 4px;" />`);
      };
      reader.readAsDataURL(file);
    });
  }

  if (recordBtn) {
    recordBtn.addEventListener('click', async () => {
      isRecording = !isRecording;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      
      if (isRecording) {
        recordBtn.style.color = '#dc3227';
        recordBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">stop_circle</span> Stop Recording';
        chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING" });
        appendAgentBubble("Recording started. Click elements and type to create a macro.");
      } else {
        recordBtn.style.color = 'inherit';
        recordBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">fiber_manual_record</span> Record Macro';
        chrome.tabs.sendMessage(tab.id, { type: "STOP_RECORDING" }, (res) => {
           if (res && res.steps) {
             appendAgentBubble(`Macro recorded with ${res.steps.length} steps. See console for JSON.`);
             console.log("RECORDED MACRO:", JSON.stringify(res.steps, null, 2));
           }
        });
      }
    });
  }

  // Listen for macro steps from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "MACRO_RECORDED_STEP") {
       console.log("Recorded step:", request.step);
    }
  });

  if (actualSendBtn && input) {
    actualSendBtn.addEventListener('click', () => {
      const prompt = input.value.trim();
      if (!prompt) return;

      appendUserBubble(prompt);
      input.value = '';

      // Default to reading from storage eventually, but sending a generic default for now
      const provider = 'openai';
      const model = 'gpt-4o';
      const dryRun = dryRunToggle ? dryRunToggle.checked : false;

      chrome.runtime.sendMessage({ type: "START_AGENT_LOOP", prompt, provider, model, dryRun }, (response) => {
        console.log("Response from background:", response);
      });
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        actualSendBtn.click();
      }
    });
  }

  let currentStreamBubble = null;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "UI_UPDATE") {
      const { text, type, payload } = request.message;
      
      if (type === 'agent') {
        appendAgentBubble(text);
        currentStreamBubble = null;
      } else if (type === 'agent_stream_start') {
        currentStreamBubble = createAgentBubbleElement();
        chatContainer.appendChild(currentStreamBubble.container);
        scrollToBottom();
      } else if (type === 'agent_stream_chunk') {
        if (currentStreamBubble) {
          currentStreamBubble.textElement.textContent += text;
          scrollToBottom();
        }
      } else if (type === 'action') {
        appendActionCard(payload.name, text);
        currentStreamBubble = null;
      } else if (type === 'consent') {
        appendConsentGate(text);
        currentStreamBubble = null;
      } else if (type === 'error') {
        appendAgentBubble(`Error: ${text}`);
        currentStreamBubble = null;
      }
    }
  });

  function appendUserBubble(text) {
    const html = `
      <div class="flex flex-col items-end w-full mt-4">
        <div class="bg-[#444] text-white px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] shadow-sm">
          <p class="text-sm font-medium whitespace-pre-wrap">${escapeHtml(text)}</p>
        </div>
      </div>
    `;
    chatContainer.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
  }

  function appendAgentBubble(text) {
    const el = createAgentBubbleElement();
    el.textElement.textContent = text;
    chatContainer.appendChild(el.container);
    scrollToBottom();
  }

  function createAgentBubbleElement() {
    const container = document.createElement('div');
    container.className = "flex flex-col items-start w-full mt-4";
    
    const bubble = document.createElement('div');
    bubble.className = "bg-[#333] text-gray-200 px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] border border-[#444] shadow-sm flex items-start gap-2";
    
    const icon = document.createElement('span');
    icon.className = "material-symbols-outlined text-[16px] text-gray-400 shrink-0 mt-0.5";
    icon.innerText = "smart_toy";
    
    const textElement = document.createElement('p');
    textElement.className = "text-sm font-medium whitespace-pre-wrap";
    
    bubble.appendChild(icon);
    bubble.appendChild(textElement);
    container.appendChild(bubble);
    
    return { container, textElement };
  }

  function appendActionCard(actionName, description) {
    const icons = {
      click: 'mouse', navigate: 'public', type: 'keyboard', scroll: 'swap_vert', double_click: 'ads_click', right_click: 'mouse'
    };
    const icon = icons[actionName] || 'build';
    
    const html = `
      <div class="bg-[#222] border border-[#444] rounded-lg p-2 flex items-center gap-2 shadow-sm mx-4 mt-2">
        <span class="material-symbols-outlined text-gray-500 text-[16px]">${icon}</span>
        <div class="flex-1 flex justify-between items-center">
          <span class="text-xs font-medium text-gray-300 truncate">${escapeHtml(description)}</span>
        </div>
      </div>
    `;
    chatContainer.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
  }

  function appendConsentGate(reason) {
    const html = `
      <div class="bg-[#fce8e6] border border-[#d93025] rounded-lg p-3 flex flex-col gap-3 shadow-sm mt-4 mx-4">
        <div class="flex items-start gap-2 text-[#d93025]">
          <span class="material-symbols-outlined text-[20px]">warning</span>
          <p class="text-title-sm font-title-sm font-bold">${escapeHtml(reason)}</p>
        </div>
        <div class="flex justify-end gap-2 mt-1">
          <button id="deny-btn" class="px-4 py-1.5 rounded-lg border border-[#d93025] text-[#d93025] hover:bg-[#f8d7da]">Deny</button>
          <button id="approve-btn" class="px-4 py-1.5 rounded-lg bg-[#d93025] text-white hover:bg-secondary">Approve</button>
        </div>
      </div>
    `;
    chatContainer.insertAdjacentHTML('beforeend', html);
    scrollToBottom();

    document.getElementById('approve-btn').addEventListener('click', (e) => {
      chrome.runtime.sendMessage({ type: "CONSENT_RESPONSE", approved: true });
      e.target.parentElement.innerHTML = '<span class="text-[#d93025] font-bold">Approved</span>';
    }, { once: true });

    document.getElementById('deny-btn').addEventListener('click', (e) => {
      chrome.runtime.sendMessage({ type: "CONSENT_RESPONSE", approved: false });
      e.target.parentElement.innerHTML = '<span class="text-[#d93025] font-bold">Denied</span>';
    }, { once: true });
  }

  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
