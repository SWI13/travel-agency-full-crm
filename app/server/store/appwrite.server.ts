import {
  Account,
  AppwriteException,
  Client,
  ID,
  Query,
  TablesDB,
  TablesDBIndexType,
  Users,
} from "node-appwrite";
import { env } from "../env.server";
import { COLLECTIONS, SCHEMA, type Collection, type FieldDef } from "./schema";
import { ConflictError, NotFoundError, type ListOptions, type Store } from "./types";

/**
 * Appwrite driver (TablesDB + Users). The API key lives on the server only; the
 * browser never talks to Appwrite directly, so tables need no client permissions.
 *
 * The schema is provisioned automatically on first use (idempotent).
 */

const PAGE = 500;
const MAX_ROWS = 20_000;

const isCode = (error: unknown, code: number) =>
  error instanceof AppwriteException && error.code === code;

function fieldsOf(collection: Collection): Record<string, FieldDef> {
  return SCHEMA[collection].fields;
}

/**
 * Maps an entity to Appwrite columns. With `fill`, every column is sent (missing
 * ones as null): Appwrite refuses to create a row from an empty data object.
 */
function toRow(collection: Collection, data: Record<string, unknown>, fill = false) {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(fieldsOf(collection))) {
    if (!(key in data)) {
      if (fill) out[key] = def.type === "strings" ? [] : null;
      continue;
    }
    const value = data[key];
    if (def.type === "json") out[key] = value == null ? null : JSON.stringify(value);
    else if (def.type === "strings") out[key] = Array.isArray(value) ? value : [];
    else out[key] = value ?? null;
  }
  return out;
}

