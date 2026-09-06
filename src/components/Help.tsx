import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Eyebrow, Panel, SectionHead, Takeaway } from './ui/tac';

/**
 * Help: an overview of every part of the app, one panel per section.
 *
 * Not a manual. Each panel says what the section is for, where it lives, and
 * where to go next. The copy is plain and short on purpose: a creator reads
 * this once, on a phone, and should come away knowing which tab to open.
 *
 * Order is deliberate: brands and accounts first, because the two header
 * chips change what every other screen shows and that is the part most
 * likely to confuse someone landing here cold.
 */

export interface HelpLink {
  label: string;
  to: string;
}

export interface HelpSection {
  id: string;
  num: string;
  name: string;
  tagline: string;
  body: string[];
  /** Where it lives in the app, in the creator's words. */
  find: string;
  links: HelpLink[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'brands',
    num: '01',
    name: 'Brands and accounts',
    tagline: 'Who the app is acting as.',
    body: [
      'Two chips sit in the header. The first is the brand: a business with its own accounts, posts, numbers, ideas, deals and voice. The second is one account inside that brand, or all of them.',
      'Every screen follows that pair. Switch brand and the account list, analytics, brief, ideas and schedule all change together. Nothing crosses between brands.',
      'Create a brand from the brand chip. Connect its accounts at Connections while it is the active brand.',
    ],
    find: 'Header, top right',
    links: [{ label: 'Connections', to: '/office/connections' }],
  },
  {
    id: 'clio',
    num: '02',
    name: 'Clio',
    tagline: 'Your daily read, and a place to ask.',
    body: [
      'Clio opens on a brief written each morning from your recent posts and numbers: what moved, what to make next, when to post.',
      'Ask Clio anything underneath it, in plain words. It answers from your own data for the brand and account you are acting as, not from generic advice.',
      'Playbook tasks that follow a publish appear here too.',
    ],
    find: 'Bottom nav, first tab',
    links: [{ label: 'Open Clio', to: '/' }],
  },
  {
    id: 'studio',
    num: '03',
    name: 'Studio',
    tagline: 'Idea to published, in five stations.',
    body: [
      'Ideate holds AI suggestions, your saved ideas and the 30-day challenge. Script writes in your voice, with templates. Create is your media library and the Drop Zone. Schedule is the calendar. Analyze is your analytics.',
      'Each station hands to the next, so an idea can become a script, a post and a verdict without leaving Studio.',
    ],
    find: 'Bottom nav, second tab',
    links: [
      { label: 'Open Studio', to: '/studio' },
      { label: 'Saved ideas', to: '/saved-ideas' },
      { label: '30-day challenge', to: '/studio/challenge' },
      { label: 'Templates', to: '/studio/templates' },
    ],
  },
  {
    id: 'create',
    num: '04',
    name: 'Create',
    tagline: 'The fast path, from the plus button.',
    body: [
      'Quick post writes and publishes now to any of the brand’s connected accounts.',
      'Drop a video takes one piece of footage and turns it into platform-shaped posts with captions in your voice, ready to schedule or send.',
    ],
    find: 'The plus button in the middle of the bottom nav',
    links: [
      { label: 'Quick post', to: '/compose' },
      { label: 'Drop a video', to: '/drop' },
    ],
  },
  {
    id: 'schedule',
    num: '05',
    name: 'Schedule',
    tagline: 'What is going out, and what already did.',
    body: [
      'A calendar of drafts, scheduled posts and published posts for the active brand. Open a post to edit it, or retry one that failed to publish.',
    ],
    find: 'Studio, then Schedule',
    links: [{ label: 'Open Schedule', to: '/schedule' }],
  },
  {
    id: 'media',
    num: '06',
    name: 'Media',
    tagline: 'Footage and images, kept per brand.',
    body: ['Upload once, reuse in posts and in the Drop Zone. Each brand has its own library.'],
    find: 'Studio, then Create',
    links: [{ label: 'Open Media', to: '/media' }],
  },
  {
    id: 'analytics',
    num: '07',
    name: 'Analytics',
    tagline: 'Was that post good. Are you growing. What next.',
    body: [
      'Every post is scored against your own last twenty in the same format. A 2.3x means 2.3 times your median, not somebody else’s.',
      'Content lanes show which kind of post is working. Followers per platform sit below.',
      'When a screen is empty, the panel at the top says why: a token that expired, a sync that stalled, or simply nothing published in the window you picked.',
    ],
    find: 'Studio, then Analyze',
    links: [{ label: 'Open Analytics', to: '/analytics' }],
  },
  {
    id: 'watch',
    num: '08',
    name: 'Watch',
    tagline: 'What is working in your niche right now.',
    body: [
      'Creators and posts worth watching on YouTube, TikTok and Instagram, chosen for the niche of the account you are acting as. Use it for formats and hooks, not for copying.',
    ],
    find: 'Bottom nav, fourth tab',
    links: [{ label: 'Open Watch', to: '/watch' }],
  },
  {
    id: 'patra',
    num: '09',
    name: 'Patra',
    tagline: 'Brand deals, from quote to invoice.',
    body: [
      'Quick quote prices a deal from your numbers and the CPM tier in Settings. Deals is the pipeline. Invoices tracks what has been sent and paid. All of it per brand.',
    ],
    find: 'Bottom nav, last tab',
    links: [{ label: 'Open Patra', to: '/patra' }],
  },
  {
    id: 'connections',
    num: '10',
    name: 'Connections',
    tagline: 'Where accounts get connected.',
    body: [
      'Post for Me connects TikTok, Instagram, Facebook, YouTube, X, Threads and Bluesky, and pulls every post’s metrics. Follower counts for Instagram and YouTube need their own connection on the same page.',
      'Each row shows which brand the account belongs to. Move it from there if it was filed under the wrong one.',
    ],
    find: 'Settings, then Connections',
    links: [{ label: 'Open Connections', to: '/office/connections' }],
  },
  {
    id: 'settings',
    num: '11',
    name: 'Settings and voice',
    tagline: 'Profile, appearance, rates, and how you sound.',
    body: [
      'Your voice is built from your own captions and used by everything that writes for you. Rebuild it from Settings when your style shifts. Rates and the CPM tier feed Patra’s quotes.',
    ],
    find: 'Gear icon, top right',
    links: [{ label: 'Open Settings', to: '/settings' }],
  },
];

export function Help() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
      <div className="space-y-3">
        <Eyebrow>HELP</Eyebrow>
        <SectionHead accent="together.">How Cliopatra fits</SectionHead>
        <p className="text-sm text-muted-foreground max-w-prose">
          What each part of the app is for, where it lives, and where to go next. Two minutes, start to finish.
        </p>
      </div>

      <Takeaway>Pick a brand, pick an account, and every screen follows.</Takeaway>

      <div className="space-y-4">
        {HELP_SECTIONS.map((s) => (
          <Panel key={s.id} className="p-6">
            <Eyebrow>
              {s.num} · {s.name.toUpperCase()}
            </Eyebrow>
            <h3 className="text-lg font-black uppercase tracking-tight text-foreground mt-2">{s.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{s.tagline}</p>
            <div className="mt-4 space-y-3">
              {s.body.map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground max-w-prose">
                  {para}
                </p>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="t-micro text-muted-foreground">FIND IT · {s.find.toUpperCase()}</span>
              {s.links.map((l) => (
                <Link
                  key={l.to + l.label}
                  to={l.to}
                  className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-2"
                >
                  {l.label.toUpperCase()} <ArrowRight className="w-3 h-3" />
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
