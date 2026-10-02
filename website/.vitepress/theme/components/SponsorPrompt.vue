<script setup lang="ts">
// A small, dismissible card in the corner of pages that ask for it in frontmatter
// (`sponsorPrompt: devices`). It appears once the reader is most of the way down the page and no
// in-page sponsor callout is on screen, and stays away for 30 days after being closed. The
// dismissal is kept only in this browser.
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useData, useRoute, withBase} from 'vitepress';
import {sponsorLinks, sponsorReasons, type SponsorReason} from '../sponsor';

const STORAGE_KEY = 'callx-sponsor-prompt-dismissed-at';
const QUIET_DAYS = 30;

const {frontmatter} = useData();
const route = useRoute();
const open = ref(false);
const closeButton = ref<HTMLButtonElement | null>(null);

const reason = computed<SponsorReason | null>(() => {
  const value = frontmatter.value.sponsorPrompt;
  return typeof value === 'string' && value in sponsorReasons ? (value as SponsorReason) : null;
});
const copy = computed(() => (reason.value ? sponsorReasons[reason.value] : null));

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function dismiss() {
  open.value = false;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the card simply may appear again on a later visit.
  }
}

/** The page's own callout already makes the case; do not repeat it next to it. */
function calloutOnScreen(): boolean {
  return [...document.querySelectorAll('.sponsor-callout')].some((element) => {
    const box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  });
}

function onScroll() {
  if (open.value || !reason.value) return;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0 || window.scrollY / scrollable < 0.8) return;
  if (calloutOnScreen() || dismissedRecently()) return;
  open.value = true;
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) dismiss();
}

watch(() => route.path, () => {
  open.value = false;
});
watch(open, async (value) => {
  if (value) {
    await nextTick();
    closeButton.value?.focus({preventScroll: true});
  }
});

onMounted(() => {
  window.addEventListener('scroll', onScroll, {passive: true});
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <Transition name="sponsor-prompt">
    <div v-if="open && copy" class="sponsor-prompt" role="dialog" aria-modal="false"
      aria-labelledby="sponsor-prompt-title">
      <button ref="closeButton" class="sponsor-prompt__close" type="button" aria-label="Close"
        @click="dismiss">×</button>
      <p id="sponsor-prompt-title" class="sponsor-prompt__title">
        <span aria-hidden="true">♥</span> {{ copy.promptTitle }}
      </p>
      <p class="sponsor-prompt__body">{{ copy.promptBody }}</p>
      <div class="sponsor-prompt__actions">
        <a class="sp-btn sp-btn--brand" :href="sponsorLinks.monthly" target="_blank" rel="noopener"
          @click="dismiss">Sponsor monthly</a>
        <a class="sp-btn" :href="sponsorLinks.oneTime" target="_blank" rel="noopener"
          @click="dismiss">One-time</a>
      </div>
      <div class="sponsor-prompt__footer">
        <a v-if="'extra' in copy" :href="copy.extra.href" target="_blank" rel="noopener"
          @click="dismiss">{{ copy.extra.label }}</a>
        <a :href="withBase('/sponsor')" @click="dismiss">Where the money goes</a>
        <button type="button" @click="dismiss">Not now</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sponsor-prompt {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 30;
  width: min(340px, calc(100vw - 32px));
  padding: 18px 18px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-4);
}
@media (max-width: 640px) {
  /* A compact bar on phones: title and the two choices. */
  .sponsor-prompt {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    padding: 12px 14px 10px;
  }
  .sponsor-prompt__body,
  .sponsor-prompt__footer a {
    display: none;
  }
  .sponsor-prompt__title {
    font-size: 14px;
    margin-bottom: 10px;
  }
  .sponsor-prompt__footer {
    margin-top: 6px;
  }
  .sponsor-prompt__footer button {
    margin-left: auto;
  }
}
.sponsor-prompt__close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  color: var(--vp-c-text-3);
}
.sponsor-prompt__close:hover,
.sponsor-prompt__close:focus-visible {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft);
}
.sponsor-prompt__title {
  margin: 0 28px 0 0;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.sponsor-prompt__title span {
  color: var(--vp-c-brand-1);
}
.sponsor-prompt__body {
  margin: 6px 0 14px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
.sponsor-prompt__actions {
  display: flex;
  gap: 8px;
}
.sp-btn {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}
.sp-btn:hover {
  border-color: var(--vp-c-brand-1);
}
.sp-btn--brand {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}
.dark .sp-btn--brand {
  color: #0b1512;
}
.sponsor-prompt__footer {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 12.5px;
}
.sponsor-prompt__footer a {
  color: var(--vp-c-brand-1);
}
.sponsor-prompt__footer button {
  color: var(--vp-c-text-3);
}
.sponsor-prompt__footer button:hover {
  color: var(--vp-c-text-1);
}
.sponsor-prompt-enter-active,
.sponsor-prompt-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.sponsor-prompt-enter-from,
.sponsor-prompt-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .sponsor-prompt-enter-active,
  .sponsor-prompt-leave-active {
    transition: none;
  }
}
</style>
