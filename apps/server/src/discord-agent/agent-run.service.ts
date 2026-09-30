import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AgentRunStatus =
  | 'PLANNING'
  | 'INVESTIGATING'
  | 'SYNTHESIZING'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export type AgentRunStage = 'PLANNING' | 'INVESTIGATING' | 'SYNTHESIZING' | 'AWAITING_APPROVAL';

const TERMINAL_STATUSES = new Set<AgentRunStatus>(['AWAITING_APPROVAL', 'COMPLETED', 'PARTIAL', 'FAILED']);

function sanitizeEventText(text: string) {
  return text
    .replace(/[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}/g, '[REDACTED_DISCORD_TOKEN]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/AIzaSy[A-Za-z0-9_-]{30,40}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/(postgres|postgresql|redis|mongodb|mysql):\/\/([^:]+):([^@]+)@/gi, '$1://$2:***@')
    .replace(/(token|password|secret|api[_-]?key|bearer)\s*[:=]\s*['\"]?[A-Za-z0-9_\-\.]{10,}['\"]?/gi, '$1: [REDACTED]');
}

function neutralizeEventMentions(text: string) {
  return text.replace(/@(everyone|here)/gi, (_, mention) => `@${String.fromCharCode(8203)}${mention}`);
}
const MAX_EVENT_SUMMARY_LENGTH = 1000;
const MAX_METADATA_LENGTH = 4000;

@Injectable()
export class AgentRunService {
  constructor(private readonly prisma: PrismaService) {}

  async start(guildId: string, channelId: string, userId: string, retentionDays = 30) {
    const run = await this.prisma.agentRun.create({
      data: { guildId, channelId, userId, status: 'PLANNING' },
    });
    await this.addEvent(run.id, 'STAGE', 'PLANNING', 'Permintaan diterima; menyiapkan pemeriksaan.');
    await this.cleanup(guildId, retentionDays).catch(() => undefined);
    return run;
  }

  async stage(runId: string, stage: AgentRunStage, summary: string) {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run || TERMINAL_STATUSES.has(run.status as AgentRunStatus)) return;
    await this.prisma.agentRun.update({ where: { id: runId }, data: { status: stage } });
    await this.addEvent(runId, 'STAGE', stage, summary);
  }

  async evidence(runId: string, tool: string, outcome: 'SUCCESS' | 'EMPTY' | 'PARTIAL' | 'FAILED', summary: string) {
    await this.addEvent(runId, 'EVIDENCE', 'INVESTIGATING', summary, { tool, outcome });
  }

  async proposal(runId: string, proposalId: string, action: string) {
    await this.addEvent(runId, 'PROPOSAL', 'AWAITING_APPROVAL', `Proposal ${action} dibuat; menunggu persetujuan moderator.`, { proposalId, action });
  }

  async finish(runId: string, status: AgentRunStatus, summary: string) {
    const current = await this.prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!current || TERMINAL_STATUSES.has(current.status as AgentRunStatus)) return;
    const now = new Date();
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status, completedAt: status === 'AWAITING_APPROVAL' ? null : now },
    });
    await this.addEvent(runId, status === 'AWAITING_APPROVAL' ? 'STAGE' : 'FINISH', status, summary);
  }

  private async addEvent(runId: string, type: string, stage: string, summary: string, metadata?: Record<string, unknown>) {
    const count = await this.prisma.agentRunEvent.count({ where: { runId } });
    const safeSummary = neutralizeEventMentions(sanitizeEventText(summary)).slice(0, MAX_EVENT_SUMMARY_LENGTH);
    let safeMetadata = metadata;
    if (metadata) {
      const serialized = neutralizeEventMentions(sanitizeEventText(JSON.stringify(metadata)));
      safeMetadata = serialized.length > MAX_METADATA_LENGTH
        ? { truncated: true, preview: serialized.slice(0, MAX_METADATA_LENGTH) }
        : JSON.parse(serialized);
    }
    await this.prisma.agentRunEvent.create({
      data: { runId, sequence: count + 1, type, stage, summary: safeSummary, metadata: safeMetadata as any },
    });
  }

  private async cleanup(guildId: string, retentionDays: number) {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    await this.prisma.agentRun.deleteMany({ where: { guildId, startedAt: { lt: cutoff } } });
  }
}
