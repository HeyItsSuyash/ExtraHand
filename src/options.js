// options.js - Settings page logic
import { TriggerManager } from './utils/triggerManager.js';

document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get(['provider_config'], (result) => {
    if (result.provider_config && result.provider_config.openai) {
      document.getElementById('openaiKey').value = result.provider_config.openai.key || '';
    }
    if (result.provider_config && result.provider_config.groq) {
      document.getElementById('groqKey').value = result.provider_config.groq.key || '';
    }
    if (result.provider_config && result.provider_config.ollama) {
      document.getElementById('ollamaUrl').value = result.provider_config.ollama.url || 'http://127.0.0.1:11434';
    }
    
    document.getElementById('executionContext').value = result.executionContext || 'notify';
    
    loadTriggers();
    loadUsage();
  });

  function loadUsage() {
    chrome.storage.local.get(['usage_stats'], (res) => {
      const list = document.getElementById('usageList');
      list.innerHTML = '';
      
      const stats = res.usage_stats || {};
      const today = new Date().toISOString().split('T')[0];
      const todayStats = stats[today];
      
      if (!todayStats || Object.keys(todayStats).length === 0) {
        list.innerHTML = '<li>No usage recorded today.</li>';
        return;
      }
      
      for (const [provider, counts] of Object.entries(todayStats)) {
        const li = document.createElement('li');
        li.style.marginBottom = '5px';
        li.innerHTML = `<strong>${provider}:</strong> ${counts.prompt} prompt, ${counts.completion} completion tokens`;
        list.appendChild(li);
      }
    });
  }

  // Save settings
  document.getElementById('saveBtn').addEventListener('click', () => {
    const openaiKey = document.getElementById('openaiKey').value;
    const groqKey = document.getElementById('groqKey').value;
    const ollamaUrl = document.getElementById('ollamaUrl').value;
    const executionContext = document.getElementById('executionContext').value;
    
    chrome.storage.local.get(['provider_config'], (result) => {
      const config = result.provider_config || { openai: { model: 'gpt-4o' }, groq: { model: 'llama3-70b-8192' }, ollama: { url: 'http://127.0.0.1:11434' } };
      if (!config.openai) config.openai = { model: 'gpt-4o' };
      if (!config.groq) config.groq = { model: 'llama3-70b-8192' };
      if (!config.ollama) config.ollama = { url: 'http://127.0.0.1:11434' };
      
      config.openai.key = openaiKey;
      config.groq.key = groqKey;
      config.ollama.url = ollamaUrl;

      chrome.storage.local.set({ provider_config: config, executionContext: executionContext }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Settings saved!';
        setTimeout(() => { status.textContent = ''; }, 2000);
      });
    });
  });

  document.getElementById('requestOllamaPermBtn').addEventListener('click', () => {
    const url = document.getElementById('ollamaUrl').value;
    const origin = new URL(url).origin + '/*';
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      if (granted) alert('Local Model permissions granted!');
      else alert('Permission denied.');
    });
  });

  document.getElementById('magicFillBtn').addEventListener('click', () => {
    const prompt = document.getElementById('magicFillInput').value;
    if (!prompt) return;
    
    document.getElementById('magicFillBtn').textContent = 'Thinking...';
    
    chrome.runtime.sendMessage({ type: "MAGIC_FILL", prompt }, (response) => {
      document.getElementById('magicFillBtn').textContent = 'Magic Fill';
      if (response && response.status === 'success' && response.rule) {
        document.getElementById('triggerType').value = response.rule.type || 'time';
        document.getElementById('triggerCondition').value = response.rule.condition || '';
        document.getElementById('triggerPrompt').value = response.rule.prompt || '';
      } else {
        alert("Failed to parse rule.");
      }
    });
  });

  document.getElementById('addTriggerBtn').addEventListener('click', async () => {
    const type = document.getElementById('triggerType').value;
    const condition = document.getElementById('triggerCondition').value;
    const prompt = document.getElementById('triggerPrompt').value;
    const nextTaskId = document.getElementById('nextTaskId').value;

    if (!prompt) return alert('Fill required fields');

    const trigger = { type, prompt };
    if (nextTaskId) trigger.nextTaskId = nextTaskId;

    if (type === 'time') {
      trigger.intervalMinutes = condition;
    } else if (type === 'navigation') {
      trigger.urlContains = condition;
    }

    await TriggerManager.addTrigger(trigger);
    loadTriggers();
  });

  async function loadTriggers() {
    const list = document.getElementById('triggerList');
    list.innerHTML = '';
    const triggers = await TriggerManager.getTriggers();
    
    triggers.forEach(t => {
      const li = document.createElement('li');
      li.style.cssText = "background: white; border: 1px solid #ccc; padding: 10px; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between;";
      
      let label = '';
      if (t.type === 'time') label = `Every ${t.intervalMinutes}m`;
      else if (t.type === 'navigation') label = `URL matches '${t.urlContains}'`;
      else if (t.type === 'browser_launch') label = `On Browser Launch`;
      else if (t.type === 'idle_timeout') label = `On System Idle`;

      const chainInfo = t.nextTaskId ? `<br><small style="color:gray;">Chains to: ${t.nextTaskId}</small>` : '';
      
      li.innerHTML = `<span><strong>${label}</strong> [${t.id}]: ${t.prompt} ${chainInfo}</span>`;
      
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.style.background = '#dc3227';
      btn.onclick = async () => {
        await TriggerManager.removeTrigger(t.id);
        loadTriggers();
      };
      
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  // --- Export / Import ---
  document.getElementById('exportWorkflowsBtn').addEventListener('click', () => {
    chrome.storage.local.get(['automation_triggers'], (res) => {
      const data = JSON.stringify(res.automation_triggers || [], null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'snorlax_workflows.json';
      a.click();
    });
  });

  document.getElementById('importWorkflowsBtn').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        chrome.storage.local.get(['automation_triggers'], (res) => {
          const current = res.automation_triggers || [];
          chrome.storage.local.set({ automation_triggers: current.concat(imported) }, () => {
            alert('Workflows imported!');
            loadTriggers();
          });
        });
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('exportAuditBtn').addEventListener('click', () => {
    chrome.storage.local.get(['action_history'], (res) => {
      const history = res.action_history || [];
      const csv = ['timestamp,role,tool_call_id,content'].concat(
        history.map(h => `"${h.timestamp || ''}","${h.role}","${h.tool_call_id || ''}","${(h.content || '').replace(/"/g, '""')}"`)
      ).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'snorlax_audit_log.csv';
      a.click();
    });
  });
});
