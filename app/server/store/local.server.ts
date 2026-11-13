import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { DATA_DIR } from "../env.server";
import { COLLECTIONS, SCHEMA, type Collection } from "./schema";
import { ConflictError, NotFoundError, type ListOptions, type Store } from "./types";

/**
 * File-backed store for demo and development. Zero configuration: data lives in
 * `.data/db.json`. Single-process only — use the Appwrite driver in production.
 */

type Row = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };
interface Credential {
  email: string;
  salt: string;
  hash: string;
  active: boolean;
}
interface Db {
  tables: Record<string, Record<string, Row>>;
  credentials: Record<string, Credential>;
}

const FILE = path.join(DATA_DIR, "db.json");

function load(): Db {
  const db: Db = { tables: {}, credentials: {} };
  if (existsSync(FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Db>;
      db.tables = parsed.tables ?? {};
      db.credentials = parsed.credentials ?? {};
    } catch (error) {
      // Keep the unreadable file for inspection instead of silently overwriting it.
      renameSync(FILE, `${FILE}.corrupt-${Date.now()}`);
      console.error("[local-store] db.json was unreadable and has been set aside.", error);
    }
  }
  for (const c of COLLECTIONS) db.tables[c] ??= {};
  return db;
}

let saveTimer: NodeJS.Timeout | null = null;
function persist(db: Db) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(db));
    renameSync(tmp, FILE); // atomic replace
  }, 150);
}

const hashPassword = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString("hex");

export const newId = () => randomBytes(10).toString("hex");

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

function assertUnique(db: Db, collection: Collection, candidate: Row) {
  for (const index of SCHEMA[collection].indexes as Array<{ fields: string[]; unique?: boolean }>) {
    if (!index.unique) continue;
    const values = index.fields.map((f) => candidate[f] ?? null);
    if (values.some((v) => v === null || v === "")) continue;
    for (const row of Object.values(db.tables[collection])) {
      if (row.id !== candidate.id && index.fields.every((f, i) => row[f] === values[i])) {
        throw new ConflictError(`${collection}.${index.fields.join("+")} must be unique`);
      }
    }
  }
}

export function createLocalStore(): Store {
  const db = load();
  const clone = <T>(row: Row): T => structuredClone(row) as T;

  return {
    kind: "local",

    async get<T>(collection: Collection, id: string) {
      const row = db.tables[collection][id];
      return row ? clone<T>(row) : null;
    },

    async list<T>(collection: Collection, options: ListOptions = {}) {
      let rows = Object.values(db.tables[collection]).filter((r) => matches(r, options.where));
      const key = options.orderBy ?? "createdAt";
      rows.sort((a, b) => {
        const av = (a[key] ?? "") as string | number;
        const bv = (b[key] ?? "") as string | number;
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
      if (options.desc) rows.reverse();
      if (options.limit) rows = rows.slice(0, options.limit);
      return rows.map((r) => clone<T>(r));
    },

    async create<T>(collection: Collection, data: Record<string, unknown>, id?: string) {
      const rowId = id ?? newId();
      if (db.tables[collection][rowId]) throw new ConflictError();
      const now = new Date().toISOString();
      const createdAt = typeof data.createdAt === "string" ? data.createdAt : now;
      const row: Row = { ...structuredClone(data), id: rowId, createdAt, updatedAt: now };
      assertUnique(db, collection, row);
      db.tables[collection][rowId] = row;
      persist(db);
      return clone<T>(row);
    },

    async update<T>(collection: Collection, id: string, patch: Record<string, unknown>) {
      const current = db.tables[collection][id];
      if (!current) throw new NotFoundError(`${collection}/${id} not found`);
      const next: Row = {
        ...current,
        ...structuredClone(patch),
        id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      assertUnique(db, collection, next);
      db.tables[collection][id] = next;
      persist(db);
      return clone<T>(next);
    },

    async remove(collection: Collection, id: string) {
      delete db.tables[collection][id];
      persist(db);
    },

    auth: {
      async createUser(email, password) {
        const normalized = email.trim().toLowerCase();
        if (Object.values(db.credentials).some((c) => c.email === normalized)) {
          throw new ConflictError("An account with this email already exists");
        }
        const id = newId();
        const salt = randomBytes(16).toString("hex");
        db.credentials[id] = { email: normalized, salt, hash: hashPassword(password, salt), active: true };
        persist(db);
        return id;
      },
      async verify(email, password) {
        const normalized = email.trim().toLowerCase();
        const entry = Object.entries(db.credentials).find(([, c]) => c.email === normalized);
        // Hash even when the account is unknown so timing does not reveal which emails exist.
        const salt = entry?.[1].salt ?? "0".repeat(32);
        const computed = Buffer.from(hashPassword(password, salt), "hex");
        if (!entry || !entry[1].active) return null;
        const stored = Buffer.from(entry[1].hash, "hex");
        return stored.length === computed.length && timingSafeEqual(stored, computed) ? entry[0] : null;
      },
      async setPassword(userId, password) {
        const cred = db.credentials[userId];
        if (!cred) throw new NotFoundError("Account not found");
        cred.salt = randomBytes(16).toString("hex");
        cred.hash = hashPassword(password, cred.salt);
        persist(db);
      },
      async setActive(userId, active) {
        const cred = db.credentials[userId];
        if (!cred) throw new NotFoundError("Account not found");
        cred.active = active;
        persist(db);
      },
      async findUserIdByEmail(email) {
        const normalized = email.trim().toLowerCase();
        return Object.entries(db.credentials).find(([, c]) => c.email === normalized)?.[0] ?? null;
      },
      async removeUser(userId) {
        delete db.credentials[userId];
        persist(db);
      },
    },

    async health() {
      return { ok: true, detail: "Local demo datastore (.data/db.json)" };
    },
  };
}
