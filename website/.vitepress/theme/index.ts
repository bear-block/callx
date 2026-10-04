import {h} from 'vue';
import type {Theme} from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SponsorAside from './components/SponsorAside.vue';
import SponsorCallout from './components/SponsorCallout.vue';
import SponsorList from './components/SponsorList.vue';
import SponsorPrompt from './components/SponsorPrompt.vue';
import CallFeatureGallery from './components/CallFeatureGallery.vue';
import CallDemoShowcase from './components/CallDemoShowcase.vue';
import SetupGuide from './components/SetupGuide.vue';
import MermaidDiagram from './components/MermaidDiagram.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'aside-outline-after': () => h(SponsorAside),
    'layout-bottom': () => h(SponsorPrompt),
  }),
  enhanceApp({app}) {
    app.component('CallDemoShowcase', CallDemoShowcase);
    app.component('CallFeatureGallery', CallFeatureGallery);
    app.component('SetupGuide', SetupGuide);
    app.component('MermaidDiagram', MermaidDiagram);
    app.component('SponsorCallout', SponsorCallout);
    app.component('SponsorList', SponsorList);
  },
} satisfies Theme;
