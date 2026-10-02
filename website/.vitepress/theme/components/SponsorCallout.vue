<script setup lang="ts">
import {computed} from 'vue';
import {withBase} from 'vitepress';
import {sponsorLinks, sponsorReasons, type SponsorReason} from '../sponsor';

const props = withDefaults(defineProps<{reason?: SponsorReason}>(), {reason: 'general'});
const copy = computed(() => sponsorReasons[props.reason]);
</script>

<template>
  <aside class="sponsor-callout" :aria-label="copy.title">
    <div class="sponsor-callout__text">
      <p class="sponsor-callout__title">
        <span aria-hidden="true">♥</span> {{ copy.title }}
      </p>
      <p class="sponsor-callout__body">{{ copy.body }}</p>
    </div>
    <div class="sponsor-callout__actions">
      <a class="sc-btn sc-btn--brand" :href="sponsorLinks.monthly" target="_blank" rel="noopener">
        Become a monthly sponsor
      </a>
      <a class="sc-btn" :href="sponsorLinks.oneTime" target="_blank" rel="noopener">Buy a coffee</a>
      <a v-if="'extra' in copy" class="sc-link" :href="copy.extra.href" target="_blank" rel="noopener">
        {{ copy.extra.label }} →
      </a>
      <a class="sc-link" :href="withBase('/sponsor')">Where the money goes →</a>
    </div>
  </aside>
</template>

<style scoped>
.sponsor-callout {
  margin: 28px 0;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-brand-soft);
  border-left: 4px solid var(--vp-c-brand-1);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.sponsor-callout__title {
  margin: 0 !important;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.sponsor-callout__title span {
  color: var(--vp-c-brand-1);
}
.sponsor-callout__body {
  margin: 6px 0 14px !important;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.sponsor-callout__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}
.sc-btn {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none !important;
  color: var(--vp-c-text-1) !important;
  background: var(--vp-c-bg);
  transition: border-color 0.2s, background-color 0.2s;
}
.sc-btn:hover {
  border-color: var(--vp-c-brand-1);
}
.sc-btn--brand {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white) !important;
}
.dark .sc-btn--brand {
  color: #0b1512 !important;
}
.sc-btn--brand:hover {
  background: var(--vp-c-brand-2);
}
.sc-link {
  font-size: 0.88rem;
}
</style>
