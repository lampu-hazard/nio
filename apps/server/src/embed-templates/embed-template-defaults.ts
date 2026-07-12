import { EmbedTemplateCategory, EmbedTemplateCategoryMeta, EmbedTemplatePayload } from './embed-template.types';

const COMMON = [
  { key: 'guild.name', label: 'Guild name', example: 'nio' },
  { key: 'user.mention', label: 'User mention', example: '@Othinus' },
  { key: 'user.username', label: 'Username', example: 'Othinus' },
];

const TAKO = [
  ...COMMON,
  { key: 'donation.amount', label: 'Donation amount', example: '100.000' },
  { key: 'donation.message', label: 'Donation message', example: 'semangat bang!' },
  { key: 'donation.senderName', label: 'Sender name', example: 'Othinus' },
  { key: 'donation.total', label: 'Total support', example: '500.000' },
  { key: 'transaction.id', label: 'Transaction ID', example: 'tx-123' },
  { key: 'role.mention', label: 'Reward role', example: '@Donatur' },
  { key: 'tier.unlocked_roles', label: 'Unlocked tier roles', example: '@Donatur, @VIP' },
];

const PANEL = [
  ...COMMON,
  { key: 'panel.name', label: 'Panel name', example: 'Server Rules' },
  { key: 'panel.title', label: 'Panel title', example: 'Server Rules' },
  { key: 'panel.accentText', label: 'Accent text', example: 'Please read first' },
  { key: 'panel.description', label: 'Description', example: 'Follow the rules.' },
  { key: 'panel.role_count', label: 'Role count', example: '4' },
  { key: 'leaderboard.lines', label: 'Leaderboard lines', example: '#1 @user — 100 pesan' },
];

const MODERATION = [
  ...COMMON,
  { key: 'moderation.title', label: 'Title', example: 'Warning Issued' },
  { key: 'moderation.description', label: 'Description', example: 'A warning has been recorded.' },
  { key: 'moderation.reason', label: 'Reason', example: 'spam' },
  { key: 'moderator.mention', label: 'Moderator', example: '@mod' },
  { key: 'target.mention', label: 'Target user', example: '@user' },
];

const AGENT = [
  ...COMMON,
  { key: 'agent.title', label: 'Title', example: 'Proposal Created' },
  { key: 'agent.description', label: 'Description', example: 'Approve this action?' },
  { key: 'agent.action', label: 'Action', example: 'WARN' },
  { key: 'agent.reason', label: 'Reason', example: 'spam' },
  { key: 'target.mention', label: 'Target user', example: '@user' },
];

export const EMBED_TEMPLATE_CATEGORY_META: Record<EmbedTemplateCategory, EmbedTemplateCategoryMeta> = {
  TAKO_SUCCESS_DM: { category: 'TAKO_SUCCESS_DM', label: 'Tako Success DM', group: 'Tako', variables: TAKO },
  TAKO_PUBLIC_ANNOUNCEMENT: { category: 'TAKO_PUBLIC_ANNOUNCEMENT', label: 'Tako Public Announcement', group: 'Tako', variables: TAKO },
  TAKO_DIRECT_DONATION: { category: 'TAKO_DIRECT_DONATION', label: 'Tako Direct Donation', group: 'Tako', variables: TAKO },
  PANEL_SELF_ROLE: { category: 'PANEL_SELF_ROLE', label: 'Panel: Self Role', group: 'Panels', variables: PANEL },
  PANEL_RULES: { category: 'PANEL_RULES', label: 'Panel: Rules', group: 'Panels', variables: PANEL },
  PANEL_ANNOUNCEMENT: { category: 'PANEL_ANNOUNCEMENT', label: 'Panel: Announcement', group: 'Panels', variables: PANEL },
  PANEL_LEADERBOARD: { category: 'PANEL_LEADERBOARD', label: 'Panel: Leaderboard', group: 'Panels', variables: PANEL },
  MODERATION_WARNING: { category: 'MODERATION_WARNING', label: 'Moderation Warning', group: 'Moderation', variables: MODERATION },
  MODERATION_STATUS: { category: 'MODERATION_STATUS', label: 'Moderation Status', group: 'Moderation', variables: MODERATION },
  AGENT_PROPOSAL: { category: 'AGENT_PROPOSAL', label: 'Agent Proposal', group: 'Agent', variables: AGENT },
  AGENT_EXECUTION_RESULT: { category: 'AGENT_EXECUTION_RESULT', label: 'Agent Execution Result', group: 'Agent', variables: AGENT },
};

export const DEFAULT_EMBED_TEMPLATES: Record<EmbedTemplateCategory, EmbedTemplatePayload> = {
  TAKO_SUCCESS_DM: {
    embeds: [{
      title: 'Tako Donation Success',
      color: '#00FF00',
      description: 'Role {role.mention} has been assigned to {user.mention}.',
      fields: [
        { name: 'Donor', value: '{user.mention} ({donation.senderName})', inline: true },
        { name: 'Amount', value: 'Rp{donation.amount}', inline: true },
        { name: 'Transaction ID', value: '{transaction.id}', inline: true },
        { name: 'Total Support', value: 'Rp{donation.total}', inline: true },
        { name: 'Unlocked Tiers', value: '{tier.unlocked_roles}', inline: false },
      ],
      timestamp: true,
    }],
  },
  TAKO_PUBLIC_ANNOUNCEMENT: {
    embeds: [{ color: '#F59E0B', description: '{user.mention} baru saja memberikan Rp{donation.amount}! {donation.message}' }],
  },
  TAKO_DIRECT_DONATION: {
    embeds: [{ color: '#F59E0B', description: '{donation.senderName} baru saja memberikan Rp {donation.amount}! {donation.message}' }],
  },
  PANEL_SELF_ROLE: {
    embeds: [{ color: '#5865F2', title: '{panel.title}', description: '{panel.accentText}\n{panel.description}', footer: { text: 'Self-role panel · {panel.role_count} role tersedia' }, timestamp: true }],
  },
  PANEL_RULES: {
    embeds: [{ color: '#5865F2', title: '{panel.title}', description: '{panel.accentText}\n{panel.description}', footer: { text: 'Rules panel' }, timestamp: true }],
  },
  PANEL_ANNOUNCEMENT: {
    embeds: [{ color: '#5865F2', title: '{panel.title}', description: '{panel.accentText}\n{panel.description}', footer: { text: 'Announcement panel' }, timestamp: true }],
  },
  PANEL_LEADERBOARD: {
    embeds: [{ color: '#5865F2', title: '{panel.title}', description: '{panel.description}\n{leaderboard.lines}', footer: { text: 'Leaderboard panel' }, timestamp: true }],
  },
  MODERATION_WARNING: {
    embeds: [{ color: '#2B2D31', title: '{moderation.title}', description: '{target.mention} — {moderation.reason}', fields: [{ name: 'Moderator', value: '{moderator.mention}', inline: true }], timestamp: true }],
  },
  MODERATION_STATUS: {
    embeds: [{ color: '#2B2D31', title: '{moderation.title}', description: '{moderation.description}', timestamp: true }],
  },
  AGENT_PROPOSAL: {
    embeds: [{ color: '#2B2D31', title: '{agent.title}', description: '{agent.description}', fields: [{ name: 'Action', value: '{agent.action}', inline: true }, { name: 'Reason', value: '{agent.reason}', inline: false }], timestamp: true }],
  },
  AGENT_EXECUTION_RESULT: {
    embeds: [{ color: '#2B2D31', title: '{agent.title}', description: '{agent.description}', timestamp: true }],
  },
};
