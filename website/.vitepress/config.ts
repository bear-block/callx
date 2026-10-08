import {readFileSync} from 'node:fs';
import {defineConfig} from 'vitepress';

// One source for the version shown in the nav: all packages release together (see Packages).
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const version: string = readJson('../../packages/react-native/package.json').version;
const contractVersion: string = readJson('../../contracts/v0/manifest.json').contractVersion;
const releaseAnchor = `release-${version.replaceAll('.', '-')}`;

const site = 'https://bear-block.github.io/callx/';
const description =
  'Native incoming and outgoing calls for Flutter and React Native: CallKit, Core-Telecom, push and recovery in one shared native core.';

export default defineConfig({
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
    ['meta', {property: 'og:image', content: `${site}og.jpg`}],
    ['meta', {property: 'og:image:width', content: '1200'}],
    ['meta', {property: 'og:image:height', content: '630'}],
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
      {text: 'Get started', link: '/guide/'},
      {text: 'Features', link: '/guide/features'},
      {text: 'Backend', link: '/backend/'},
      {text: 'Reference', link: '/reference/javascript'},
      {
        text: 'Project',
        items: [
          {text: 'Why Callx', link: '/why'},
          {text: 'Compare', link: '/compare'},
          {text: 'Status', link: '/project/status'},
          {text: 'Roadmap', link: '/project/roadmap'},
          {text: 'Decisions', link: '/project/decisions'},
          {text: 'Changelog & releases', link: '/project/changelog'},
          {text: 'Contributing', link: '/project/contributing'},
          {text: 'Security', link: '/project/security'},
        ],
      },
      {text: 'Work with us', link: '/services'},
      {text: 'Sponsor', link: '/sponsor'},
      {
        text: `v${version}`,
        items: [
          {text: `Release notes for ${version}`, link: `/project/changelog#${releaseAnchor}`},
          {text: 'What has been verified', link: '/project/status'},
          {text: `Contract ${contractVersion}`, link: '/reference/contract'},
          {text: 'npm', link: 'https://www.npmjs.com/package/@bear-block/callx'},
          {text: 'pub.dev', link: 'https://pub.dev/packages/callx'},
        ],
      },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          {text: 'Quick start', link: '/guide/'},
          {text: 'Flutter', link: '/guide/flutter'},
          {text: 'React Native', link: '/guide/react-native'},
          {text: 'Expo', link: '/guide/expo'},
          {text: 'Audio and video with LiveKit', link: '/guide/livekit'},
          {text: 'Try without a backend', link: '/guide/simulator'},
          {text: 'Setup checklist generator', link: '/guide/setup'},
        ],
      },
      {
        text: 'Build your calls',
        items: [
          {text: 'Video calls', link: '/guide/video'},
          {text: 'Phone features', link: '/guide/phone-features'},
          {text: 'Call overlay and mini-call', link: '/guide/call-ui'},
          {text: 'Bring your own media', link: '/guides/own-media'},
          {text: 'Native host integration', link: '/guides/native-host'},
        ],
      },
      {
        text: 'Backend',
        items: [
          {text: 'Overview and rules', link: '/backend/'},
          {text: 'Call flows', link: '/backend/call-flows'},
          {text: 'API and push payloads', link: '/backend/reference'},
          {text: 'Media credentials', link: '/backend/media'},
          {text: 'Production checklist', link: '/backend/production'},
        ],
      },
      {
        text: 'Test and ship',
        items: [
          {text: 'Verify your first call', link: '/guide/first-call'},
          {text: 'Test on devices', link: '/guides/testing'},
          {text: 'Troubleshooting', link: '/guides/troubleshooting'},
          {text: 'FAQ', link: '/guides/faq'},
          {
            text: 'Migrate',
            collapsed: true,
            items: [
              {text: 'From react-native-callkeep', link: '/guides/migrate-callkeep'},
              {text: 'From flutter_callkit_incoming', link: '/guides/migrate-flutter-callkit-incoming'},
              {text: 'Rollout and rollback', link: '/guides/migration-rollout'},
            ],
          },
        ],
      },
      {
        text: 'Concepts',
        collapsed: true,
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
        text: 'Platforms',
        collapsed: true,
        items: [
          {text: 'iOS', link: '/platforms/ios'},
          {text: 'Android', link: '/platforms/android'},
        ],
      },
      {
        text: 'Reference',
        collapsed: true,
        items: [
          {text: 'TypeScript API', link: '/reference/javascript'},
          {text: 'Dart API', link: '/reference/dart'},
          {text: 'Native API', link: '/reference/native'},
          {text: 'Expo config plugin', link: '/reference/expo-plugin'},
          {text: 'Errors', link: '/reference/errors'},
          {text: `Contract v${contractVersion.split('.').slice(0, 2).join('.')}`, link: '/reference/contract'},
          {text: 'Packages', link: '/reference/packages'},
        ],
      },
      {
        text: 'Advanced',
        collapsed: true,
        items: [
          {text: 'Write a media adapter', link: '/guides/write-an-adapter'},
          {text: 'Provider-managed signaling (planned)', link: '/guides/provider-managed'},
        ],
      },
      {
        text: 'About Callx',
        collapsed: true,
        items: [
          {text: 'What you can build', link: '/guide/features'},
          {text: 'Why Callx', link: '/why'},
          {text: 'Compare', link: '/compare'},
          {text: 'Two-device demo', link: '/guide/demos'},
          {text: 'Lock-screen demo', link: '/guide/lockscreen-demo'},
          {text: 'Status', link: '/project/status'},
          {text: 'Roadmap', link: '/project/roadmap'},
          {text: 'Decisions', link: '/project/decisions'},
          {text: 'Changelog & releases', link: '/project/changelog'},
          {text: 'Contributing', link: '/project/contributing'},
          {text: 'Security', link: '/project/security'},
          {text: 'Work with us', link: '/services'},
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
  vite: {
    // The home page's release badge reads the same package version as the nav.
    define: {__CALLX_VERSION__: JSON.stringify(version)},
    // Mermaid's own chunks are large but load only on pages with a diagram.
    build: {chunkSizeWarningLimit: 1500},
  },
  markdown: {
    config(md) {
      // ```mermaid fences render client-side, loading Mermaid only where a diagram exists.
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index];
        if (token.info.trim() !== 'mermaid') return fence(tokens, index, options, env, self);
        return `<ClientOnly><MermaidDiagram code="${encodeURIComponent(token.content)}" /></ClientOnly>`;
      };
    },
  },
});
