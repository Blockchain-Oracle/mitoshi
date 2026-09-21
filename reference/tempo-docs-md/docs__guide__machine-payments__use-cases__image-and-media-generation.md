# Pay for image, video, and audio generation

Let your agents generate images, videos, audio, and speech — pay per generation with stablecoins on Tempo. Access 600+ models through fal.ai, or use OpenAI, Gemini, and Deepgram directly.

## The media generation payment problem

Media generation APIs require separate accounts and API keys per provider. Costs vary wildly by model and resolution, making budgeting unpredictable. Agents that need to generate a product image, a voiceover, and a video clip in a single workflow must juggle three sets of credentials and billing systems.

## How MPP enables paid media generation

With MPP, your agent pays per generation using stablecoins on Tempo. The price is declared upfront in the `402` Challenge — the agent knows exactly what it will pay before generating anything. One wallet, one balance, any provider.

**Tempo Charge** is ideal for media generation: each request is a discrete unit with a known cost. The agent signs a TIP-20 transfer, the provider verifies it in ~500ms, and returns the generated media.

## Media generation services you can pay for

| Provider | Capabilities | Service URL |
|---|---|---|
| fal.ai | 600+ models: Flux, SD, Recraft, Grok | `fal.mpp.tempo.xyz` |
| OpenAI | DALL·E image generation, Whisper audio | `openai.mpp.tempo.xyz` |
| Google Gemini | Veo video, Nano Banana image gen | `gemini.mpp.tempo.xyz` |
| [Deepgram](https://deepgram.mpp.paywithlocus.com) | Nova-3 transcription, Aura-2 TTS | `deepgram.mpp.paywithlocus.com` |
| [Mathpix](https://mathpix.mpp.paywithlocus.com) | OCR for math, science docs, LaTeX | `mathpix.mpp.paywithlocus.com` |

## Try fal.ai with Tempo payments

```bash
# Install Tempo CLI + wallet
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login

# Generate an image via fal.ai
tempo request fal.mpp.tempo.xyz/fal-ai/flux/dev \
  -d '{"prompt": "a futuristic city skyline at sunset"}'
```

## Prompt your agent to buy media generation

```
Use fal.mpp.tempo.xyz to generate images via Tempo.
Pay per image with stablecoins — no API key needed.
```

## Next steps for media generation payments

* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Build a payment-gated media generation API
* [Agent quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/agent) — Set up your agent to discover and pay for services
* [Browse all services](https://mpp.dev/services) — 85+ MPP-enabled services in the directory
