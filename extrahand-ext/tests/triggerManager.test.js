import { jest } from '@jest/globals';
import { TriggerManager } from '../src/utils/triggerManager.js';

// Mock the global chrome API
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn()
  }
};

describe('TriggerManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get empty triggers when nothing is saved', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({});
    });
    const triggers = await TriggerManager.getTriggers();
    expect(triggers).toEqual([]);
  });

  it('should add a time-based trigger and register an alarm', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ automation_triggers: [] });
    });
    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    const trigger = { type: 'time', prompt: 'test prompt', intervalMinutes: '10' };
    const saved = await TriggerManager.addTrigger(trigger);

    expect(saved.id).toBeDefined();
    expect(saved.id).toMatch(/trigger_\d+/);
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(chrome.alarms.create).toHaveBeenCalledWith(saved.id, { periodInMinutes: 10 });
  });

  it('should remove a trigger and clear the alarm', async () => {
    const fakeTriggers = [{ id: 'trigger_1', type: 'time', prompt: 'test' }];
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ automation_triggers: fakeTriggers });
    });
    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await TriggerManager.removeTrigger('trigger_1');

    expect(chrome.alarms.clear).toHaveBeenCalledWith('trigger_1');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { automation_triggers: [] },
      expect.any(Function)
    );
  });
});
