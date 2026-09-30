# Integrations

Every integration is `CONNECTED`, `DISCONNECTED`, `ERROR`, or `MOCK`. Mock is labelled in the UI and in tool results. A missing credential does not crash Atlas.

| Integration | Access in this version | Notes |
| --- | --- | --- |
| Home Assistant | Mock now, live adapter next | Blink and Vivint are discovered through Home Assistant. Atlas never stores their passwords. |
| Google | Mock now | Calendar will be read/write. Gmail stays read-only. Refresh tokens will be encrypted with `ATLAS_ENCRYPTION_KEY`. |
| Vercel | Mock now | Read-only. No deploys or env changes. |
| Stripe | Mock now | Restricted key only. Refunds, payouts, and charges are rejected by the client guard. |
| AI Gateway | Live when `AI_GATEWAY_API_KEY` is set | Model ids come from `ATLAS_AI_FAST_MODEL` and `ATLAS_AI_REASONING_MODEL`. |
| Audio | Mock conversations | Browser transcription is not enabled yet. The mic stays off. |
| MQTT | Optional | Not required. Broker stays on localhost. |
| Health / Finance | Disconnected | No provider is configured. Atlas does not invent readings. |

The Integrations page can force Mock, return to Auto, or Disconnect each card.
