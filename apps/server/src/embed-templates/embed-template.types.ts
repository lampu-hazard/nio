export const EMBED_TEMPLATE_CATEGORIES = [
  'TAKO_SUCCESS_DM',
  'TAKO_PUBLIC_ANNOUNCEMENT',
  'TAKO_DIRECT_DONATION',
  'PANEL_SELF_ROLE',
  'PANEL_RULES',
  'PANEL_ANNOUNCEMENT',
  'PANEL_LEADERBOARD',
  'MODERATION_WARNING',
  'MODERATION_STATUS',
  'AGENT_PROPOSAL',
  'AGENT_EXECUTION_RESULT',
] as const;

export type EmbedTemplateCategory = typeof EMBED_TEMPLATE_CATEGORIES[number];

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

export type EmbedTemplateCategoryMeta = {
  category: EmbedTemplateCategory;
  label: string;
  group: 'Tako' | 'Panels' | 'Moderation' | 'Agent';
  variables: TemplateVariable[];
};
