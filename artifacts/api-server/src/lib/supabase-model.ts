import { getSupabaseAdmin } from "./supabase.js";

const supabaseAdmin = getSupabaseAdmin();

function normalize(row: any) {
  if (!row) return row;
  return { ...row, _id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, lastSeen: row.last_seen };
}

function chain(run: () => Promise<any>) {
  const state = { limit: undefined as number | undefined, order: undefined as string | undefined };
  const api: any = {
    sort(value: any) { state.order = typeof value === "string" ? value : Object.keys(value ?? {})[0]; return api; },
    limit(value: number) { state.limit = value; return api; },
    lean: async () => (await run()).map(normalize),
    exec: async () => (await run()).map(normalize),
    then: (resolve: any, reject?: any) => run().then((rows) => resolve(rows.map(normalize)), reject),
  };
  return api;
}

export function createSupabaseModel(table: string, idField = "id") {
  return class SupabaseModel {
    [key: string]: any;
    constructor(values: any = {}) { Object.assign(this, values); }
    static find(filter: any = {}) { return chain(async () => { let q: any = supabaseAdmin.from(table).select("*"); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { data, error } = await q; if (error) throw error; return data ?? []; }); }
    static findOne(filter: any = {}) { return chain(async () => { let q: any = supabaseAdmin.from(table).select("*").limit(1); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { data, error } = await q.maybeSingle(); if (error) throw error; return data ? [data] : []; }); }
    static async findById(id: any) { const { data, error } = await supabaseAdmin.from(table).select("*").eq(idField, id).maybeSingle(); if (error) throw error; return normalize(data); }
    static async countDocuments(filter: any = {}) { let q: any = supabaseAdmin.from(table).select("*", { count: "exact", head: true }); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { count, error } = await q; if (error) throw error; return count ?? 0; }
    static async create(values: any) { const { data, error } = await supabaseAdmin.from(table).insert(values).select().single(); if (error) throw error; return new this(normalize(data)); }
    static async findByIdAndUpdate(id: any, values: any, options: any = {}) { const patch = values.$set ?? values; const { data, error } = await supabaseAdmin.from(table).update(patch).eq(idField, id).select().maybeSingle(); if (error) throw error; return options.new ? normalize(data) : normalize(data); }
    static async findOneAndUpdate(filter: any, values: any, options: any = {}) { let q: any = supabaseAdmin.from(table).update(values.$set ?? values).select().limit(1); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { data, error } = await q.maybeSingle(); if (error) throw error; return normalize(data); }
    static async findByIdAndDelete(id: any) { const { data, error } = await supabaseAdmin.from(table).delete().eq(idField, id).select().maybeSingle(); if (error) throw error; return normalize(data); }
    static async deleteMany(filter: any = {}) { let q: any = supabaseAdmin.from(table).delete(); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { error } = await q; if (error) throw error; return { acknowledged: true }; }
    static async updateMany(filter: any, values: any) { let q: any = supabaseAdmin.from(table).update(values.$set ?? values); for (const [key, value] of Object.entries(filter)) q = q.eq(key, value); const { error } = await q; if (error) throw error; return { acknowledged: true }; }
    async save() { const values = { ...this }; delete values._id; const id = values[idField]; const { data, error } = id ? await (supabaseAdmin.from(table) as any).upsert(values).select().single() : await (supabaseAdmin.from(table) as any).insert(values).select().single(); if (error) throw error; Object.assign(this, normalize(data)); return this; }
  };
}
