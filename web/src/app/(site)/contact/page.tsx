// `/contact` (S13 step 10; D34, App Review 1.2): the published contact — a plain form, its outcome in the address.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/features/contact/ContactForm";

export const metadata: Metadata = { title: "Contact", description: "Report a problem, a person or a post, ask about your data, or ask a question." };

type Search = Promise<{ sent?: string; error?: string }>;

async function Outcome({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  return <ContactForm sent={q.sent === "1"} error={typeof q.error === "string" ? q.error.slice(0, 20) : null} />;
}

export default function ContactPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<ContactForm sent={false} error={null} />}>
      <Outcome searchParams={searchParams} />
    </Suspense>
  );
}
