// utils/usageTracker.js

export class UsageTracker {
  static async logUsage(provider, model, promptTokens, completionTokens) {
    if (!promptTokens && !completionTokens) return;
    
    return new Promise((resolve) => {
      chrome.storage.local.get(['usage_stats'], (res) => {
        const stats = res.usage_stats || {};
        const today = new Date().toISOString().split('T')[0];
        
        if (!stats[today]) {
          stats[today] = {};
        }
        
        if (!stats[today][provider]) {
          stats[today][provider] = { prompt: 0, completion: 0 };
        }
        
        stats[today][provider].prompt += promptTokens;
        stats[today][provider].completion += completionTokens;
        
        chrome.storage.local.set({ usage_stats: stats }, resolve);
      });
    });
  }

  static async getUsage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['usage_stats'], (res) => {
        resolve(res.usage_stats || {});
      });
    });
  }
}
