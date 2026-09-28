/**
 * The two things VRCNext does not know: how long you have played on Steam, and which of your
 * friends appear in a public tag list.
 *
 * Both are optional and both fail quietly. A source that is unreachable leaves its numbers at
 * zero, which empties the placeholders that use them, which drops their line.
 */

import type { HttpApi, Logger } from '@vrcnext/plugin-api';

export interface SteamOptions {
  readonly steamId: string;
  readonly apiKey: string;
  readonly appId: string;
}

/** Minutes played of `appId`, or 0 when not configured or not answered. */
export async function steamMinutes(http: HttpApi, options: SteamOptions, logger: Logger, signal: AbortSignal): Promise<number> {
  if (options.steamId.trim() === '' || options.apiKey.trim() === '') return 0;
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  url.searchParams.set('key', options.apiKey.trim());
  url.searchParams.set('steamid', options.steamId.trim());
  url.searchParams.set('include_played_free_games', '1');
  url.searchParams.set('format', 'json');
  try {
    const response = await http.fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      logger.warn(`Steam answered ${String(response.status)}; playtime left empty.`);
      return 0;
    }
    const body: unknown = await response.json();
    const games = readGames(body);
    const wanted = games.find((game) => game.appid === options.appId.trim());
    return wanted?.minutes ?? 0;
  } catch (error) {
    logger.debug(`Steam playtime unavailable: ${String(error)}`);
    return 0;
  }
}

function readGames(body: unknown): readonly { appid: string; minutes: number }[] {
  if (typeof body !== 'object' || body === null) return [];
  const response = (body as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return [];
  const games = (response as { games?: unknown }).games;
  if (!Array.isArray(games)) return [];
  return games.flatMap((game) => {
    if (typeof game !== 'object' || game === null) return [];
    const record = game as { appid?: unknown; playtime_forever?: unknown };
    const minutes = typeof record.playtime_forever === 'number' ? record.playtime_forever : 0;
    return [{ appid: String(record.appid), minutes }];
  });
}

/** Rich-text colour and style markup, as the tag files carry it. */
function plain(tag: string): string {
  return tag.replace(/<\/?(?:color=[^>]*|color|b|i)>/gi, '').trim();
}

export interface TagResult {
  /** How many of `userIds` appear in any source. */
  readonly tagged: number;
  /** How many distinct tag strings the sources define. */
  readonly totalTags: number;
  /** One sentence per source that could not be read; empty when every source loaded. */
  readonly problems: readonly string[];
}

export interface TagRequest {
  readonly urls: readonly string[];
  /** Whose membership to count. */
  readonly userIds: readonly string[];
  readonly logger: Logger;
  readonly signal: AbortSignal;
}

/** The tags one entry carries, whether it spells them `tags` or `tag`. */
function entryTags(entry: unknown): readonly string[] {
  if (typeof entry !== 'object' || entry === null) return [];
  const record = entry as { tags?: unknown; tag?: unknown };
  const list = Array.isArray(record.tags) ? record.tags : [record.tag];
  return list.flatMap((tag) => {
    if (typeof tag !== 'string') return [];
    const clean = plain(tag);
    return clean === '' ? [] : [clean];
  });
}

/** Folds one source into the running sets. */
function collect(body: unknown, known: Set<string>, tags: Set<string>): void {
  if (typeof body !== 'object' || body === null) return;
  for (const [userId, entry] of Object.entries(body as Record<string, unknown>)) {
    known.add(userId);
    for (const tag of entryTags(entry)) tags.add(tag);
  }
}

/**
 * Loads every source and counts. The shape is the one FewTags publishes: an object keyed by
 * user id, each value carrying `tags` (or a single `tag`).
 */
export async function loadTags(http: HttpApi, request: TagRequest): Promise<TagResult> {
  const { logger, signal } = request;
  const known = new Set<string>();
  const tags = new Set<string>();
  // Reported as well as logged: a source that silently fails reads as "Tagged: 0 / 0", which
  // looks like an empty file rather than a broken URL.
  const problems: string[] = [];
  for (const url of request.urls) {
    if (url.trim() === '') continue;
    try {
      const response = await http.fetch(url.trim(), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        const problem = `Tag source ${url} answered ${String(response.status)}.`;
        logger.warn(problem);
        problems.push(problem);
        continue;
      }
      collect(await response.json(), known, tags);
    } catch (error) {
      // A cross-origin URL that sends no CORS headers lands here, as an opaque "Load failed".
      const problem = `Tag source ${url} could not be read: ${error instanceof Error ? error.message : String(error)}`;
      logger.warn(problem);
      problems.push(problem);
    }
  }
  return { tagged: request.userIds.filter((id) => known.has(id)).length, totalTags: tags.size, problems };
}
