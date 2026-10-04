<script setup lang="ts">
// The home page hero: the recorded two-device call, playing muted on a loop so people see a real
// call before reading anything. Reduced-motion or data-saver visitors get the poster and a play button.
import {onMounted, ref} from 'vue';
import {withBase} from 'vitepress';

const video = ref<HTMLVideoElement>();
const autoplay = ref(false);
onMounted(() => {
  const saveData = (navigator as Navigator & {connection?: {saveData?: boolean}}).connection?.saveData === true;
  autoplay.value = !saveData && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (autoplay.value) void video.value?.play().catch(() => { autoplay.value = false; });
});
</script>

<template>
  <figure class="hero-demo">
    <video ref="video" :poster="withBase('/demos/steven-hao.jpg')" :src="withBase('/demos/steven-hao.mp4')"
      muted loop playsinline :controls="!autoplay" preload="metadata" width="1856" height="1460"
      aria-label="Recorded call: React Native calls Flutter on two Android emulators, with native video" />
    <figcaption>
      <span><span class="hero-demo__dot" aria-hidden="true" />Real call · two Android emulators · native Telecom and LiveKit</span>
      <a :href="withBase('/guide/demos')">Watch with chapters →</a>
    </figcaption>
  </figure>
</template>

<style scoped>
.hero-demo { margin: 0; width: 100%; max-width: 560px; }
.hero-demo video {
  display: block; width: 100%; height: auto; border-radius: 16px;
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  box-shadow: 0 24px 64px rgba(0, 0, 0, .28);
}
.hero-demo figcaption {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 12px;
  font-size: 13px; color: var(--vp-c-text-2);
}
@media (max-width: 959px) { .hero-demo figcaption { justify-content: center; text-align: center; } }
.hero-demo figcaption a { color: var(--vp-c-brand-1); font-weight: 500; text-decoration: none; }
.hero-demo figcaption a:hover { text-decoration: underline; }
.hero-demo__dot { display: inline-block; margin-right: 8px; vertical-align: 1px; width: 8px; height: 8px; border-radius: 50%; background: #e5484d; box-shadow: 0 0 0 4px rgba(229, 72, 77, .18); }
</style>
