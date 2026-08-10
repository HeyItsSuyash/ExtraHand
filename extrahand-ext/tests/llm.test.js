import { jest } from '@jest/globals';
import { LLMProvider } from '../src/utils/llm.js';

describe('LLMProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize correctly with groq', () => {
    const provider = new LLMProvider('groq', 'fake-key', 'llama3-70b-8192');
    expect(provider.providerName).toBe('groq');
    expect(provider.apiKey).toBe('fake-key');
  });

  it('should initialize correctly with ollama', () => {
    const provider = new LLMProvider('ollama', 'http://127.0.0.1:11434', 'llama3');
    expect(provider.providerName).toBe('ollama');
  });

  it('should format tool calls correctly for ollama', async () => {
    const provider = new LLMProvider('ollama', 'http://127.0.0.1:11434', 'llama3');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          message: {
            content: 'I will do that',
            tool_calls: [{ function: { name: 'click', arguments: '{"ref_id": 5}' } }]
          }
        })
      })
    );

    const tools = [{ name: 'click', description: 'Click element', parameters: { ref_id: 'number' } }];
    const result = await provider.prompt('System msg', [{ role: 'user', content: 'click it' }], tools, null);
    
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:11434/api/chat', expect.any(Object));
    expect(result.tool_calls.length).toBe(1);
    expect(result.tool_calls[0].name).toBe('click');
  });
});
