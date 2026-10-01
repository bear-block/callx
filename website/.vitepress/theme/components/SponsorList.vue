<script setup lang="ts">
// The sponsors of bear-block, grouped by tier. Data comes from .vitepress/data/sponsors.data.ts,
// refreshed every time the site builds (the Docs workflow builds daily).
import {computed} from 'vue';
import {withBase} from 'vitepress';
import {data, type Sponsor, type SponsorTier} from '../../data/sponsors.data';
import {sponsorLinks} from '../sponsor';

const props = withDefaults(defineProps<{
  /** Which tiers to show; the home page shows only partners and companies. */
  tiers?: SponsorTier[];
  /** Hide everything, including the empty state, when nobody is listed. */
  hideWhenEmpty?: boolean;
  /** A heading shown above the list, only when it is shown. */
  heading?: string;
}>(), {tiers: () => ['partner', 'company', 'supporter', 'backer', 'oneTime'], hideWhenEmpty: false});

const groups: {tier: SponsorTier; title: string; size: 'xl' | 'lg' | 'md' | 'name'}[] = [
  {tier: 'partner', title: 'Partners', size: 'xl'},
  {tier: 'company', title: 'Company sponsors', size: 'lg'},
  {tier: 'supporter', title: 'Supporters', size: 'md'},
  {tier: 'backer', title: 'Backers', size: 'md'},
  {tier: 'oneTime', title: 'One-time supporters', size: 'name'},
];

const current = computed(() => data.sponsors.filter((sponsor) => sponsor.active));
const visibleGroups = computed(() => groups
  .filter((group) => props.tiers.includes(group.tier))
  .map((group) => ({...group, sponsors: current.value.filter((sponsor) => sponsor.tier === group.tier)}))
  .filter((group) => group.sponsors.length > 0));
const past = computed(() => props.tiers.length > 2 ? data.sponsors.filter((sponsor) => !sponsor.active) : []);
const namedGifts = computed(() => current.value.filter((sponsor) => sponsor.tier === 'oneTime').length);
const anonymousGifts = computed(() => props.tiers.includes('oneTime') ? Math.max(0, data.giftCount - namedGifts.value) : 0);
const empty = computed(() => visibleGroups.value.length === 0 && anonymousGifts.value === 0);
const updated = computed(() => data.updatedAt ? new Date(data.updatedAt).toISOString().slice(0, 10) : null);

const initials = (sponsor: Sponsor) => sponsor.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
</script>

<template>
  <div v-if="!(empty && hideWhenEmpty)" class="sponsor-list">
    <h2 v-if="heading" class="sl-heading">{{ heading }}</h2>
    <section v-for="group in visibleGroups" :key="group.tier" class="sl-group">
      <h3 class="sl-title">{{ group.title }}</h3>
      <div v-if="group.size !== 'name'" class="sl-grid" :class="`sl-grid--${group.size}`">
        <component :is="sponsor.url ? 'a' : 'span'" v-for="sponsor in group.sponsors" :key="sponsor.name"
          class="sl-item" :href="sponsor.url" :target="sponsor.url ? '_blank' : undefined"
          :rel="sponsor.url ? 'noopener sponsored' : undefined" :title="sponsor.name">
          <img v-if="sponsor.avatar" :src="sponsor.avatar" :alt="sponsor.name" loading="lazy" />
          <span v-else class="sl-initials" aria-hidden="true">{{ initials(sponsor) }}</span>
          <span v-if="group.size !== 'md'" class="sl-name">{{ sponsor.name }}</span>
          <span v-else class="sl-sr">{{ sponsor.name }}</span>
        </component>
      </div>
      <p v-else class="sl-names">
        <template v-for="(sponsor, index) in group.sponsors" :key="sponsor.name">
          <a v-if="sponsor.url" :href="sponsor.url" target="_blank" rel="noopener">{{ sponsor.name }}</a>
          <span v-else>{{ sponsor.name }}</span><span v-if="index < group.sponsors.length - 1">, </span>
        </template>
        <span v-if="anonymousGifts > 0">{{ group.sponsors.length ? ', and ' : '' }}{{ anonymousGifts }} more</span>
      </p>
    </section>

    <section v-if="anonymousGifts > 0 && !visibleGroups.some((group) => group.tier === 'oneTime')" class="sl-group">
      <h3 class="sl-title">One-time supporters</h3>
      <p class="sl-names">{{ anonymousGifts }} {{ anonymousGifts === 1 ? 'person has' : 'people have' }} bought Callx a coffee. Thank you.</p>
    </section>

    <p v-if="empty" class="sl-empty">
      No sponsors yet. Yours could be the first name here:
      <a :href="sponsorLinks.monthly" target="_blank" rel="noopener">sponsor monthly</a> or
      <a :href="sponsorLinks.oneTime" target="_blank" rel="noopener">buy a coffee</a>.
    </p>

    <p v-if="past.length" class="sl-past">
      Thank you also to past sponsors: {{ past.map((sponsor) => sponsor.name).join(', ') }}.
    </p>

    <p v-if="updated && tiers.length > 2" class="sl-updated">
      Updated {{ updated }}. Only sponsors who chose to be public are listed.
      <a :href="withBase('/sponsor')">How to appear here</a>.
    </p>
  </div>
</template>

<style scoped>
.sponsor-list {
  margin: 20px 0 8px;
}
.sl-heading {
  margin-bottom: 16px !important;
}
.sl-group + .sl-group {
  margin-top: 24px;
}
.sl-title {
  margin: 0 0 12px !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 0.82rem !important;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.sl-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.sl-item {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none !important;
  color: var(--vp-c-text-1) !important;
}
.sl-grid--xl .sl-item,
.sl-grid--lg .sl-item {
  padding: 10px 16px 10px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s;
}
.sl-grid--xl .sl-item:hover,
.sl-grid--lg .sl-item:hover {
  border-color: var(--vp-c-brand-1);
}
.sl-item img,
.sl-initials {
  flex: none;
  border-radius: 50%;
}
.sl-grid--xl img, .sl-grid--xl .sl-initials { width: 64px; height: 64px; }
.sl-grid--lg img, .sl-grid--lg .sl-initials { width: 44px; height: 44px; }
.sl-grid--md img, .sl-grid--md .sl-initials { width: 40px; height: 40px; }
.sl-grid--xl .sl-name { font-size: 1.1rem; font-weight: 600; }
.sl-grid--lg .sl-name { font-weight: 600; }
.sl-initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.sl-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.sl-names,
.sl-empty,
.sl-past,
.sl-updated {
  margin: 0 !important;
  line-height: 1.7;
}
.sl-empty {
  color: var(--vp-c-text-2);
}
.sl-past {
  margin-top: 20px !important;
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
}
.sl-updated {
  margin-top: 16px !important;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
}
</style>
