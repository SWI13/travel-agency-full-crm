import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { evalScript, KEY_PREFIX, redis } from "../redis.server";
import { COLLECTIONS, SCHEMA, type Collection } from "./schema";
import { ConflictError, NotFoundError, type ListOptions, type Store } from "./types";

/**
 * Redis driver — made for serverless hosting (Vercel), where several short-lived
 * server instances run at once and nothing can be written to disk.
 *
 * Layout (all keys start with KEY_PREFIX, "crm:" by default):
 *   t:<collection>              HASH  id → JSON row
 *   u:<collection>:<field>      HASH  value → id        (unique fields)
 *   x:<collection>:<field>:<v>  SET   ids               (fast lookups, e.g. messages by lead)
 *   z:<collection>:createdAt    ZSET  id by creation    (latest activity entries)
 *   cred / cred:email           HASH  logins
 *
 * Every write is one Lua script, so it is atomic across instances: an id or a
 * unique value can never be taken twice, and an update is only applied when the
 * row has not changed since it was read (otherwise it is re-read and retried).
 */

type Row = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };

const k = (...parts: string[]) => KEY_PREFIX + parts.join(":");
const tableKey = (c: Collection) => k("t", c);
const uniqueKey = (c: Collection, field: string) => k("u", c, field);
const indexKey = (c: Collection, field: string, value: string) => k("x", c, field, value);
const recentKey = (c: Collection) => k("z", c, "createdAt");

/** Equality lookups served from an index set instead of reading the whole table. */
const INDEXED: Partial<Record<Collection, string[]>> = {
  messages: ["leadId"],
  followups: ["leadId"],
  activity: ["leadId"],
};
/** Tables that grow without limit: also kept in creation order for "latest N". */
const RECENT: Collection[] = ["activity", "messages", "webhook_events"];

function uniqueFields(c: Collection): string[] {
  return (SCHEMA[c].indexes as Array<{ fields: string[]; unique?: boolean }>)
    .filter((i) => i.unique && i.fields.length === 1)
    .map((i) => i.fields[0]);
}
const present = (v: unknown) => v !== null && v !== undefined && v !== "";
const asKey = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/**
 * One generic write script.
 * KEYS[1] = table. ARGV[1] = id, ARGV[2] = expected current JSON ("" = must not exist,
 * "*" = must exist, anything else = must be identical), ARGV[3] = new JSON ("" = delete),
 * ARGV[4] = number of operations, then 3 ARGV per operation: kind, key, value.
 *   check-unique key value → the value must be free or already ours
 *   hset key value / hdel key value → unique map (value → id)
 *   sadd key / srem key → index set membership of id
 *   zadd key score / zrem key → recency set
 */
const WRITE = `
local id = ARGV[1]
local expected = ARGV[2]
local nextRow = ARGV[3]
local current = redis.call('HGET', KEYS[1], id)
if expected == '' then
  if current then return 'conflict' end
elseif expected == '*' then
  if not current then return 'missing' end
else
  if not current then return 'missing' end
  if current ~= expected then return 'stale' end
end
local n = tonumber(ARGV[4])
for i = 0, n - 1 do
  local kind, key, value = ARGV[5 + i * 3], ARGV[6 + i * 3], ARGV[7 + i * 3]
  if kind == 'check-unique' then
    local owner = redis.call('HGET', key, value)
    if owner and owner ~= id then return 'conflict' end
  end
end
for i = 0, n - 1 do
  local kind, key, value = ARGV[5 + i * 3], ARGV[6 + i * 3], ARGV[7 + i * 3]
  if kind == 'hset' then redis.call('HSET', key, value, id)
  elseif kind == 'hdel' then
    if redis.call('HGET', key, value) == id then redis.call('HDEL', key, value) end
  elseif kind == 'sadd' then redis.call('SADD', key, id)
  elseif kind == 'srem' then redis.call('SREM', key, id)
  elseif kind == 'zadd' then redis.call('ZADD', key, tonumber(value), id)
  elseif kind == 'zrem' then redis.call('ZREM', key, id)
  end
end
if nextRow == '' then redis.call('HDEL', KEYS[1], id) else redis.call('HSET', KEYS[1], id, nextRow) end
return 'ok'
`;

type Op = [kind: string, key: string, value: string];

