import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAiAgentSettingsDto } from './update-ai-agent-settings.dto';

describe('behavior settings DTO', () => {
  it.each([
    ['conversationStyle', ['BALANCED', 'CASUAL', 'FORMAL']],
    ['responseLength', ['CONCISE', 'ADAPTIVE', 'DETAILED']],
    ['activityVisibility', ['BRIEF', 'HIDDEN']],
    ['webResearchPolicy', ['AUTO', 'ON_REQUEST']],
  ] as const)('accepts every valid %s value', async (field, values) => {
    for (const value of values) expect(await validate(plainToInstance(UpdateAiAgentSettingsDto, { [field]: value }))).toHaveLength(0);
  });
  it('accepts omitted preferences', async () => {
    expect(await validate(plainToInstance(UpdateAiAgentSettingsDto, {}))).toHaveLength(0);
  });
  it.each(['conversationStyle', 'responseLength', 'activityVisibility', 'webResearchPolicy'])('rejects null and invalid %s', async (field) => {
    for (const value of [null, '', 'INVALID']) {
      const errors = await validate(plainToInstance(UpdateAiAgentSettingsDto, { [field]: value }));
      expect(errors.some((error) => error.property === field)).toBe(true);
    }
  });
});
