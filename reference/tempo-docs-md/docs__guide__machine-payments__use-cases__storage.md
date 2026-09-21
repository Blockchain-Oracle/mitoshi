# Pay for object storage and Git repos

Let your agents store files, upload objects, and create Git repositories — pay per operation with stablecoins on Tempo. No AWS accounts, no access keys, no billing dashboards.

## The storage payment problem

Cloud storage requires account creation, IAM configuration, and billing setup before an agent can store a single byte. Even "simple" object storage like S3 requires access keys, bucket policies, and region selection. For agents that need temporary or task-specific storage, the overhead of cloud account provisioning is disproportionate to the need.

## How MPP enables paid object storage

With MPP, your agent pays per upload or per repo creation using stablecoins. The storage service publishes its pricing via the `402` Challenge, the agent pays, and the operation completes. No cloud credentials, no IAM roles.

## Storage services you can pay for

| Provider | Capabilities | Service URL |
|---|---|---|
| Object Storage | S3/R2-compatible storage, dynamic per-size pricing | `storage.mpp.tempo.xyz` |
| Code Storage | Paid Git repo creation, authenticated clone URLs | `codestorage.mpp.tempo.xyz` |

## Try object storage with Tempo payments

```bash
# Install Tempo CLI + wallet
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login

# Upload a file to object storage
tempo request storage.mpp.tempo.xyz/upload \
  -F "file=@document.pdf"
```

## Prompt your agent to buy storage

```
Use storage.mpp.tempo.xyz to upload files via Tempo.
Pay per upload with stablecoins — no cloud account needed.
```

## Next steps for storage payments

* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Build a payment-gated storage service
* [Server quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/server) — Add payment gating to your own storage API
* [Browse all services](https://mpp.dev/services) — 85+ MPP-enabled services in the directory
