import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Privacy policy and terms of service, as in-app pages.
 *
 * Both render without the signed-in Layout so a platform reviewer, an app
 * store reviewer, or someone on the sign-in screen can read them with no
 * session. Same cream page and editorial heading as Auth and Onboarding.
 */

const CONTACT_EMAIL = 'hello@theamplifiedcreator.com';
const UPDATED = 'September 14, 2026';

function LegalShell({
  eyebrow,
  title,
  accent,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  children: ReactNode;
}) {
  const pageStyle: React.CSSProperties = {
    background: 'var(--background, #F7F4EE)',
    color: 'var(--foreground, #1a1a1a)',
    minHeight: '100vh',
  };

  return (
    <div style={pageStyle} className="px-4 py-12">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <Link to="/" className="font-sans font-bold text-lg tracking-tight text-foreground" style={{ letterSpacing: '-0.02em' }}>
            Cliopatra
          </Link>
          <Link to="/" className="t-micro text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
            <ArrowLeft className="w-3 h-3" />
            BACK
          </Link>
        </div>

        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>{eyebrow}</span>
        </div>
        <h1
          className="text-foreground mb-3"
          style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          {title} <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>{accent}</em>
        </h1>
        <p className="t-micro mb-6">LAST UPDATED · {UPDATED.toUpperCase()}</p>
        <p className="t-body mb-10" style={{ maxWidth: '60ch' }}>{intro}</p>

        <div className="space-y-8">{children}</div>

        <div className="mt-12 pt-6 border-t border-border flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="t-micro text-muted-foreground hover:text-foreground transition-colors">PRIVACY</Link>
          <Link to="/terms" className="t-micro text-muted-foreground hover:text-foreground transition-colors">TERMS</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="t-micro text-muted-foreground hover:text-foreground transition-colors">CONTACT</a>
        </div>
        <div className="mt-6 t-micro text-muted-foreground">CLIOPATRA SOCIAL · v1</div>
      </div>
    </div>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="t-micro mb-3 pb-2 border-b border-border">
        {num} · {title.toUpperCase()}
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-foreground" style={{ maxWidth: '64ch' }}>
        {children}
      </div>
    </section>
  );
}

function Items({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2" style={{ listStyle: 'disc', paddingLeft: '1.25rem' }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-accent transition-colors">
      {children}
    </a>
  );
}

export function Privacy() {
  return (
    <LegalShell
      eyebrow="PRIVACY"
      title="How we handle"
      accent="your data."
      intro="Cliopatra Social is a publishing and analytics tool for creators, run by The Amplified Creator. This page says what we collect, why, who else touches it, and how to get it deleted."
    >
      <Section num="01" title="What we collect">
        <p>Only what the app needs to work:</p>
        <Items
          items={[
            <><strong>Account details.</strong> Your email address and a password, held by Supabase Auth. We never see the password itself.</>,
            <><strong>Profile and brand details.</strong> Your name, niche, timezone, the brands you set up, and the rates and terms you enter for brand deals.</>,
            <><strong>Connected accounts.</strong> When you connect a social account, the access token for it is stored so the app can publish and read metrics on your behalf. Tokens are never shown to other users or included in API responses.</>,
            <><strong>Content you create.</strong> Captions, scripts, ideas, scheduled posts, and any media you upload. Uploaded media is private to your account and served through short-lived links.</>,
            <><strong>Platform data.</strong> Your handles, follower counts, and the performance of your posts, pulled from the platforms you connect.</>,
            <><strong>Media kit enquiries.</strong> If you publish a media kit, a brand that contacts you through it gives us their name, email, and message, plus a hashed IP address used only to limit spam.</>,
          ]}
        />
      </Section>

      <Section num="02" title="How we use it">
        <Items
          items={[
            'To sign you in and keep your session secure.',
            'To connect to your social platforms and publish what you schedule, when you schedule it.',
            'To show you your analytics, post history, and calendar.',
            'To generate ideas, scripts, captions, and briefs in your voice. The captions of your published posts are sent to an AI model for this; the model provider does not train on them.',
            'To answer support requests.',
          ]}
        />
        <p>We do not sell your data, use it for advertising, or share it with anyone for their own purposes.</p>
      </Section>

      <Section num="03" title="Who else touches it">
        <p>The app runs on a small number of services. Each has its own privacy policy:</p>
        <Items
          items={[
            <><strong>Supabase</strong> stores your data and handles sign-in. <Ext href="https://supabase.com/privacy">supabase.com/privacy</Ext></>,
            <><strong>Post for Me</strong> connects and publishes to Instagram, Facebook, Threads, YouTube, TikTok, X, and Bluesky on your behalf. <Ext href="https://www.postforme.dev/privacy">postforme.dev/privacy</Ext></>,
            <><strong>Anthropic</strong> provides the AI model behind Clio and the writing tools. <Ext href="https://www.anthropic.com/privacy">anthropic.com/privacy</Ext></>,
            <><strong>Vercel</strong> hosts the app. <Ext href="https://vercel.com/legal/privacy-policy">vercel.com/legal/privacy-policy</Ext></>,
            <><strong>The platforms themselves.</strong> Meta (Instagram, Facebook, Threads), Google (YouTube), TikTok, X, and Bluesky each apply their own policies to the accounts you connect.</>,
          ]}
        />
        <p>We request the smallest set of permissions each platform allows for publishing and reading your own metrics. You can revoke access at any time from Connections in the app or from the platform's own settings.</p>
      </Section>

      <Section num="04" title="Where it lives and how it is protected">
        <p>Data is stored in a Supabase Postgres database with row-level security, so each user can only read their own records. Uploaded media sits in a private bucket and is only reachable through links that expire. Everything travels over HTTPS. Access tokens are never written to logs.</p>
      </Section>

      <Section num="05" title="How long we keep it">
        <p>For as long as your account exists. Deleting your account, from Profile in the app, removes your profile, brands, posts, ideas, analytics history, uploaded media, and connected-account tokens straight away. Backups roll off within 30 days.</p>
      </Section>

      <Section num="06" title="Your choices">
        <Items
          items={[
            'See and edit what we hold about you from Profile and Settings.',
            'Disconnect any platform from Connections.',
            'Delete your account and everything in it from Profile.',
            <>Ask us anything about your data at <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.</>,
          ]}
        />
      </Section>

      <Section num="07" title="Children">
        <p>Cliopatra Social is not for anyone under 13, and we do not knowingly collect information from children. If you think a child has given us personal information, email us and we will delete it.</p>
      </Section>

      <Section num="08" title="Changes">
        <p>If this policy changes in a way that matters, we will update the date at the top and say so in the app. Using Cliopatra Social after a change means you accept the updated policy.</p>
      </Section>

      <Section num="09" title="Contact">
        <p>
          Questions about this policy or your data: <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalShell>
  );
}

