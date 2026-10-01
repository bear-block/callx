// Build-time data for the sponsor list: the list fetched by scripts/fetch-sponsors.mjs, plus
// entries added by hand in sponsors.manual.json. Either may be missing or empty.
import {existsSync, readFileSync} from 'node:fs';
import {defineLoader} from 'vitepress';

export type SponsorTier = 'partner' | 'company' | 'supporter' | 'backer' | 'oneTime';
export interface Sponsor {
  name: string;
  url?: string;
  avatar?: string;
  tier: SponsorTier;
  active: boolean;
  since?: string;
  source?: string;
}
export interface SponsorData {
  updatedAt: string | null;
  giftCount: number;
  sponsors: Sponsor[];
}

declare const data: SponsorData;
export {data};

const generated = new URL('./sponsors.generated.json', import.meta.url);
const manual = new URL('./sponsors.manual.json', import.meta.url);
const read = (file: URL) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});

export default defineLoader({
  watch: ['./sponsors.generated.json', './sponsors.manual.json'],
  load(): SponsorData {
    const fetched = read(generated);
    const added = read(manual);
    const names = new Set<string>();
    const sponsors: Sponsor[] = [];
    for (const sponsor of [...(added.sponsors ?? []), ...(fetched.sponsors ?? [])] as Sponsor[]) {
      const key = sponsor.name.toLowerCase();
      if (names.has(key)) continue;
      names.add(key);
      sponsors.push(sponsor);
    }
    return {updatedAt: fetched.updatedAt ?? null, giftCount: fetched.giftCount ?? 0, sponsors};
  },
});