/** Index operations to go from `before` to `after` (either may be null). */
function indexOps(c: Collection, before: Row | null, after: Row | null): Op[] {
  const ops: Op[] = [];
  for (const field of uniqueFields(c)) {
    const was = before?.[field];
    const now = after?.[field];
    if (present(now)) ops.push(["check-unique", uniqueKey(c, field), asKey(now)]);
    if (present(was) && (!after || asKey(was) !== asKey(now))) ops.push(["hdel", uniqueKey(c, field), asKey(was)]);
    if (present(now)) ops.push(["hset", uniqueKey(c, field), asKey(now)]);
  }
  for (const field of INDEXED[c] ?? []) {
    const was = before?.[field];
    const now = after?.[field];
    if (present(was) && (!after || asKey(was) !== asKey(now))) ops.push(["srem", indexKey(c, field, asKey(was)), ""]);
    if (present(now)) ops.push(["sadd", indexKey(c, field, asKey(now)), ""]);
  }
  if (RECENT.includes(c)) {
    if (after) ops.push(["zadd", recentKey(c), String(Date.parse(after.createdAt) || Date.now())]);
    else ops.push(["zrem", recentKey(c), ""]);
  }
  return ops;
}

async function write(c: Collection, id: string, expected: string, next: Row | null, ops: Op[]): Promise<string> {
  const args = [id, expected, next ? JSON.stringify(next) : "", String(ops.length), ...ops.flat()];
  return String(await evalScript(WRITE, [tableKey(c)], args));
}

function matches(row: Row, where: ListOptions["where"]): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    const actual = row[key] ?? null;
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as string | number)) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

function sortRows(rows: Row[], options: ListOptions): Row[] {
  const key = options.orderBy ?? "createdAt";
  rows.sort((a, b) => {
    const av = (a[key] ?? "") as string | number;
    const bv = (b[key] ?? "") as string | number;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  if (options.desc) rows.reverse();
  return options.limit ? rows.slice(0, options.limit) : rows;
}

const parse = (json: string | null | undefined): Row | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as Row;
  } catch {
    return null;
  }
};

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
export const newId = () => randomBytes(10).toString("hex");

interface Credential {
  email: string;
  salt: string;
  hash: string;
  active: boolean;
}
const CRED = k("cred");
const CRED_EMAIL = k("cred", "email");

