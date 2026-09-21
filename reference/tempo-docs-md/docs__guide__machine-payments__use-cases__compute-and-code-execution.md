# Pay for compute and code execution

Let your agents run code in sandboxed environments, deploy containers, and access GPU compute — pay per use with stablecoins on Tempo. No cloud accounts, no billing dashboards, no credit cards.

## The compute payment problem

Cloud compute requires account creation, billing setup, and credential management before running a single line of code. For agents that need to execute code snippets, deploy temporary services, or run GPU workloads, the overhead of provisioning cloud accounts is disproportionate to the task. Sandbox environments like CodeSandbox or Replit target human developers, not programmatic access.

## How MPP enables paid code execution

With MPP, your agent pays per execution or per compute-minute with stablecoins on Tempo. Submit code, pay, get results — all in one HTTP request. No accounts, no API keys, no cloud provider onboarding.

**Tempo Charge** works well for discrete tasks like running a code snippet. For longer-running workloads or metered compute, **Tempo Sessions** let the agent pay incrementally as resources are consumed.

## Compute services you can pay for

| Provider | Capabilities | Service URL |
|---|---|---|
| Modal | Serverless GPU compute, AI/ML workloads | `modal.mpp.tempo.xyz` |
| [Judge0](https://judge0.mpp.paywithlocus.com) | Code execution in 60+ languages, sandboxed | `judge0.mpp.paywithlocus.com` |
| [Build With Locus](https://mpp.buildwithlocus.com) | Containers, Postgres, Redis, custom domains | `mpp.buildwithlocus.com` |

## Try Judge0 with Tempo payments

```bash
# Install Tempo CLI + wallet
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login

# Execute Python code via Judge0
tempo request judge0.mpp.paywithlocus.com/submissions \
  -d '{"source_code": "print(42)", "language_id": 71}'
```

## Prompt your agent to buy code execution

```
Use judge0.mpp.paywithlocus.com to run Python code via Tempo.
Pay per execution with stablecoins — no account needed.
```

## Next steps for compute payments

* [Accept pay-as-you-go payments](https://tempo.xyz/developers/docs/guide/machine-payments/pay-as-you-go) — Build session-based billing for metered compute
* [Server quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/server) — Add payment gating to your own compute API
* [Browse all services](https://mpp.dev/services) — 85+ MPP-enabled services in the directory
