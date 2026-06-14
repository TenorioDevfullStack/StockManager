import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_NAME = "bot-api";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    authenticateBot(request);

    const supabase = createSupabaseAdminClient();
    const userId = requireUuidEnv("BOT_USER_ID");
    const orgId = requireUuidEnv("BOT_ORG_ID");
    const url = new URL(request.url);
    const parts = routeParts(url);
    const [resource, id] = parts;

    if (!resource) {
      return ok({
        name: "StockManager Bot API",
        version: 1,
        endpoints: [
          "GET /health",
          "GET /resumo",
          "GET|POST /produtos",
          "GET|PATCH|DELETE /produtos/:id",
          "GET|POST /pessoas",
          "GET|PATCH|DELETE /pessoas/:id",
          "GET|POST /movimentacoes",
          "GET /documentos",
          "GET /documentos/:id",
        ],
      });
    }

    if (resource === "health") return handleHealth(request, userId, orgId);
    if (resource === "resumo") return handleResumo(request, supabase, orgId);
    if (resource === "produtos") return handleProdutos(request, url, supabase, userId, orgId, id);
    if (resource === "pessoas") return handlePessoas(request, url, supabase, userId, orgId, id);
    if (resource === "movimentacoes") return handleMovimentacoes(request, url, supabase, userId, orgId, id);
    if (resource === "documentos") return handleDocumentos(request, url, supabase, orgId, id);

    throw new ApiError(404, "not_found", "Endpoint nao encontrado.");
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.status, error.code, error.message, error.details);
    }

    console.error("Erro inesperado na Bot API:", error);
    return fail(500, "internal_error", "Erro interno da API.");
  }
});

function handleHealth(request: Request, userId: string, orgId: string) {
  requireMethod(request, ["GET"]);
  return ok({ ok: true, user_id: userId, org_id: orgId, timestamp: new Date().toISOString() });
}

