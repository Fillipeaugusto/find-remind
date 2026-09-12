export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
};

export function buildQuery(query?: Query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function parseError(response: Response) {
  let message = response.statusText || "Erro inesperado";
  let code: string | undefined;
  try {
    const data = (await response.json()) as { message?: string; code?: string; error?: string };
    message = data.message ?? data.error ?? message;
    code = data.code;
  } catch {
    // corpo vazio ou não-JSON
  }
  return new ApiError(response.status, message, code);
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal } = options;
  const response = await fetch(`${API_URL}${path}${buildQuery(query)}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const error = await parseError(response);
    if (error.status === 401 && typeof window !== "undefined") {
      // Sessão expirada: recarrega a app inteira na tela de login para limpar qualquer estado.
      const login = new URL("/login", window.location.origin);
      login.searchParams.set("next", window.location.pathname + window.location.search);
      window.location.assign(login.toString());
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function isApiError(error: unknown, status?: number, code?: string): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  if (status !== undefined && error.status !== status) return false;
  if (code !== undefined && error.code !== code) return false;
  return true;
}

export function errorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente.") {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
