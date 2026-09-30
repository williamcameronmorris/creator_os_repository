import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, PlayCircle, Send } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Public landing page, served at `/` to anyone without a session.
 *
 * Exists because the app's home was a ProtectedRoute that bounced straight to
 * /auth, and Google's OAuth verification rejects an app whose home page sits
 * behind a login ("We were unable to confirm your app's compliance"). A
 * reviewer needs to reach a page that says what the app is, which Google data
 * it touches, and where the privacy policy lives, with no account.
 *
 * So the YouTube section here is not marketing copy. It is the compliance
 * disclosure, and it has to keep matching what the app actually requests:
 * SCOPES in src/lib/youtubeOAuth.ts (youtube.readonly) and what
 * supabase/functions/youtube-sync reads with it (subscriber and post counts,
 * nothing else). Change either of those and change this too.
 *
 * Signed-in users never see this: App.tsx only mounts it in the logged-out
 * route table, where `/` used to redirect to /auth.
 */

const CONTACT_EMAIL = 'hello@theamplifiedcreator.com';

function Feature({
  icon: Icon,
  accent,
  label,
  title,
  children,
}: {
  icon: React.ElementType;
  accent: string;
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 pl-4 py-1" style={{ borderColor: accent }}>
      <div className="t-micro mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        {label}
      </div>
      <h3 className="text-foreground mb-2" style={{ fontSize: '1.0625rem', fontWeight: 500, letterSpacing: '-0.015em' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="t-micro mb-4 pb-2 border-b border-border">
        {num} · {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}

export function Landing() {
  return (
    <div
      className="px-4 py-12"
      style={{ background: 'var(--background, #F7F4EE)', color: 'var(--foreground, #1a1a1a)', minHeight: '100vh' }}
    >
      <div className="w-full max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-16">
          <span className="font-sans font-bold text-lg tracking-tight text-foreground" style={{ letterSpacing: '-0.02em' }}>
            Cliopatra
          </span>
          <Link to="/auth" className="t-micro text-muted-foreground hover:text-foreground transition-colors">
            SIGN IN
          </Link>
        </header>

        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>FOR SOLO CREATORS</span>
        </div>
        <h1
          className="text-foreground mb-5"
          style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          Plan it, write it, <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>publish it.</em>
        </h1>
        <p className="t-body mb-8" style={{ maxWidth: '60ch' }}>
          Cliopatra Social is a content planning and publishing app for people who run their own
          channel. Decide what to make next, write it, schedule it, and send it to every platform
          you post on, from one place. Then see how it did.
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-20">
          <Link to="/auth" className="btn-ie btn-ie-solid flex items-center gap-2">
            <span className="btn-ie-text">Create an account</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/auth" className="t-micro text-muted-foreground hover:text-foreground transition-colors">
            ALREADY HAVE ONE? SIGN IN
          </Link>
        </div>

        <div className="space-y-12">
          <Section num="01" title="What it does">
            <div className="space-y-6">
              <Feature icon={MessageCircle} accent="var(--accent)" label="CLIO" title="Work out what to make next">
                Clio is the content side of the app. Talk through ideas, look at what has been
                working on your own channel, and plan a week of posts without staring at a blank page.
              </Feature>
              <Feature icon={PlayCircle} accent="#7A9E89" label="STUDIO" title="Write the thing">
                Turn an idea into a hook, a script and a caption. Keep your scripts and saved ideas
                in one place instead of scattered across notes apps.
              </Feature>
              <Feature icon={Send} accent="#B07050" label="COMPOSE" title="Publish everywhere at once">
                Write one post, pick the accounts it goes to, and publish now or schedule it.
                Cliopatra checks each platform's caption limits and media rules before it sends,
                so a post does not fail after you have walked away.
              </Feature>
            </div>
          </Section>

          <Section num="02" title="Platforms you can connect">
            <p className="text-sm leading-relaxed text-muted-foreground mb-3" style={{ maxWidth: '64ch' }}>
              Instagram, Facebook, Threads, YouTube, TikTok, X and Bluesky. Publishing runs through{' '}
              <a
                href="https://www.postforme.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-accent transition-colors"
              >
                Post for Me
              </a>
              . You connect the accounts you want and can disconnect any of them at any time.
            </p>
          </Section>

          <Section num="03" title="How Cliopatra uses your Google account data">
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground" style={{ maxWidth: '64ch' }}>
              <p>
                Connecting YouTube is optional. If you choose to, Cliopatra requests one scope,{' '}
                <code className="font-mono text-xs text-foreground">youtube.readonly</code>, and uses
                it for a single purpose: reading your channel's subscriber count and how many videos
                you have published, so the app can show you your own follower growth next to your
                other platforms.
              </p>
              <p>
                <strong className="text-foreground">Cliopatra does not upload, edit, delete or
                comment on anything on your YouTube channel with this access</strong>, and never reads
                another channel's private data. Your tokens are stored encrypted, are never shown to
                other users, and are deleted the moment you disconnect YouTube or delete your account.
              </p>
              <p>
                Cliopatra's use and transfer of information received from Google APIs adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-accent transition-colors"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. Full detail is in our{' '}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-accent transition-colors">
                  privacy policy
                </Link>
                .
              </p>
            </div>
          </Section>

          <Section num="04" title="Who makes it">
            <p className="text-sm leading-relaxed text-muted-foreground" style={{ maxWidth: '64ch' }}>
              Cliopatra Social is built and run by The Amplified Creator. Questions, or want to
              report something?{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-accent transition-colors">
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>
        </div>

        <div className="mt-16 pt-6 border-t border-border flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="t-micro text-muted-foreground hover:text-foreground transition-colors">PRIVACY</Link>
          <Link to="/terms" className="t-micro text-muted-foreground hover:text-foreground transition-colors">TERMS</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="t-micro text-muted-foreground hover:text-foreground transition-colors">CONTACT</a>
        </div>
        <div className="mt-6 t-micro text-muted-foreground">CLIOPATRA SOCIAL · v1</div>
      </div>
    </div>
  );
}
