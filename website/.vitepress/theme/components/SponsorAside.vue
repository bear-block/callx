<script setup lang="ts">
import {computed} from 'vue';
import {useData, withBase} from 'vitepress';
import {sponsorLinks} from '../sponsor';

const {page} = useData();
// Not on the sponsor page itself.
const visible = computed(() => page.value.relativePath !== 'sponsor.md');
</script>

<template>
  <div v-if="visible" class="sponsor-aside">
    <p class="sponsor-aside__title"><span aria-hidden="true">♥</span> Support Callx</p>
    <p class="sponsor-aside__body">Free, MIT and independent. Sponsors fund testing on real phones.</p>
    <div class="sponsor-aside__links">
      <a :href="sponsorLinks.monthly" target="_blank" rel="noopener">Sponsor</a>
      <span aria-hidden="true">·</span>
      <a :href="sponsorLinks.oneTime" target="_blank" rel="noopener">Buy a coffee</a>
      <span aria-hidden="true">·</span>
      <a :href="withBase('/sponsor')">Why</a>
    </div>
  </div>
</template>

<style scoped>
.sponsor-aside {
  margin-top: 24px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  font-size: 12.5px;
  line-height: 1.55;
}
.sponsor-aside__title {
  margin: 0;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.sponsor-aside__title span {
  color: var(--vp-c-brand-1);
}
.sponsor-aside__body {
  margin: 4px 0 8px;
  color: var(--vp-c-text-2);
}
.sponsor-aside__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--vp-c-text-3);
}
.sponsor-aside__links a {
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
.sponsor-aside__links a:hover {
  text-decoration: underline;
}
</style>
