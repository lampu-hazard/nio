import { AiGenerateRequest, AiMessage, PreparedChatCall, TokenEstimate } from '../interfaces/ai-provider.interface';

export class InsufficientRequestCapacityError extends Error {
  constructor(
    readonly details: {
      requiredTokens: number;
      availableTokens: number;
      inputTokens: number;
      minOutputTokens: number;
      estimate: TokenEstimate;
    },
  ) {
    super('INSUFFICIENT_REQUEST_CAPACITY');
  }
}

function groupRemovableTurns(messages: AiMessage[]): { historyGroups: AiMessage[][]; tail: AiMessage[] } {
  if (messages.length <= 1) {
    return { historyGroups: [], tail: messages.slice() };
  }
  const current = messages[messages.length - 1];
  const history = messages.slice(0, -1);
  const groups: AiMessage[][] = [];
  let i = 0;
  while (i < history.length) {
    const msg = history[i];
    const next = history[i + 1];
    const hasToolCalls = msg.role === 'assistant' && msg.parts.some((p) => p.type === 'tool_call');
    const nextHasToolResults = next?.role === 'user' && next.parts.some((p) => p.type === 'tool_result');
    if (hasToolCalls && nextHasToolResults) {
      groups.push([msg, next]);
      i += 2;
      continue;
    }
    if (msg.role === 'user' && next?.role === 'assistant' && !next.parts.some((p) => p.type === 'tool_call')) {
      groups.push([msg, next]);
      i += 2;
      continue;
    }
    groups.push([msg]);
    i += 1;
  }
  return { historyGroups: groups, tail: [current] };
}

export async function fitChatRequest(
  request: AiGenerateRequest,
  prepare: (candidate: AiGenerateRequest) => Promise<PreparedChatCall>,
  capacity: { inputAndOutput: number | null; outputCap: number },
): Promise<{ request: AiGenerateRequest; call: PreparedChatCall; removedHistoryTurns: number }> {
  const desiredOutput = Math.max(128, Math.min(8192, Math.floor(capacity.outputCap || request.maxOutputTokens || 2048)));
  const initialRequest: AiGenerateRequest = { ...request, maxOutputTokens: desiredOutput };

  if (capacity.inputAndOutput === null) {
    const call = await prepare(initialRequest);
    return { request: initialRequest, call, removedHistoryTurns: 0 };
  }

  const maxTotal = Math.floor(capacity.inputAndOutput);
  const { historyGroups, tail } = groupRemovableTurns(request.messages);
  let activeGroups = historyGroups.slice();
  let removedHistoryTurns = 0;

  while (true) {
    const messages = [...activeGroups.flat(), ...tail];
    const candidate: AiGenerateRequest = { ...request, messages, maxOutputTokens: desiredOutput };
    const call = await prepare(candidate);
    if (call.estimate.inputTokens + call.maxOutputTokens <= maxTotal) {
      return { request: candidate, call, removedHistoryTurns };
    }
    if (activeGroups.length > 0) {
      const dropped = activeGroups.shift()!;
      removedHistoryTurns += dropped.length;
      continue;
    }
    const roomForOutput = maxTotal - call.estimate.inputTokens;
    if (roomForOutput >= 128) {
      const reducedCap = Math.max(128, Math.min(desiredOutput, roomForOutput));
      const reducedCandidate: AiGenerateRequest = { ...request, messages, maxOutputTokens: reducedCap };
      const reducedCall = await prepare(reducedCandidate);
      if (reducedCall.estimate.inputTokens + reducedCall.maxOutputTokens <= maxTotal) {
        return { request: reducedCandidate, call: reducedCall, removedHistoryTurns };
      }
    }
    throw new InsufficientRequestCapacityError({
      requiredTokens: call.estimate.inputTokens + 128,
      availableTokens: Math.max(0, maxTotal),
      inputTokens: call.estimate.inputTokens,
      minOutputTokens: 128,
      estimate: call.estimate,
    });
  }
}
