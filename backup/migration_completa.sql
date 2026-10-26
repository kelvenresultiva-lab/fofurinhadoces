-- Migration gerada a partir do projeto Supabase original (somente schema public + bucket de storage)

create extension if not exists "pg_trgm" with schema extensions;

set check_function_bodies = off;

-- ===== FUNCOES (antes das tabelas: usadas em defaults) =====
CREATE OR REPLACE FUNCTION public.converter_orcamento_em_contrato(p_orcamento_id uuid, p_entrada numeric DEFAULT 0, p_data_entrada date DEFAULT NULL::date, p_numero_parcelas integer DEFAULT 1, p_primeiro_vencimento date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_orcamento record;
  v_contrato_id uuid;
  v_restante numeric(12,2);
  v_base numeric(12,2);
  v_soma_base numeric(12,2) := 0;
  v_numero integer := 1;
  v_valor numeric(12,2);
  i integer;
begin
  if p_numero_parcelas < 1 then
    p_numero_parcelas := 1;
  end if;

  select * into v_orcamento from public.orcamentos where id = p_orcamento_id for update;

  if v_orcamento is null then
    raise exception 'Orçamento não encontrado.';
  end if;

  if v_orcamento.status != 'aprovado' then
    raise exception 'Apenas orçamentos aprovados podem virar contrato.';
  end if;

  if exists (select 1 from public.contratos where evento_id = v_orcamento.evento_id) then
    raise exception 'Este evento já possui um contrato. Não é possível criar um segundo contrato.';
  end if;

  if p_primeiro_vencimento is null then
    raise exception 'Informe o vencimento da primeira parcela.';
  end if;

  insert into public.contratos (evento_id, valor_total, desconto, observacoes)
  values (
    v_orcamento.evento_id,
    v_orcamento.subtotal,
    v_orcamento.subtotal - v_orcamento.valor_total,
    v_orcamento.observacoes
  )
  returning id into v_contrato_id;

  insert into public.contrato_itens (contrato_id, produto_id, quantidade, valor_unitario)
  select v_contrato_id, produto_id, quantidade, valor_unitario
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  v_restante := greatest(v_orcamento.valor_total - p_entrada, 0);
  v_base := floor((v_restante / p_numero_parcelas) * 100) / 100;

  if p_entrada > 0 then
    insert into public.parcelas (contrato_id, numero, descricao, vencimento, valor)
    values (v_contrato_id, v_numero, 'Entrada', coalesce(p_data_entrada, p_primeiro_vencimento), p_entrada);
    v_numero := v_numero + 1;
  end if;

  for i in 0..(p_numero_parcelas - 1) loop
    if i = p_numero_parcelas - 1 then
      v_valor := round((v_restante - v_soma_base)::numeric, 2);
    else
      v_valor := v_base;
    end if;
    v_soma_base := v_soma_base + v_base;

    insert into public.parcelas (contrato_id, numero, descricao, vencimento, valor)
    values (
      v_contrato_id,
      v_numero + i,
      format('Parcela %s/%s', i + 1, p_numero_parcelas),
      (p_primeiro_vencimento + (i || ' months')::interval)::date,
      v_valor
    );
  end loop;

  update public.orcamentos
  set contrato_id = v_contrato_id
  where id = p_orcamento_id;

  insert into public.orcamento_historico (orcamento_id, usuario_id, texto)
  values (p_orcamento_id, auth.uid(), 'Convertido em contrato.');

  return v_contrato_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_empresa_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select empresa_id from public.usuarios where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_subtotal_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  target_id uuid;
begin
  target_id := coalesce(new.orcamento_id, old.orcamento_id);
  update public.orcamentos
  set subtotal = coalesce((
    select sum(subtotal) from public.orcamento_itens where orcamento_id = target_id
  ), 0)
  where id = target_id;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_orcamento_numero()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero
    from public.orcamentos
    where empresa_id = new.empresa_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ===== TABELAS =====
create table public."cliente_familiares" (
  "id" uuid default gen_random_uuid() not null,
  "cliente_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "nome" text not null,
  "parentesco" text,
  "telefone" text,
  "whatsapp" text,
  "email" text,
  "instagram" text,
  "aniversario" date,
  "observacoes" text,
  constraint "cliente_familiares_pkey" PRIMARY KEY (id)
);

create table public."clientes" (
  "id" uuid default gen_random_uuid() not null,
  "empresa_id" uuid default current_empresa_id() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "nome" text not null,
  "cpf" text,
  "telefone" text,
  "whatsapp" text,
  "email" text,
  "instagram" text,
  "data_nascimento" date,
  "endereco" text,
  "cidade" text,
  "estado" text,
  "cep" text,
  "origem" text,
  "profissao" text,
  "observacoes" text,
  "status" text default 'ativo'::text not null,
  constraint "clientes_pkey" PRIMARY KEY (id),
  constraint "clientes_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text])))
);

create table public."contrato_itens" (
  "id" uuid default gen_random_uuid() not null,
  "contrato_id" uuid not null,
  "produto_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "quantidade" numeric(12,2) not null,
  "valor_unitario" numeric(12,2) default 0 not null,
  "subtotal" numeric(12,2) generated always as ((quantidade * valor_unitario)) stored,
  "status_producao" text default 'nao_iniciado'::text not null,
  constraint "contrato_itens_pkey" PRIMARY KEY (id),
  constraint "contrato_itens_status_producao_check" CHECK ((status_producao = ANY (ARRAY['nao_iniciado'::text, 'em_producao'::text, 'pronto'::text, 'entregue'::text])))
);

create table public."contratos" (
  "id" uuid default gen_random_uuid() not null,
  "evento_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "valor_total" numeric(12,2) not null,
  "desconto" numeric(12,2) default 0 not null,
  "valor_final" numeric(12,2) generated always as ((valor_total - desconto)) stored,
  "status" text default 'ativo'::text not null,
  "observacoes" text,
  constraint "contratos_evento_id_key" UNIQUE (evento_id),
  constraint "contratos_pkey" PRIMARY KEY (id),
  constraint "contratos_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'cancelado'::text])))
);

create table public."documentos" (
  "id" uuid default gen_random_uuid() not null,
  "evento_id" uuid not null,
  "usuario_upload_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "categoria" text default 'outros'::text not null,
  "nome" text not null,
  "tipo" text not null,
  "caminho" text not null,
  "tamanho" bigint default 0 not null,
  "status" text default 'ativo'::text not null,
  constraint "documentos_pkey" PRIMARY KEY (id),
  constraint "documentos_categoria_check" CHECK ((categoria = ANY (ARRAY['orcamento'::text, 'contrato'::text, 'comprovante'::text, 'referencia'::text, 'foto'::text, 'lista_convidados'::text, 'checklist'::text, 'outros'::text]))),
  constraint "documentos_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'arquivado'::text])))
);

create table public."empresas" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "nome" text not null,
  "nome_fantasia" text,
  "cnpj" text,
  "telefone" text,
  "email" text,
  "logo" text,
  "site" text,
  "instagram" text,
  "endereco" text,
  "cidade" text,
  "estado" text,
  "cep" text,
  "plano" text default 'gratis'::text not null,
  "status" text default 'ativo'::text not null,
  constraint "empresas_pkey" PRIMARY KEY (id),
  constraint "empresas_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text])))
);