async function handleResumo(request: Request, supabase: ReturnType<typeof createClient>, orgId: string) {
  requireMethod(request, ["GET"]);

  const { data: produtos, error: produtosError } = await supabase
    .from("produtos")
    .select("id,nome,sku,categoria,unidade,quantidade,qtd_minima,localizacao")
    .eq("org_id", orgId)
    .order("nome");

  if (produtosError) throwDbError(produtosError, "Nao foi possivel buscar o resumo.");

  const { count: movimentacoesCount, error: movError } = await supabase
    .from("movimentacoes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (movError) throwDbError(movError, "Nao foi possivel contar movimentacoes.");

  const rows = produtos ?? [];
  const semEstoque = rows.filter((produto) => Number(produto.quantidade ?? 0) <= 0);
  const baixoEstoque = rows.filter((produto) => {
    const quantidade = Number(produto.quantidade ?? 0);
    const minima = Number(produto.qtd_minima ?? 0);
    return quantidade > 0 && minima > 0 && quantidade <= minima;
  });

  return ok({
    total_produtos: rows.length,
    total_itens: rows.reduce((sum, produto) => sum + Number(produto.quantidade ?? 0), 0),
    sem_estoque: semEstoque.length,
    baixo_estoque: baixoEstoque.length,
    total_movimentacoes: movimentacoesCount ?? 0,
    alertas: [...semEstoque, ...baixoEstoque].slice(0, 20),
  });
}

async function handleProdutos(
  request: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  id?: string,
) {
  if (request.method === "GET" && id) {
    ensureUuid(id, "id");
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel buscar o material.");
    if (!data) throw new ApiError(404, "not_found", "Material nao encontrado.");
    return ok({ data });
  }

  if (request.method === "GET") {
    const { limit, offset } = pagination(url);
    const search = cleanLikeTerm(url.searchParams.get("search") ?? url.searchParams.get("q"));
    const categoria = cleanParam(url.searchParams.get("categoria"));
    const sku = cleanParam(url.searchParams.get("sku"));
    const { column, ascending } = orderOptions(url, ["nome", "sku", "categoria", "quantidade", "criado_em", "atualizado_em"], "nome");

    let query = supabase
      .from("produtos")
      .select("*", { count: "exact" })
      .eq("org_id", orgId);

    if (search) query = query.or(`nome.ilike.%${search}%,sku.ilike.%${search}%`);
    if (categoria) query = query.eq("categoria", categoria);
    if (sku) query = query.ilike("sku", sku);

    const { data, error, count } = await query
      .order(column, { ascending })
      .range(offset, offset + limit - 1);

    if (error) throwDbError(error, "Nao foi possivel listar materiais.");
    return ok({ data: data ?? [], pagination: { limit, offset, count: count ?? 0 } });
  }

  if (request.method === "POST") {
    if (id) throw new ApiError(404, "not_found", "Endpoint nao encontrado.");
    const body = await readBody(request);
    const row = produtoPayload(body, userId, orgId, false);
    const { data, error } = await supabase
      .from("produtos")
      .insert(row)
      .select("*")
      .single();

    if (error) throwDbError(error, "Nao foi possivel criar o material.");
    return ok({ data }, 201);
  }

  if (request.method === "PATCH" && id) {
    ensureUuid(id, "id");
    const body = await readBody(request);
    const row = produtoPayload(body, userId, orgId, true);
    const { data, error } = await supabase
      .from("produtos")
      .update(row)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel atualizar o material.");
    if (!data) throw new ApiError(404, "not_found", "Material nao encontrado.");
    return ok({ data });
  }

  if (request.method === "DELETE" && id) {
    ensureUuid(id, "id");
    const { data, error } = await supabase
      .from("produtos")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel excluir o material.");
    if (!data) throw new ApiError(404, "not_found", "Material nao encontrado.");
    return ok({ deleted: true, id });
  }

  throw new ApiError(405, "method_not_allowed", "Metodo nao permitido para materiais.");
}

async function handlePessoas(
  request: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  id?: string,
) {
  if (request.method === "GET" && id) {
    ensureUuid(id, "id");
    const { data, error } = await supabase
      .from("pessoas")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel buscar o cadastro.");
    if (!data) throw new ApiError(404, "not_found", "Cadastro nao encontrado.");
    return ok({ data });
  }

  if (request.method === "GET") {
    const { limit, offset } = pagination(url);
    const search = cleanLikeTerm(url.searchParams.get("search") ?? url.searchParams.get("q"));
    const tipo = cleanParam(url.searchParams.get("tipo"));
    const { column, ascending } = orderOptions(url, ["nome", "tipo", "criado_em", "atualizado_em"], "nome");

    let query = supabase
      .from("pessoas")
      .select("*", { count: "exact" })
      .eq("org_id", orgId);

    if (search) query = query.or(`nome.ilike.%${search}%,documento.ilike.%${search}%,email.ilike.%${search}%`);
    if (tipo) query = query.eq("tipo", validatePessoaTipo(tipo));

    const { data, error, count } = await query
      .order(column, { ascending })
      .range(offset, offset + limit - 1);

    if (error) throwDbError(error, "Nao foi possivel listar cadastros.");
    return ok({ data: data ?? [], pagination: { limit, offset, count: count ?? 0 } });
  }

  if (request.method === "POST") {
    if (id) throw new ApiError(404, "not_found", "Endpoint nao encontrado.");
    const body = await readBody(request);
    const row = pessoaPayload(body, userId, orgId, false);
    const { data, error } = await supabase
      .from("pessoas")
      .insert(row)
      .select("*")
      .single();

    if (error) throwDbError(error, "Nao foi possivel criar o cadastro.");
    return ok({ data }, 201);
  }

  if (request.method === "PATCH" && id) {
    ensureUuid(id, "id");
    const body = await readBody(request);
    const row = pessoaPayload(body, userId, orgId, true);
    const { data, error } = await supabase
      .from("pessoas")
      .update(row)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel atualizar o cadastro.");
    if (!data) throw new ApiError(404, "not_found", "Cadastro nao encontrado.");
    return ok({ data });
  }

  if (request.method === "DELETE" && id) {
    ensureUuid(id, "id");
    const { data, error } = await supabase
      .from("pessoas")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel excluir o cadastro.");
    if (!data) throw new ApiError(404, "not_found", "Cadastro nao encontrado.");
    return ok({ deleted: true, id });
  }

  throw new ApiError(405, "method_not_allowed", "Metodo nao permitido para cadastros.");
}

async function handleMovimentacoes(
  request: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  id?: string,
) {
  if (id) throw new ApiError(404, "not_found", "Endpoint nao encontrado.");

  if (request.method === "GET") {
    const { limit, offset } = pagination(url);
    const tipo = cleanParam(url.searchParams.get("tipo"));
    const produtoId = cleanParam(url.searchParams.get("produto_id") ?? url.searchParams.get("produtoId"));
    const pessoaId = cleanParam(url.searchParams.get("pessoa_id") ?? url.searchParams.get("pessoaId"));

    let query = supabase
      .from("movimentacoes")
      .select("*,produto:produtos(id,nome,sku,unidade),pessoa:pessoas(id,nome,tipo)", { count: "exact" })
      .eq("org_id", orgId);

    if (tipo) query = query.eq("tipo", validateMovimentacaoTipo(tipo));
    if (produtoId) query = query.eq("produto_id", ensureUuid(produtoId, "produto_id"));
    if (pessoaId) query = query.eq("pessoa_id", ensureUuid(pessoaId, "pessoa_id"));

    const { data, error, count } = await query
      .order("criado_em", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throwDbError(error, "Nao foi possivel listar movimentacoes.");
    return ok({ data: data ?? [], pagination: { limit, offset, count: count ?? 0 } });
  }

  if (request.method === "POST") {
    const body = await readBody(request);
    const produtoId = requiredUuid(body, ["produto_id", "produtoId"], "produto_id");
    const pessoaId = optionalUuid(body, ["pessoa_id", "pessoaId"], "pessoa_id");
    const tipo = validateMovimentacaoTipo(requiredText(body, ["tipo"], "tipo"));
    const quantidade = requiredNumber(body, ["quantidade"], "quantidade", { positive: true });
    const motivo = optionalText(body, ["motivo"], "motivo") ?? null;
    const responsavel = optionalText(body, ["responsavel", "funcionario"], "responsavel") ?? null;

    const { data, error } = await supabase.rpc("registrar_movimentacao_api", {
      p_org_id: orgId,
      p_produto_id: produtoId,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_motivo: motivo,
      p_responsavel: responsavel,
      p_pessoa_id: pessoaId,
      p_user_id: userId,
    });

    if (error) throwDbError(error, "Nao foi possivel registrar a movimentacao.");
    return ok({ data }, 201);
  }

  throw new ApiError(405, "method_not_allowed", "Metodo nao permitido para movimentacoes.");
}

async function handleDocumentos(
  request: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  id?: string,
) {
  requireMethod(request, ["GET"]);

  if (id) {
    ensureUuid(id, "id");
    const { data, error } = await supabase
      .from("documentos")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) throwDbError(error, "Nao foi possivel buscar o documento.");
    if (!data) throw new ApiError(404, "not_found", "Documento nao encontrado.");
    return ok({ data });
  }

  const { limit, offset } = pagination(url);
  const search = cleanLikeTerm(url.searchParams.get("search") ?? url.searchParams.get("q"));
  const tipoDocumento = cleanParam(url.searchParams.get("tipo_documento") ?? url.searchParams.get("tipoDocumento"));
  const produtoId = cleanParam(url.searchParams.get("produto_id") ?? url.searchParams.get("produtoId"));

  let query = supabase
    .from("documentos")
    .select("*", { count: "exact" })
    .eq("org_id", orgId);

  if (search) query = query.or(`nome.ilike.%${search}%,descricao.ilike.%${search}%`);
  if (tipoDocumento) query = query.eq("tipo_documento", tipoDocumento);
  if (produtoId) query = query.eq("produto_id", ensureUuid(produtoId, "produto_id"));

  const { data, error, count } = await query
    .order("criado_em", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throwDbError(error, "Nao foi possivel listar documentos.");
  return ok({ data: data ?? [], pagination: { limit, offset, count: count ?? 0 } });
}

function produtoPayload(body: Record<string, unknown>, userId: string, orgId: string, partial: boolean) {
  const row: Record<string, unknown> = {};
  if (!partial) {
    row.user_id = userId;
    row.org_id = orgId;
  }

  const nome = partial ? optionalText(body, ["nome"], "nome") : requiredText(body, ["nome"], "nome");
  if (nome !== undefined) {
    if (!nome) throw new ApiError(400, "invalid_field", "Campo nome nao pode ser vazio.");
    row.nome = nome;
  }

  setOptionalText(row, "sku", body, ["sku"]);
  setOptionalText(row, "localizacao", body, ["localizacao"]);
  setOptionalText(row, "descricao", body, ["descricao"]);

  const categoria = optionalText(body, ["categoria"], "categoria");
  if (categoria !== undefined) {
    if (!categoria) throw new ApiError(400, "invalid_field", "Campo categoria nao pode ser vazio.");
    row.categoria = categoria;
  } else if (!partial) {
    row.categoria = "Outros";
  }

  const unidade = optionalText(body, ["unidade"], "unidade");
  if (unidade !== undefined) {
    if (!unidade) throw new ApiError(400, "invalid_field", "Campo unidade nao pode ser vazio.");
    row.unidade = unidade;
  } else if (!partial) {
    row.unidade = "un";
  }

  const quantidade = optionalNumber(body, ["quantidade"], "quantidade", { nonNegative: true });
  if (quantidade !== undefined) {
    if (quantidade === null) throw new ApiError(400, "invalid_field", "Campo quantidade nao pode ser nulo.");
    row.quantidade = quantidade;
  } else if (!partial) {
    row.quantidade = 0;
  }

  const qtdMinima = optionalNumber(body, ["qtd_minima", "qtdMinima"], "qtd_minima", { nonNegative: true });
  if (qtdMinima !== undefined) {
    if (qtdMinima === null) throw new ApiError(400, "invalid_field", "Campo qtd_minima nao pode ser nulo.");
    row.qtd_minima = qtdMinima;
  } else if (!partial) {
    row.qtd_minima = 0;
  }

  if (partial && Object.keys(row).length === 0) {
    throw new ApiError(400, "empty_payload", "Informe ao menos um campo para atualizar.");
  }

  return row;
}

function pessoaPayload(body: Record<string, unknown>, userId: string, orgId: string, partial: boolean) {
  const row: Record<string, unknown> = {};
  if (!partial) {
    row.user_id = userId;
    row.org_id = orgId;
  }

  const nome = partial ? optionalText(body, ["nome"], "nome") : requiredText(body, ["nome"], "nome");
  if (nome !== undefined) {
    if (!nome) throw new ApiError(400, "invalid_field", "Campo nome nao pode ser vazio.");
    row.nome = nome;
  }

  const tipo = optionalText(body, ["tipo"], "tipo");
  if (tipo !== undefined) {
    row.tipo = tipo ? validatePessoaTipo(tipo) : "funcionario";
  } else if (!partial) {
    row.tipo = "funcionario";
  }

  setOptionalText(row, "documento", body, ["documento"]);
  setOptionalText(row, "telefone", body, ["telefone"]);
  setOptionalText(row, "email", body, ["email"]);
  setOptionalText(row, "endereco", body, ["endereco"]);
  setOptionalText(row, "obs", body, ["obs"]);

  if (partial && Object.keys(row).length === 0) {
    throw new ApiError(400, "empty_payload", "Informe ao menos um campo para atualizar.");
  }

  return row;
}

function createSupabaseAdminClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authenticateBot(request: Request) {
  const expected = requireEnv("BOT_API_KEY");
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = request.headers.get("x-api-key")?.trim();

  if (!safeEquals(bearerToken ?? "", expected) && !safeEquals(apiKey ?? "", expected)) {
    throw new ApiError(401, "unauthorized", "Chave da API invalida ou ausente.");
  }
}

function requireMethod(request: Request, methods: string[]) {
  if (!methods.includes(request.method)) {
    throw new ApiError(405, "method_not_allowed", "Metodo nao permitido.");
  }
}

function routeParts(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const functionIndex = parts.lastIndexOf(FUNCTION_NAME);
  return functionIndex >= 0 ? parts.slice(functionIndex + 1) : parts;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};

  try {
    const value = JSON.parse(text);
    if (!isRecord(value)) {
      throw new ApiError(400, "invalid_json", "O corpo da requisicao deve ser um objeto JSON.");
    }
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "JSON invalido no corpo da requisicao.");
  }
}

