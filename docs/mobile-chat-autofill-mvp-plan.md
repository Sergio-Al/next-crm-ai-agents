## Plan: Mobile Chat Memory + Contact Autofill MVP

Deliver a mobile-first MVP that improves contact creation quality and preserves a stable conversational experience using existing APIs, with only minimal backend extensions. Start with contact autofill and duplicate prevention, then add lightweight chat memory hardening for long threads.

### Steps

1. Phase 1 - Baseline and acceptance criteria
Define acceptance criteria for mobile contact creation flow: AI prefill appears, user can edit fields, duplicate warning appears before save, create succeeds, and chat continuation confirms outcome. Also define memory behavior acceptance: ongoing thread keeps context, reopened thread restores context from persisted messages.

2. Phase 2 - Contact autofill quality improvements (mobile)
Enhance autofill handling in the contact modal by normalizing inferred values (email casing, phone formatting, trimmed names) and surfacing confidence-friendly UX copy. Preserve HITL behavior so users always review and confirm before write.

3. Phase 3 - Duplicate detection guardrail (minimal backend + mobile)
Add a preflight duplicate-check endpoint or query mode on contacts API (email exact match, and name+company fuzzy/equality rule). In the mobile contact modal, run dedupe check before POST create and show options: create anyway, cancel, or open existing contact summary.

4. Phase 4 - Chat memory hardening for context window limits
Keep current persisted conversation behavior, but introduce client-side message budgeting before send (retain latest turns + compact summary marker when needed). Add server-side guardrails for oversized requests with clear fallback response instead of abrupt failure.

5. Phase 5 - Conversation continuity and locale correctness
Ensure locale is always forwarded in mobile send/confirm calls so model replies remain language-consistent after long sessions and restores. Validate that conversation restore from drawer sends coherent history on next turn.

6. Phase 6 - QA and rollout
Run targeted manual QA on create-contact and long-thread chat behavior, then perform regression checks on existing deal/session write flows. Roll out behind a small feature flag if desired, then remove flag after confidence.

### Relevant Files

- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-mobile/app/(tabs)/chat.tsx - conversation state lifecycle, send pipeline, locale propagation, and history restore behavior.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-mobile/hooks/useStreamingChat.ts - outbound chat payload shape and streaming request path for message budgeting integration.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-mobile/hooks/useConfirmAction.ts - confirmation payload path; include locale forwarding and follow-up continuity checks.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-mobile/components/forms/CreateContact.tsx - autofill normalization UX, dedupe preflight call, warning/decision UI, and final create submission.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-mobile/types/api.ts - optional types for duplicate-check responses and create decisions.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-agent-2/apps/web/app/api/contacts/route.ts - add minimal duplicate-check support (query or dedicated subroute) used by mobile preflight.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-agent-2/apps/web/app/lib/chat-persistence.ts - reference for persisted message model and sequence ordering used by restore and continuity behavior.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-agent-2/apps/web/app/api/chat/mobile/route.ts - enforce graceful handling for oversized message payloads and preserve current write-tool pending-action behavior.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-agent-2/apps/web/app/api/chat/mobile/confirm/route.ts - continuation consistency after confirm/cancel events.
- /Users/sergio/Documents/WebDevelopment/AiProjects/crm-agent-2/apps/web/app/api/conversations/[id]/route.ts - restore endpoint used by mobile drawer and continuity checks.

### Verification

1. Functional flow test: from mobile chat, request contact creation with partial info, verify modal opens prefilled, edit values, pass dedupe check, create contact, and receive assistant follow-up in same conversation.
2. Duplicate guard test: attempt create with existing email and with same name+company, verify warning UX and both user paths (create anyway/cancel) behave correctly.
3. Continuity test: send 10 to 20 turns, close and reopen conversation from drawer, send another message, verify model retains relevant context from restored history.
4. Context-window resilience test: simulate long conversation payload, verify client trimming strategy runs and server response remains graceful (no crash/blank stream).
5. Locale test: switch device language to ES and EN, verify chat and confirm responses stay in selected locale through normal and restored conversations.
6. Regression test: validate existing pending-action flows still work for deal creation, stage update, and session creation.

### Decisions

- Included scope: mobile app improvements plus minimal backend extension for dedupe and payload guardrails.
- Excluded for this MVP: full products/orders parity UI, dashboard feature parity, and contextual detail-page AI parity.
- Priority: contact autofill plus dedupe first, followed by chat memory hardening.
- Delivery mode: quick MVP in one sprint with focused QA.

### Further Considerations

1. Duplicate policy threshold: strict exact matching now (low risk) versus fuzzy matching with score threshold (higher recall, more false positives).
2. Long-thread strategy: simple sliding window first versus summary compaction pipeline; recommend sliding window for MVP and summary in phase 2.
3. Existing-contact handling UX: inline warning in modal versus branch to existing contact preview card; recommend inline warning first for speed.
