import { Logger } from '@nestjs/common';
import { AnswerPlan } from './agent-answer-plan';
export type DeliveryPayload = {
  content: string; embeds?: any[]; components?: any[];
  files?: Array<{ attachment: Buffer; name: string }>;
  allowedMentions: { parse: []; users: []; roles: []; repliedUser: false };
};
export type SentAnswer = { id?: string; edit?: (payload: DeliveryPayload) => Promise<unknown> };
export type DeliveryReceipt = {
  delivered: boolean; complete: boolean; messageId?: string;
  messageIds: string[]; deliveredContent: string;
};
const logger = new Logger('AgentAnswerDelivery');
const STOP_NOTICE = 'Pengiriman jawaban terhenti. Sebagian jawaban belum terkirim.';
export async function deliverPlannedAnswer(input: {
  plan: AnswerPlan;
  extras?: Pick<DeliveryPayload, 'embeds' | 'components' | 'files'>;
  first: (payload: DeliveryPayload) => Promise<SentAnswer>;
  next: (payload: DeliveryPayload) => Promise<SentAnswer>;
  warn?: (code: 'ANSWER_DELIVERY_FAILED' | 'ANSWER_DELIVERY_NOTICE_FAILED') => void;
}): Promise<DeliveryReceipt> {
  const receipt: DeliveryReceipt = { delivered: false, complete: false, messageIds: [], deliveredContent: '' };
  const warn = (code: Parameters<NonNullable<typeof input.warn>>[0]) => { try { if (input.warn) input.warn(code); else logger.warn(code); } catch { /* Logging never changes delivery. */ } };
  let last: { sent: SentAnswer; payload: DeliveryPayload } | undefined;
  for (const [index, part] of input.plan.parts.slice(0, 5).entries()) {
    const extras = index === 0 ? input.extras : undefined;
    const files = index === 0 ? [...(extras?.files ?? []), ...(input.plan.textFile ? [input.plan.textFile] : [])] : [];
    const payload: DeliveryPayload = {
      ...extras, content: part.content, ...(files.length ? { files } : {}),
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    };
    let sent: SentAnswer;
    try {
      sent = await (index === 0 ? input.first : input.next)(payload);
      if (!sent) throw new Error('Missing transport receipt');
    } catch {
      warn('ANSWER_DELIVERY_FAILED');
      if (last?.sent.edit && last.payload.content.length + STOP_NOTICE.length + 2 <= 2000) {
        try {
          const { files: _files, ...editable } = last.payload;
          await last.sent.edit({ ...editable, content: `${last.payload.content}\n\n${STOP_NOTICE}` });
          receipt.deliveredContent += `\n\n${STOP_NOTICE}`;
        } catch { warn('ANSWER_DELIVERY_NOTICE_FAILED'); }
      }
      return receipt;
    }
    receipt.delivered = true;
    receipt.deliveredContent += part.sourceText;
    if (sent.id) {
      receipt.messageIds.push(sent.id);
      receipt.messageId ??= sent.id;
    }
    last = { sent, payload };
  }
  if (receipt.messageIds.length) receipt.messageId = receipt.messageIds[0];
  receipt.complete = input.plan.complete && input.plan.parts.length <= 5;
  return receipt;
}
