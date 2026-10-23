import { supabase } from "./supabase";
export async function request<T>(
  params: URLSearchParams,
  signal: AbortSignal,
  body?: { unitId: number | null },
  endpoint = "/api/everest",
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre na sua conta para consultar o Everest.");
  const response = await fetch(`${endpoint}?${params}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "A consulta não está disponível neste ambiente. Tente novamente no site publicado.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "Não foi possível consultar as fichas.");
  return data;
}
