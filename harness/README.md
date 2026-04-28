# Race Harness

Run the save/publish race harness with:

```bash
npm run harness:race
```

The harness enables structured server tracing with `TRACE_SAVE_PUBLISH=1`, saves an initial draft, starts a second save without awaiting it, then immediately publishes. A stale publish is confirmed when the trace shows `publish.start` reading the old `currentDraft` before `draft.commit.finish` writes the new draft.

Useful knobs:

```bash
HARNESS_ITERATIONS=10 npm run harness:race
SAVE_COMMIT_DELAY_MS=500 npm run harness:race
PUBLISH_GAP_MS=250 npm run harness:race
HARNESS_FAIL_ON_RACE=1 npm run harness:race
```
