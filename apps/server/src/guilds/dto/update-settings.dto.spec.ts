import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './update-settings.dto';

describe('UpdateSettingsDto', () => {
  it('rejects invalid slowmode durations', async () => {
    const dto = new UpdateSettingsDto();
    dto.slowmodeIntervalQuiet = -1;
    dto.slowmodeIntervalNormal = -1;
    dto.slowmodeIntervalBusy = 21601;

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining([
      'slowmodeIntervalQuiet',
      'slowmodeIntervalNormal',
      'slowmodeIntervalBusy',
    ]));
  });

  it('accepts zero-second slowmode durations', async () => {
    const dto = new UpdateSettingsDto();
    dto.slowmodeIntervalQuiet = 0;
    dto.slowmodeIntervalNormal = 0;
    dto.slowmodeIntervalBusy = 0;

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('validates hall of fame threshold bounds', async () => {
    const invalidDto = new UpdateSettingsDto();
    invalidDto.hallOfFameThreshold = 0;
    const errors = await validate(invalidDto);
    expect(errors.map((e) => e.property)).toContain('hallOfFameThreshold');

    const invalidDtoHigh = new UpdateSettingsDto();
    invalidDtoHigh.hallOfFameThreshold = 101;
    const errorsHigh = await validate(invalidDtoHigh);
    expect(errorsHigh.map((e) => e.property)).toContain('hallOfFameThreshold');

    const validDto = new UpdateSettingsDto();
    validDto.hallOfFameThreshold = 5;
    await expect(validate(validDto)).resolves.toHaveLength(0);
  });
});