export function Terms() {
  return (
    <LegalShell
      eyebrow="TERMS"
      title="The terms,"
      accent="in plain words."
      intro="These terms cover your use of Cliopatra Social, the app and website run by The Amplified Creator. By creating an account you agree to them. If you do not agree, do not use the app."
    >
      <Section num="01" title="Your account">
        <Items
          items={[
            'You need to be at least 13, and old enough to hold accounts on the platforms you connect.',
            'Keep your password to yourself. What happens under your account is your responsibility.',
            'One person per account. Brands inside the app are yours to set up; sharing a login with a team is not supported yet.',
            'Give us accurate details and keep them current.',
          ]}
        />
      </Section>

      <Section num="02" title="What the app does">
        <p>Cliopatra Social lets you plan, write, schedule, and publish posts to social platforms you connect, read the performance of those posts, and use AI tools that write in your voice. Publishing goes through Post for Me, a third-party service that holds the platform connections.</p>
        <p>We work hard to publish on time and report numbers accurately, but the platforms decide what gets posted and what data they return. A platform outage, a policy change, or an expired connection can delay or block a post. Check anything important yourself.</p>
      </Section>

      <Section num="03" title="Your content">
        <Items
          items={[
            'Everything you write, upload, or publish stays yours. We take no ownership of it.',
            'You give us permission to store it, show it back to you, and send it to the platforms you choose, because that is what the app is for.',
            'Only post what you have the right to post. No content that infringes someone else’s rights, breaks a law, or breaks the rules of the platform it goes to.',
            'You are responsible for what you publish, including anything the AI tools drafted for you. Read it before it goes out.',
          ]}
        />
      </Section>

      <Section num="04" title="Connected platforms">
        <p>When you connect Instagram, Facebook, Threads, YouTube, TikTok, X, or Bluesky, you also agree to that platform's terms. We publish only what you tell us to, when you tell us to, and read only the metrics needed to show you your own performance. Disconnect a platform at any time from Connections.</p>
      </Section>

      <Section num="05" title="AI features">
        <p>Ideas, scripts, captions, and briefs are generated by an AI model from your own posts and the details you give us. They are suggestions. They can be wrong, generic, or off-tone, and they are not advice. Each account has a daily limit on AI requests.</p>
      </Section>

      <Section num="06" title="Acceptable use">
        <p>Do not use the app to:</p>
        <Items
          items={[
            'Spam, harass, impersonate, or mislead.',
            'Publish content that is illegal, hateful, or sexually explicit, or that targets minors.',
            'Access another person’s account or data, or try to get around the app’s security or limits.',
            'Resell or automate the service beyond what the app itself offers.',
          ]}
        />
        <p>We can suspend or close an account that breaks these rules.</p>
      </Section>

      <Section num="07" title="Plans and payment">
        <p>Some features may sit behind a paid plan. Prices and what each plan includes are shown in the app before you pay. Subscriptions renew until you cancel, and you can cancel any time; access continues to the end of the period already paid for. Fees are non-refundable except where the law says otherwise.</p>
      </Section>

      <Section num="08" title="Ending things">
        <p>You can delete your account from Profile at any time, which removes your data as described in the privacy policy. We can end or suspend access if you break these terms, or if we shut the service down, in which case we will give reasonable notice where we can.</p>
      </Section>

      <Section num="09" title="No warranties, limited liability">
        <p>The app is provided as it is. We do not promise it will be uninterrupted, error-free, or that every post will publish or every number will be exact. To the extent the law allows, The Amplified Creator is not liable for lost revenue, lost followers, lost content, or any indirect damage that comes from using the app, and our total liability to you is limited to what you paid us in the twelve months before the claim.</p>
      </Section>

      <Section num="10" title="Changes to these terms">
        <p>We may update these terms. If the change is significant we will update the date at the top and tell you in the app. Continuing to use Cliopatra Social after that means you accept the new terms.</p>
      </Section>

      <Section num="11" title="Law and contact">
        <p>These terms are governed by the laws of the State of Tennessee, United States. Questions go to <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.</p>
      </Section>
    </LegalShell>
  );
}
