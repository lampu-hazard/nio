import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from './api-exception.filter';

function fixture() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/guilds/123/panels/p' }), getResponse: () => response }) };
  const logger = { warn: jest.fn(), error: jest.fn() };
  return { response, host, filter: new ApiExceptionFilter(logger as any) };
}

describe('database schema errors', () => {
  it.each(['P2021', 'P2022'])('reports %s as unavailable with actionable migration guidance, without leaking database details', code => {
    const f = fixture();
    f.filter.catch(new Prisma.PrismaClientKnownRequestError('private database details', { code, clientVersion: '6', meta: { column: 'Panel.visualDocument' } }), f.host as any);
    expect(f.response.status).toHaveBeenCalledWith(503);
    expect(f.response.json).toHaveBeenCalledWith({ ok: false, code: 'DATABASE_SCHEMA_OUTDATED', message: 'Database schema is out of date. Ask the administrator to apply the pending Prisma migrations before retrying.' });
  });

  it('keeps unrelated failures as generic internal errors', () => {
    const f = fixture();
    f.filter.catch(new Error('private details'), f.host as any);
    expect(f.response.status).toHaveBeenCalledWith(500);
    expect(f.response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR', message: 'Internal server error' }));
  });
});
