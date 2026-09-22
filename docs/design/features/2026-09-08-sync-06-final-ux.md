# SYNC-06: Final Sync UX

Status: design contract defined; standard settings archetype, no separate visual approval required.

## Contract

- Classification: existing settings feature and compact shell component; existing Goal/Walk attachment feedback.
- User goal: understand protected delivery, connect devices, recover a version or inspect a backup safely.
- Source of state: existing SyncApplication, coordinator, IndexedDB outbox/attachment queue/history/snapshot metadata. UI consumes application projections; commands own mutations.
- Section: More → Synchronization. Graphite panels, existing gold primary action; no new navigation section.
- Atmosphere: existing restrained settings surfaces; no illustration or permanent glow.
- Visual center: current sync state, last success, Sync now. Secondary sections: Devices, Protection, Attachments, Backups, Recovery.
- Reuse: SectionPageHeader, AppIcon, settings-panel, primary/secondary buttons, section-status, existing forms/lists.
- Mobile: one column, wrap long names, 44px touch targets, reachable inline confirmation, bounded QR width, visible focus; reduced motion.
- States: local/unconfigured, loading, syncing, pending, offline neutral, success only after verified delivery, attention amber for recoverable history, error red for failed verification/operation, empty lists and retry.
- Approved reference: NO new mockup required. Existing settings design and LifeOS_DESIGN_RULES_v1.md are the reference; review actual desktop and Galaxy A23.
- Test scope: status projections/subscriptions, UI interactions, attachment feedback, recovery confirmation, full final gate, native master scenario and privacy evidence.

## Boundaries

Keep current protocols, keys, identities, migrations and user records. No full restore on real profiles. Test records use SYNC06_TEST prefix. UI never renders raw auth identifiers, transport errors, key envelopes or permanent secrets except an explicit recovery export view. Screenshots must mask temporary QR and recovery material.