create table public."eventos" (
  "id" uuid default gen_random_uuid() not null,
  "cliente_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "tipo" text default 'casamento'::text not null,
  "titulo" text,
  "data" date,
  "horario" time without time zone,
  "local" text,
  "cidade" text,
  "numero_convidados" integer,
  "status" text default 'planejado'::text not null,
  "observacoes" text,
  constraint "eventos_pkey" PRIMARY KEY (id),
  constraint "eventos_status_check" CHECK ((status = ANY (ARRAY['planejado'::text, 'confirmado'::text, 'realizado'::text, 'cancelado'::text]))),
  constraint "eventos_tipo_check" CHECK ((tipo = ANY (ARRAY['casamento'::text, 'cha_revelacao'::text, 'aniversario'::text, '15_anos'::text, 'batizado'::text, 'outro'::text])))
);

create table public."observacoes" (
  "id" uuid default gen_random_uuid() not null,
  "evento_id" uuid not null,
  "usuario_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "texto" text not null,
  constraint "observacoes_pkey" PRIMARY KEY (id)
);

create table public."orcamento_historico" (
  "id" uuid default gen_random_uuid() not null,
  "orcamento_id" uuid not null,
  "usuario_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "texto" text not null,
  constraint "orcamento_historico_pkey" PRIMARY KEY (id)
);

