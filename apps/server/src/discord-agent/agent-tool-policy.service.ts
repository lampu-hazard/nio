import { ForbiddenException, Injectable } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { AgentAccessService } from './agent-access.service';
import { AgentRequestScope, AgentScope, parseAgentProfile } from './agent-profile.types';
import { AGENT_TOOLS } from './discord-agent-tools';
import { AiToolDefinition } from './interfaces/ai-provider.interface';
import { McpToolService } from './mcp-tool.service';
import { PluginToolRegistryService } from '../plugins/plugin-tool-registry.service';

export type AgentToolContext = AgentRequestScope & { requestedById: string };
export type AgentToolEntry = { id: string; definition: AiToolDefinition; dispatchName: string; source: 'BUILTIN' | 'PLUGIN' | 'MCP' };
export type AgentToolCatalogItem = {
  id: string;
  name: string;
  description: string;
  source: 'BUILTIN' | 'PLUGIN' | 'MCP';
  mode: 'read' | 'write';
  available: boolean;
  unavailableReason?: string | null;
};

const PUBLIC_WEB_TOOLS = new Set(['web_search', 'web_fetch']);
const MODERATION_READS = new Set(['get_user_warnings', 'get_member_info', 'get_user_notes', 'check_user_activity_score', 'lookup_domain_reputation']);
const CHANNEL_READS = new Set(['get_channel_recent_messages', 'get_channel_slowmode', 'get_channel_info', 'get_message_context', 'find_duplicate_messages']);
const GUILD_READS = new Set([
  'get_server_settings', 'get_deleted_message_history', 'get_server_channels', 'get_server_roles', 'get_guild_overview',
  'get_member_permissions', 'get_bot_permissions', 'get_role_info', 'get_voice_state', 'get_server_stats',
  'get_voice_leaderboard', 'get_chat_leaderboard', 'get_discord_audit_logs', 'get_audit_logs', 'get_member_audit_trail',
  'get_moderator_actions', 'search_audit_events', 'get_recent_joins', 'get_invite_links', 'trace_user_timeline',
  'find_correlated_accounts', 'detect_role_hierarchy_blockers', 'analyze_channel_permissions_leak',
  'recover_panel_from_message', 'find_unlinked_panels',
]);
const WRITE_TOOLS = new Set([
  'warn_user', 'timeout_user', 'kick_user', 'ban_user', 'purge_channel_messages', 'add_role_to_user', 'remove_role_from_user',
  'remove_timeout_user', 'revoke_warning', 'update_server_settings', 'lockdown_channel', 'unlock_channel',
  'set_channel_slowmode', 'send_channel_announcement', 'purge_user_messages', 'mass_moderation_action', 'manage_server_sticker',
  'create_channel', 'edit_channel', 'delete_channel', 'move_channel', 'set_channel_permissions', 'create_category_with_channels',
  'clone_channel_permissions', 'sync_category_permissions', 'rename_channel_batch', 'cleanup_empty_channels',
  'create_role', 'edit_role', 'delete_role', 'move_role', 'snapshot_member_roles', 'restore_member_roles', 'quarantine_member',
  'send_plain_message', 'send_embed_message', 'edit_bot_message', 'delete_bot_message', 'create_thread', 'archive_thread',
  'lock_thread', 'pin_message', 'unpin_message', 'react_to_message', 'remove_reaction', 'move_member_voice',
  'disconnect_member_voice', 'set_voice_channel_status', 'create_invite', 'delete_invite', 'bot_join_voice', 'bot_leave_voice',
]);

@Injectable()
export class AgentToolPolicyService {
  private client?: Client;
  constructor(
    private readonly access: AgentAccessService,
    private readonly plugins: PluginToolRegistryService,
    private readonly mcp: McpToolService,
  ) {}

  setClient(client: Client) { this.client = client; }

  async definitions(context: AgentToolContext): Promise<AiToolDefinition[]> {
    return (await this.entries(context)).map((entry) => entry.definition);
  }

  async resolveCall(context: AgentToolContext, providerName: string, args: unknown): Promise<AgentToolEntry> {
    const entry = (await this.entries(context)).find((candidate) => candidate.definition.name === providerName);
    if (!entry) throw new ForbiddenException('Tool is not available for this profile.');
    await this.authorizeRead(context, entry, args);
    return entry;
  }

  async assertAllowed(context: AgentToolContext, toolId: string, args: unknown): Promise<void> {
    const entry = (await this.entries(context)).find((candidate) => candidate.id === toolId);
    if (!entry) throw new ForbiddenException('Tool is not available for this profile.');
    await this.authorizeRead(context, entry, args);
  }

