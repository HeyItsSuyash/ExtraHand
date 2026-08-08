// src/utils/triggerManager.js

export class TriggerManager {
  static async getTriggers() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['automation_triggers'], (result) => {
        resolve(result.automation_triggers || []);
      });
    });
  }

  static async saveTriggers(triggers) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ automation_triggers: triggers }, () => {
        resolve();
      });
    });
  }

  static async addTrigger(trigger) {
    const triggers = await this.getTriggers();
    
    // Assign a unique ID
    trigger.id = trigger.id || 'trigger_' + Date.now();
    triggers.push(trigger);
    
    await this.saveTriggers(triggers);

    // If it's a time-based trigger, register it with chrome.alarms
    if (trigger.type === 'time') {
      chrome.alarms.create(trigger.id, { periodInMinutes: parseInt(trigger.intervalMinutes) });
    }

    return trigger;
  }

  static async removeTrigger(triggerId) {
    let triggers = await this.getTriggers();
    const trigger = triggers.find(t => t.id === triggerId);
    
    if (trigger && trigger.type === 'time') {
      chrome.alarms.clear(triggerId);
    }

    triggers = triggers.filter(t => t.id !== triggerId);
    await this.saveTriggers(triggers);
  }
}
