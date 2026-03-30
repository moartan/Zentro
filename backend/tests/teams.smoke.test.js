import assert from 'node:assert/strict';
import test from 'node:test';

import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { supabaseService } from '../src/config/supabase.js';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const LEADER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const OUTSIDER_ID = '55555555-5555-4555-8555-555555555555';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesFilters(row, filters) {
  return filters.every((filter) => {
    if (filter.type === 'eq') return row[filter.column] === filter.value;
    if (filter.type === 'in') return filter.values.includes(row[filter.column]);
    return true;
  });
}

function enrichTeamsRow(row, db) {
  const teamMembers = db.team_members
    .filter((item) => item.team_id === row.id)
    .map((item) => ({
      user_id: item.user_id,
      role: item.role,
      profiles: db.profiles.find((p) => p.id === item.user_id)
        ? {
            id: item.user_id,
            full_name: db.profiles.find((p) => p.id === item.user_id).full_name,
            email: db.profiles.find((p) => p.id === item.user_id).email,
          }
        : null,
    }));

  const comments = db.team_comments
    .filter((item) => item.team_id === row.id)
    .map((item) => ({
      id: item.id,
      author_user_id: item.author_user_id,
      body: item.body,
      created_at: item.created_at,
      profiles: db.profiles.find((p) => p.id === item.author_user_id)
        ? {
            id: item.author_user_id,
            full_name: db.profiles.find((p) => p.id === item.author_user_id).full_name,
          }
        : null,
    }));

  return {
    ...row,
    team_members: teamMembers,
    team_comments: comments,
  };
}

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this._operation = 'select';
    this._payload = null;
    this._count = null;
    this._head = false;
    this._range = null;
    this._order = null;
    this._single = null;
    this._idCounter = db.__idCounter;
  }

  select(_columns, options = {}) {
    this._operation = this._operation === 'insert' || this._operation === 'update' ? this._operation : 'select';
    this._count = options.count ?? null;
    this._head = Boolean(options.head);
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, values });
    return this;
  }

  or(_expr) {
    return this;
  }

  order(column, options = {}) {
    this._order = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(value) {
    this._range = { from: 0, to: Math.max(0, value - 1) };
    return this;
  }

  range(from, to) {
    this._range = { from, to };
    return this;
  }

  insert(payload) {
    this._operation = 'insert';
    this._payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload) {
    this._operation = 'update';
    this._payload = payload;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  maybeSingle() {
    this._single = 'maybe';
    return this._execute();
  }

  single() {
    this._single = 'single';
    return this._execute();
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  async _execute() {
    const tableRows = this.db[this.table];
    if (!Array.isArray(tableRows)) {
      return { data: null, error: { code: 'TABLE_NOT_FOUND', message: `Unknown table ${this.table}` } };
    }

    if (this._operation === 'insert') {
      const now = new Date().toISOString();
      const inserted = this._payload.map((row) => {
        const next = {
          ...row,
          id: row.id ?? `00000000-0000-4000-8000-${String(this.db.__idCounter++).padStart(12, '0')}`,
        };

        if (this.table === 'teams') {
          next.created_at = next.created_at ?? now;
          next.updated_at = next.updated_at ?? now;
        }
        if (this.table === 'team_comments') {
          next.created_at = next.created_at ?? now;
        }

        return next;
      });
      this.db[this.table].push(...inserted);
      return this._finalize(inserted);
    }

    if (this._operation === 'update') {
      const updated = [];
      for (const row of this.db[this.table]) {
        if (!matchesFilters(row, this.filters)) continue;
        Object.assign(row, this._payload);
        updated.push(clone(row));
      }
      return this._finalize(updated);
    }

    if (this._operation === 'delete') {
      const keep = [];
      const removed = [];
      for (const row of this.db[this.table]) {
        if (matchesFilters(row, this.filters)) removed.push(clone(row));
        else keep.push(row);
      }
      this.db[this.table] = keep;
      return this._finalize(removed);
    }

    let rows = this.db[this.table].filter((row) => matchesFilters(row, this.filters)).map((row) => clone(row));

    if (this.table === 'teams') {
      rows = rows.map((row) => enrichTeamsRow(row, this.db));
    }

    if (this._order) {
      const { column, ascending } = this._order;
      rows.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return ascending ? `${av}`.localeCompare(`${bv}`) : `${bv}`.localeCompare(`${av}`);
      });
    }

    const total = rows.length;

    if (this._range) {
      rows = rows.slice(this._range.from, this._range.to + 1);
    }

    if (this._head) {
      return { data: null, error: null, count: this._count ? total : null };
    }

    return this._finalize(rows, total);
  }

  _finalize(rows, total = rows.length) {
    if (this._single === 'single') {
      if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      return { data: rows[0], error: null };
    }
    if (this._single === 'maybe') {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null, count: this._count ? total : null };
  }
}