function firstValue(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return { found: true, value: body[key] };
    }
  }
  return { found: false, value: undefined };
}

function requiredText(body: Record<string, unknown>, keys: string[], label: string) {
  const value = optionalText(body, keys, label);
  if (!value) throw new ApiError(400, "missing_field", `Campo ${label} e obrigatorio.`);
  return value;
}

function optionalText(body: Record<string, unknown>, keys: string[], label: string) {
  const current = firstValue(body, keys);
  if (!current.found) return undefined;
  if (current.value === null || current.value === undefined) return null;

  const value = String(current.value).trim();
  if (value.length > 5000) {
    throw new ApiError(400, "invalid_field", `Campo ${label} excede o tamanho permitido.`);
  }

  return value || null;
}

function setOptionalText(row: Record<string, unknown>, column: string, body: Record<string, unknown>, keys: string[]) {
  const value = optionalText(body, keys, column);
  if (value !== undefined) row[column] = value;
}

function requiredNumber(
  body: Record<string, unknown>,
  keys: string[],
  label: string,
  options: { positive?: boolean; nonNegative?: boolean } = {},
) {
  const value = optionalNumber(body, keys, label, options);
  if (value === undefined || value === null) {
    throw new ApiError(400, "missing_field", `Campo ${label} e obrigatorio.`);
  }
  return value;
}

