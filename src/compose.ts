/**
 * Fitting a set of template lines into a field that has a hard limit.
 *
 * VRChat gives a bio 512 characters and a status 32. A line that is interesting when there is
 * room is often still worth saying in fewer words when there is not, so every line may carry a
 * **compact** form and a **priority**. Everything renders full first; while the result is too
 * long, the lowest-priority lines switch to their compact form, lowest first, later lines before
 * earlier ones at equal priority. Only if that is still too long is the text cut.
 *
 * The field is also not wholly ours. Anything the user typed before the separator is theirs:
 * it is found, kept, and the generated part is fitted into what is left.
 */

import { renderTemplate, TemplateError, type TemplateValues } from '@vrcnext/plugin-api';

export interface TemplateLine {
  readonly content: string;
  /** Used instead of `content` when the field is too long. Empty means "same as content". */
  readonly compact: string;
  /** Higher survives longer. Equal priorities compact from the bottom up. */
  readonly priority: number;
}

export interface ComposeOptions {
  readonly lines: readonly TemplateLine[];
  readonly values: TemplateValues;
  readonly limit: number;
  /** What the lines are joined with. `'\n'` for a bio, `' | '` for a status. */
  readonly separator: string;
  /** Text already in the field, so anything the user wrote by hand is kept. */
  readonly current?: string;
  /** Marks where the user's own text ends and ours begins. */
  readonly prefixSeparator?: string;
  readonly onError?: (error: TemplateError, line: TemplateLine) => void;
}

export interface Composed {
  /** What to write to the field: the kept prefix, the separator, and the generated part. */
  readonly text: string;
  /** Only the generated part. */
  readonly body: string;
  /** The user's own text that was kept, `''` when there was none. */
  readonly prefix: string;
  /** How many lines ended up compact. */
  readonly compacted: number;
  /** Whether the result still had to be cut. */
  readonly truncated: boolean;
}

/** Renders one template, reporting a broken one and treating it as empty. */
function render(template: string, values: TemplateValues, onError?: (error: TemplateError) => void): string {
  if (template.trim() === '') return '';
  try {
    return renderTemplate(template, values, { dropEmptyLines: false }).trim();
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    onError?.(error);
    return '';
  }
}

/**
 * The part of `current` the user wrote themselves.
 *
 * Everything before the separator is theirs. A separator whose own line is just `-` or `---`
 * also matches as a line of its own, because that is how it reads once written.
 */
export function managedPrefix(current: string, separator: string): string {
  if (current === '' || separator === '') return '';
  const text = current.replace(/\r\n/g, '\n');
  const sep = separator.replace(/\r\n/g, '\n');
  const at = text.indexOf(sep);
  if (at >= 0) return text.slice(0, at).trimEnd();

  const bare = sep.trim();
  if (bare === '-' || bare === '---') {
    const lines = text.split('\n');
    const index = lines.findIndex((line) => line.trim() === bare);
    if (index >= 0) return lines.slice(0, index).join('\n').trimEnd();
  }
  return '';
}

/** The order lines give up their full form in: lowest priority first, then bottom-up. */
function compactionOrder(lines: readonly TemplateLine[]): readonly number[] {
  return lines
    .map((line, index) => ({ index, priority: line.priority }))
    .sort((a, b) => a.priority - b.priority || b.index - a.index)
    .map((entry) => entry.index);
}

export function compose(options: ComposeOptions): Composed {
  const rendered = options.lines.map((line) => ({
    full: render(line.content, options.values, (error) => { options.onError?.(error, line); }),
    compact: line.compact.trim() === ''
      ? render(line.content, options.values, () => undefined)
      : render(line.compact, options.values, (error) => { options.onError?.(error, line); }),
  }));

  const prefix = managedPrefix(options.current ?? '', options.prefixSeparator ?? '');
  const joiner = options.prefixSeparator ?? '';
  const head = prefix === '' ? '' : prefix + joiner;
  const room = Math.max(0, options.limit - head.length);

  const build = (compactAt: ReadonlySet<number>): string =>
    rendered
      .map((line, index) => (compactAt.has(index) ? line.compact : line.full))
      .filter((text) => text !== '')
      .join(options.separator);

  const compactAt = new Set<number>();
  let body = build(compactAt);
  if (body.length > room) {
    for (const index of compactionOrder(options.lines)) {
      compactAt.add(index);
      body = build(compactAt);
      if (body.length <= room) break;
    }
  }

  const truncated = body.length > room;
  if (truncated) body = room <= 1 ? body.slice(0, room) : `${body.slice(0, room - 1)}…`;
  return { text: head + body, body, prefix, compacted: compactAt.size, truncated };
}