/** Appwrite returns "2026-11-14T09:30:15.123+00:00"; the app uses "…Z" so dates compare as strings. */
function isoZ(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value ?? null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function fromRow<T>(collection: Collection, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {
    id: row.$id,
    createdAt: isoZ(row.$createdAt),
    updatedAt: isoZ(row.$updatedAt),
  };
  for (const [key, def] of Object.entries(fieldsOf(collection))) {
    const value = row[key];
    if (def.type === "json") {
      try {
        out[key] = typeof value === "string" && value ? JSON.parse(value) : null;
      } catch {
        out[key] = null;
      }
    } else if (def.type === "strings") out[key] = Array.isArray(value) ? value : [];
    else if (def.type === "bool") out[key] = def.nullable ? (typeof value === "boolean" ? value : null) : value === true;
    else if (def.type === "datetime") out[key] = isoZ(value);
    else out[key] = value ?? null;
  }
  return out as T;
}

export function createAppwriteStore(): Store {
  const { endpoint, projectId, apiKey, databaseId } = env.appwrite;
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const tables = new TablesDB(client);
  const users = new Users(client);

  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= provision().catch((e) => ((ready = null), Promise.reject(e))));

  async function provision() {
    try {
      await tables.get({ databaseId });
    } catch (error) {
      if (!isCode(error, 404)) throw error;
      await tables.create({ databaseId, name: "Umrah & Hajj CRM" });
    }

    const existing = new Set(
      (await tables.listTables({ databaseId, queries: [Query.limit(100)] })).tables.map((t) => t.$id),
    );

    for (const tableId of COLLECTIONS) {
      if (!existing.has(tableId)) {
        // No permissions and no row security: reachable with the server API key only.
        await tables.createTable({ databaseId, tableId, name: tableId, permissions: [], rowSecurity: false });
      }
      const columns = await tables.listColumns({ databaseId, tableId, queries: [Query.limit(100)] });
      const have = new Set(columns.columns.map((c) => (c as { key: string }).key));
      let created = false;
      for (const [key, def] of Object.entries(fieldsOf(tableId))) {
        if (have.has(key)) continue;
        await createColumn(tableId, key, def);
        created = true;
      }
      if (created) await waitForColumns(tableId);

      const indexes = await tables.listIndexes({ databaseId, tableId, queries: [Query.limit(100)] });
      const haveIdx = new Set(indexes.indexes.map((i) => i.key));
      for (const index of SCHEMA[tableId].indexes as Array<{ fields: string[]; unique?: boolean }>) {
        const key = `idx_${index.fields.join("_")}`;
        if (haveIdx.has(key)) continue;
        await tables.createIndex({
          databaseId,
          tableId,
          key,
          type: index.unique ? TablesDBIndexType.Unique : TablesDBIndexType.Key,
          columns: index.fields,
        });
      }
    }
  }

  async function createColumn(tableId: string, key: string, def: FieldDef) {
    const base = { databaseId, tableId, key, required: def.required ?? false };
    switch (def.type) {
      case "string":
        return tables.createVarcharColumn({ ...base, size: def.size ?? 255 });
      case "strings":
        return tables.createVarcharColumn({ ...base, size: 255, required: false, array: true });
      case "text":
      case "json":
        return tables.createTextColumn({ ...base, required: false });
      case "int":
        return tables.createIntegerColumn(base);
      case "float":
        return tables.createFloatColumn(base);
      case "bool":
        return tables.createBooleanColumn(base);
      case "datetime":
        return tables.createDatetimeColumn(base);
    }
  }

  /** Columns are built asynchronously by Appwrite; wait until they are usable. */
  async function waitForColumns(tableId: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { columns } = await tables.listColumns({ databaseId, tableId, queries: [Query.limit(100)] });
      const statuses = columns.map((c) => String((c as { status: unknown }).status));
      if (statuses.some((s) => s === "failed" || s === "stuck")) {
        throw new Error(`Appwrite could not create a column in "${tableId}".`);
      }
      if (statuses.every((s) => s === "available")) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Timed out waiting for Appwrite columns in "${tableId}".`);
  }

  function buildQueries(options: ListOptions): string[] {
    const queries: string[] = [];
    for (const [key, value] of Object.entries(options.where ?? {})) {
      if (value === null) queries.push(Query.isNull(key));
      else queries.push(Query.equal(key, value as string | number | boolean | string[] | number[]));
    }
    const orderBy = options.orderBy === "createdAt" || !options.orderBy ? "$createdAt" : options.orderBy;
    queries.push(options.desc ? Query.orderDesc(orderBy) : Query.orderAsc(orderBy));
    return queries;
  }

  return {
    kind: "appwrite",

    async get<T>(collection: Collection, id: string) {
      await ensure();
      try {
        const row = await tables.getRow({ databaseId, tableId: collection, rowId: id });
        return fromRow<T>(collection, row);
      } catch (error) {
        if (isCode(error, 404)) return null;
        throw error;
      }
    },

    async list<T>(collection: Collection, options: ListOptions = {}) {
      await ensure();
      const base = buildQueries(options);
      const max = options.limit ?? MAX_ROWS;
      const out: T[] = [];
      let cursor: string | null = null;
      while (out.length < max) {
        const queries = [...base, Query.limit(Math.min(PAGE, max - out.length))];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const page = await tables.listRows({ databaseId, tableId: collection, queries, total: false });
        for (const row of page.rows) out.push(fromRow<T>(collection, row));
        if (page.rows.length < PAGE) break;
        cursor = page.rows[page.rows.length - 1].$id;
      }
      return out;
    },

    async create<T>(collection: Collection, data: Record<string, unknown>, id?: string) {
      await ensure();
      try {
        const row = await tables.createRow({
          databaseId,
          tableId: collection,
          rowId: id ?? ID.unique(),
          // API-key callers may set $createdAt; only sample data uses this.
          data: {
            ...toRow(collection, data, true),
            ...(typeof data.createdAt === "string" ? { $createdAt: data.createdAt } : {}),
          },
        });
        return fromRow<T>(collection, row);
      } catch (error) {
        if (isCode(error, 409)) throw new ConflictError();
        throw error;
      }
    },

    async update<T>(collection: Collection, id: string, patch: Record<string, unknown>) {
      await ensure();
      try {
        const row = await tables.updateRow({
          databaseId,
          tableId: collection,
          rowId: id,
          data: toRow(collection, patch),
        });
        return fromRow<T>(collection, row);
      } catch (error) {
        if (isCode(error, 404)) throw new NotFoundError(`${collection}/${id} not found`);
        if (isCode(error, 409)) throw new ConflictError();
        throw error;
      }
    },

    async remove(collection: Collection, id: string) {
      await ensure();
      try {
        await tables.deleteRow({ databaseId, tableId: collection, rowId: id });
      } catch (error) {
        if (!isCode(error, 404)) throw error;
      }
    },

    auth: {
      async createUser(email, password, name) {
        try {
          const user = await users.create({ userId: ID.unique(), email, password, name });
          return user.$id;
        } catch (error) {
          if (isCode(error, 409)) throw new ConflictError("An account with this email already exists");
          throw error;
        }
      },
      async verify(email, password) {
        // Appwrite checks the password; the temporary session is discarded immediately.
        const guest = new Client().setEndpoint(endpoint).setProject(projectId);
        try {
          const session = await new Account(guest).createEmailPasswordSession({ email, password });
          await users.deleteSession({ userId: session.userId, sessionId: session.$id }).catch(() => {});
          return session.userId;
        } catch (error) {
          if (error instanceof AppwriteException && [400, 401, 403, 404].includes(error.code ?? 0)) {
            return null;
          }
          throw error;
        }
      },
      async setPassword(userId, password) {
        await users.updatePassword({ userId, password });
        await users.deleteSessions({ userId }).catch(() => {});
      },
      async setActive(userId, active) {
        await users.updateStatus({ userId, status: active });
      },
      async findUserIdByEmail(email) {
        const found = await users.list({ queries: [Query.equal("email", [email.trim().toLowerCase()]), Query.limit(1)] });
        return found.users[0]?.$id ?? null;
      },
      async removeUser(userId) {
        await users.delete({ userId }).catch((error) => {
          if (!isCode(error, 404)) throw error;
        });
      },
    },

    async health(deep = false) {
      try {
        await ensure();
        if (deep) {
          // Round trip on a throw-away row proves the API key, schema and permissions all work.
          const rowId = "healthcheck";
          await tables.deleteRow({ databaseId, tableId: "webhook_events", rowId }).catch(() => {});
          await tables.createRow({ databaseId, tableId: "webhook_events", rowId, data: { status: "ignored", payload: "{}", isDemo: true } });
          await tables.updateRow({ databaseId, tableId: "webhook_events", rowId, data: { summary: "health check" } });
          const row = await tables.getRow({ databaseId, tableId: "webhook_events", rowId });
          await tables.deleteRow({ databaseId, tableId: "webhook_events", rowId });
          if (row.summary !== "health check") throw new Error("Appwrite read-back did not match the written value");
        }
        return { ok: true, detail: `Appwrite database "${databaseId}"` };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Appwrite error";
        return { ok: false, detail: message };
      }
    },
  };
}
