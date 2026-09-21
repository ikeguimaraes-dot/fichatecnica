import { createClient } from "@supabase/supabase-js";
export const DB_URL = "https://iqgrvptrtphvbmvrqntm.supabase.co";
export const PUBLIC_KEY = "sb_publishable_ZeUC_rH70nELk4No1GnTNg_XBtc_GlD";
export function database(env = process.env) {
  if (!env.EVEREST_SUPABASE_SERVICE_KEY) throw Error("database_configuration");
  return createClient(
    env.SUPABASE_URL || DB_URL,
    env.EVEREST_SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function checked(query) {
  const { data, error } = await query;
  if (error) throw Error("database_operation");
  return data;
}
export async function allRows(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const data = await checked(makeQuery().range(offset, offset + 499));
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function upsertChunks(db, table, rows) {
  for (let i = 0; i < rows.length; i += 50)
    await checked(db.from(table).upsert(rows.slice(i, i + 50)));
}
export async function authorized(req, env = process.env, fetchImpl = fetch) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !/^Bearer [A-Za-z0-9._-]+$/.test(header))
    return {
      status: 401,
      error: "Entre na sua conta para consultar as fichas.",
    };
  const allowed = (env.EVEREST_ALLOWED_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (req.method !== "GET" && !allowed.length)
    return {
      status: 503,
      error: "O acesso à integração ainda não foi configurado.",
    };
  const response = await fetchImpl(
    `${env.SUPABASE_URL || DB_URL}/auth/v1/user`,
    {
      headers: {
        Authorization: header,
        apikey: env.SUPABASE_PUBLISHABLE_KEY || PUBLIC_KEY,
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    },
  );
  if (!response.ok)
    return {
      status: response.status >= 500 ? 503 : 401,
      error: "Não foi possível validar a sessão. Entre novamente.",
    };
  const user = await response.json();
  if (
    !user.id ||
    user.is_anonymous ||
    (req.method !== "GET" && !allowed.includes(user.id))
  )
    return {
      status: 403,
      error: "Sua conta não tem acesso às fichas do Everest.",
    };
  return { user };
}