function optionalNumber(
  body: Record<string, unknown>,
  keys: string[],
  label: string,
  options: { positive?: boolean; nonNegative?: boolean } = {},
) {
  const current = firstValue(body, keys);
  if (!current.found) return undefined;
  if (current.value === null || current.value === "") return null;

  const value = Number(current.value);
  if (!Number.isFinite(value)) {
    throw new ApiError(400, "invalid_field", `Campo ${label} deve ser numerico.`);
  }

  if (options.positive && value <= 0) {
    throw new ApiError(400, "invalid_field", `Campo ${label} deve ser maior que zero.`);
  }

  if (options.nonNegative && value < 0) {
    throw new ApiError(400, "invalid_field", `Campo ${label} nao pode ser negativo.`);
  }

  return value;
}

function requiredUuid(body: Record<string, unknown>, keys: string[], label: string) {
  return ensureUuid(requiredText(body, keys, label), label);
}

function optionalUuid(body: Record<string, unknown>, keys: string[], label: string) {
  const value = optionalText(body, keys, label);
  if (value === undefined || value === null) return null;
  return ensureUuid(value, label);
}

function ensureUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new ApiError(400, "invalid_field", `Campo ${label} deve ser um UUID valido.`);
  }
  return value;
}

function validateMovimentacaoTipo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!["entrada", "saida", "ajuste"].includes(normalized)) {
    throw new ApiError(400, "invalid_field", "Campo tipo deve ser entrada, saida ou ajuste.");
  }
  return normalized;
}

