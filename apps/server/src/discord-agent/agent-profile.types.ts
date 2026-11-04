import { BadRequestException } from '@nestjs/common';

export type AgentProfile = 'PUBLIC' | 'ADMIN';
export type AgentScope = { guildId: string; profile: AgentProfile };
export type AgentRequestScope = AgentScope & { channelId: string; userId: string };

export function parseAgentProfile(value: unknown): AgentProfile {
  if (value !== 'PUBLIC' && value !== 'ADMIN') throw new BadRequestException('Invalid agent profile.');
  return value;
}
