import { deliverPlannedAnswer, DeliveryPayload, DeliveryReceipt, SentAnswer } from './agent-answer-delivery';
import { planAgentAnswer } from './agent-answer-plan';

/** Only locally generated, validated image buffers may arrive through response.files. */
export function agentReplyExtras(response: any) {
  const files = response.files?.filter((file: any) => Buffer.isBuffer(file.attachment)
    && /^nio-generated\.(png|jpg|webp)$/.test(file.name) && file.attachment.length <= 8388608).slice(0, 1);
  return { embeds: response.embeds, components: response.components, ...(files?.length ? { files } : {}) };
}
export function sentAnswer(message: any): SentAnswer {
  return { ...(message?.id ? { id: message.id } : {}),
    ...(typeof message?.edit === 'function' ? { edit: (payload: DeliveryPayload) => message.edit(payload) } : {}) };
}
export async function deliverAgentReply(input: {
  message: { reply: (payload: any) => Promise<any> };
  loadingMessage?: { edit: (payload: any) => Promise<any> } | null;
  response: any; canAttach?: boolean; attachmentLimit?: number;
}): Promise<DeliveryReceipt> {
  return deliverPlannedAnswer({
    plan: planAgentAnswer({ content: input.response.content ?? '', canAttach: input.canAttach === true, attachmentLimit: input.attachmentLimit ?? 8388608 }),
    extras: agentReplyExtras(input.response),
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
