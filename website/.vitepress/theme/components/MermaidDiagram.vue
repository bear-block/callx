<script setup lang="ts">
// Renders a ```mermaid fence. Mermaid is loaded on demand, only on pages that have a diagram,
// so it stays out of the bundle every page downloads. It re-renders when the theme changes.
import {onMounted, ref, watch} from 'vue';
import {useData} from 'vitepress';

const props = defineProps<{code: string}>();
const {isDark} = useData();
const svg = ref('');
const failed = ref(false);
const minWidth = ref('');
let counter = 0;

async function render() {
  const {default: mermaid} = await import('mermaid');
  // Mermaid measures labels when it renders; with a fallback font the boxes come out too small.
  await document.fonts.ready;
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string) => styles.getPropertyValue(name).trim();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    // SVG labels: HTML labels pick up the page's line height and overflow the boxes Mermaid measured.
    htmlLabels: false,
    flowchart: {htmlLabels: false},
    fontFamily: color('--vp-font-family-base'),
    themeVariables: {
      darkMode: isDark.value,
      background: color('--vp-c-bg'),
      primaryColor: color('--vp-c-bg-soft'),
      primaryTextColor: color('--vp-c-text-1'),
      primaryBorderColor: color('--vp-c-brand-1'),
      lineColor: color('--vp-c-text-2'),
      secondaryColor: color('--vp-c-bg-alt'),
      tertiaryColor: color('--vp-c-bg'),
      clusterBkg: color('--vp-c-bg-alt'),
      clusterBorder: color('--vp-c-divider'),
      edgeLabelBackground: color('--vp-c-bg'),
      fontSize: '14px',
    },
  });
  try {
    const {svg: output} = await mermaid.render(`callx-mermaid-${Date.now()}-${counter++}`, decodeURIComponent(props.code));
    // Fit the column, but never shrink below a readable width: narrow screens scroll instead.
    const width = Number(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+)/.exec(output)?.[1] ?? 0);
    minWidth.value = width ? `${Math.min(width, 560)}px` : '';
    svg.value = output; failed.value = false;
  } catch { failed.value = true; }
}

onMounted(render);
watch(isDark, render);
</script>

<template>
  <div class="mermaid-diagram" v-if="svg && !failed" :style="{'--diagram-min-width': minWidth}" v-html="svg" />
  <pre v-else-if="failed" class="mermaid-diagram__source">{{ decodeURIComponent(code) }}</pre>
  <div v-else class="mermaid-diagram mermaid-diagram--loading" aria-hidden="true" />
</template>

<style scoped>
.mermaid-diagram { margin: 24px 0; overflow-x: auto; text-align: center; }
.mermaid-diagram :deep(svg) { max-width: 100%; min-width: var(--diagram-min-width, 0); height: auto; }
.mermaid-diagram--loading { min-height: 160px; border-radius: 12px; background: var(--vp-c-bg-soft); }
.mermaid-diagram__source { font-size: 13px; }
</style>
