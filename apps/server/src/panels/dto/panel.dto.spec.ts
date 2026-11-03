import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePanelDto } from './create-panel.dto';
import { UpdatePanelDto } from './update-panel.dto';

describe('panel DTO boundaries', () => {
  it('preserves absent PATCH values instead of applying create defaults', () => {
    const dto = plainToInstance(UpdatePanelDto, { title: 'Changed' });
    expect(dto.type).toBeUndefined();
    expect(dto.mode).toBeUndefined();
    expect(dto.style).toBeUndefined();
  });

  it('allows explicit media/document clearing and revision zero', async () => {
    const dto = plainToInstance(UpdatePanelDto, { imageUrl: null, thumbnailUrl: null, visualDocument: null, expectedRevision: 0 });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.visualDocument).toBeNull();
  });

  it.each([-1, 1.5, '1'])('rejects invalid revision %s', async expectedRevision => {
    expect((await validate(plainToInstance(UpdatePanelDto, { expectedRevision }))).map(e => e.property)).toContain('expectedRevision');
  });

  it('rejects a non-object document', async () => {
    const dto = plainToInstance(CreatePanelDto, { name: 'Panel', title: 'Title', visualDocument: [] });
    expect((await validate(dto)).map(e => e.property)).toContain('visualDocument');
  });
});
