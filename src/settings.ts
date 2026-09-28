/**
 * Settings schema.
 *
 * The three fields this plugin writes — bio, status, pronouns — are each a **list of template
 * lines**, because that is what makes the fitting work: a line can carry a shorter form and a
 * priority, and the host renders the list as cards you can reorder. Everything else is the
 * schedule, the separators that protect your own text, and the two outside sources.
 */

import type { SettingsSchema, SettingsValues } from '@vrcnext/plugin-api';

/** VRChat's own limits. A field is never written longer than this. */
export const LIMITS = { bio: 512, status: 32, pronouns: 32 } as const;

/** One line of a field. Shared by the bio, status and pronouns lists. */
const templateLine = {
  content: {
    kind: 'string',
    label: 'Line',
    description: 'A template. {name} is short for {{ name }}; see the plugin’s README for every variable.',
    default: '',
    placeholder: 'Friends: {friends}',
  },
  compact: {
    kind: 'string',
    label: 'Short form',
    description: 'Used instead when the field would be too long. Empty means the line has none.',
    default: '',
    placeholder: 'F: {friends}',
  },
  priority: {
    kind: 'number',
    label: 'Priority',
    description: 'Higher keeps its full form longer. Lines with the same priority shorten from the bottom up.',
    default: 0,
    markers: [0, 5, 10, 20],
  },
} as const satisfies SettingsSchema;

export const DEFAULT_BIO_LINES = [
  {
    content: '{{ favorites.group_0.name }}: {{ favorites.group_0.names | join: ", " }} <3',
    compact: '{{ favorites.group_0.name }}: {{ favorites.group_0.count }} <3',
    priority: 10,
  },
  {
    content: '{{ favorites.group_1.name }}: {{ favorites.group_1.names | join: ", " }}',
    compact: '{{ favorites.group_1.name }}: {{ favorites.group_1.count }}',
    priority: 10,
  },
  { content: 'Rank: {rank}', compact: '', priority: 5 },
  { content: 'Friends: {friends} | Blocked: {blocked} | Muted: {muted}', compact: 'F: {friends} | B: {blocked} | M: {muted}', priority: 0 },
  { content: 'Time played: {playtime}', compact: '{playtime}', priority: 0 },
  { content: 'Date joined: {dateJoined}', compact: 'Joined: {dateJoinedShort}', priority: 0 },
  { content: 'Last updated: {now} (every {interval})', compact: 'Updated: {nowTime}', priority: 0 },
  { content: 'Tagged: {tagged} / {totalTags}', compact: '', priority: 0 },
  { content: 'User ID: {userId}', compact: '', priority: 0 },
  { content: 'Steam ID: {steamId}', compact: '', priority: 0 },
] as const;

export const DEFAULT_STATUS_LINES = [
  { content: 'tg:@blubotanica|dc:@bluscream', compact: 'dc:@bluscream', priority: 20 },
] as const;

export const DEFAULT_LINKS = [
  { url: 'https://steamcommunity.com/profiles/{steamId}' },
  { url: 'https://vrchat.com/home/user/{userId}' },
] as const;

/** The list the original shipped with: FewTags' public user tags. */
// raw.githubusercontent.com, not github.com/.../raw/...: the redirecting github.com endpoint
// sends no CORS headers, so a request from this page fails outright rather than following it.
export const DEFAULT_TAG_SOURCE = 'https://raw.githubusercontent.com/Bluscream/FewTags/refs/heads/main/usertags.json';

export const settings = {
  enabled: {
    kind: 'boolean',
    label: 'Keep my profile updated',
    description: 'Master switch. Nothing is written while this is off.',
    default: false,
  },
  dryRun: {
    kind: 'boolean',
    label: 'Preview only',
    description: 'Render on the schedule but never write to VRChat. Use it while you are editing the lines.',
    default: true,
  },
  intervalMinutes: {
    kind: 'number',
    label: 'Update every',
    description: 'How often the profile is rewritten. VRChat rate-limits its API; hours, not minutes.',
    default: 120,
    markers: [15, 30, 60, 120, 240, 480],
    integer: true,
    unit: ' min',
  },
  initialDelaySecs: {
    kind: 'number',
    label: 'Wait before the first run',
    description: 'Gives VRCNext time to load your friends and favourites after a start.',
    default: 5,
    min: 5,
    max: 600,
    step: 5,
    integer: true,
    unit: 's',
    slider: true,
  },

  bioLines: {
    kind: 'list',
    label: 'Bio',
    description: `Joined by the separator below, fitted into ${String(LIMITS.bio)} characters.`,
    titleKey: 'content',
    addLabel: 'Add bio line',
    default: [...DEFAULT_BIO_LINES],
    item: templateLine,
  },
  bioSeparator: {
    kind: 'string',
    multiline: true,
    label: 'Bio separator',
    description: 'Written between your own text and the generated part, and between the lines. Anything you type above it in VRChat is kept.',
    default: '\n-\n',
  },
  statusLines: {
    kind: 'list',
    label: 'Status',
    description: `Fitted into ${String(LIMITS.status)} characters. Leave empty to leave your status alone.`,
    titleKey: 'content',
    addLabel: 'Add status line',
    default: [...DEFAULT_STATUS_LINES],
    item: templateLine,
  },
  statusSeparator: {
    kind: 'string',
    label: 'Status separator',
    default: ' | ',
  },
  pronounLines: {
    kind: 'list',
    label: 'Pronouns',
    description: `Fitted into ${String(LIMITS.pronouns)} characters. Leave empty to leave your pronouns alone.`,
    titleKey: 'content',
    addLabel: 'Add pronouns line',
    default: [],
    item: templateLine,
  },
  links: {
    kind: 'list',
    label: 'Bio links',
    description: 'Up to three, each a template. VRChat shows them under your bio.',
    titleKey: 'url',
    addLabel: 'Add link',
    max: 3,
    default: [...DEFAULT_LINKS],
    item: {
      url: { kind: 'string', label: 'URL', default: '', placeholder: 'https://vrchat.com/home/user/{userId}', format: 'url' },
    },
  },

  steam: {
    kind: 'object',
    label: 'Steam playtime',
    description: 'Fills {playtime}. Without this, {playtime} is empty and its line is dropped.',
    collapsed: true,
    fields: {
      steamId: { kind: 'string', label: 'Steam ID (64-bit)', default: '', placeholder: '7656119…' },
      apiKey: {
        kind: 'string',
        label: 'Steam Web API key',
        description: 'From steamcommunity.com/dev/apikey. Stored in plain text like every setting — use a key you can revoke.',
        default: '',
        format: 'password',
      },
      appId: { kind: 'string', label: 'App ID', description: '438100 is VRChat.', default: '438100' },
    },
  },
  tagSources: {
    kind: 'list',
    label: 'Tag sources',
    description: 'JSON files mapping user ids to tags; fills {tagged} and {totalTags}.',
    titleKey: 'url',
    addLabel: 'Add source',
    default: [{ url: DEFAULT_TAG_SOURCE }],
    item: {
      url: {
        kind: 'string',
        label: 'URL',
        default: '',
        placeholder: DEFAULT_TAG_SOURCE,
        format: 'url',
      },
    },
  },
} as const satisfies SettingsSchema;

export type Settings = typeof settings;
export type Values = SettingsValues<Settings>;
