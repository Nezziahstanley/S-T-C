import { authDatabasePool } from "./auth.js";

// A small PostgreSQL query adapter for the existing STC API while routes are
// migrated from Supabase's fluent query interface to native SQL.
const TABLES = new Set([
  "stc_audit_logs","stc_awards","stc_brand_signatures","stc_certificates",
  "stc_enquiries","stc_invoices","stc_media","stc_messages","stc_notifications",
  "stc_payment_settings","stc_payments","stc_portfolio","stc_posts","stc_profiles",
  "stc_projects","stc_quotes","stc_services","stc_staff_roles","stc_tickets",
  "stc_training_enrollments"
]);

function ident(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid SQL identifier.");
  return '"' + value + '"';
}
function columns(value) {
  if (!value || value.trim() === "*") return "*";
  return value.split(",").map(part => {
    const name = part.trim();
    if (name === "*") return "*";
    return ident(name);
  }).join(", ");
}
function pgError(error) {
  return { message: error?.message || "Database query failed.", code: error?.code };
}

class Query {
  constructor(table) {
    if (!TABLES.has(table)) throw new Error("Table is not allowed: " + table);
    this.table = ident(table);
    this.action = "select";
    this.projection = "*";
    this.values = [];
    this.filters = [];
    this.sorts = [];
    this.maxRows = null;
    this.payload = null;
    this.conflict = null;
    this.ignoreDuplicates = false;
    this.countMode = null;
    this.headOnly = false;
  }
  select(value = "*", options = {}) {
    this.projection = columns(value);
    this.countMode = options.count || null;
    this.headOnly = Boolean(options.head);
    return this;
  }
  where(column, operator, value) {
    const col = ident(column);
    if (operator === "in") {
      if (!Array.isArray(value) || value.length === 0) { this.filters.push("FALSE"); return this; }
      const slots = value.map(v => { this.values.push(v); return "$" + this.values.length; });
      this.filters.push(col + " IN (" + slots.join(",") + ")");
      return this;
    }
    this.values.push(value);
    this.filters.push(col + " " + operator + " $" + this.values.length);
    return this;
  }
  eq(c,v){ return this.where(c,"=",v); }
  neq(c,v){ return this.where(c,"<>",v); }
  gt(c,v){ return this.where(c,">",v); }
  gte(c,v){ return this.where(c,">=",v); }
  lt(c,v){ return this.where(c,"<",v); }
  lte(c,v){ return this.where(c,"<=",v); }
  in(c,v){ return this.where(c,"in",v); }
  is(c,v){
    if (v === null) { this.filters.push(ident(c) + " IS NULL"); return this; }
    if (v === true || v === false) { this.filters.push(ident(c) + " IS " + (v ? "TRUE" : "FALSE")); return this; }
    return this.eq(c,v);
  }
  order(column, options = {}) {
    this.sorts.push(ident(column) + (options.ascending === false ? " DESC" : " ASC"));
    return this;
  }
  limit(value) { this.maxRows = Math.max(0, Math.min(1000, Number(value) || 0)); return this; }
  insert(value) { this.action = "insert"; this.payload = value; return this; }
  update(value) { this.action = "update"; this.payload = value; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(value, options = {}) {
    this.action = "upsert"; this.payload = value;
    this.conflict = options.onConflict || null;
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates);
    return this;
  }
  async maybeSingle() { const result = await this.execute(); return { data: result.data?.[0] ?? null, error: result.error }; }
  async single() {
    const result = await this.execute();
    if (result.error) return result;
    if (!result.data || result.data.length !== 1) return { data: null, error: { message: "Expected exactly one row." } };
    return { data: result.data[0], error: null };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    const params = [...this.values];
    if ((this.action === "update" || this.action === "delete") && this.filters.length === 0) {
      return { data: null, error: { message: "Refusing an UPDATE or DELETE without a filter." } };
    }
    const where = this.filters.length ? " WHERE " + this.filters.join(" AND ") : "";
    const returning = " RETURNING " + this.projection;
    let sql;
    try {
      if (this.action === "select" && this.countMode) {
        sql = "SELECT COUNT(*)::int AS count FROM " + this.table + where;
      } else if (this.action === "select") {
        sql = "SELECT " + this.projection + " FROM " + this.table + where +
          (this.sorts.length ? " ORDER BY " + this.sorts.join(", ") : "") +
          (this.maxRows !== null ? " LIMIT " + this.maxRows : "");
      } else if (this.action === "insert" || this.action === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (!rows.length || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
          throw new Error("Insert payload must contain row objects.");
        }
        const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
        if (!keys.length) throw new Error("Insert payload is empty.");
        const names = keys.map(ident).join(", ");
        const tuples = rows.map(row => "(" + keys.map(key => {
          params.push(row[key] === undefined ? null : row[key]);
          return "$" + params.length;
        }).join(", ") + ")");
        sql = "INSERT INTO " + this.table + " (" + names + ") VALUES " + tuples.join(", ");
        if (this.action === "upsert" && this.conflict) {
          const conflictKeys = this.conflict.split(",").map(x => x.trim());
          if (!conflictKeys.length || conflictKeys.some(x => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x))) throw new Error("Invalid upsert conflict columns.");
          const conflict = conflictKeys.map(ident).join(", ");
          const updates = keys.filter(k => !conflictKeys.includes(k));
          sql += this.ignoreDuplicates ? " ON CONFLICT (" + conflict + ") DO NOTHING" :
            updates.length ? " ON CONFLICT (" + conflict + ") DO UPDATE SET " +
              updates.map(k => ident(k) + " = EXCLUDED." + ident(k)).join(", ") : " ON CONFLICT (" + conflict + ") DO NOTHING";
        }
        sql += returning;
      } else if (this.action === "update") {
        const entries = Object.entries(this.payload || {});
        if (!entries.length) throw new Error("Update payload is empty.");
        const sets = entries.map(([key,value]) => {
          params.push(value);
          return ident(key) + " = $" + params.length;
        });
        sql = "UPDATE " + this.table + " SET " + sets.join(", ") + where + returning;
      } else {
        sql = "DELETE FROM " + this.table + where + returning;
      }
      const result = await authDatabasePool.query(sql, params);
      if (this.action === "select" && this.countMode) {
        return { data: this.headOnly ? null : result.rows, error: null, count: result.rows[0]?.count ?? 0 };
      }
      return { data: result.rows, error: null, count: result.rowCount };
    } catch (error) {
      return { data: null, error: pgError(error) };
    }
  }
}

export const db = { from: table => new Query(table) };