create table public."orcamento_itens" (
  "id" uuid default gen_random_uuid() not null,
  "orcamento_id" uuid not null,
  "produto_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "quantidade" numeric(12,2) not null,
  "valor_unitario" numeric(12,2) default 0 not null,
  "subtotal" numeric(12,2) generated always as ((quantidade * valor_unitario)) stored,
  constraint "orcamento_itens_pkey" PRIMARY KEY (id)
);

create table public."orcamentos" (
  "id" uuid default gen_random_uuid() not null,
  "empresa_id" uuid default current_empresa_id() not null,
  "cliente_id" uuid not null,
  "evento_id" uuid not null,
  "contrato_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "numero" integer not null,
  "status" text default 'rascunho'::text not null,
  "subtotal" numeric(12,2) default 0 not null,
  "desconto_tipo" text default 'valor'::text not null,
  "desconto_valor" numeric(12,2) default 0 not null,
  "valor_total" numeric(12,2) generated always as (
CASE
    WHEN (desconto_tipo = 'percentual'::text) THEN (subtotal - ((subtotal * desconto_valor) / (100)::numeric))
    ELSE (subtotal - desconto_valor)
END) stored,
  "data_emissao" date default CURRENT_DATE not null,
  "data_validade" date,
  "observacoes" text,
  "deleted_at" timestamp with time zone,
  constraint "orcamentos_pkey" PRIMARY KEY (id),
  constraint "orcamentos_desconto_tipo_check" CHECK ((desconto_tipo = ANY (ARRAY['valor'::text, 'percentual'::text]))),
  constraint "orcamentos_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'enviado'::text, 'em_negociacao'::text, 'aprovado'::text, 'recusado'::text, 'expirado'::text, 'cancelado'::text])))
);

create table public."parcelas" (
  "id" uuid default gen_random_uuid() not null,
  "contrato_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "numero" integer not null,
  "descricao" text,
  "vencimento" date not null,
  "valor" numeric(12,2) not null,
  "valor_pago" numeric(12,2) default 0 not null,
  "status" text default 'pendente'::text not null,
  "forma_pagamento" text,
  constraint "parcelas_pkey" PRIMARY KEY (id),
  constraint "parcelas_forma_pagamento_check" CHECK ((forma_pagamento = ANY (ARRAY['pix'::text, 'dinheiro'::text, 'cartao_credito'::text, 'cartao_debito'::text, 'transferencia'::text, 'cheque'::text, 'boleto'::text, 'outros'::text]))),
  constraint "parcelas_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'parcial'::text, 'pago'::text, 'cancelado'::text])))
);

create table public."produtos" (
  "id" uuid default gen_random_uuid() not null,
  "empresa_id" uuid default current_empresa_id() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "nome" text not null,
  "categoria" text,
  "unidade" text default 'unidade'::text not null,
  "preco" numeric(12,2),
  "dias_antecedencia_producao" integer default 2 not null,
  "ativo" boolean default true not null,
  constraint "produtos_pkey" PRIMARY KEY (id)
);

create table public."recebimentos" (
  "id" uuid default gen_random_uuid() not null,
  "parcela_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "valor" numeric(12,2) not null,
  "data" date default CURRENT_DATE not null,
  "forma_pagamento" text not null,
  "observacoes" text,
  constraint "recebimentos_pkey" PRIMARY KEY (id),
  constraint "recebimentos_forma_pagamento_check" CHECK ((forma_pagamento = ANY (ARRAY['pix'::text, 'dinheiro'::text, 'cartao_credito'::text, 'cartao_debito'::text, 'transferencia'::text, 'cheque'::text, 'boleto'::text, 'outros'::text])))
);

create table public."tarefas" (
  "id" uuid default gen_random_uuid() not null,
  "empresa_id" uuid default current_empresa_id() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "titulo" text not null,
  "descricao" text,
  "responsavel" text,
  "data" date,
  "hora" time without time zone,
  "prioridade" text default 'normal'::text not null,
  "status" text default 'pendente'::text not null,
  constraint "tarefas_pkey" PRIMARY KEY (id),
  constraint "tarefas_prioridade_check" CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text, 'urgente'::text]))),
  constraint "tarefas_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluida'::text, 'cancelada'::text])))
);

