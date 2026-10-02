/**
 * Everything a template may say about you, gathered from what VRCNext already knows.
 *
 * All of it comes through `ctx.vrchat`, so nothing here opens a dialog or costs a VRChat
 * request that VRCNext was not going to make anyway. The two outside sources — Steam playtime
 * and the tag files — are fetched through `ctx.http`, and each degrades to an empty string
 * rather than failing the run: a line whose placeholders all came out empty is simply dropped.
 */

import {
  formatDuration,
  parseLocation,
  timeAgo,
  trustRank,
  type TemplateValues,
  type VrcSelf,
  type VrchatApi,
} from '@vrcnext/plugin-api';

import type { Values } from './settings.js';

/** `4 months (3120h)` — a length of time plus the raw hours, which is what a bio line wants. */
export function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  // Under an hour there is no coarser unit to add, and "45 minutes (0h)" says less than "0h".
  if (hours < 1) return `${String(hours)}h`;
  return `${formatDuration(minutes * 60_000)} (${String(hours)}h)`;
}

export interface Extras {
  /** Your friends, as the caller already read them for the tag count. */
  readonly friends: readonly { readonly id: string }[];
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
  me: VrcSelf,
  values: Values,
  extras: Extras,
): Promise<TemplateValues> {
  // `moderationCounts` is a read of what VRCNext already holds, not a lookup, so it is not in
  // the parallel batch — there is nothing for it to wait alongside.
  const moderation = vrchat.moderationCounts();
  const [groups, instance] = await Promise.all([
    vrchat.favoriteFriendGroups(),
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

  const rank = trustRank(me.tags);
  const now = new Date();
  const joined = me.dateJoined === '' ? undefined : new Date(me.dateJoined);
  const at = instance === undefined ? undefined : parseLocation(instance.location);

  return {
    name: me.displayName,
    displayName: me.displayName,
    userId: me.id,
    steamId: values.steam.steamId,
    rank: rank.short,
    rankText: rank.label,
    status: me.status,
    statusDescription: me.statusDescription,
    platform: me.platform,
    avatarId: me.currentAvatarId,

    friends: extras.friends.length,
    blocked: moderation.blocked,
    muted: moderation.muted,
    hiddenAvatars: moderation.hiddenAvatar,
    tagged: extras.tagged,
    totalTags: extras.totalTags,

    playtime: formatPlaytime(extras.steamMinutes),
    playtimeHours: extras.steamMinutes === 0 ? '' : String(Math.floor(extras.steamMinutes / 60)),

    dateJoined: joined === undefined ? '' : `${me.dateJoined.slice(0, 10)} (${timeAgo(joined)})`,
    dateJoinedShort: me.dateJoined.slice(0, 10),
    vrcRunning: me.vrcRunning,

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
