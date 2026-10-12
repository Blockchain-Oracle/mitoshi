// `/contact` (S13 step 10; D34, App Review 1.2): the words.
export const CONTACT = {
  title: "Reach us",
  lead: "A problem, a person, a post, your data, or a question. A person reads it.",
  topic: "What is it about?",
  topics: [
    { value: "problem", label: "Something isn't working" },
    { value: "report", label: "A person or a post" },
    { value: "privacy", label: "My data" },
    { value: "question", label: "A question" },
  ],
  message: "Your message",
  messageHint: "Up to 2,000 characters. Include a link to the post or page if there is one.",
  email: "Email for a reply (optional)",
  emailHint: "Only if you want an answer. It's used for this and nothing else.",
  send: "Send",
  notes: ["Read by the Mitoshi team", "Never shared or sold"],
  faster: "Faster: Report on any post or profile goes straight to moderation, and Settings → Account downloads or deletes your data yourself.",
  account: "Settings → Account",
  sent: "Sent. Thank you — if you left an email, the reply goes there.",
  errors: {
    unreadable: "That message couldn't be read. Try again.",
    topic: "Pick what it's about.",
    empty: "Write a message first.",
    email: "That email doesn't look right. Leave it empty if you don't want a reply.",
    wait: "You've sent a few already. Give it a minute and try again.",
    down: "Messages can't be saved right now. Try again shortly.",
  } as Record<string, string>,
} as const;