create table public."usuarios" (
  "id" uuid not null,
  "empresa_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "nome" text,
  "email" text,
  "telefone" text,
  "cargo" text default 'administrador'::text not null,
  "foto" text,
  "status" text default 'ativo'::text not null,
  "ultimo_login" timestamp with time zone,
  constraint "usuarios_pkey" PRIMARY KEY (id),
  constraint "usuarios_cargo_check" CHECK ((cargo = ANY (ARRAY['administrador'::text, 'financeiro'::text, 'producao'::text, 'atendente'::text, 'marketing'::text]))),
  constraint "usuarios_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text])))
);

-- ===== FOREIGN KEYS =====
alter table public."cliente_familiares" add constraint "cliente_familiares_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
alter table public."clientes" add constraint "clientes_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
alter table public."contrato_itens" add constraint "contrato_itens_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
alter table public."contrato_itens" add constraint "contrato_itens_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT;
alter table public."contratos" add constraint "contratos_evento_id_fkey" FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public."documentos" add constraint "documentos_evento_id_fkey" FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public."documentos" add constraint "documentos_usuario_upload_id_fkey" FOREIGN KEY (usuario_upload_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table public."eventos" add constraint "eventos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
alter table public."observacoes" add constraint "observacoes_evento_id_fkey" FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public."observacoes" add constraint "observacoes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table public."orcamento_historico" add constraint "orcamento_historico_orcamento_id_fkey" FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
alter table public."orcamento_historico" add constraint "orcamento_historico_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table public."orcamento_itens" add constraint "orcamento_itens_orcamento_id_fkey" FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
alter table public."orcamento_itens" add constraint "orcamento_itens_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT;
alter table public."orcamentos" add constraint "orcamentos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
alter table public."orcamentos" add constraint "orcamentos_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL;
alter table public."orcamentos" add constraint "orcamentos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
alter table public."orcamentos" add constraint "orcamentos_evento_id_fkey" FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public."parcelas" add constraint "parcelas_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
alter table public."produtos" add constraint "produtos_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
alter table public."recebimentos" add constraint "recebimentos_parcela_id_fkey" FOREIGN KEY (parcela_id) REFERENCES parcelas(id) ON DELETE CASCADE;
alter table public."tarefas" add constraint "tarefas_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
alter table public."usuarios" add constraint "usuarios_empresa_id_fkey" FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
alter table public."usuarios" add constraint "usuarios_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===== INDICES =====
CREATE INDEX cliente_familiares_aniversario_idx ON public.cliente_familiares USING btree (aniversario);
CREATE INDEX cliente_familiares_cliente_id_idx ON public.cliente_familiares USING btree (cliente_id);
CREATE INDEX clientes_cidade_idx ON public.clientes USING btree (cidade);
CREATE INDEX clientes_cpf_idx ON public.clientes USING btree (cpf);
CREATE INDEX clientes_email_idx ON public.clientes USING btree (email);
CREATE INDEX clientes_empresa_id_idx ON public.clientes USING btree (empresa_id);
CREATE INDEX clientes_nome_idx ON public.clientes USING gin (nome gin_trgm_ops);
CREATE INDEX clientes_status_idx ON public.clientes USING btree (status);
CREATE INDEX clientes_telefone_idx ON public.clientes USING btree (telefone);
CREATE INDEX clientes_whatsapp_idx ON public.clientes USING btree (whatsapp);
CREATE INDEX contrato_itens_contrato_id_idx ON public.contrato_itens USING btree (contrato_id);
CREATE INDEX contrato_itens_produto_id_idx ON public.contrato_itens USING btree (produto_id);
CREATE INDEX contrato_itens_status_producao_idx ON public.contrato_itens USING btree (status_producao);
CREATE INDEX contratos_evento_id_idx ON public.contratos USING btree (evento_id);
CREATE INDEX documentos_categoria_idx ON public.documentos USING btree (categoria);
CREATE INDEX documentos_evento_id_idx ON public.documentos USING btree (evento_id);
CREATE INDEX documentos_status_idx ON public.documentos USING btree (status);
CREATE INDEX eventos_cidade_idx ON public.eventos USING btree (cidade);
CREATE INDEX eventos_cliente_id_idx ON public.eventos USING btree (cliente_id);
CREATE INDEX eventos_data_idx ON public.eventos USING btree (data);
CREATE INDEX eventos_status_idx ON public.eventos USING btree (status);
CREATE INDEX observacoes_evento_id_idx ON public.observacoes USING btree (evento_id);
CREATE INDEX orcamento_historico_orcamento_id_idx ON public.orcamento_historico USING btree (orcamento_id);
CREATE INDEX orcamento_itens_orcamento_id_idx ON public.orcamento_itens USING btree (orcamento_id);
CREATE INDEX orcamento_itens_produto_id_idx ON public.orcamento_itens USING btree (produto_id);
CREATE INDEX orcamentos_cliente_id_idx ON public.orcamentos USING btree (cliente_id);
CREATE UNIQUE INDEX orcamentos_empresa_numero_idx ON public.orcamentos USING btree (empresa_id, numero);
CREATE UNIQUE INDEX orcamentos_evento_aprovado_unq ON public.orcamentos USING btree (evento_id) WHERE (status = 'aprovado'::text);
CREATE INDEX orcamentos_evento_id_idx ON public.orcamentos USING btree (evento_id);
CREATE INDEX orcamentos_status_idx ON public.orcamentos USING btree (status);
CREATE INDEX parcelas_contrato_id_idx ON public.parcelas USING btree (contrato_id);
CREATE INDEX parcelas_status_idx ON public.parcelas USING btree (status);
CREATE INDEX parcelas_vencimento_idx ON public.parcelas USING btree (vencimento);
CREATE INDEX produtos_empresa_id_idx ON public.produtos USING btree (empresa_id);
CREATE INDEX recebimentos_data_idx ON public.recebimentos USING btree (data);
CREATE INDEX recebimentos_parcela_id_idx ON public.recebimentos USING btree (parcela_id);
CREATE INDEX tarefas_data_idx ON public.tarefas USING btree (data);
CREATE INDEX tarefas_empresa_id_idx ON public.tarefas USING btree (empresa_id);
CREATE INDEX tarefas_status_idx ON public.tarefas USING btree (status);
CREATE INDEX usuarios_empresa_id_idx ON public.usuarios USING btree (empresa_id);

-- ===== TRIGGERS (public) =====
CREATE TRIGGER clientes_set_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contrato_itens_set_updated_at BEFORE UPDATE ON public.contrato_itens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contratos_set_updated_at BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER documentos_set_updated_at BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER empresas_set_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER eventos_set_updated_at BEFORE UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orcamento_itens_recalcular_subtotal AFTER INSERT OR DELETE OR UPDATE ON public.orcamento_itens FOR EACH ROW EXECUTE FUNCTION recalcular_subtotal_orcamento();
CREATE TRIGGER orcamento_itens_set_updated_at BEFORE UPDATE ON public.orcamento_itens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orcamentos_set_numero BEFORE INSERT ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION set_orcamento_numero();
CREATE TRIGGER orcamentos_set_updated_at BEFORE UPDATE ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parcelas_set_updated_at BEFORE UPDATE ON public.parcelas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER produtos_set_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tarefas_set_updated_at BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER usuarios_set_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== TRIGGERS EM auth.users (se houver) =====

-- ===== RLS =====
alter table public."cliente_familiares" enable row level security;
alter table public."clientes" enable row level security;
alter table public."contrato_itens" enable row level security;
alter table public."contratos" enable row level security;
alter table public."documentos" enable row level security;
alter table public."empresas" enable row level security;
alter table public."eventos" enable row level security;
alter table public."observacoes" enable row level security;
alter table public."orcamento_historico" enable row level security;
alter table public."orcamento_itens" enable row level security;
alter table public."orcamentos" enable row level security;
alter table public."parcelas" enable row level security;
alter table public."produtos" enable row level security;
alter table public."recebimentos" enable row level security;
alter table public."tarefas" enable row level security;
alter table public."usuarios" enable row level security;

create policy "cliente_familiares_empresa_all" on public."cliente_familiares" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = cliente_familiares.cliente_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = cliente_familiares.cliente_id) AND (c.empresa_id = current_empresa_id())))));
create policy "clientes_empresa_all" on public."clientes" as permissive for all to public using ((empresa_id = current_empresa_id())) with check ((empresa_id = current_empresa_id()));
create policy "contrato_itens_empresa_all" on public."contrato_itens" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM ((contratos ct
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((ct.id = contrato_itens.contrato_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM ((contratos ct
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((ct.id = contrato_itens.contrato_id) AND (c.empresa_id = current_empresa_id())))));
create policy "contratos_empresa_all" on public."contratos" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = contratos.evento_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = contratos.evento_id) AND (c.empresa_id = current_empresa_id())))));
create policy "documentos_empresa_all" on public."documentos" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = documentos.evento_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = documentos.evento_id) AND (c.empresa_id = current_empresa_id())))));
create policy "empresas_select_own" on public."empresas" as permissive for select to public using ((id = current_empresa_id()));
create policy "empresas_update_own" on public."empresas" as permissive for update to public using ((id = current_empresa_id())) with check ((id = current_empresa_id()));
create policy "eventos_empresa_all" on public."eventos" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = eventos.cliente_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = eventos.cliente_id) AND (c.empresa_id = current_empresa_id())))));
create policy "observacoes_empresa_all" on public."observacoes" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = observacoes.evento_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM (eventos e
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((e.id = observacoes.evento_id) AND (c.empresa_id = current_empresa_id())))));
create policy "orcamento_historico_empresa_all" on public."orcamento_historico" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM orcamentos o
  WHERE ((o.id = orcamento_historico.orcamento_id) AND (o.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM orcamentos o
  WHERE ((o.id = orcamento_historico.orcamento_id) AND (o.empresa_id = current_empresa_id())))));
