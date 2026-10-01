import {defineConfig} from 'vitepress';
import {withMermaid} from 'vitepress-plugin-mermaid';

const site = 'https://bear-block.github.io/callx/';
const description =
  'Native incoming and outgoing calls for Flutter and React Native: CallKit, Core-Telecom, push and recovery in one shared native core.';

export default withMermaid(defineConfig({
  title: 'Callx',
  description,
  base: '/callx/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {hostname: site},
  head: [
    ['link', {rel: 'icon', type: 'image/svg+xml', href: '/callx/logo.svg'}],
    ['meta', {name: 'theme-color', content: '#165a45'}],
    ['meta', {property: 'og:type', content: 'website'}],
    ['meta', {property: 'og:site_name', content: 'Callx'}],
    ['meta', {property: 'og:image', content: `${site}og.png`}],
    ['meta', {name: 'twitter:card', content: 'summary_large_image'}],
  ],
  transformPageData(page) {
    const title = page.frontmatter.title ?? page.title;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(
      ['meta', {property: 'og:title', content: title ? `${title} | Callx` : 'Callx'}],
      ['meta', {property: 'og:description', content: page.frontmatter.description ?? description}],
    );
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Callx',
    nav: [
      {text: 'Why Callx', link: '/why'},
      {text: 'Get started', link: '/guide/'},
      {text: 'Guides', link: '/guides/backend'},
      {text: 'Reference', link: '/reference/javascript'},
      {text: 'Compare', link: '/compare'},
      {
        text: 'Project',
        items: [
          {text: 'Status', link: '/project/status'},
          {text: 'Roadmap', link: '/project/roadmap'},
          {text: 'Decisions', link: '/project/decisions'},
          {text: 'Changelog', link: '/project/changelog'},
          {text: 'Contributing', link: '/project/contributing'},
          {text: 'Security', link: '/project/security'},
        ],
      },
      {text: 'Sponsor', link: '/sponsor'},
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          {text: 'Why Callx', link: '/why'},
          {text: 'Compare', link: '/compare'},
          {text: 'Status', link: '/project/status'},
        ],
      },
      {
        text: 'Get started',
        items: [
          {text: 'Overview', link: '/guide/'},
          {text: 'Flutter', link: '/guide/flutter'},
          {text: 'React Native', link: '/guide/react-native'},
          {text: 'Expo', link: '/guide/expo'},
          {text: 'Add LiveKit audio', link: '/guide/livekit'},
          {text: 'Try without a backend', link: '/guide/simulator'},
        ],
      },
      {
        text: 'Concepts',
        items: [
          {text: 'Architecture', link: '/concepts/architecture'},
          {text: 'Call lifecycle', link: '/concepts/call-lifecycle'},
          {text: 'Incoming calls and push', link: '/concepts/incoming'},
          {text: 'Commands and results', link: '/concepts/commands'},
          {text: 'Observation and replay', link: '/concepts/observation'},
          {text: 'Recovery', link: '/concepts/recovery'},
          {text: 'Media and audio ownership', link: '/concepts/media'},
        ],
      },
      {
        text: 'Guides',
        items: [
          {text: 'Backend and push payloads', link: '/guides/backend'},
          {text: 'Native host integration', link: '/guides/native-host'},
          {text: 'Bring your own media', link: '/guides/own-media'},
          {text: 'Write a media adapter', link: '/guides/write-an-adapter'},
          {text: 'Provider-managed signaling', link: '/guides/provider-managed'},
          {text: 'Test on devices', link: '/guides/testing'},
          {text: 'Migrate from react-native-callkeep', link: '/guides/migrate-callkeep'},
          {text: 'Migrate from flutter_callkit_incoming', link: '/guides/migrate-flutter-callkit-incoming'},
          {text: 'Troubleshooting', link: '/guides/troubleshooting'},
          {text: 'FAQ', link: '/guides/faq'},
        ],
      },
      {
        text: 'Platforms',
        items: [
          {text: 'iOS', link: '/platforms/ios'},
          {text: 'Android', link: '/platforms/android'},
        ],
      },
      {
        text: 'Reference',
        items: [
          {text: 'JavaScript API', link: '/reference/javascript'},
          {text: 'Dart API', link: '/reference/dart'},
          {text: 'Native API', link: '/reference/native'},
          {text: 'Expo config plugin', link: '/reference/expo-plugin'},
          {text: 'Errors', link: '/reference/errors'},
          {text: 'Contract v0.1', link: '/reference/contract'},
          {text: 'Packages', link: '/reference/packages'},
        ],
      },
      {
        text: 'Project',
        items: [
          {text: 'Status', link: '/project/status'},
          {text: 'Roadmap', link: '/project/roadmap'},
          {text: 'Decisions', link: '/project/decisions'},
          {text: 'Changelog', link: '/project/changelog'},
          {text: 'Contributing', link: '/project/contributing'},
          {text: 'Security', link: '/project/security'},
          {text: 'Sponsor', link: '/sponsor'},
        ],
      },
    ],
    socialLinks: [{icon: 'github', link: 'https://github.com/bear-block/callx'}],
    editLink: {
      pattern: 'https://github.com/bear-block/callx/edit/main/website/:path',
      text: 'Edit this page on GitHub',
    },
    search: {provider: 'local'},
    outline: {level: [2, 3]},
    footer: {
      message: 'Released under the MIT License. No telemetry, in the library or on this site.',
      copyright: 'Copyright © 2026 Callx contributors',
    },
  },
  mermaid: {theme: 'neutral'},
}));
