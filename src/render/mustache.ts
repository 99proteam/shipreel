// Browser-safe (no Node imports): used by the CLI renderer and the live demo website.
export type View = Record<string, unknown>;

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => escapeMap[c]!);
}

function lookup(view: View, key: string): unknown {
  if (key === '.') return view['.'];
  return key.split('.').reduce<unknown>((obj, part) => (obj && typeof obj === 'object' ? (obj as View)[part] : undefined), view);
}

function truthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * Minimal mustache-style renderer: `{{var}}` (escaped), `{{{var}}}` (raw),
 * `{{#var}}...{{/var}}` (section / loop), `{{^var}}...{{/var}}` (inverted section).
 */
export function renderString(template: string, view: View): string {
  const section = /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;
  let output = template.replace(section, (_match, type: string, key: string, inner: string) => {
    const value = lookup(view, key);
    if (type === '^') return truthy(value) ? '' : renderString(inner, view);
    if (!truthy(value)) return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => renderString(inner, { ...view, ...(item && typeof item === 'object' ? (item as View) : {}), '.': item }))
        .join('');
    }
    return renderString(inner, view);
  });
  output = output.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key: string) => String(lookup(view, key) ?? ''));
  output = output.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => escapeHtml(String(lookup(view, key) ?? '')));
  return output;
}
