import { ConversationTurn } from './conversation-memory.service';

export function deliveredConversationTurns(
  pending: ConversationTurn[] | undefined, deliveredContent: string,
): ConversationTurn[] {
  if (!pending?.length || !deliveredContent) return [];
  return [...pending.slice(0, -1), { ...pending[pending.length - 1], aiResponse: deliveredContent }];
}
