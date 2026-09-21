# Pay for translation and language services

Let your agents translate text across 30+ languages, transcribe audio, generate speech, and analyze sentiment — pay per request with stablecoins on Tempo.

## The translation payment problem

Language APIs require separate developer accounts for each provider, with usage tied to monthly subscription tiers. An agent that needs to translate a document, transcribe a call, and generate a voiceover must manage three sets of credentials and billing cycles. Most providers don't offer true pay-per-use pricing.

## How MPP enables paid translation services

With MPP, your agent pays per translation, per transcription, or per TTS request using stablecoins. One Tempo wallet works across all language service providers. The agent pays only for what it uses — no monthly commitments, no unused credits.

## Translation services you can pay for

| Provider | Capabilities | Service URL |
|---|---|---|
| [DeepL](https://deepl.mpp.paywithlocus.com) | 30+ languages, professional quality translation | `deepl.mpp.paywithlocus.com` |
| [Deepgram](https://deepgram.mpp.paywithlocus.com) | Nova-3 transcription, Aura-2 TTS, sentiment | `deepgram.mpp.paywithlocus.com` |
| OpenAI | Whisper transcription, TTS | `openai.mpp.tempo.xyz` |

## Try DeepL with Tempo payments

```bash
# Install Tempo CLI + wallet
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login

# Translate text via DeepL
tempo request deepl.mpp.paywithlocus.com/v2/translate \
  -d '{"text": ["Hello, world!"], "target_lang": "DE"}'
```

## Prompt your agent to buy translation

```
Use deepl.mpp.paywithlocus.com to translate text via Tempo.
Pay per request with stablecoins — no API key needed.
```

## Next steps for translation payments

* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Build a payment-gated translation API
* [Agent quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/agent) — Set up your agent to discover and pay for services
* [Browse all services](https://mpp.dev/services) — 85+ MPP-enabled services in the directory
