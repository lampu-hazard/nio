import { deliverPlannedAnswer, DeliveryPayload, DeliveryReceipt, SentAnswer } from './agent-answer-delivery';
import { AnswerPlan, planAgentAnswer } from './agent-answer-plan';
import { decideSmartEmbed } from './agent-embed-decider';

/** Only locally generated, validated image buffers may arrive through response.files. */
export function agentReplyExtras(response: any) {
  const files = response?.files?.filter((file: any) => Buffer.isBuffer(file.attachment)
    && /^nio-generated\.(png|jpg|webp)$/.test(file.name) && file.attachment.length <= 8388608).slice(0, 1);
  return { embeds: response?.embeds, components: response?.components, ...(files?.length ? { files } : {}) };
}

export function sentAnswer(message: any): SentAnswer {
  return { ...(message?.id ? { id: message.id } : {}),
    ...(typeof message?.edit === 'function' ? { edit: (payload: DeliveryPayload) => message.edit(payload) } : {}) };
}

export function prepareAgentDelivery(input: {
  content: string;
  profile?: 'PUBLIC' | 'ADMIN';
  canAttach?: boolean;
  attachmentLimit?: number;
  canEmbed?: boolean;
  responseExtras?: any;
}): { plan: AnswerPlan; extras: ReturnType<typeof agentReplyExtras> } {
  const extras = agentReplyExtras(input.responseExtras ?? {});
  const rawContent = input.content ?? '';

  const decision = decideSmartEmbed({
    content: rawContent,
    profile: input.profile,
    canEmbed: input.canEmbed !== false,
    hasCustomEmbeds: Boolean(extras.embeds && extras.embeds.length > 0),
  });

  if (decision.shouldEmbed && decision.embed) {
    return {
      plan: {
        parts: [{ content: '', sourceText: rawContent }],
        complete: true,
      },
      extras: {
        ...extras,
        embeds: [decision.embed],
      },
    };
  }

  return {
    plan: planAgentAnswer({
      content: rawContent,
      canAttach: input.canAttach === true,
      attachmentLimit: input.attachmentLimit ?? 8388608,
    }),
    extras,
  };
}

export async function deliverAgentReply(input: {
  message: { reply: (payload: any) => Promise<any> };
  loadingMessage?: { edit: (payload: any) => Promise<any> } | null;
  response: any;
  canAttach?: boolean;
  attachmentLimit?: number;
  canEmbed?: boolean;
}): Promise<DeliveryReceipt> {
  const { plan, extras } = prepareAgentDelivery({
    content: input.response?.content ?? '',
    profile: input.response?.profile,
    canAttach: input.canAttach === true,
    attachmentLimit: input.attachmentLimit ?? 8388608,
    canEmbed: input.canEmbed,
    responseExtras: input.response,
  });

  return deliverPlannedAnswer({
    plan,
    extras,
    first: async (payload) => {
      if (input.loadingMessage) {
        const edited = await input.loadingMessage.edit(payload).catch(() => null);
        if (edited) return sentAnswer(edited);
      }
      return sentAnswer(await input.message.reply(payload));
    },
    next: async (payload) => sentAnswer(await input.message.reply(payload)),
  });
}
