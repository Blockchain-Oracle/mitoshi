// The welcome's words (round 7, after Senryo's onboarding story: one headline and one sentence a scene, then three
// actions). Every line says only what the product does today: test dollars with no cash value, a passkey on this phone.
export const WELCOME = {
  scenes: [
    { key: "call", title: "Call the close.", body: "Up or down on a live price. Minutes, not days." },
    { key: "tap", title: "One tap.", body: "No pop-ups, no gas. Your call is in." },
    { key: "proof", title: "Signed and settled.", body: "RedStone signs the close. Tempo pays it out." },
    { key: "key", title: "Your passkey is your account.", body: "A passkey on this phone. No seed phrase, no password." },
    { key: "dollars", title: "Start with test dollars.", body: "Free, with no cash value. Real markets, real prices." },
  ],
  create: "Create account",
  signIn: "I have an account",
  look: "Look around",
  creating: "Confirm your passkey…",
  signingIn: "Waiting for your passkey…",
  scene: (n: number, of: number) => `Scene ${n} of ${of}`,
  faceId: {
    title: "Open Mitoshi with Face ID?",
    body: "It asks when you come back. Change it in Settings.",
    on: "Turn on",
    later: "Not now",
  },
} as const;

export type SceneKey = (typeof WELCOME.scenes)[number]["key"];
