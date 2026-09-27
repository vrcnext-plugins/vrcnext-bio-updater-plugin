import assert from 'node:assert/strict';
import { test } from 'vitest';

import { compose, managedPrefix, type TemplateLine } from './compose.js';

const VALUES = { name: 'Tupper', friends: 300, blocked: 4, rank: 'Trusted', empty: '' };

function line(content: string, compact = '', priority = 0): TemplateLine {
  return { content, compact, priority };
}

test('renders every line and joins them', () => {
  const out = compose({
    lines: [line('Hi {name}'), line('Friends: {friends}')],
    values: VALUES,
    limit: 512,
    separator: '\n',
  });
  assert.equal(out.text, 'Hi Tupper\nFriends: 300');
  assert.deepEqual([out.compacted, out.truncated], [0, false]);
});

test('a line that renders empty is left out entirely', () => {
  const out = compose({ lines: [line('{empty}'), line('kept')], values: VALUES, limit: 512, separator: '\n' });
  assert.equal(out.text, 'kept');
});

test('over the limit, the lowest priority gives up its full form first', () => {
  const lines = [
    line('Rank: {rank}', 'R: {rank}', 5),
    line('Friends: {friends}', 'F: {friends}', 1),
    line('Blocked: {blocked}', 'B: {blocked}', 9),
  ];
  const full = compose({ lines, values: VALUES, limit: 512, separator: ' | ' });
  assert.equal(full.text, 'Rank: Trusted | Friends: 300 | Blocked: 4');

  const tight = compose({ lines, values: VALUES, limit: 38, separator: ' | ' });
  assert.equal(tight.text, 'Rank: Trusted | F: 300 | Blocked: 4');
  assert.equal(tight.compacted, 1);

  // 30 is enough once every line is compact, in priority order, so nothing is cut.
  const tighter = compose({ lines, values: VALUES, limit: 30, separator: ' | ' });
  assert.equal(tighter.text, 'R: Trusted | F: 300 | B: 4');
  assert.deepEqual([tighter.compacted, tighter.truncated], [3, false]);

  const impossible = compose({ lines, values: VALUES, limit: 12, separator: ' | ' });
  assert.equal(impossible.text, 'R: Trusted …');
  assert.equal(impossible.truncated, true);
});

test('equal priorities compact from the bottom up', () => {
  const lines = [line('aaaa', 'a', 0), line('bbbb', 'b', 0)];
  const out = compose({ lines, values: VALUES, limit: 6, separator: ' ' });
  assert.equal(out.text, 'aaaa b');
});

test('a line with no compact form keeps its full text', () => {
  const lines = [line('aaaaaaaa', '', 0), line('bbbb', 'b', 1)];
  const out = compose({ lines, values: VALUES, limit: 10, separator: ' ' });
  assert.equal(out.text, 'aaaaaaaa b');
});

test('the user’s own text before the separator is kept and shrinks the room', () => {
  const out = compose({
    lines: [line('Friends: {friends}')],
    values: VALUES,
    limit: 512,
    separator: '\n',
    current: 'my own words\n-\ngenerated before',
    prefixSeparator: '\n-\n',
  });
  assert.equal(out.prefix, 'my own words');
  assert.equal(out.text, 'my own words\n-\nFriends: 300');

  // 'mine' plus the separator is 7 characters, so only 11 are left for the body.
  const tight = compose({
    lines: [line('Friends: {friends}', 'F: {friends}', 0)],
    values: VALUES,
    limit: 18,
    separator: '\n',
    current: 'mine\n-\nold',
    prefixSeparator: '\n-\n',
  });
  assert.equal(tight.text, 'mine\n-\nF: 300');
  assert.equal(tight.compacted, 1);
});

test('managedPrefix finds a bare dash line, and returns nothing when there is no separator', () => {
  assert.equal(managedPrefix('a\nb\n-\nold stuff', '\n-\n'), 'a\nb');
  assert.equal(managedPrefix('a\r\nb\r\n-\r\nold', '\n-\n'), 'a\nb');
  assert.equal(managedPrefix('nothing generated here', '\n-\n'), '');
  assert.equal(managedPrefix('', '\n-\n'), '');
  assert.equal(managedPrefix('a | b', ' | '), 'a');
});

test('a template that does not parse is reported and treated as empty', () => {
  const broken: string[] = [];
  const out = compose({
    lines: [line('{{ oops'), line('fine')],
    values: VALUES,
    limit: 512,
    separator: '\n',
    onError: (_error, l) => { broken.push(l.content); },
  });
  assert.equal(out.text, 'fine');
  assert.deepEqual(broken, ['{{ oops']);
});
