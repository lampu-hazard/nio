export type EmbedTemplatePayload = {
  content?: string;
  embeds: Array<{
    title?: string;
    description?: string;
    color?: string;
    author?: { name?: string; iconUrl?: string };
    footer?: { text?: string; iconUrl?: string };
    imageUrl?: string;
    thumbnailUrl?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: boolean;
  }>;
};

export type TemplateVariable = { key: string; label: string; example: string };
export type CategoryMeta = { category: string; label: string; group: string; variables: TemplateVariable[] };
export type TemplateRow = { id: string | null; category: string; name: string; enabled: boolean; template: EmbedTemplatePayload; isDefault?: boolean };
export type TemplateListResponse = { ok: boolean; categories: CategoryMeta[]; templates: Record<string, TemplateRow> };