  async catalog(scope: AgentScope): Promise<AgentToolCatalogItem[]> {
    const profile = parseAgentProfile(scope.profile);
    const items: AgentToolCatalogItem[] = AGENT_TOOLS
      .filter((tool) => profile === 'PUBLIC'
        ? PUBLIC_WEB_TOOLS.has(tool.name)
        : (PUBLIC_WEB_TOOLS.has(tool.name) || MODERATION_READS.has(tool.name) || CHANNEL_READS.has(tool.name)
          || GUILD_READS.has(tool.name) || WRITE_TOOLS.has(tool.name) || tool.name === 'preview_embed_message'))
      .map((tool) => ({
        id: tool.name,
        name: tool.name,
        description: tool.description,
        source: 'BUILTIN' as const,
        mode: tool.safety.mode,
        available: true,
        unavailableReason: null,
      }));
    if (profile === 'ADMIN') {
      for (const tool of await this.plugins.definitionsForGuild(scope.guildId)) {
        const available = tool.safety.mode === 'read' && !tool.safety.proposalRequired;
        items.push({
          id: `plugin:${tool.pluginId}:${tool.name}`,
          name: `${tool.pluginId}:${tool.name}`,
          description: tool.description,
          source: 'PLUGIN',
          mode: tool.safety.mode,
          available,
          unavailableReason: available ? null : 'Plugin write confirmation adapter is not enabled.',
        });
      }
      for (const tool of await this.mcp.definitions()) {
        const resolved = this.mcp.resolve(tool.name);
        if (!resolved) continue;
        items.push({
          id: `mcp:${resolved.config.name}:${resolved.remoteName}`,
          name: `${resolved.config.name}:${resolved.remoteName}`,
          description: tool.description,
          source: 'MCP',
          mode: tool.safety.mode,
          available: true,
          unavailableReason: null,
        });
      }
    }
    return items;
  }

  async entries(context: AgentToolContext): Promise<AgentToolEntry[]> {
    parseAgentProfile(context.profile);
    if (!context.userId || context.requestedById !== context.userId) throw new ForbiddenException('Tool requester mismatch.');
    const decision = await this.access.resolve(context, 'CHAT');
    if (!decision.allowed) throw new ForbiddenException('Agent admission revoked.');
    const selected = new Set(decision.settings.allowedToolIds);
    const candidates: AgentToolEntry[] = AGENT_TOOLS.filter((tool) => selected.has(tool.name)
      && (context.profile === 'PUBLIC'
        ? PUBLIC_WEB_TOOLS.has(tool.name)
        : (PUBLIC_WEB_TOOLS.has(tool.name) || MODERATION_READS.has(tool.name) || CHANNEL_READS.has(tool.name)
          || GUILD_READS.has(tool.name) || WRITE_TOOLS.has(tool.name) || tool.name === 'preview_embed_message')))
      .map((definition) => ({ id: definition.name, definition, dispatchName: definition.name, source: 'BUILTIN' }));
    if (context.profile === 'ADMIN' && [...selected].some((id) => id.startsWith('plugin:'))) {
      for (const tool of await this.plugins.definitionsForGuild(context.guildId)) {
        const id = `plugin:${tool.pluginId}:${tool.name}`;
        if (selected.has(id) && tool.safety.mode === 'read' && !tool.safety.proposalRequired) {
          candidates.push({ id, definition: { ...tool, name: this.providerName(id) }, dispatchName: tool.name, source: 'PLUGIN' });
        }
      }
    }
    if (context.profile === 'ADMIN' && [...selected].some((id) => id.startsWith('mcp:'))) {
      for (const tool of await this.mcp.definitions()) {
        const resolved = this.mcp.resolve(tool.name);
        if (!resolved) continue;
        const id = `mcp:${resolved.config.name}:${resolved.remoteName}`;
        if (selected.has(id)) candidates.push({ id, definition: { ...tool, name: this.providerName(id) }, dispatchName: tool.name, source: 'MCP' });
      }
    }
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const entry of candidates) {
      if (names.has(entry.definition.name) || ids.has(entry.id)) throw new ForbiddenException('Tool catalog collision.');
      names.add(entry.definition.name);
      ids.add(entry.id);
    }
    const available: AgentToolEntry[] = [];
    for (const entry of candidates) {
      try { await this.authorizeRead(context, entry, {}); available.push(entry); }
      catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    }
    return available;
  }

  private providerName(id: string) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  }

  private async authorizeRead(context: AgentToolContext, entry: AgentToolEntry, args: unknown) {
    try {
      const guild = this.client?.guilds.cache.get(context.guildId);
      if (!guild) throw new ForbiddenException('Guild unavailable.');
      const member = await guild.members.fetch({ user: context.userId, force: true });
      if (member.guild.id !== context.guildId) throw new ForbiddenException('Member unavailable.');
      const manager = guild.ownerId === context.userId || member.permissions.has(PermissionFlagsBits.ManageGuild)
        || member.permissions.has(PermissionFlagsBits.Administrator);
      if (entry.definition.safety.ownerOnly && (!process.env.OWNER_DISCORD_ID || process.env.OWNER_DISCORD_ID !== context.userId)) {
        throw new ForbiddenException('Owner-only tool.');
      }
      if (entry.source !== 'BUILTIN' || GUILD_READS.has(entry.id)) {
        if (!manager) throw new ForbiddenException('Guild management permission required.');
      } else if (MODERATION_READS.has(entry.id) && !manager && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        throw new ForbiddenException('Moderation permission required.');
      }
      const input = args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {};
      const channelIds = new Set([context.channelId]);
      for (const key of ['channelId', 'sourceChannelId', 'targetChannelId']) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'string' || !input[key]) throw new ForbiddenException('Invalid channel.');
          channelIds.add(input[key] as string);
        }
      }
      for (const id of channelIds) {
        const channel = await guild.channels.fetch(id, { force: true });
        if (!channel || channel.guildId !== context.guildId || !channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
          throw new ForbiddenException('Source channel is not visible.');
        }
        if (CHANNEL_READS.has(entry.id) && !channel.permissionsFor(member)?.has(PermissionFlagsBits.ReadMessageHistory)) {
          throw new ForbiddenException('Message history permission required.');
        }
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('Current tool permissions unavailable.');
    }
  }
}
