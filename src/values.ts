/**
 * Everything a template may say about you, gathered from what VRCNext already knows.
 *
 * All of it comes through `ctx.vrchat`, so nothing here opens a dialog or costs a VRChat
 * request that VRCNext was not going to make anyway. The two outside sources — Steam playtime
 * and the tag files — are fetched through `ctx.http`, and each degrades to an empty string
 * rather than failing the run: a line whose placeholders all came out empty is simply dropped.
 */

import { parseLocation, timeAgo, type TemplateValues, type VrcSelf, type VrchatApi } from '@vrcnext/plugin-api';

import type { Values } from './settings.js';

/** VRChat's trust ranks, best first, as they appear in a user's tags. */
const RANKS: readonly (readonly [string, string])[] = [
  ['system_trust_legend', 'Legend'],
  ['system_trust_veteran', 'Veteran'],
  ['system_trust_trusted', 'Trusted'],
  ['system_trust_known', 'Known'],
  ['system_trust_basic', 'User'],
  ['system_trust_visitor', 'Visitor'],
];

export function trustRank(tags: readonly string[]): string {
  return RANKS.find(([tag]) => tags.includes(tag))?.[1] ?? 'Visitor';
}

/** `3 days (72h)` — the shape the original used, which reads well in a bio. */
export function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  const unit =
    years >= 1 ? `${String(years)} ${years === 1 ? 'year' : 'years'}`
    : months >= 1 ? `${String(months)} ${months === 1 ? 'month' : 'months'}`
    : days >= 1 ? `${String(days)} ${days === 1 ? 'day' : 'days'}`
    : '';
  return unit === '' ? `${String(hours)}h` : `${unit} (${String(hours)}h)`;
}

export interface Extras {
  /** Minutes from Steam, or 0 when it was not asked or did not answer. */
  readonly steamMinutes: number;
  /** How many of your friends appear in the tag sources. */
  readonly tagged: number;
  /** How many distinct tags the sources define. */
  readonly totalTags: number;
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The values, as flat names plus a `favorites` object keyed by both the group's VRChat tag
 * (`group_0`) and the name you gave it, so a template can say either.
 */
export async function buildValues(
  vrchat: VrchatApi,
  self: VrcSelf,
  values: Values,
  extras: Extras,
): Promise<TemplateValues> {
  const [friends, groups, moderation, instance] = await Promise.all([
    vrchat.friends(),
    vrchat.favoriteFriendGroups(),
    vrchat.moderationCounts(),
    vrchat.currentInstance(),
  ]);

  const favorites: Record<string, TemplateValues> = {};
  for (const group of groups) {
    const names = group.users.map((user) => user.displayName);
    const entry: TemplateValues = {
      name: group.displayName,
      tag: group.name,
      names,
      count: group.userIds.length,
    };
    favorites[group.name] = entry;
    favorites[group.name.replace(/[^a-zA-Z0-9]/g, '')] = entry;
    if (group.displayName !== '') favorites[group.displayName] = entry;
  }

  const now = new Date();
  const joined = self.dateJoined === '' ? undefined : new Date(self.dateJoined);
  const at = instance === undefined ? undefined : parseLocation(instance.location);

  return {
    name: self.displayName,
    displayName: self.displayName,
    userId: self.id,
    rank: trustRank(self.tags),
    status: self.status,
    statusDescription: self.statusDescription,
    platform: self.platform,
    avatarId: self.currentAvatarId,

    friends: friends.length,
    blocked: moderation.blocked,
    muted: moderation.muted,
    hiddenAvatars: moderation.hiddenAvatar,
    tagged: extras.tagged,
    totalTags: extras.totalTags,

    playtime: formatPlaytime(extras.steamMinutes),
    playtimeHours: extras.steamMinutes === 0 ? '' : String(Math.floor(extras.steamMinutes / 60)),

    dateJoined: joined === undefined ? '' : `${self.dateJoined.slice(0, 10)} (${timeAgo(joined)})`,
    dateJoinedShort: self.dateJoined.slice(0, 10),
    vrcRunning: self.vrcRunning,

    world: instance?.worldName ?? '',
    worldId: instance?.worldId ?? '',
    instanceType: at?.instanceType ?? '',
    region: at?.region ?? '',

    now: `${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`,
    nowTime: `${two(now.getHours())}:${two(now.getMinutes())}`,
    date: now.toLocaleDateString(),
    interval: `${String(values.intervalMinutes)} minutes`,

    favorites,
  };
}
