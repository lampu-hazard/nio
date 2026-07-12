import type { TemplateVariable } from './template-types';

export function VariableChips({ variables, onInsert }: { variables: TemplateVariable[]; onInsert: (value: string) => void }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-bold text-[var(--text)]">Variables</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">Click to insert into the last focused field.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {variables.map((variable) => (
          <button
            key={variable.key}
            type="button"
            onClick={() => onInsert(`{${variable.key}}`)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--panel-strong)]"
            title={variable.example}
          >
            {variable.label}
          </button>
        ))}
      </div>
    </div>
  );
}
