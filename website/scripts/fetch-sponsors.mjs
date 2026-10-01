#!/usr/bin/env node
// Collects the people and companies who sponsor bear-block and writes
// .vitepress/data/sponsors.generated.json for the sponsor list on the site.
//
//   SPONSORS_GITHUB_TOKEN  a GitHub token that can read bear-block's sponsorships (read:org, read:user)
//   SPONSORS_BMC_TOKEN     a Buy Me a Coffee API access token
//
// Either token may be missing: that source is skipped and the site shows what it has. Only
// public GitHub sponsorships are listed, and Buy Me a Coffee supporters only when they chose a
// public support; emails, notes and amounts of individual gifts are never written.
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ORG = 'bear-block';
const out = join(dirname(fileURLToPath(import.meta.url)), '../.vitepress/data/sponsors.generated.json');
const TIER_ORDER = ['partner', 'company', 'supporter', 'backer', 'oneTime'];

/** Monthly amount in US dollars → the tiers on the sponsor page. */
export function tierFor(monthlyDollars, oneTime) {
  if (oneTime) return 'oneTime';
  if (monthlyDollars >= 1000) return 'partner';
  if (monthlyDollars >= 250) return 'company';
  if (monthlyDollars >= 25) return 'supporter';
  return 'backer';
}

/** One entry per person: someone who sponsors and also bought a coffee is listed once, at their best tier. */
export function mergeSponsors(sponsors) {
  const byName = new Map();
  for (const sponsor of sponsors) {
    const key = sponsor.name.toLowerCase();
    const seen = byName.get(key);
    if (!seen || TIER_ORDER.indexOf(sponsor.tier) < TIER_ORDER.indexOf(seen.tier)) byName.set(key, sponsor);
  }
  return [...byName.values()];
}

async function githubSponsors(token) {
  const query = `query($org: String!, $after: String) {
    organization(login: $org) {
      sponsorshipsAsMaintainer(first: 100, after: $after, includePrivate: false, activeOnly: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          createdAt isActive isOneTimePayment privacyLevel
          tier { monthlyPriceInDollars isOneTime }
          sponsorEntity {
            ... on User { login name avatarUrl url }
            ... on Organization { login name avatarUrl url }
          }
        }
      }
    }
  }`;
  const sponsors = [];
  let after = null;
  do {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'callx-website'},
      body: JSON.stringify({query, variables: {org: ORG, after}}),
    });
    const json = await response.json();
    if (!response.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json).slice(0, 300));
    const page = json.data.organization.sponsorshipsAsMaintainer;
    for (const node of page.nodes) {
      if (node.privacyLevel !== 'PUBLIC' || !node.sponsorEntity) continue;
      const entity = node.sponsorEntity;
      const oneTime = Boolean(node.isOneTimePayment || node.tier?.isOneTime);
      sponsors.push({
        name: entity.name || entity.login,
        url: entity.url,
        avatar: entity.avatarUrl,
        tier: tierFor(node.tier?.monthlyPriceInDollars ?? 0, oneTime),
        active: oneTime || node.isActive,
        since: node.createdAt.slice(0, 10),
        source: 'github',
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return sponsors;
}

async function buyMeACoffee(token) {
  const get = async (path) => {
    const items = [];
    for (let url = `https://developers.buymeacoffee.com/api/v1/${path}`; url;) {
      const response = await fetch(url, {headers: {authorization: `Bearer ${token}`}});
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      const json = await response.json();
      items.push(...(json.data ?? []));
      url = json.next_page_url;
    }
    return items;
  };
  // Names appear only for supports the supporter made public; anything else stays a count.
  const isPublic = (item) => Number(item.support_visibility ?? item.subscription_visibility ?? 0) === 1;
  const named = (name) => typeof name === 'string' && name.trim() && !/^someone$/i.test(name.trim());
  const sponsors = [];
  for (const member of await get('subscriptions?status=active')) {
    if (!isPublic(member) || !named(member.payer_name)) continue;
    sponsors.push({name: member.payer_name.trim(), tier: 'supporter', active: true,
      since: String(member.subscription_created_on ?? '').slice(0, 10), source: 'buymeacoffee'});
  }
  const gifts = (await get('supporters')).filter((gift) => !gift.is_refunded);
  for (const gift of gifts) {
    if (!isPublic(gift) || !named(gift.supporter_name)) continue;
    sponsors.push({name: gift.supporter_name.trim(), tier: 'oneTime', active: true,
      since: String(gift.support_created_on ?? '').slice(0, 10), source: 'buymeacoffee'});
  }
  return {sponsors, giftCount: gifts.length};
}

async function main() {
  const result = {updatedAt: new Date().toISOString(), sources: [], giftCount: 0, sponsors: []};
  const github = process.env.SPONSORS_GITHUB_TOKEN;
  const bmc = process.env.SPONSORS_BMC_TOKEN;
  if (github) {
    try { result.sponsors.push(...await githubSponsors(github)); result.sources.push('github'); }
    catch (error) { console.warn(`GitHub Sponsors skipped: ${error.message}`); }
  }
  if (bmc) {
    try {
      const {sponsors, giftCount} = await buyMeACoffee(bmc);
      result.sponsors.push(...sponsors); result.giftCount += giftCount; result.sources.push('buymeacoffee');
    } catch (error) { console.warn(`Buy Me a Coffee skipped: ${error.message}`); }
  }
  result.sponsors = mergeSponsors(result.sponsors);
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Sponsors: ${result.sponsors.length} listed from ${result.sources.join(', ') || 'no source'}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
