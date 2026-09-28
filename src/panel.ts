/**
 * The plugin's tab: what would be written, what was, and the two buttons.
 *
 * A preview is the same work as a run with the writing left out, so what you see here is what
 * goes out — including which lines had to give up their full form and whether anything was cut.
 */

import type { PluginContext, UiBadgeTone } from '@vrcnext/plugin-api';

import { LIMITS, type Settings } from './settings.js';
import type { RunResult } from './run.js';

type Ctx = PluginContext<Settings>;

export interface PanelDeps {
  readonly preview: () => Promise<void>;
  readonly updateNow: () => Promise<void>;
  readonly state: () => PanelState;
}

export interface PanelState {
  readonly last: RunResult | undefined;
  readonly nextAt: number | undefined;
  readonly busy: boolean;
  readonly error: string | undefined;
}

function countTone(length: number, limit: number): UiBadgeTone {
  if (length > limit) return 'err';
  if (length > limit - Math.max(4, Math.round(limit / 10))) return 'warn';
  return 'ok';
}

export class BioPanel {
  readonly #ctx: Ctx;
  readonly #deps: PanelDeps;
  #status: HTMLElement | undefined;
  #output: HTMLElement | undefined;

  constructor(ctx: Ctx, deps: PanelDeps) {
    this.#ctx = ctx;
    this.#deps = deps;
  }

  install(): void {
    this.#ctx.ui.addNavTab({
      label: 'Bio Updater',
      icon: 'edit_note',
      render: (tab) => { this.#render(tab); },
    });
    this.#ctx.ui.addSettingsCard({
      title: 'Bio Updater',
      icon: 'edit_note',
      render: (card) => {
        card.appendChild(this.#ctx.ui.kit.description(
          'Preview the result and write it from the Bio Updater tab. While "Preview only" is on, nothing is sent to VRChat.',
        ));
      },
    });
    this.#ctx.settings.onChange(() => { this.refresh(); });
  }

  refresh(): void {
    const k = this.#ctx.ui.kit;
    if (this.#status !== undefined) k.setChildren(this.#status, this.#statusRows());
    if (this.#output !== undefined) k.setChildren(this.#output, this.#outputRows());
  }

  #render(tab: HTMLElement): void {
    const k = this.#ctx.ui.kit;
    this.#status = k.card({ title: 'Status', icon: 'schedule' });
    this.#output = k.card({ title: 'What gets written', icon: 'article' });
    const actions = k.card({
      title: 'Actions',
      icon: 'build',
      children: [
        k.description('A preview does everything a run does except the writing.'),
        k.buttonRow(
          k.button({ label: 'Preview', icon: 'visibility', onClick: () => { void this.#deps.preview(); } }),
          k.button({ label: 'Update my profile now', icon: 'send', onClick: () => { void this.#deps.updateNow(); } }),
        ),
      ],
    });
    tab.append(k.layout(k.pair(this.#status, actions), this.#output));
    this.refresh();
  }

  #statusRows(): readonly (HTMLElement | DocumentFragment)[] {
    const k = this.#ctx.ui.kit;
    const values = this.#ctx.settings.values;
    const state = this.#deps.state();
    const me = this.#ctx.vrchat.self();
    const rows = [
      k.row({
        label: 'Updating',
        value: !values.enabled
          ? k.badge('neutral', 'Off')
          : values.dryRun
            ? k.badge('warn', 'Preview only')
            : k.badge('ok', `Every ${String(values.intervalMinutes)} min`),
      }),
      k.row({ label: 'Account', detail: me === undefined ? 'Waiting for VRChat login' : me.displayName }),
      k.row({
        label: 'Last run',
        detail: state.last === undefined
          ? 'Not yet'
          : `${new Date(state.last.at).toLocaleTimeString()} · ${state.last.wrote.length === 0 ? 'nothing written' : `wrote ${state.last.wrote.join(', ')}`}`,
      }),
      k.row({
        label: 'Next run',
        detail: state.nextAt === undefined ? 'Not scheduled' : new Date(state.nextAt).toLocaleTimeString(),
      }),
    ];
    if (state.error !== undefined) rows.push(k.row({ label: 'Last error', detail: state.error }));
    return rows;
  }

  #field(label: string, composed: RunResult['bio'], limit: number): HTMLElement {
    const k = this.#ctx.ui.kit;
    const notes: string[] = [];
    if (composed.prefix !== '') notes.push('your own text kept');
    if (composed.compacted > 0) notes.push(`${String(composed.compacted)} line(s) shortened`);
    if (composed.truncated) notes.push('cut to fit');
    return k.card({
      title: `${label} — ${String(composed.text.length)} / ${String(limit)}`,
      icon: 'subject',
      children: [
        k.row({ label: 'Length', value: k.badge(countTone(composed.text.length, limit), `${String(composed.text.length)} chars`) }),
        notes.length === 0 ? undefined : k.description(notes.join(' · ')),
        k.textArea({ value: composed.text === '' ? '(left alone)' : composed.text, rows: label === 'Bio' ? 10 : 2, onCommit: () => undefined }),
      ],
    });
  }

  #outputRows(): readonly (HTMLElement | DocumentFragment)[] {
    const k = this.#ctx.ui.kit;
    const state = this.#deps.state();
    if (state.busy) return [k.emptyState('Working…')];
    const last = state.last;
    if (last === undefined) return [k.emptyState('Press Preview to see what would be written.')];

    const cards = [
      this.#field('Bio', last.bio, LIMITS.bio),
      this.#field('Status', last.status, LIMITS.status),
      this.#field('Pronouns', last.pronouns, LIMITS.pronouns),
    ];
    const rows: (HTMLElement | DocumentFragment)[] = [k.grid(cards, { min: 300 })];
    if (last.links.length > 0) {
      rows.push(k.row({ label: 'Bio links', detail: last.links.join('  ·  ') }));
    }
    for (const problem of last.problems) {
      rows.push(k.row({ label: 'Problem', detail: problem, value: k.badge('err', 'template') }));
    }
    return rows;
  }
}
