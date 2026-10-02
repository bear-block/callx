// Every sponsor link on the site comes from here.
export const sponsorLinks = {
  monthly: 'https://github.com/sponsors/bear-block',
  oneTime: 'https://buymeacoffee.com/bearblock',
};

/** Why the reader is being asked, so the message fits the page they are on. */
export const sponsorReasons = {
  verify: {
    title: 'Help verify Callx on real phones',
    body: 'Rows not yet verified on a physical device need results from real hardware. Share results from your phone or pass on one you no longer use; sponsors fund the time to turn results into fixes and releases.',
    promptTitle: 'Have a phone Callx is not verified on yet?',
    promptBody: 'Results from your device fill this table fastest. Sponsors fund the maintenance that follows.',
    extra: {label: 'Share device results', href: 'https://github.com/bear-block/callx/issues/new?template=device-results.yml'},
  },
  roadmap: {
    title: 'Help decide what comes next',
    body: 'Video, more adapters and multi-call move faster with funded maintenance time. Supporters vote on roadmap priorities.',
    promptTitle: 'Want these sooner?',
    promptBody: 'Funded maintenance time moves the roadmap. Monthly sponsors help set the order.',
  },
  general: {
    title: 'Callx is free and independent',
    body: 'No paid tier, no telemetry. Sponsors keep it that way and pay for the time to follow every iOS and Android release.',
    promptTitle: 'Enjoying Callx?',
    promptBody: 'It is free and independent. A small sponsorship keeps it maintained through every OS release.',
  },
} as const;

export type SponsorReason = keyof typeof sponsorReasons;
