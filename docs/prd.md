# Product scope

Topicwake is a small, read-only Zenoh inspector for local operators and developers on Apple Silicon Macs.

## Included

- Local account creation and sign-in
- Topics observed by the local Zenoh subscriber
- Topic-name search, sorting, and full-row selection
- Latest payload, receipt state, estimated rate, and preview limits
- Display pause without stopping collection
- Host network information and a manual connectivity check
- Native app packaging and tag-based GitHub Releases

## Not included

- A guaranteed catalog of every key on a subnet
- Publisher-to-IP or peer-to-device attribution
- Message history, dashboards, charts, or alerting rules
- Topic publishing, robot commands, or endpoint editing
- Multi-user roles, remote hosting, Intel builds, or automatic updates

## Expected experience

Operators can find a key and inspect its latest data without scrolling past the list. Activity stays visible in the list, selection stays clear, and stale data is not mistaken for a confirmed connection failure. The app preserves accounts across normal restarts and keeps collection separate from display updates.

Implementation details live in [architecture](architecture.md), visual decisions in [UI guidelines](design-system.md), and release checks in [verification](acceptance.md).