export function createRedisStore(): Store {
  async function getRow(c: Collection, id: string): Promise<{ json: string; row: Row } | null> {
    const json = await (await redis()).hGet(tableKey(c), id);
    const row = parse(json);
    return json && row ? { json, row } : null;
  }

  async function rowsByIds(c: Collection, ids: string[]): Promise<Row[]> {
    if (!ids.length) return [];
    const client = await redis();
    const out: Row[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = await client.hmGet(tableKey(c), ids.slice(i, i + 500));
      for (const json of chunk) {
        const row = parse(json);
        if (row) out.push(row);
      }
    }
    return out;
  }

  return {
    kind: "redis",

    async get<T>(collection: Collection, id: string) {
      return ((await getRow(collection, id))?.row ?? null) as T | null;
    },

    async list<T>(collection: Collection, options: ListOptions = {}) {
      const client = await redis();
      const where = options.where ?? {};
      const indexed = (INDEXED[collection] ?? []).find((f) => typeof where[f] === "string");
      let rows: Row[];
      if (indexed) {
        const ids = await client.sMembers(indexKey(collection, indexed, String(where[indexed])));
        rows = await rowsByIds(collection, ids);
      } else if (
        RECENT.includes(collection) &&
        options.limit &&
        (options.orderBy ?? "createdAt") === "createdAt" &&
        Object.keys(where).length === 0
      ) {
        const ids = await client.zRange(recentKey(collection), 0, options.limit - 1, options.desc ? { REV: true } : undefined);
        rows = await rowsByIds(collection, ids);
      } else {
        rows = Object.values(await client.hGetAll(tableKey(collection)))
          .map((json) => parse(json))
          .filter((r): r is Row => r !== null);
      }
      return sortRows(rows.filter((r) => matches(r, where)), options) as T[];
    },

    async create<T>(collection: Collection, data: Record<string, unknown>, id?: string) {
      const rowId = id ?? newId();
      const now = new Date().toISOString();
      const createdAt = typeof data.createdAt === "string" ? data.createdAt : now;
      const row: Row = { ...structuredClone(data), id: rowId, createdAt, updatedAt: now };
      const result = await write(collection, rowId, "", row, indexOps(collection, null, row));
      if (result !== "ok") throw new ConflictError(`${collection}/${rowId} already exists or a unique value is taken`);
      return row as T;
    },

    async update<T>(collection: Collection, id: string, patch: Record<string, unknown>) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await getRow(collection, id);
        if (!current) throw new NotFoundError(`${collection}/${id} not found`);
        const next: Row = {
          ...current.row,
          ...structuredClone(patch),
          id,
          createdAt: current.row.createdAt,
          updatedAt: new Date().toISOString(),
        };
        const result = await write(collection, id, current.json, next, indexOps(collection, current.row, next));
        if (result === "ok") return next as T;
        if (result === "conflict") throw new ConflictError(`${collection}: a unique value is already taken`);
        if (result === "missing") throw new NotFoundError(`${collection}/${id} not found`);
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (attempt + 1))); // stale: re-read
      }
      throw new Error(`Could not update ${collection}/${id}: too many concurrent changes`);
    },

    async remove(collection: Collection, id: string) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await getRow(collection, id);
        if (!current) return;
        const result = await write(collection, id, current.json, null, indexOps(collection, current.row, null));
        if (result === "ok" || result === "missing") return;
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
      }
      throw new Error(`Could not delete ${collection}/${id}`);
    },

    auth: {
      async createUser(email, password) {
        const client = await redis();
        const normalized = email.trim().toLowerCase();
        const id = newId();
        const salt = randomBytes(16).toString("hex");
        const cred: Credential = { email: normalized, salt, hash: hashPassword(password, salt), active: true };
        const claimed = await client.hSetNX(CRED_EMAIL, normalized, id);
        if (!claimed) throw new ConflictError("An account with this email already exists");
        await client.hSet(CRED, id, JSON.stringify(cred));
        return id;
      },
      async verify(email, password) {
        const client = await redis();
        const normalized = email.trim().toLowerCase();
        const id = await client.hGet(CRED_EMAIL, normalized);
        const cred = id ? (JSON.parse((await client.hGet(CRED, id)) ?? "null") as Credential | null) : null;
        // Hash even when the account is unknown so timing does not reveal which emails exist.
        const computed = Buffer.from(hashPassword(password, cred?.salt ?? "0".repeat(32)), "hex");
        if (!id || !cred || !cred.active) return null;
        const stored = Buffer.from(cred.hash, "hex");
        return stored.length === computed.length && timingSafeEqual(stored, computed) ? id : null;
      },
      async setPassword(userId, password) {
        const client = await redis();
        const cred = JSON.parse((await client.hGet(CRED, userId)) ?? "null") as Credential | null;
        if (!cred) throw new NotFoundError("Account not found");
        cred.salt = randomBytes(16).toString("hex");
        cred.hash = hashPassword(password, cred.salt);
        await client.hSet(CRED, userId, JSON.stringify(cred));
      },
      async setActive(userId, active) {
        const client = await redis();
        const cred = JSON.parse((await client.hGet(CRED, userId)) ?? "null") as Credential | null;
        if (!cred) throw new NotFoundError("Account not found");
        cred.active = active;
        await client.hSet(CRED, userId, JSON.stringify(cred));
      },
      async findUserIdByEmail(email) {
        return (await (await redis()).hGet(CRED_EMAIL, email.trim().toLowerCase())) ?? null;
      },
      async removeUser(userId) {
        const client = await redis();
        const cred = JSON.parse((await client.hGet(CRED, userId)) ?? "null") as Credential | null;
        if (cred && (await client.hGet(CRED_EMAIL, cred.email)) === userId) await client.hDel(CRED_EMAIL, cred.email);
        await client.hDel(CRED, userId);
      },
    },

    async health(deep = false) {
      try {
        const client = await redis();
        await client.ping();
        if (deep) {
          const key = k("health", newId());
          await client.set(key, "1", { expiration: { type: "PX", value: 10_000 } });
          const ok = (await client.get(key)) === "1";
          await client.del(key);
          if (!ok) return { ok: false, detail: "Redis write/read check failed" };
        }
        const tables = await Promise.all(COLLECTIONS.map((c) => client.hLen(tableKey(c))));
        return { ok: true, detail: `Redis — ${tables.reduce((a, b) => a + b, 0)} records` };
      } catch (error) {
        return { ok: false, detail: `Redis unreachable: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
}
