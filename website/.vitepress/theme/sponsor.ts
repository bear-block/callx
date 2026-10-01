// Every sponsor link on the site comes from here.
export const sponsorLinks = {
  monthly: 'https://github.com/sponsors/bear-block',
  oneTime: 'https://buymeacoffee.com/bearblock',
  company: 'https://opencollective.com/callx',
};

/** Why the reader is being asked, so the message fits the page they are on. */
export const sponsorReasons = {
  devices: {
    title: 'Help put Callx on more phones',
    body: 'Each row above that is not verified on a physical device waits on hardware. Sponsors fund the phones and the time to test every release on them.',
    promptTitle: 'Want Callx verified on your users’ phones?',
    promptBody: 'Sponsors fund the test devices and release testing. Monthly sponsors vote on which phones come next.',
  },
  roadmap: {
    title: 'Help decide what comes next',
    body: 'Video, more adapters and multi-call move faster with funded maintenance time. Supporters vote on which device family is tested next.',
    promptTitle: 'Want these sooner?',
    promptBody: 'Funded maintenance time moves the roadmap. Monthly sponsors help set the order.',
  },
  general: {
    title: 'Callx is free and independent',
    body: 'No paid tier, no telemetry. Sponsors keep it that way and pay for real-device testing.',
    promptTitle: 'Enjoying Callx?',
    promptBody: 'It is free and independent. A small sponsorship keeps it tested and maintained.',
  },
} as const;

export type SponsorReason = keyof typeof sponsorReasons;