function validatePessoaTipo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!["funcionario", "fornecedor", "ambos"].includes(normalized)) {
    throw new ApiError(400, "invalid_field", "Campo tipo deve ser funcionario, fornecedor ou ambos.");
  }
  return normalized;
}

function pagination(url: URL) {
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0);

  return { limit, offset };
}

function orderOptions(url: URL, allowedColumns: string[], defaultColumn: string) {
  const requestedColumn = cleanParam(url.searchParams.get("order"));
  const column = requestedColumn && allowedColumns.includes(requestedColumn) ? requestedColumn : defaultColumn;
  const ascending = cleanParam(url.searchParams.get("dir")) !== "desc";

  return { column, ascending };
}

function cleanParam(value: string | null) {
  const clean = String(value ?? "").trim();
  return clean.length ? clean.slice(0, 120) : "";
}

function cleanLikeTerm(value: string | null) {
  return cleanParam(value)
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ApiError(500, "missing_env", `Variavel ${name} nao configurada.`);
  return value;
}

function requireUuidEnv(name: string) {
  return ensureUuid(requireEnv(name), name);
}

function throwDbError(error: { code?: string; message?: string; details?: string; hint?: string }, fallback: string): never {
  const message = error.message || fallback;
  let status = 500;

  if (error.code === "23505") status = 409;
  else if (error.code === "23503") status = 400;
  else if (message.includes("nao encontrado") || message.includes("não encontrado")) status = 404;
  else if (message.includes("Estoque insuficiente")) status = 409;
  else if (message.includes("Acesso negado")) status = 403;
  else if (error.code === "P0001") status = 400;

  throw new ApiError(status, "database_error", message, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function ok(data: unknown, status = 200) {
  return json(data, status);
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return json({ error: { code, message, details } }, status);
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