create policy "orcamento_itens_empresa_all" on public."orcamento_itens" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM orcamentos o
  WHERE ((o.id = orcamento_itens.orcamento_id) AND (o.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM orcamentos o
  WHERE ((o.id = orcamento_itens.orcamento_id) AND (o.empresa_id = current_empresa_id())))));
create policy "orcamentos_empresa_all" on public."orcamentos" as permissive for all to public using ((empresa_id = current_empresa_id())) with check ((empresa_id = current_empresa_id()));
create policy "parcelas_empresa_all" on public."parcelas" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM ((contratos ct
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((ct.id = parcelas.contrato_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM ((contratos ct
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((ct.id = parcelas.contrato_id) AND (c.empresa_id = current_empresa_id())))));
create policy "produtos_empresa_all" on public."produtos" as permissive for all to public using ((empresa_id = current_empresa_id())) with check ((empresa_id = current_empresa_id()));
create policy "recebimentos_empresa_all" on public."recebimentos" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (((parcelas p
     JOIN contratos ct ON ((ct.id = p.contrato_id)))
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((p.id = recebimentos.parcela_id) AND (c.empresa_id = current_empresa_id()))))) with check ((EXISTS ( SELECT 1
   FROM (((parcelas p
     JOIN contratos ct ON ((ct.id = p.contrato_id)))
     JOIN eventos e ON ((e.id = ct.evento_id)))
     JOIN clientes c ON ((c.id = e.cliente_id)))
  WHERE ((p.id = recebimentos.parcela_id) AND (c.empresa_id = current_empresa_id())))));
create policy "tarefas_empresa_all" on public."tarefas" as permissive for all to public using ((empresa_id = current_empresa_id())) with check ((empresa_id = current_empresa_id()));
create policy "usuarios_select_same_empresa" on public."usuarios" as permissive for select to public using (((id = auth.uid()) OR (empresa_id = current_empresa_id())));
create policy "usuarios_update_self" on public."usuarios" as permissive for update to public using ((id = auth.uid())) with check ((id = auth.uid()));

-- ===== STORAGE =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('documentos', 'documentos', false, null, null) on conflict (id) do nothing;
create policy "documentos_storage_delete" on storage.objects as permissive for delete to public using (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (current_empresa_id())::text)));
create policy "documentos_storage_insert" on storage.objects as permissive for insert to public with check (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (current_empresa_id())::text)));
create policy "documentos_storage_select" on storage.objects as permissive for select to public using (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (current_empresa_id())::text)));
