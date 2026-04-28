#!/usr/bin/env node

process.env.SAVE_COMMIT_DELAY_MS = process.env.SAVE_COMMIT_DELAY_MS || '300';
process.env.TRACE_SAVE_PUBLISH = '1';

const supertest = require('supertest');
const app = require('../app/server');

const iterations = parseInteger(process.env.HARNESS_ITERATIONS, 3);
const publishGapMs = parseInteger(process.env.PUBLISH_GAP_MS, 0);
const failOnRace = process.env.HARNESS_FAIL_ON_RACE === '1';

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event, details = {}) {
  console.log(JSON.stringify({
    harness: true,
    at: new Date().toISOString(),
    event,
    ...details,
  }));
}

async function runIteration(agent, iteration) {
  const initialDraft = `draft A ${iteration}`;
  const latestDraft = `draft B ${iteration}`;

  log('iteration.start', { iteration, initialDraft, latestDraft });
  await agent.post('/reset').expect(200);
  await agent.post('/draft').send({ content: initialDraft }).expect(200);

  const savePromise = agent.post('/draft').send({ content: latestDraft });

  if (publishGapMs > 0) {
    await sleep(publishGapMs);
  }

  const publishPromise = agent.post('/publish');
  const [saveResponse, publishResponse] = await Promise.all([savePromise, publishPromise]);
  const currentResponse = await agent.get('/current').expect(200);
  const publishedResponse = await agent.get('/published').expect(200);
  const stalePublish = publishResponse.body.published !== latestDraft;

  log('iteration.finish', {
    iteration,
    saveResponse: saveResponse.body.saved,
    publishResponse: publishResponse.body.published,
    currentAfterBoth: currentResponse.body.current,
    publishedAfterBoth: publishedResponse.body.published,
    stalePublish,
  });

  return stalePublish;
}

async function main() {
  const agent = supertest(app);
  let stalePublishes = 0;

  log('harness.start', {
    iterations,
    publishGapMs,
    failOnRace,
    saveCommitDelayMs: process.env.SAVE_COMMIT_DELAY_MS,
  });

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    if (await runIteration(agent, iteration)) {
      stalePublishes += 1;
    }
  }

  log('harness.finish', {
    iterations,
    stalePublishes,
    raceConfirmed: stalePublishes > 0,
  });

  if (failOnRace && stalePublishes > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
