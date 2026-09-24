import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';

const defaultInput = {
  name: '  Test  Player ',
  phone: '+91 98765 43210',
  campaign: 'Main Story Campaign (15–30 Hours)',
  slot: 'Peak Evenings (4 PM – 9 PM)',
  arrival: 'Launch Week Day 1',
  website: ''
};

it('parses the landing page scripts and keeps FAQ schema aligned with visible answers', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const blocks = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
  const jsonLd = blocks.filter(([tag]) => tag.startsWith('<script type="application/ld+json">'));
  assert.equal(jsonLd.length, 2);
  const faq = JSON.parse(jsonLd[1][1]);
  for (const entry of faq.mainEntity) {
    assert.ok(html.includes(entry.name));
    assert.ok(html.includes(entry.acceptedAnswer.text));
  }
  for (const [tag, body] of blocks) {
    if (!tag.includes('application/ld+json')) {
      new vm.Script(body);
    }
  }
  assert.match(html, /2026-11-19T00:00:00\+05:30/);
  assert.match(html, /fetch\('\/api\/leads'/);
});

function createDatabase() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      assert.match(sql, /INSERT INTO leads/);
      return {
        bind(passId, name, phone, campaign, slot, arrival) {
          return {
            async first() {
              if (rows.some((row) => row.phone === phone)) {
                throw new Error('UNIQUE constraint failed: leads.phone');
              }
              if (rows.some((row) => row.pass_id === passId)) {
                throw new Error('UNIQUE constraint failed: leads.pass_id');
              }
              const row = {
                pass_id: passId,
                name,
                phone,
                campaign,
                slot,
                arrival,
                discount_eligible: rows.length < 50 ? 1 : 0
              };
              rows.push(row);
              return row;
            }
          };
        }
      };
    }
  };
}

function submit(db, payload = defaultInput, { origin = 'https://nexiclounge.me', method = 'POST' } = {}) {
  const request = new Request('https://nexiclounge.me/api/leads', {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });
  return worker.fetch(request, { DB: db });
}

describe('D1 launch-interest endpoint', () => {
  it('stores a validated lead, generates a four-digit pass, and awards the first 50 only', async () => {
    const db = createDatabase();
    for (let index = 0; index < 51; index++) {
      const response = await submit(db, {
        ...defaultInput,
        phone: `+91 ${String(9000000000 + index)}`
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.match(body.passId, /^NEXIC-PASS-\d{4}$/);
      assert.equal(body.discountEligible, index < 50);
    }
    assert.equal(db.rows.length, 51);
    assert.equal(db.rows[0].name, 'Test Player');
    assert.equal(db.rows[0].phone, '919000000000');
  });

  it('rejects duplicate phone numbers without adding a lead', async () => {
    const db = createDatabase();
    await submit(db);
    const response = await submit(db);
    assert.equal(response.status, 409);
    assert.equal(db.rows.length, 1);
  });

  it('rejects malformed, cross-site and bot submissions', async () => {
    const db = createDatabase();
    assert.equal((await submit(db, { ...defaultInput, phone: 'abc' })).status, 400);
    assert.equal((await submit(db, { ...defaultInput, website: 'spam' })).status, 400);
    assert.equal((await submit(db, defaultInput, { origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await submit(db, defaultInput, { method: 'GET' })).status, 405);
    assert.equal(db.rows.length, 0);
  });

  it('does not claim a pass if the database binding is missing', async () => {
    const request = new Request('https://nexiclounge.me/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultInput)
    });
    const response = await worker.fetch(request, {});
    assert.equal(response.status, 503);
  });
});
