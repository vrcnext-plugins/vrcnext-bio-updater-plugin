/**
 * Bio Updater.
 *
 * Keeps your VRChat bio, status, pronouns and bio links written from templates: how many
 * friends you have, your trust rank, your favourite-friend groups by name, hours on Steam, how
 * many of your friends carry a public tag, where you are right now. Lines that do not fit are
 * shortened by priority rather than cut, and anything you typed above the separator stays
 * yours.
 *
 * Ported from the bio updater in vrcx-extras. Two things did not survive the move and are
 * better for it: there are no VRChat credentials here, because writing goes through VRCNext's
 * own profile actions, and there is no second copy of your data, because everything comes from
 * what VRCNext already fetched.
 */

import { definePlugin, type PluginContext, type PluginId } from '@vrcnext/plugin-api';

import { BioPanel, type PanelState } from './src/panel.js';
import { runOnce, type RunResult } from './src/run.js';
import { settings } from './src/settings.js';

type Ctx = PluginContext<typeof settings>;

const MINUTE_MS = 60_000;

class BioUpdater {
  readonly #ctx: Ctx;
  readonly #panel: BioPanel;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #last: RunResult | undefined;
  #nextAt: number | undefined;
  #busy = false;
  #error: string | undefined;

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.#panel = new BioPanel(ctx, {
      preview: () => this.#run(false, true),
      updateNow: () => this.#run(true, true),
      state: (): PanelState => ({
        last: this.#last,
        nextAt: this.#nextAt,
        busy: this.#busy,
        error: this.#error,
      }),
    });
  }

  start(): void {
    this.#panel.install();
    this.#ctx.disposables.add(() => { this.#stopTimer(); });
    this.#ctx.disposables.add(
      this.#ctx.settings.onChange(() => { this.#schedule(); }),
    );
    this.#schedule();
    this.#ctx.logger.info(`Bio Updater v${this.#ctx.version} ready.`);
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#nextAt = undefined;
  }

  /** Arms the next run, or disarms when updating is off. The first one waits for VRCNext. */
  #schedule(): void {
    this.#stopTimer();
    const values = this.#ctx.settings.values;
    if (!values.enabled) {
      this.#panel.refresh();
      return;
    }
    const delayMs = this.#last === undefined
      ? values.initialDelaySecs * 1000
      : values.intervalMinutes * MINUTE_MS;
    this.#nextAt = Date.now() + delayMs;
    this.#timer = setTimeout(() => { void this.#run(!values.dryRun, false); }, delayMs);
    this.#panel.refresh();
  }

  /**
   * One run. `write` is what actually reaches VRChat; `manual` separates a button press from
   * the timer, so a scheduled run is quiet and a pressed one says what it did.
   */
  async #run(write: boolean, manual: boolean): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#error = undefined;
    this.#panel.refresh();
    try {
      const result = await runOnce(this.#ctx, write);
      this.#last = result;
      for (const problem of result.problems) this.#ctx.logger.warn(problem);
      if (result.wrote.length > 0) {
        this.#ctx.logger.info(`Wrote ${result.wrote.join(', ')}.`);
        if (manual) this.#ctx.notifications.toast({ message: `Profile updated: ${result.wrote.join(', ')}.` });
      } else if (manual) {
        this.#ctx.notifications.toast({ message: write ? 'Nothing had changed.' : 'Preview ready.' });
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error);
      this.#ctx.logger.error(`Run failed: ${this.#error}`);
      if (manual) this.#ctx.notifications.toast({ message: this.#error, ok: false });
    } finally {
      this.#busy = false;
      // A manual run does not disturb the schedule; a scheduled one arms the next.
      if (manual) this.#panel.refresh();
      else this.#schedule();
    }
  }
}

export default definePlugin({
  id: 'bio-updater' as PluginId,
  settings,

  activate(ctx) {
    new BioUpdater(ctx).start();
  },

  deactivate() {
    // The timer and the panel went through `ctx`, so the host tears them down.
  },
});
