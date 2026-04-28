// Save-and-Publish Draft Editor
//
// This app has a known race condition between /draft and /publish.
// See README.md for the bug description and what you're being asked to do.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------
// `currentDraft` is the most recent saved draft.
// `publishedDraft` is what /publish has marked as live.
//
// In a real app these would live in a database. For this assignment, in-memory
// is fine — the bug is in the timing, not the storage.
let currentDraft = '';
let publishedDraft = '';
let saveQueue = Promise.resolve();

// SAVE_COMMIT_DELAY_MS controls how long a /draft request takes to commit.
// In production this would represent database write latency, network latency,
// or any other delay between "request received" and "value updated."
//
// Set to 200ms by default to make the race condition reliably reproducible.
// Tests may override this via environment variable.
const SAVE_COMMIT_DELAY_MS = parseInt(process.env.SAVE_COMMIT_DELAY_MS || '200', 10);
const TRACE_SAVE_PUBLISH = process.env.TRACE_SAVE_PUBLISH === '1';
let traceSequence = 0;

function trace(event, details = {}) {
  if (!TRACE_SAVE_PUBLISH) {
    return;
  }

  traceSequence += 1;
  console.error(JSON.stringify({
    seq: traceSequence,
    at: new Date().toISOString(),
    event,
    currentDraft,
    publishedDraft,
    ...details,
  }));
}

function commitDraft(content) {
  return new Promise((resolve) => {
    // Simulate write latency.
    setTimeout(() => {
      trace('draft.commit.start', { content });
      currentDraft = content;
      trace('draft.commit.finish', { content });
      resolve(content);
    }, SAVE_COMMIT_DELAY_MS);
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /draft — save the current draft text.
//
// Note the artificial delay: the draft is not committed to currentDraft
// until SAVE_COMMIT_DELAY_MS milliseconds after the request arrives.
app.post('/draft', async (req, res, next) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }

  trace('draft.accepted', { content, delayMs: SAVE_COMMIT_DELAY_MS });

  const saveOperation = saveQueue.then(() => commitDraft(content));
  saveQueue = saveOperation.catch(() => {});

  try {
    await saveOperation;
    res.json({ ok: true, saved: content });
  } catch (error) {
    next(error);
  }
});

// POST /publish — mark the most recent saved draft as live.
//
// Capture the saves that were already in flight when publish arrived, then
// wait for them before reading currentDraft.
app.post('/publish', async (req, res, next) => {
  const savesBeforePublish = saveQueue;
  trace('publish.start');

  try {
    await savesBeforePublish;
    publishedDraft = currentDraft;
    trace('publish.finish', { published: publishedDraft });
    res.json({ ok: true, published: publishedDraft });
  } catch (error) {
    next(error);
  }
});

// GET /published — return the currently published draft.
app.get('/published', (req, res) => {
  res.json({ published: publishedDraft });
});

// GET /current — return the currently saved (committed) draft.
app.get('/current', (req, res) => {
  res.json({ current: currentDraft });
});

// Reset endpoint for tests.
app.post('/reset', (req, res) => {
  trace('reset.start');
  currentDraft = '';
  publishedDraft = '';
  trace('reset.finish');
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Draft editor running on http://localhost:${PORT}`);
    console.log(`SAVE_COMMIT_DELAY_MS = ${SAVE_COMMIT_DELAY_MS}`);
  });
}

module.exports = app;
