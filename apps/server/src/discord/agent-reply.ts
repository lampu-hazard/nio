export async function deliverAgentReply(input: { message: { reply: (payload: any) => Promise<any> }; loadingMessage?: { edit: (payload: any) => Promise<any> } | null; response: any }): Promise<{ delivered: boolean; messageId?: string }> {
  const files = input.response.files?.filter((file: any) => Buffer.isBuffer(file.attachment)
    && /^nio-generated\.(png|jpg|webp)$/.test(file.name) && file.attachment.length <= 8388608).slice(0, 1);
  const payload = {
    content: input.response.content, embeds: input.response.embeds, components: input.response.components,
    ...(files?.length ? { files } : {}),
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
  };
  if (input.loadingMessage) {
    const edited = await input.loadingMessage.edit(payload).catch(() => null);
    if (edited) return { delivered: true, messageId: edited.id };
  }
  const fallback = await input.message.reply(payload).catch(() => null);
  return fallback ? { delivered: true, messageId: fallback.id } : { delivered: false };
}
