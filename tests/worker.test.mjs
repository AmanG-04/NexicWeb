import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';

const defaultInput = {
  name: '  Test  Player ',
  phone: '+91 98765 43210',
  campaign: 'Story + side content (80+ hours, Nexic planning estimate)',
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
  assert.match(html, /@keyframes digit-flip/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /fetch\('\/api\/leads'/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.nexic\.me\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.nexic\.me\/">/);
  const business = JSON.parse(jsonLd[0][1]);
  assert.equal(business.url, 'https://www.nexic.me/');
  assert.equal(business.event.datePublished, '2026-11-19');
  assert.equal(business.event.gamePlatform.length, 2);
  assert.doesNotMatch(html, /battle lounge|55-inch|55''|50-hour story|4K 60FPS/i);
  assert.match(html, /80\+ hours/);
  assert.match(html, /PIN-protected saves are planned for return visits/);
  assert.match(html, /4K GAMING/);
  assert.match(html, /Delhi's\s*<span class="neon-text">GTA VI<\/span> Lounge/);
  assert.doesNotMatch(html, /fa-gamepad text-lg text-vice/);
  assert.match(html, /NEXIC <span class="text-white\/55">LOUNGE<\/span>/);
});

it('publishes crawl directives and a single canonical sitemap URL', () => {
  const robots = fs.readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
  const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
  assert.match(robots, /Sitemap: https:\/\/www\.nexic\.me\/sitemap\.xml/);
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 1);
  assert.match(sitemap, /<loc>https:\/\/www\.nexic\.me\/<\/loc>/);
});

it('uses the two supplied pistol cursors throughout the page', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /html,\s*html \*,\s*\*::before,\s*\*::after\s*\{\s*cursor: url\('cursors\/nexic-grey-pistol\.png'\) 12 1, url\('cursors\/nexic-grey-pistol\.cur'\) 12 1, default !important;/);
  assert.match(html, /:is\(a, button, select, input, label, \[role="button"\]\)/);
  assert.match(html, /cursor: url\('cursors\/nexic-pink-pointer\.png'\) 14 5, url\('cursors\/nexic-pink-pointer\.cur'\) 14 5, pointer !important;/);
  for (const file of ['nexic-grey-pistol.cur', 'nexic-pink-pointer.cur']) {
    const bytes = fs.readFileSync(new URL(`../public/cursors/${file}`, import.meta.url));
    assert.equal(bytes.readUInt16LE(2), 2, `${file} should be a Windows cursor resource`);
    assert.ok(bytes.length > 1000, `${file} should contain cursor image data`);
  }
  for (const file of ['nexic-grey-pistol.png', 'nexic-pink-pointer.png']) {
    const bytes = fs.readFileSync(new URL(`../public/cursors/${file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 51);
    assert.equal(bytes.readUInt32BE(20), 51);
  }
  assert.match(html, /sweezy-cursors\.com/);
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

function submit(db, payload = defaultInput, { origin = 'https://www.nexic.me', method = 'POST' } = {}) {
  const request = new Request('https://www.nexic.me/api/leads', {
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
    const request = new Request('https://www.nexic.me/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultInput)
    });
    const response = await worker.fetch(request, {});
    assert.equal(response.status, 503);
  });
});
