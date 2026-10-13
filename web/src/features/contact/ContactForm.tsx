// From 21st.dev 27904 ln-dev7/centered-contact-form, revamped per D-044 for `/contact` (S13 step 10; D34): the centred
// head (mark, title, one line), one card holding the form, the quiet notes under it. A plain HTML form posting to
// `/api/contact` — no client JavaScript on a site route; the outcome comes back in the address. The name field is
// dropped (Mitoshi asks for no name), a topic is added, the email is optional and says why, and the notes only claim
// what is true. A hidden field catches bots. Tokens, 44 px targets, 16 px inputs.
import { Mail, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { CONTACT as C } from "./copy";

const input = "w-full rounded-lg border border-hairline bg-surface-1 px-3 text-base text-ink placeholder:text-ink-secondary focus-visible:border-accent focus-visible:outline-none";

export function ContactForm({ sent, error }: { sent: boolean; error: string | null }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink"><Mail className="size-5" /></span>
        <h1 className="type-display text-ink">{C.title}</h1>
        <p className="max-w-md type-body text-ink-secondary">{C.lead}</p>
      </div>
      {sent ? <p role="status" className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink">{C.sent}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-4 type-body text-ink">{C.errors[error] ?? C.errors.unreadable}</p> : null}
      <form method="post" action="/api/contact" className="flex flex-col gap-5 rounded-2xl border border-hairline bg-surface-1 p-6 sm:p-8">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 type-body-strong text-ink">{C.topic}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {C.topics.map((t, i) => (
              <label key={t.value} className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-hairline px-3 has-checked:border-accent has-checked:bg-accent/10">
                <input type="radio" name="topic" value={t.value} defaultChecked={i === 0} required className="size-4 accent-[var(--color-accent)]" />
                <span className="type-body text-ink">{t.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="type-body-strong text-ink">{C.message}</span>
          <textarea name="message" rows={6} required maxLength={2000} className={`${input} py-2`} />
          <span className="type-caption text-ink-secondary">{C.messageHint}</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-body-strong text-ink">{C.email}</span>
          <input type="email" name="email" maxLength={200} autoComplete="email" className={`${input} min-h-touch`} />
          <span className="type-caption text-ink-secondary">{C.emailHint}</span>
        </label>
        {/* Off screen and out of the tab order: only a bot fills it. */}
        <div aria-hidden className="sr-only">
          <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        {/* Send sticks above the phone dock while the form is on screen (`.page-action`, R4-13: it sat 230 px under a
            375 × 667 phone's first screen). */}
        <div className="page-action max-md:bg-surface-1 max-md:py-2">
          <button type="submit" className="min-h-touch w-full rounded-lg bg-accent-fill px-4 type-body-strong text-on-accent">{C.send}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 type-caption text-ink-secondary">
          <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden className="size-3" />{C.notes[0]}</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck aria-hidden className="size-3" />{C.notes[1]}</span>
        </div>
      </form>
      <p className="text-center type-caption text-ink-secondary">
        {C.faster.split(C.account)[0]}<Link href="/settings/account" className="underline">{C.account}</Link>{C.faster.split(C.account)[1]}
      </p>
    </section>
  );
}
