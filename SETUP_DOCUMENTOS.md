# 📄 Guia de Implementação - Sistema de PDFs no StockManager

## Resumo da Implementação

Foi implementado um sistema completo de gerenciamento de arquivos PDF no StockManager, permitindo:

- ✅ Upload de PDFs ao banco de dados (Supabase Storage)
- ✅ Visualização de PDFs no navegador com navegação por páginas
- ✅ Download de PDFs
- ✅ Edição de metadados (nome, descrição, tipo, tags)
- ✅ Deleção de documentos
- ✅ Filtros por tipo de documento
- ✅ Busca por termo
- ✅ Interface responsiva e moderna

## 🔧 Configuração Necessária

### 1. Configurar Supabase Storage

O projeto inclui a migration `supabase/migrations/20260521001000_create_documents_storage_bucket.sql`, que cria o bucket `documentos` e as políticas de upload, leitura e remoção no Supabase Storage.

Se preferir configurar manualmente pelo Dashboard, use os passos abaixo:

#### Passo 1: Acessar o Dashboard do Supabase

1. Vá para [https://app.supabase.com](https://app.supabase.com)
2. Selecione seu projeto StockManager
3. No menu lateral, clique em **"Storage"**

#### Passo 2: Criar o Bucket

1. Clique em **"New bucket"**
2. Configure assim:
   - **Name:** `documentos`
   - **Public bucket:** ☑️ (marque a opção para permitir acesso público)
3. Clique em **"Create bucket"**

#### Passo 3: Configurar Políticas de Acesso (RLS)

Na aba **Storage > Policies**, adicione as seguintes políticas:

```sql
-- Policy 1: Usuários podem fazer upload apenas na pasta deles
create policy "Usuários podem fazer upload na sua pasta"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Policy 2: Usuários podem ver apenas seus arquivos
create policy "Usuários podem visualizar seus arquivos"
on storage.objects for select
to authenticated
using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Policy 3: Usuários podem deletar apenas seus arquivos
create policy "Usuários podem deletar seus arquivos"
on storage.objects for delete
to authenticated
using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
```

### 2. Executar Migração SQL

Execute as migrações SQL para criar a tabela de documentos e configurar o Storage:

```sql
-- Arquivo: supabase/migrations/20260521000000_add_documents_table.sql
-- Arquivo: supabase/migrations/20260521001000_create_documents_storage_bucket.sql
```

Você pode executar isso:

- Via **Supabase Dashboard > SQL Editor** (copie e cole o conteúdo)
- Ou via Supabase CLI se tiver configurado

## 📁 Arquivos Adicionados

### Novo

- `js/documentos.js` - Módulo de gerenciamento de PDFs
- `js/ui.js` - Helpers de interface de usuário
- `supabase/migrations/20260521000000_add_documents_table.sql` - Tabela de documentos
- `supabase/migrations/20260521001000_create_documents_storage_bucket.sql` - Bucket e políticas de Storage

### Modificados

- `js/app.js` - Adicionada rota de documentos
- `css/style.css` - Adicionados estilos para documentos
- `index.html` - Adicionados scripts necessários

## 🚀 Como Usar

### Upload de PDF

1. Navegue até a seção **"Documentos"** (novo item no menu)
2. Clique em **"📤 Upload de PDF"**
3. Preencha os dados:
   - **Nome do Documento** (obrigatório)
   - **Descrição** (opcional)
   - **Tipo de Documento**: Geral, Manual, Especificação ou Certificado
   - **Arquivo PDF** (máximo 50MB)
   - **Tags** (opcional, separadas por vírgula)
4. Clique em **"Enviar PDF"**

### Visualizar PDF

1. Na lista de documentos, clique em **"Abrir"** no card do documento
2. Use os botões para navegar entre páginas:
   - **← Anterior**: volta à página anterior
   - **Próxima →**: próxima página
3. Clique em **"Descarregar"** para baixar o PDF

### Editar Documento

1. Clique no menu (⋮) no card do documento
2. Selecione **"✏️ Editar"**
3. Modifique os dados desejados
4. Clique em **"Salvar"**

### Filtros e Busca

- **Botões de Filtro**: Filtre por tipo de documento (Todos, Manuais, Especificações, Certificados)
- **Campo de Busca**: Digite para buscar por nome, descrição ou tags

### Deletar Documento

1. Clique no menu (⋮) no card do documento
2. Selecione **"🗑️ Deletar"**
3. Confirme a exclusão

## 🗄️ Estrutura de Dados

### Tabela: `documentos`

```sql
- id: UUID (chave primária)
- user_id: UUID (referência ao usuário autenticado)
- nome: TEXT (nome do documento)
- descricao: TEXT (descrição opcional)
- arquivo_url: TEXT (URL pública do arquivo no Storage)
- arquivo_caminho: TEXT (caminho interno no Storage)
- tipo_documento: TEXT (geral, manual, especificacao, certificado)
- produto_id: UUID (opcional, referência para produto)
- tags: TEXT[] (array de tags)
- criado_em: TIMESTAMPTZ (data de criação)
- atualizado_em: TIMESTAMPTZ (data de atualização)
```

## 🔐 Segurança

- ✅ **Row Level Security (RLS)**: Cada usuário só pode acessar seus próprios documentos
- ✅ **Autenticação**: Apenas usuários autenticados podem fazer upload
- ✅ **Validação de Arquivo**: Apenas PDFs são aceitos
- ✅ **Limite de Tamanho**: Máximo 50MB por arquivo
- ✅ **Validação no Frontend**: Verificações antes do envio

## 📋 Funcionalidades Técnicas

### bibliotecas Utilizadas

- **PDF.js**: Renderização de PDFs no navegador (CDN)
- **Supabase Storage**: Armazenamento de arquivos
- **Supabase JavaScript Client**: Operações com banco de dados

### Compatibilidade

- ✅ Chrome, Firefox, Safari, Edge (navegadores modernos)
- ✅ Responsivo em mobile, tablet e desktop

## 🔍 Troubleshooting

### Erro: "Arquivo muito grande"

- Reduza o tamanho do PDF (máximo 50MB)
- Use ferramentas online para comprimir o PDF

### Erro: "Supabase não está configurado"

- Verifique se o bucket "documentos" existe em Storage
- Verifique se as políticas de RLS estão configuradas corretamente

### PDFs não aparecem

- Confirme que o bucket é público
- Verifique se a migração SQL foi executada
- Limpe o cache do navegador (Ctrl+Shift+Delete)

### Erro ao visualizar PDF

- Tente atualizar a página
- Verifique se o PDF é válido
- Tente fazer download do PDF para testar

## 🎨 Customizações Possíveis

### Adicionar mais tipos de documentos

Edite o arquivo `documentos.js` na seção `abrirModalUpload()`:

```javascript
<option value="novo_tipo">Novo Tipo</option>
```

### Modificar limite de tamanho

No arquivo `documentos.js`, função `enviarPDF()`:

```javascript
if (arquivo.size > 50 * 1024 * 1024) {
  // 50MB
  // Altere para o tamanho desejado
}
```

### Vincular documentos a produtos

A tabela de documentos possui o campo `produto_id` para futuras integrações com produtos.

## 📞 Suporte

Para dúvidas sobre o Supabase Storage:

- [Documentação oficial do Supabase](https://supabase.com/docs/guides/storage)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)

## ✨ Próximos Passos (Opcional)

- [ ] Integrar documentos com produtos (vincular automáticamente)
- [ ] Adicionar editor de PDF online
- [ ] Suportar outros formatos (Word, Excel, imagens)
- [ ] Compartilhamento de documentos entre usuários
- [ ] Histórico de versões de documentos
- [ ] Assinatura digital de PDFs
