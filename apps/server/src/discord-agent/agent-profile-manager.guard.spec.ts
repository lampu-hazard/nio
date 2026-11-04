import { describe, expect, it } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PermissionFlagsBits } from 'discord.js';
import { AgentProfileManagerGuard } from './agent-profile-manager.guard';
import { AiAgentSettingsController } from './ai-agent-settings.controller';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { AgentQuotaQueryService } from './quota/agent-quota-query.service';

const context = (profile?: string, userId = 'user') => ({ switchToHttp: () => ({ getRequest: () => ({ params: { guildId: 'guild', profile }, session: { user: { id: userId } } }) }) }) as any;

describe('AgentProfileManagerGuard', () => {
  it('requires fresh Manage Guild or Administrator for ADMIN, including compatibility PATCH', async () => {
    const guard = new AgentProfileManagerGuard();
    let permission = PermissionFlagsBits.ManageRoles;
    const guild = { ownerId: 'owner', members: { fetch: async () => ({ guild: { id: 'guild' }, permissions: { has: (bit: bigint) => permission === bit } }) } };
    guard.setClient({ guilds: { fetch: async () => guild } } as any);
    await expect(guard.canActivate(context('ADMIN'))).rejects.toThrow();
    await expect(guard.canActivate(context())).rejects.toThrow();
    permission = PermissionFlagsBits.ManageGuild;
    await expect(guard.canActivate(context('ADMIN'))).resolves.toBe(true);
    permission = PermissionFlagsBits.Administrator;
    await expect(guard.canActivate(context())).resolves.toBe(true);
    permission = 0n;
    await expect(guard.canActivate(context('ADMIN', 'owner'))).resolves.toBe(true);
  });
  it('does not add an ADMIN manager requirement to PUBLIC or trust unavailable membership', async () => {
    const guard = new AgentProfileManagerGuard();
    await expect(guard.canActivate(context('PUBLIC'))).resolves.toBe(true);
    await expect(guard.canActivate(context('ADMIN'))).rejects.toThrow();
    await expect(guard.canActivate(context('admin'))).rejects.toThrow();
  });
  it('shares the Discord client with the Nest @UseGuards injectable instance created for AiAgentSettingsController', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiAgentSettingsController],
      providers: [
        AgentProfileManagerGuard,
        {
          provide: AiAgentSettingsService,
          useValue: {
            client: undefined as any,
            setClient(client: any) { this.client = client; },
            getClient() { return this.client; },
          },
        },
        { provide: AgentQuotaQueryService, useValue: {} },
      ],
    }).compile();

    const guild = {
      ownerId: 'owner',
      members: {
        fetch: async () => ({
          guild: { id: 'guild' },
          permissions: { has: (bit: bigint) => bit === PermissionFlagsBits.ManageGuild },
        }),
      },
    };
    const fakeClient = { guilds: { fetch: async () => guild } } as any;

    // Simulate DiscordBotService constructor injection (which resolves from hostModule.providers, NOT hostModule.injectables)
    const modulesContainer = (moduleRef as any).container.getModules();
    const hostModule = Array.from(modulesContainer.values()).find((m: any) => m.controllers?.has(AiAgentSettingsController)) as any;
    const providerInstance = hostModule.providers.get(AgentProfileManagerGuard).instance;
    const guardMeta = Reflect.getMetadata(GUARDS_METADATA, AiAgentSettingsController.prototype.updateProfileSettings)[0];
    const injectableInstance = hostModule.injectables.get(guardMeta).instance;

    moduleRef.get(AiAgentSettingsService).setClient(fakeClient);
    providerInstance.setClient(fakeClient);

    await expect(injectableInstance.canActivate(context('ADMIN'))).resolves.toBe(true);
  });
});

