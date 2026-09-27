/**
 * One run: gather, render, and (unless this is a preview) write.
 *
 * Writing goes through VRCNext's own actions, so the profile changes exactly as it would if you
 * had typed it into VRCNext's My Profile dialog — no second set of credentials, no direct call
 * to the VRChat API.
 */

import { renderTemplate, TemplateError, type PluginContext, type TemplateValues } from '@vrcnext/plugin-api';

import { compose, type Composed, type TemplateLine } from './compose.js';
import { LIMITS, type Settings, type Values } from './settings.js';
import { loadTags, steamMinutes } from './sources.js';
import { buildValues } from './values.js';

type Ctx = PluginContext<Settings>;

export interface RunResult {
  readonly at: number;
  readonly bio: Composed;
  readonly status: Composed;
  readonly pronouns: Composed;
  readonly links: readonly string[];
  /** What was written, or `[]` for a preview. */
  readonly wrote: readonly string[];
  readonly problems: readonly string[];
}

function lines(list: readonly { readonly content: string; readonly compact: string; readonly priority: number }[]): readonly TemplateLine[] {
  return list.filter((line) => line.content.trim() !== '');
}

/** Renders the bio links, keeping the ones that came out as http(s) URLs. */
function renderLinks(values: Values, templateValues: TemplateValues, problems: string[]): readonly string[] {
  const out: string[] = [];
  for (const link of values.links) {
    if (link.url.trim() === '') continue;
    try {
      const rendered = renderTemplate(link.url, templateValues).trim();
      if (/^https?:\/\/\S+$/i.test(rendered)) out.push(rendered);
      else if (rendered !== '') problems.push(`Link "${link.url}" rendered to something that is not a URL.`);
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      problems.push(`Link "${link.url}": ${error.message}`);
    }
  }
  return out;
}

/**
 * Gathers everything and renders the three fields. `write` false is a preview: identical work,
 * nothing sent.
 */
export async function runOnce(ctx: Ctx, write: boolean): Promise<RunResult> {
  const values = ctx.settings.values;
  const self = ctx.vrchat.self();
  if (self === undefined) throw new Error('Not signed in to VRChat yet.');
  const problems: string[] = [];

  const friends = await ctx.vrchat.friends();
  const [steam, tags] = await Promise.all([
    steamMinutes(ctx.http, values.steam, ctx.logger, ctx.signal),
    loadTags(ctx.http, {
      urls: values.tagSources.map((source) => source.url),
      userIds: friends.map((friend) => friend.id),
      logger: ctx.logger,
      signal: ctx.signal,
    }),
  ]);
  const templateValues = await buildValues(ctx.vrchat, self, values, {
    steamMinutes: steam,
    tagged: tags.tagged,
    totalTags: tags.totalTags,
  });

  const onError = (error: TemplateError, line: TemplateLine): void => {
    problems.push(`"${line.content}": ${error.message}`);
  };
  const bio = compose({
    lines: lines(values.bioLines),
    values: templateValues,
    limit: LIMITS.bio,
    separator: '\n',
    current: self.bio,
    prefixSeparator: values.bioSeparator,
    onError,
  });
  const status = compose({
    lines: lines(values.statusLines),
    values: templateValues,
    limit: LIMITS.status,
    separator: values.statusSeparator,
    current: self.statusDescription,
    prefixSeparator: values.statusSeparator,
    onError,
  });
  const pronouns = compose({
    lines: lines(values.pronounLines),
    values: templateValues,
    limit: LIMITS.pronouns,
    separator: ' ',
    onError,
  });
  const links = renderLinks(values, templateValues, problems);

  const wrote = write ? writeProfile(ctx, { bio, status, pronouns, links }) : [];
  return { at: Date.now(), bio, status, pronouns, links, wrote, problems };
}

interface Rendered {
  readonly bio: Composed;
  readonly status: Composed;
  readonly pronouns: Composed;
  readonly links: readonly string[];
}

/**
 * Sends only what changed and only what is non-empty: an empty list of lines means "leave that
 * field alone", which is how you keep a status you set by hand.
 */
function writeProfile(ctx: Ctx, rendered: Rendered): readonly string[] {
  const self = ctx.vrchat.self();
  const wrote: string[] = [];
  const profile: Record<string, unknown> = {};

  if (rendered.bio.body !== '' && rendered.bio.text !== self?.bio) {
    profile['bio'] = rendered.bio.text;
    wrote.push('bio');
  }
  if (rendered.pronouns.body !== '' && rendered.pronouns.text !== self?.pronouns) {
    profile['pronouns'] = rendered.pronouns.text;
    wrote.push('pronouns');
  }
  if (rendered.links.length > 0 && rendered.links.join('\n') !== (self?.bioLinks ?? []).join('\n')) {
    profile['bioLinks'] = rendered.links;
    wrote.push('links');
  }
  if (Object.keys(profile).length > 0) ctx.bridge.send('vrcUpdateProfile', profile);

  if (rendered.status.body !== '' && rendered.status.text !== self?.statusDescription) {
    ctx.bridge.send('vrcUpdateStatus', { status: self?.status ?? 'active', statusDescription: rendered.status.text });
    wrote.push('status');
  }
  return wrote;
}
