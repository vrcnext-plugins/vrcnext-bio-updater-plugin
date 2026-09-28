# Bio Updater

Keeps your VRChat **bio**, **status**, **pronouns** and **bio links** written from templates, on
a schedule.

```
Rank: Trusted
Friends: 312 | Blocked: 4 | Muted: 2
Tagged: 46 / 180
Time played: 4 months (3120h)
Date joined: 2018-03-11 (7 years ago)
Last updated: 2026-09-27 21:40 (every 120 minutes)
```

Ported from the bio updater in `vrcx-extras`. Two things changed for the better on the way:
there are **no VRChat credentials here** — writing goes through VRCNext's own profile actions,
the same ones its My Profile dialog uses — and there is no second copy of your data, because
everything comes from what VRCNext has already fetched.

## Fitting, not cutting

VRChat allows 512 characters of bio and 32 of status. Every line may carry a **short form** and a
**priority**. Everything renders in full first; while the text is too long, the lowest-priority
lines switch to their short form, lowest first, and only if that is still too long is anything
cut. So a bio degrades gracefully on a day when you have a lot to say rather than losing its last
line.

Anything you typed **above the separator** in VRChat is yours: it is found, kept, and the
generated part is fitted into what is left. The default separator is a line containing `-`.

## Variables

| Group | Names |
| :--- | :--- |
| You | `name` `userId` `rank` `rankText` `steamId` `status` `statusDescription` `platform` `avatarId` `dateJoined` `dateJoinedShort` `vrcRunning` |
| Counts | `friends` `blocked` `muted` `hiddenAvatars` `tagged` `totalTags` |
| Time | `playtime` `playtimeHours` `now` `nowTime` `date` `interval` |
| Where you are | `world` `worldId` `instanceType` `region` |
| Favourites | `favorites.<group>` → `.name` `.tag` `.names` `.count` |

Ranks are VRCNext's own: the tags are offset by one, so `system_trust_trusted` reads as
**Known**, exactly as the profile badge in VRCNext shows it.

`favorites` is keyed by both VRChat's tag (`group_0`) and the name you gave the group, so both of
these work:

```
{{ favorites.group_0.name }}: {{ favorites.group_0.names | join: ", " }}
{{ favorites.Besties.count }} besties
```

The template language is the plugin system's own: `{name}` is short for `{{ name }}`, and
`{{ "yes" if vrcRunning else "no" }}`, `{{ friends | size }}` and `{% if world %}…{% endif %}`
all work. It is deliberately not Liquid — see the
[API reference](https://vrcnext-plugins.github.io/api-reference.html#templates) for the whole
grammar. A line whose placeholders all came out empty is dropped, which is how an unconfigured
Steam key silently removes the playtime line.

## What it needs

| Permission | Why |
| :--- | :--- |
| `vrchat` | Your friends, favourite groups, moderation counts and current instance. |
| `host:actions` | `vrcUpdateProfile` and `vrcUpdateStatus` — the two writes, and nothing else. |
| `network` | `api.steampowered.com` for hours played, `raw.githubusercontent.com` for tag lists. |
| `notifications` | A toast when you press the button. |

Steam playtime needs a [Steam Web API key](https://steamcommunity.com/dev/apikey) and your
64-bit Steam ID. Settings are stored as plain JSON on your disk, so use a key you are willing to
revoke. Without them, `{playtime}` is empty and its line disappears.

## What did not come across

- **VRCX's playtime database.** The original read VRCX's SQLite file for hours in-game. This
  plugin has no filesystem, so playtime is Steam's number.
- **The Unity project scanner.** VRCNext does not expose a process list to plugins — by design —
  so there is no `{{ unity.project }}`.

## Safety

`Preview only` is **on** by default: it renders on the schedule and writes nothing, so you can
edit lines and watch the result. Turn it off when the preview says what you want. Each write
sends only the fields that actually changed.

## Installing

**Settings → Plugins → Install a plugin**:

```
https://github.com/vrcnext-plugins/vrcnext-bio-updater-plugin
```

## Developing

The typed API is not on npm, so `@vrcnext/plugin-api` is a `file:` link to a checkout of
[vrcnext-plugin-system](https://github.com/vrcnext-plugins/vrcnext-plugin-system) beside this
one.

```bash
npm install && npm run check
```

## Signature

Every release of this plugin is signed; the bridge refuses to install or update it otherwise,
and it stays pinned to this key. Check the fingerprint against the one VRCNext shows you when it
asks whether to trust a new signing key:

```
1bc6-e13e-c44c-3bd0-f5a8-5618-8b9b-919c
```

If an update ever says the key changed, stop and ask before confirming.
