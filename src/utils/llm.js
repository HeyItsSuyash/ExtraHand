// utils/llm.js - Abstraction layer for LLM APIs
import { UsageTracker } from './usageTracker.js';

export class LLMProvider {
  constructor(providerName, apiKey, model) {
    this.providerName = providerName;
    this.apiKey = apiKey;
    this.model = model;
  }

  async prompt(systemMessage, messages, tools, onChunk) {
    if (this.providerName === 'openai' || this.providerName === 'groq') {
      return this._callOpenAI(systemMessage, messages, tools, onChunk);
    }
    if (this.providerName === 'ollama') {
      return this._callOllama(systemMessage, messages, tools, onChunk);
    }
    throw new Error(`Provider ${this.providerName} not supported yet.`);
  }

  async _callOpenAI(systemMessage, messages, tools, onChunk) {
    const endpoint = this.providerName === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const formattedMessages = [
      { role: 'system', content: systemMessage },
      ...messages
    ];

    const formattedTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters || {}).map(([k, v]) => [k, { type: typeof v === 'string' && v.includes('number') ? 'number' : 'string' }])
          ),
          required: Object.keys(t.parameters || {})
        }
      }
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        stream: true,
        stream_options: { include_usage: true }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI API Error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = '';
    let functionCallBuffer = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices[0].delta;

            // Handle Text
            if (delta.content) {
              fullText += delta.content;
              if (onChunk) onChunk({ type: 'text', content: delta.content });
            }

            // Handle Tool Calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!functionCallBuffer) functionCallBuffer = [];
                if (tc.function.name) {
                  functionCallBuffer[tc.index] = {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments || ''
                  };
                } else if (tc.function.arguments && functionCallBuffer[tc.index]) {
                  functionCallBuffer[tc.index].arguments += tc.function.arguments;
                }
              }
            }

            // Usage reporting in stream (if supported by provider)
            if (data.usage) {
               UsageTracker.logUsage(this.providerName, this.model, data.usage.prompt_tokens, data.usage.completion_tokens);
            }
          } catch (e) {
            console.error("Error parsing stream line:", line, e);
          }
        }
      }
    }

    const tool_calls = [];
    if (functionCallBuffer) {
      for (const fc of functionCallBuffer) {
        if (fc) {
          tool_calls.push({
            id: fc.id,
            name: fc.name,
            arguments: JSON.parse(fc.arguments || "{}")
          });
        }
      }
    }

    return { text: fullText, tool_calls };
  }

  async _callOllama(systemMessage, messages, tools, onChunk) {
    // Assuming this.apiKey is actually the Base URL for Ollama (e.g. http://localhost:11434)
    const baseUrl = this.apiKey || 'http://127.0.0.1:11434';
    const endpoint = `${baseUrl}/api/chat`;
    
    const formattedMessages = [
      { role: 'system', content: systemMessage },
      ...messages.map(m => {
        if (m.tool_calls) {
           return { role: m.role, content: `[Tool Call: ${JSON.stringify(m.tool_calls)}]` };
        }
        if (m.tool_call_id) {
           return { role: m.role, content: `[Tool Result: ${m.content}]` };
        }
        return { role: m.role, content: m.content || "" };
      })
    ];

    // Ollama supports tools natively in recent versions
    const formattedTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters || {}).map(([k, v]) => [k, { type: typeof v === 'string' && v.includes('number') ? 'number' : 'string' }])
          ),
          required: Object.keys(t.parameters || {})
        }
      }
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model || 'llama3',
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        stream: false // Using non-streaming for simplicity with Ollama tools for now
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const message = data.message;
    
    if (onChunk && message.content) {
      onChunk({ type: 'text', content: message.content });
    }

    return { 
      text: message.content || '', 
      tool_calls: message.tool_calls ? message.tool_calls.map(tc => ({
        id: 'call_' + Date.now(),
        name: tc.function.name,
        arguments: tc.function.arguments
      })) : []
    };
  }
}
