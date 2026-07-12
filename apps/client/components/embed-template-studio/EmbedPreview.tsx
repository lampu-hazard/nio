import type { EmbedTemplatePayload } from './template-types';

function fill(value = '') {
  return value.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_m, key) => {
    const examples: Record<string, string> = {
      'user.mention': '@Othinus',
      'user.username': 'Othinus',
      'donation.amount': '100.000',
      'donation.message': 'semangat bang!',
      'donation.total': '500.000',
      'tier.unlocked_roles': '@Donatur, @VIP',
      'role.mention': '@Donatur',
      'guild.name': 'nio',
      'panel.title': 'Server Rules',
      'panel.description': 'Follow the server rules.',
      'leaderboard.lines': '#1 @user — 100 pesan',
    };
    return examples[key] || key;
  });
}

export function EmbedPreview({ template }: { template: EmbedTemplatePayload }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[#313338] p-4 text-white">
      {template.content && <p className="mb-3 whitespace-pre-wrap text-sm">{fill(template.content)}</p>}
      <div className="space-y-3">
        {template.embeds.map((embed, idx) => (
          <div key={idx} className="rounded border-l-4 bg-[#2b2d31] p-4" style={{ borderLeftColor: embed.color || '#5865F2' }}>
            {embed.author?.name && <div className="mb-2 text-xs font-semibold text-zinc-300">{fill(embed.author.name)}</div>}
            {embed.title && <h3 className="font-bold text-white">{fill(embed.title)}</h3>}
            {embed.description && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{fill(embed.description)}</p>}
            {!!embed.fields?.length && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {embed.fields.map((field, fieldIdx) => (
                  <div key={fieldIdx} className={field.inline ? '' : 'sm:col-span-2'}>
                    <div className="text-xs font-bold text-white">{fill(field.name)}</div>
                    <div className="text-xs text-zinc-200">{fill(field.value)}</div>
                  </div>
                ))}
              </div>
            )}
            {embed.imageUrl && <div className="mt-3 rounded bg-zinc-700 p-3 text-xs text-zinc-300">Image: {fill(embed.imageUrl)}</div>}
            {embed.footer?.text && <div className="mt-3 text-xs text-zinc-400">{fill(embed.footer.text)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
