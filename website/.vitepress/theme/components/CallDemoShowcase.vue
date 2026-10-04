<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {withBase} from 'vitepress';
import twoDeviceChapters from '../../../public/demos/steven-hao.chapters.json';
import lockscreenChapters from '../../../public/demos/lockscreen.chapters.json';

const props = withDefaults(defineProps<{demo?: 'two-device' | 'lockscreen'}>(), {demo: 'two-device'});
const locked = computed(() => props.demo === 'lockscreen');
const chapters = computed(() => locked.value ? lockscreenChapters : twoDeviceChapters);
const asset = computed(() => locked.value ? 'lockscreen' : 'steven-hao');
const guide = computed(() => locked.value ? '/guide/lockscreen-demo' : '/guide/demos');
const title = computed(() => locked.value ? 'Incoming calls, even while locked' : 'Steven calls hao.dev7');

const video = ref<HTMLVideoElement>();
const current = ref(-1);
const ready = ref(false);
onMounted(() => { ready.value = true; });
function updateChapter() {
  const seconds = video.value?.currentTime ?? 0;
  // Browsers may round currentTime slightly below the requested seek position.
  current.value = chapters.value.findLastIndex(chapter => chapter.seconds <= seconds + 0.05);
}
function seek(seconds: number) {
  if (!video.value) return;
  video.value.currentTime = seconds;
  updateChapter();
  video.value.focus({preventScroll: true});
}
</script>

<template>
  <section class="call-demo" :aria-label="title">
    <div class="demo-heading">
      <div>
        <span class="demo-label">{{ locked ? 'SECURE PIN · NATIVE INCOMING · ANDROID EMULATOR' : 'TWO ANDROID EMULATORS · REAL NATIVE MEDIA' }}</span>
        <h2>{{ title }}</h2>
        <p>{{ locked ? 'Voice, video and native call controls · development build.' : 'React Native and Flutter · development build. One native call lifecycle.' }}</p>
      </div>
      <a :href="withBase(guide)">How this was recorded →</a>
    </div>
    <video ref="video" controls playsinline preload="metadata" tabindex="0"
      :poster="withBase(`/demos/${asset}.jpg`)" @timeupdate="updateChapter"
      :aria-label="title">
      <source :src="withBase(`/demos/${asset}.mp4`)" type="video/mp4">
      <track kind="captions" label="Actions (English)" srclang="en" default
        :src="withBase(`/demos/${asset}.vtt`)">
      Your browser cannot play this video. Download the recording below.
    </video>
    <div class="demo-chapters" aria-label="Jump to a demo chapter">
      <button v-for="(chapter, index) in chapters" :key="chapter.name" type="button"
        :disabled="!ready" :aria-pressed="current === index" @click="seek(chapter.seconds)">
        {{ chapter.name }}
      </button>
    </div>
    <p class="demo-note">{{ locked ? 'Secure PIN and RequireUnlock on Android 16. Keyguard intervals use timestamped screen captures.' : 'Recorded from two Android emulators with real FCM and native LiveKit. The center column describes each recorded action.' }}
      Licensed sample clips feed the cameras; people shown are not Callx endorsers.
      Silent recording; the test checks media connection and remote video, not audible speech.
      <a :href="withBase(`${guide}#recording-transcript`)">Read the transcript</a>
      · <a :href="withBase(`/demos/${asset}.mp4`)" download>Download MP4</a>
      <template v-if="!locked"> · <a :href="withBase('/demos/steven-hao.gif')" download>GIF preview</a></template>
    </p>
  </section>
</template>

<style scoped>
.call-demo { margin: 36px 0; padding: 24px; border: 1px solid var(--vp-c-divider); border-radius: 20px; background: var(--vp-c-bg-soft); scroll-margin-top: 100px; }
.demo-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.demo-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--vp-c-brand-1); }
.demo-heading h2 { border: 0; margin: 8px 0; padding: 0; font-size: 28px; line-height: 1.2; }
.demo-heading p { margin: 0; color: var(--vp-c-text-2); }
.demo-heading > a { flex-shrink: 0; font-size: 13px; }
video { display: block; width: 100%; max-width: 820px; margin-inline: auto; border-radius: 12px; background: #edf3ef; }
video::cue { font-size: 14px; background-color: #102b24ee; color: white; }
.demo-chapters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.demo-chapters button { padding: 7px 12px; border: 1px solid var(--vp-c-divider); border-radius: 20px; font-size: 12px; line-height: 1.5; background: var(--vp-c-bg); transition: background-color .15s, border-color .15s; }
.demo-chapters button:hover, .demo-chapters button[aria-pressed="true"] { background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1); }
button:focus-visible, video:focus-visible { outline: 3px solid var(--vp-c-brand-1); outline-offset: 3px; }
.demo-note { margin-bottom: 0; font-size: 12px; line-height: 1.7; color: var(--vp-c-text-2); }
@media (max-width: 640px) { .call-demo { padding: 14px; } .demo-heading { display: block; } .demo-heading > a { display: inline-block; margin-top: 12px; } .demo-heading h2 { font-size: 24px; } }
@media (prefers-reduced-motion: reduce) { .demo-chapters button { transition: none; } }
</style>
