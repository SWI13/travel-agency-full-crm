import type { Collection } from "./schema";

export type Scalar = string | number | boolean | null;
export type Where = Record<string, Scalar | Array<string | number>>;

export interface ListOptions {
  where?: Where;
  orderBy?: string;
  desc?: boolean;
  limit?: number;
}

export class ConflictError extends Error {
  constructor(message = "Record already exists") {
    super(message);
    this.name = "ConflictError";
  }
}
export class NotFoundError extends Error {
  constructor(message = "Record not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface AuthProvider {
  /** Creates a login and returns its user id. Throws ConflictError when the email exists. */
  createUser(email: string, password: string, name: string): Promise<string>;
  /** Returns the user id when the credentials are valid, otherwise null. */
  verify(email: string, password: string): Promise<string | null>;
  setPassword(userId: string, password: string): Promise<void>;
  setActive(userId: string, active: boolean): Promise<void>;
  removeUser(userId: string): Promise<void>;
  /** Id of an existing login with this email, or null. */
  findUserIdByEmail(email: string): Promise<string | null>;
}

/**
 * Storage contract used by the whole server. Three implementations exist:
 * Appwrite, Redis (serverless hosting such as Vercel) and a file-backed local
 * store (demo / development).
 */
export type StoreKind = "appwrite" | "redis" | "local";

export interface Store {
  kind: StoreKind;
  get<T>(collection: Collection, id: string): Promise<T | null>;
  list<T>(collection: Collection, options?: ListOptions): Promise<T[]>;
  /**
   * Creating with an explicit id is atomic: a second writer gets ConflictError.
   * `data.createdAt` may backdate a record (used for sample data only).
   */
  create<T>(collection: Collection, data: Record<string, unknown>, id?: string): Promise<T>;
  update<T>(collection: Collection, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(collection: Collection, id: string): Promise<void>;
  auth: AuthProvider;
  /** `deep` also runs a write / read / update / delete round trip. */
  health(deep?: boolean): Promise<{ ok: boolean; detail: string }>;
}
