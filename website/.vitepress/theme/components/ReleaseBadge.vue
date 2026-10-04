<script setup lang="ts">
import {withBase} from 'vitepress';

declare const __CALLX_VERSION__: string;
const version = __CALLX_VERSION__;
const anchor = `release-${version.replaceAll('.', '-')}`;
</script>

<template>
  <a class="release-badge" :href="withBase(`/project/changelog#${anchor}`)">
    <span class="release-badge-version">New in {{ version }}</span>
    <span class="release-badge-text">Backend events from Dart and JavaScript, cancel pushes, Call back fix</span>
    <span aria-hidden="true">→</span>
  </a>
</template>

<style scoped>
.release-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin-bottom: 20px;
  padding: 4px 12px 4px 4px;
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 20px;
  text-decoration: none;
  transition: border-color 0.2s;
}
.release-badge:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-text-1); }
.release-badge-version {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-weight: 600;
}
.release-badge-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
