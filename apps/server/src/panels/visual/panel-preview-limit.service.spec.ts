import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { PanelPreviewLimitService } from './panel-preview-limit.service';

afterEach(() => { jest.useRealTimers(); });
describe('panel preview limits', () => {
  it('allows ten requests per user and guild and expires the bucket', () => {
    jest.useFakeTimers();
    const service = new PanelPreviewLimitService();
    for (let i = 0; i < 10; i++) service.consume('123', 'u');
    expect(() => service.consume('123', 'u')).toThrow(/limit/i);
    expect(() => service.consume('123', 'other')).not.toThrow();
    jest.advanceTimersByTime(60_001);
    expect(() => service.consume('123', 'u')).not.toThrow();
  });
});