function createDb({ plan = 'pro', teams = [] } = {}) {
  return {
    __idCounter: 1,
    profiles: [
      { id: OWNER_ID, full_name: 'Owner User', email: 'owner@test.com', is_platform_super_admin: false },
      { id: LEADER_ID, full_name: 'Leader User', email: 'leader@test.com', is_platform_super_admin: false },
      { id: MEMBER_ID, full_name: 'Member User', email: 'member@test.com', is_platform_super_admin: false },
      { id: OUTSIDER_ID, full_name: 'Outsider User', email: 'outsider@test.com', is_platform_super_admin: false },
    ],
    businesses: [
      {
        id: BUSINESS_ID,
        owner_user_id: OWNER_ID,
        subscription_plan: plan,
      },
    ],
    business_members: [
      { business_id: BUSINESS_ID, user_id: OWNER_ID, role: 'business_owner', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
      { business_id: BUSINESS_ID, user_id: LEADER_ID, role: 'employee', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
      { business_id: BUSINESS_ID, user_id: MEMBER_ID, role: 'employee', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
      { business_id: BUSINESS_ID, user_id: OUTSIDER_ID, role: 'employee', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
    ],
    teams: teams.map((item) => ({ ...item })),
    team_members: [],
    team_comments: [],
  };
}

async function withServer(run) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestJson(baseUrl, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-business-id': BUSINESS_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  return { status: response.status, payload };
}

const originalFrom = supabaseService.from.bind(supabaseService);
const originalDevUserId = env.DEV_USER_ID;
const originalDevBusinessId = env.DEV_BUSINESS_ID;

test.afterEach(() => {
  supabaseService.from = originalFrom;
  env.DEV_USER_ID = originalDevUserId;
  env.DEV_BUSINESS_ID = originalDevBusinessId;
});

test('owner can create team', async () => {
  const db = createDb({ plan: 'pro' });
  supabaseService.from = (table) => new FakeQuery(db, table);
  env.DEV_USER_ID = OWNER_ID;
  env.DEV_BUSINESS_ID = BUSINESS_ID;

  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, '/api/teams', {
      method: 'POST',
      body: {
        name: 'Platform Team',
        description: 'Core platform owners',
        status: 'active',
        leaderUserId: LEADER_ID,
        memberUserIds: [LEADER_ID, MEMBER_ID],
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.team.name, 'Platform Team');
    assert.equal(result.payload.team.leaderUserId, LEADER_ID);
  });
});

test('free plan blocks creating more than 2 teams', async () => {
  const db = createDb({
    plan: 'free',
    teams: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        business_id: BUSINESS_ID,
        name: 'Team One',
        description: '',
        status: 'active',
        created_by_user_id: OWNER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        business_id: BUSINESS_ID,
        name: 'Team Two',
        description: '',
        status: 'active',
        created_by_user_id: OWNER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  supabaseService.from = (table) => new FakeQuery(db, table);
  env.DEV_USER_ID = OWNER_ID;
  env.DEV_BUSINESS_ID = BUSINESS_ID;

  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, '/api/teams', {
      method: 'POST',
      body: {
        name: 'Team Three',
        description: 'Should fail on free tier',
        status: 'active',
        leaderUserId: LEADER_ID,
        memberUserIds: [LEADER_ID, MEMBER_ID],
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.payload.error?.code, 'TEAM_LIMIT_REACHED');
  });
});

test('leader can change team status', async () => {
  const db = createDb({
    plan: 'pro',
    teams: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        business_id: BUSINESS_ID,
        name: 'Ops Team',
        description: '',
        status: 'active',
        created_by_user_id: OWNER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  db.team_members = [
    { id: 'tm1', team_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: LEADER_ID, role: 'lead' },
    { id: 'tm2', team_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: MEMBER_ID, role: 'member' },
  ];

  supabaseService.from = (table) => new FakeQuery(db, table);
  env.DEV_USER_ID = LEADER_ID;
  env.DEV_BUSINESS_ID = BUSINESS_ID;

  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, '/api/teams/cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
      method: 'PATCH',
      body: { status: 'completed' },
    });

    assert.equal(result.status, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.team.status, 'completed');
  });
});

test('owner can change team leader', async () => {
  const db = createDb({
    plan: 'pro',
    teams: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        business_id: BUSINESS_ID,
        name: 'Delivery Team',
        description: '',
        status: 'active',
        created_by_user_id: OWNER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  db.team_members = [
    { id: 'tm5', team_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', user_id: LEADER_ID, role: 'lead' },
    { id: 'tm6', team_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', user_id: MEMBER_ID, role: 'member' },
    { id: 'tm7', team_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', user_id: OWNER_ID, role: 'member' },
  ];

  supabaseService.from = (table) => new FakeQuery(db, table);
  env.DEV_USER_ID = OWNER_ID;
  env.DEV_BUSINESS_ID = BUSINESS_ID;

  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, '/api/teams/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', {
      method: 'PATCH',
      body: {
        leaderUserId: MEMBER_ID,
        memberUserIds: [LEADER_ID, MEMBER_ID, OWNER_ID],
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.team.leaderUserId, MEMBER_ID);
    const leadMember = result.payload.team.members.find((member) => member.userId === MEMBER_ID);
    const oldLeader = result.payload.team.members.find((member) => member.userId === LEADER_ID);
    assert.equal(leadMember?.role, 'lead');
    assert.equal(oldLeader?.role, 'member');
  });
});

test('non-member cannot comment on a team', async () => {
  const db = createDb({
    plan: 'pro',
    teams: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        business_id: BUSINESS_ID,
        name: 'Product Team',
        description: '',
        status: 'active',
        created_by_user_id: OWNER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  db.team_members = [
    { id: 'tm3', team_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: LEADER_ID, role: 'lead' },
    { id: 'tm4', team_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: MEMBER_ID, role: 'member' },
  ];

  supabaseService.from = (table) => new FakeQuery(db, table);
  env.DEV_USER_ID = OUTSIDER_ID;
  env.DEV_BUSINESS_ID = BUSINESS_ID;

  await withServer(async (baseUrl) => {
    const result = await requestJson(baseUrl, '/api/teams/dddddddd-dddd-4ddd-8ddd-dddddddddddd/comments', {
      method: 'POST',
      body: { body: 'I should not be allowed here.' },
    });

    assert.equal(result.status, 403);
    assert.equal(result.payload.error?.code, 'FORBIDDEN');
  });
});
