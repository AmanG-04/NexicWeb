const campaigns = new Set([
  'Story + side content (80+ hours, Nexic planning estimate)',
  'Pick up my story across return visits',
  'Still deciding'
]);

const slots = new Set([
  'Matinee Sessions (11 AM – 4 PM)',
  'Peak Evenings (4 PM – 9 PM)',
  'Night Grind Passes (10 PM – 5 AM)'
]);

const arrivals = new Set(['Launch Week Day 1', 'First Month of Release']);

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...headers, ...extraHeaders } });
}

function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value.trim())) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (pathname !== '/api/leads') {
      if (pathname.startsWith('/api/')) {
        return json({ error: 'Not found.' }, 404);
      }
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
    }

    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Send JSON to register.' }, 415);
    }

    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json({ error: 'Cross-site submissions are not allowed.' }, 403);
    }
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return json({ error: 'Cross-site submissions are not allowed.' }, 403);
    }

    if (Number(request.headers.get('Content-Length')) > 4096) {
      return json({ error: 'Submission is too large.' }, 413);
    }

    let payload;
    try {
      const raw = await request.text();
      if (raw.length > 4096) {
        return json({ error: 'Submission is too large.' }, 413);
      }
      payload = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'Invalid registration.' }, 400);
    }

    // Quietly reject bot submissions; real visitors never see or fill this field.
    if (payload.website) {
      return json({ error: 'Invalid registration.' }, 400);
    }

    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : '';
    const phone = normalizePhone(payload.phone);
    const campaign = payload.campaign;
    const slot = payload.slot;
    const arrival = payload.arrival;

    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) ||
      !phone || !campaigns.has(campaign) || !slots.has(slot) || !arrivals.has(arrival)) {
      return json({ error: 'Check your name, WhatsApp number and session choices.' }, 400);
    }

    if (!env.DB) {
      return json({ error: 'Registration is unavailable right now. Please try again later.' }, 503);
    }

    try {
      // Only the database decides whether one of the first 50 slots is available.
      // A four-digit code may collide, so try another instead of overwriting a pass.
      for (let attempt = 0; attempt < 5; attempt++) {
        const randomNumber = crypto.getRandomValues(new Uint16Array(1))[0];
        const passId = `NEXIC-PASS-${1000 + (randomNumber % 9000)}`;

        try {
          const row = await env.DB.prepare(`
            INSERT INTO leads (pass_id, name, phone, campaign, slot, arrival, discount_eligible)
            VALUES (?, ?, ?, ?, ?, ?,
              CASE WHEN (SELECT COUNT(*) FROM leads WHERE discount_eligible = 1) < 50 THEN 1 ELSE 0 END)
            RETURNING pass_id, name, campaign, slot, discount_eligible
          `).bind(passId, name, phone, campaign, slot, arrival).first();

          return json({
            passId: row.pass_id,
            name: row.name,
            campaign: row.campaign,
            slot: row.slot,
            discountEligible: row.discount_eligible === 1
          }, 201);
        } catch (error) {
          if (error instanceof Error && error.message.includes('leads.phone')) {
            return json({ error: 'This WhatsApp number is already on the list.' }, 409);
          }
          if (error instanceof Error && error.message.includes('leads.pass_id')) {
            continue;
          }
          throw error;
        }
      }
      throw new Error('Could not allocate a unique pass ID');
    } catch (error) {
      console.error('Unable to save lead:', error);
      return json({ error: 'Could not save your pass. Please try again later.' }, 503);
    }
  }
};
