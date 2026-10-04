<script setup lang="ts">
import {withBase} from 'vitepress';

const features = [
  {title: 'Answer from the lock screen', image: 'locked-voice', alt: 'Steven voice call with native timer, mute, hold and audio controls while securely locked',
    detail: 'Native incoming, answer and decline, and in-call controls without unlocking.', link: '/guide/lockscreen-demo', badge: 'Android'},
  {title: 'Make video part of your app', image: 'video-call', alt: 'Live video call with top local preview, direct Hold and consistent microphone, camera, audio and end controls',
    detail: 'Native video surfaces and camera commands. Choose your own screens or customize the optional Callx UI.', link: '/guide/call-ui', badge: 'Video + UI'},
  {title: 'Keep the call while you navigate', image: 'mini-call', alt: 'Live in-app mini-call floating over the Home screen',
    detail: 'Back minimizes into your app. Expand returns to the same call, with your Home screen still mounted.', link: '/guide/call-ui', badge: 'Flutter + React Native'},
  {title: 'Continue outside the app', image: 'system-pip', alt: 'Android system picture-in-picture showing the active video call over the launcher',
    detail: 'Picture-in-picture shows video or your colors and logo when the user leaves the app.', link: '/guide/video', badge: 'Android · iOS experimental'},
];
</script>

<template>
  <section class="feature-gallery" aria-labelledby="call-features-heading">
    <div class="feature-intro">
      <p class="eyebrow">FROM INCOMING TO IN-CALL</p>
      <h2 id="call-features-heading">A call experience you can make your own</h2>
      <p>Native call ownership, optional UI and a media adapter. See what each layer gives your app.</p>
    </div>
    <div class="feature-grid">
      <article v-for="feature in features" :key="feature.image" class="feature-card">
        <div class="feature-copy">
          <span class="feature-badge">{{ feature.badge }}</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.detail }}</p>
          <a :href="withBase(feature.link)">Explore this feature →</a>
        </div>
        <div class="feature-phone">
          <img :src="withBase(`/demos/features/${feature.image}.jpg`)" :alt="feature.alt"
            width="360" height="800" loading="lazy" decoding="async">
        </div>
      </article>
    </div>
    <p class="feature-evidence">Actual Android emulator captures with native Telecom and LiveKit.
      Camera inputs are licensed sample clips.
      <a :href="withBase('/project/status')">Check platform coverage and verification →</a>
    </p>
  </section>
</template>

<style scoped>
.feature-gallery { margin: 48px 0; }
.feature-intro { max-width: 640px; margin-bottom: 24px; }
.eyebrow { color: var(--vp-c-brand-1); font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.feature-intro h2 { border: 0; padding: 0; margin: 10px 0; font-size: 30px; line-height: 1.25; }
.feature-intro > p:last-child, .feature-copy p { color: var(--vp-c-text-2); }
.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.feature-card { display: grid; grid-template-columns: minmax(0, 1fr) 142px; align-items: center; gap: 24px; padding: 24px; border-radius: 24px; border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); }
.feature-copy { min-width: 0; }
.feature-copy h3 { font-size: 22px; line-height: 1.3; margin: 16px 0 10px; }
.feature-copy p { font-size: 14px; line-height: 1.7; }
.feature-copy a { display: inline-block; margin-top: 8px; font-size: 13px; font-weight: 600; }
.feature-badge { font-size: 11px; line-height: 1.6; color: var(--vp-c-brand-1); }
.feature-phone { padding: 5px; border-radius: 25px; background: #102b24; border: 1px solid #769487; box-shadow: 0 12px 24px #0002; }
.feature-phone img { display: block; width: 100%; height: auto; border-radius: 20px; }
.feature-evidence { color: var(--vp-c-text-2); font-size: 12px; line-height: 1.7; margin-top: 18px; }
a:focus-visible { outline: 3px solid var(--vp-c-brand-1); outline-offset: 4px; border-radius: 4px; }
@media (max-width: 960px) { .feature-grid { grid-template-columns: 1fr; } .feature-card { grid-template-columns: minmax(0, 1fr) 156px; } }
@media (max-width: 480px) { .feature-card { grid-template-columns: minmax(0, 1fr) 112px; gap: 14px; padding: 16px; } .feature-copy h3 { font-size: 19px; } .feature-copy p { font-size: 13px; } .feature-intro h2 { font-size: 26px; } }
</style>
