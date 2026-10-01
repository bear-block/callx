import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeSponsors, tierFor} from './fetch-sponsors.mjs';

test('monthly amounts map to the sponsor page tiers', () => {
  assert.equal(tierFor(5, false), 'backer');
  assert.equal(tierFor(25, false), 'supporter');
  assert.equal(tierFor(250, false), 'company');
  assert.equal(tierFor(1000, false), 'partner');
  assert.equal(tierFor(1000, true), 'oneTime');
});

test('a person who gives through two channels is listed once, at the higher tier', () => {
  const merged = mergeSponsors([
    {name: 'Ada', tier: 'oneTime', active: true, source: 'buymeacoffee'},
    {name: 'ada', tier: 'supporter', active: true, source: 'github'},
    {name: 'Grace', tier: 'backer', active: true, source: 'github'},
  ]);
  assert.deepEqual(merged.map((sponsor) => [sponsor.name, sponsor.tier]), [['ada', 'supporter'], ['Grace', 'backer']]);
});
