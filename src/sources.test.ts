import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { HttpApi, Logger } from '@vrcnext/plugin-api';

import { loadTags, steamMinutes } from './sources.js';

const silent: Logger = {
  debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, scoped: () => silent,
};

/** An http api that answers from a table, and records what was asked for. */
function fakeHttp(table: Readonly<Record<string, unknown>>): HttpApi & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    fetch: (url) => {
      const href = url.toString();
      asked.push(href);
      const key = Object.keys(table).find((k) => href.startsWith(k));
      if (key === undefined) return Promise.reject(new Error('unreachable'));
      const body = table[key];
      if (body === 'error') return Promise.resolve(new Response('', { status: 500 }));
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    },
  };
}

const never = new AbortController().signal;

test('steam playtime picks the configured app and returns minutes', async () => {
  const http = fakeHttp({
    'https://api.steampowered.com': { response: { games: [{ appid: 730, playtime_forever: 10 }, { appid: 438100, playtime_forever: 4320 }] } },
  });
  const minutes = await steamMinutes(http, { steamId: '7656119', apiKey: 'k', appId: '438100' }, silent, never);
  assert.equal(minutes, 4320);
  assert.match(http.asked[0] ?? '', /key=k&steamid=7656119/);
});

test('steam is skipped without credentials, and a failure is zero', async () => {
  const http = fakeHttp({ 'https://api.steampowered.com': 'error' });
  assert.equal(await steamMinutes(http, { steamId: '', apiKey: 'k', appId: '438100' }, silent, never), 0);
  assert.equal(http.asked.length, 0, 'nothing is asked without an id');
  assert.equal(await steamMinutes(http, { steamId: '1', apiKey: 'k', appId: '438100' }, silent, never), 0);
  assert.equal(await steamMinutes(fakeHttp({}), { steamId: '1', apiKey: 'k', appId: '1' }, silent, never), 0);
});

test('an app the account does not own is zero, not a crash', async () => {
  const http = fakeHttp({ 'https://api.steampowered.com': { response: {} } });
  assert.equal(await steamMinutes(http, { steamId: '1', apiKey: 'k', appId: '438100' }, silent, never), 0);
});

test('tag sources count matching friends and distinct tags, ignoring rich text', async () => {
  const http = fakeHttp({
    'https://tags.test/a': {
      usr_1: { tags: ['<color=#ff0000>VIP</color>', '<b>Friend</b>'] },
      usr_2: { tag: 'VIP' },
      usr_3: 'junk',
    },
    'https://tags.test/b': { usr_9: { tags: ['Other'] } },
  });
  const result = await loadTags(http, { urls: ['https://tags.test/a', 'https://tags.test/b'], userIds: ['usr_1', 'usr_2', 'usr_4'], logger: silent, signal: never });
  assert.deepEqual(result, { tagged: 2, totalTags: 3, problems: [] });
});

test('an unreachable source counts nothing and says so, and a blank url is skipped silently', async () => {
  const http = fakeHttp({ 'https://tags.test/a': 'error' });
  const failed = await loadTags(http, { urls: ['https://tags.test/a', '  '], userIds: ['usr_1'], logger: silent, signal: never });
  assert.equal(failed.tagged, 0);
  assert.equal(failed.totalTags, 0);
  assert.equal(failed.problems.length, 1, 'the blank url is not a problem, the broken one is');
  assert.match(failed.problems[0] ?? '', /https:\/\/tags\.test\/a/);

  const missing = await loadTags(fakeHttp({}), { urls: ['https://nope.test'], userIds: ['usr_1'], logger: silent, signal: never });
  assert.equal(missing.totalTags, 0);
  assert.equal(missing.problems.length, 1);
});
