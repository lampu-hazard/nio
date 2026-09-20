import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { DiscordInteractionService } from './discord-interaction.service';

describe('DiscordInteractionService', () => {
  let service: DiscordInteractionService;
  let selfRolesMock: any;
  let agentProposalsMock: any;
  let agentActionRendererMock: any;
  let commandRegistryMock: any;
  let pluginAccessMock: any;

  beforeEach(() => {
    selfRolesMock = {
      toggleFromInteraction: jest.fn(async () => {}),
    };
    agentProposalsMock = {
      approveAndExecute: jest.fn(async () => ({ ok: true, message: 'Proposal executed successfully.' })),
      cancelProposal: jest.fn(async () => ({ ok: true, message: 'Proposal cancelled successfully.' })),
    };
    agentActionRendererMock = {
      renderExecutionResult: jest.fn(async (title: string, message: string) => ({
        embeds: [{ title, description: message }],
        components: [],
      })),
    };
    commandRegistryMock = {
      get: jest.fn(),
    };
    pluginAccessMock = {
      canUse: jest.fn(async () => true),
    };

    service = new DiscordInteractionService(
      selfRolesMock,
      agentProposalsMock,
      agentActionRendererMock,
      commandRegistryMock,
      pluginAccessMock,
    );
  });

  it('handles agent:approve button interaction with deferUpdate and editReply', async () => {
    const interaction: any = {
      isChatInputCommand: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: 'agent:approve:prop-123',
      user: { id: 'admin-1' },
      guildId: 'guild-1',
      deferred: false,
      replied: false,
      deferUpdate: jest.fn(async () => {
        interaction.deferred = true;
      }),
      editReply: jest.fn(async () => {}),
      update: jest.fn(async () => {}),
      reply: jest.fn(async () => {}),
      followUp: jest.fn(async () => {}),
    };

    await service.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(agentProposalsMock.approveAndExecute).toHaveBeenCalledWith('prop-123', 'admin-1');
    expect(agentActionRendererMock.renderExecutionResult).toHaveBeenCalledWith(
      'Proposal Executed',
      'Proposal executed successfully.',
      'guild-1',
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [{ title: 'Proposal Executed', description: 'Proposal executed successfully.' }],
      }),
    );
  });

  it('handles agent:cancel button interaction with deferUpdate and editReply', async () => {
    const interaction: any = {
      isChatInputCommand: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: 'agent:cancel:prop-456',
      user: { id: 'admin-2' },
      guildId: 'guild-1',
      deferred: false,
      replied: false,
      deferUpdate: jest.fn(async () => {
        interaction.deferred = true;
      }),
      editReply: jest.fn(async () => {}),
      update: jest.fn(async () => {}),
      reply: jest.fn(async () => {}),
      followUp: jest.fn(async () => {}),
    };

    await service.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(agentProposalsMock.cancelProposal).toHaveBeenCalledWith('prop-456', 'admin-2');
    expect(agentActionRendererMock.renderExecutionResult).toHaveBeenCalledWith(
      'Proposal Cancelled',
      'Proposal cancelled successfully.',
      'guild-1',
    );
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('handles agent proposal execution error with followUp when deferred', async () => {
    agentProposalsMock.approveAndExecute.mockRejectedValueOnce(new Error('Permission denied'));

    const interaction: any = {
      isChatInputCommand: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: 'agent:approve:prop-err',
      user: { id: 'user-unauthorized' },
      guildId: 'guild-1',
      deferred: false,
      replied: false,
      deferUpdate: jest.fn(async () => {
        interaction.deferred = true;
      }),
      editReply: jest.fn(async () => {}),
      reply: jest.fn(async () => {}),
      followUp: jest.fn(async () => {}),
    };

    await service.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Permission denied',
      }),
    );
  });

  it('handles self-role button interaction', async () => {
    const interaction: any = {
      isChatInputCommand: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: 'sr:panel-1:role-1',
    };

    await service.handle(interaction);

    expect(selfRolesMock.toggleFromInteraction).toHaveBeenCalledWith(interaction, 'panel-1', 'role-1');
  });

  it('handles self-role select menu interaction', async () => {
    const interaction: any = {
      isChatInputCommand: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      customId: 'sr-menu:panel-2',
      values: ['role-chosen'],
    };

    await service.handle(interaction);

    expect(selfRolesMock.toggleFromInteraction).toHaveBeenCalledWith(interaction, 'panel-2', 'role-chosen');
  });
});
