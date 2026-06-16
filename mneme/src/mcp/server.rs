//! rmcp adapter — `MnemeServer` maps the tools and `mneme://` resources onto
//! [`ServerState`], and `serve` runs the Streamable HTTP server on loopback. Thin by design:
//! every tool delegates straight to a `ServerState` method (all the real work + blocking I/O
//! lives there), so the surface is testable without an HTTP transport.

use std::path::PathBuf;
use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler};

use crate::config::Config;
use crate::error::MnemeError;

use super::params::*;
use super::{ReadOutcome, ResourceBody, ServerState};

const GUIDE: &str = include_str!("../../assets/wiki-guide.md");
const GUIDE_URI: &str = "mneme://guide";
/// Readable snapshot of the `status` tool as JSON. (Subscriptions, US-670, fire for document URIs
/// `mneme://{root}/{path}` via the watcher — not for this synthetic status resource.)
const STATUS_URI: &str = "mneme://status";

const INSTRUCTIONS: &str = "\
Mneme is a markdown knowledge base. A root may be a wiki, notes, worklog, or any markdown folder. \
Files on disk are the source of truth; the index is derived. Address every document as {root}/{path} \
(matching the resource URI mneme://{root}/{path}). Use the file-like tools (read/write/edit/glob/grep) \
exactly as you would local files, and search for relevance ranking. read returns images as viewable \
pictures; upload stores a binary file (image/PDF/diagram) from base64. Reorganize like a filesystem: \
mkdir creates a folder, rename moves/renames a file or folder, and delete removes a file or a whole \
folder (recursive). The file tools \
(read/write/edit/glob/grep/tree) see the entire root like a filesystem (only .mneme/ is hidden); \
include/ignore configure indexing/search only, not file visibility. search supports text (FTS), \
vector (semantic KNN), and hybrid (FTS + vector fused with RRF, the default) modes; vector/hybrid \
degrade to text with a note until the embedding model is provisioned (model_update). Read \
mneme://guide for the full tool reference.";

#[derive(Clone)]
pub struct MnemeServer {
    state: Arc<ServerState>,
    tool_router: ToolRouter<MnemeServer>,
    /// Stable id for this MCP session (US-670) — keys its resource subscriptions in the registry.
    /// `#[derive(Clone)]` copies it, so rmcp-internal clones stay the same session.
    session: u64,
}

impl MnemeServer {
    pub fn new(state: Arc<ServerState>) -> Self {
        let session = state.next_session_id();
        Self {
            state,
            tool_router: Self::tool_router(),
            session,
        }
    }
}

fn to_mcp(e: MnemeError) -> McpError {
    McpError::internal_error(e.to_string(), None)
}

fn structured<T: serde::Serialize>(value: T) -> std::result::Result<CallToolResult, McpError> {
    let v = serde_json::to_value(value).map_err(|e| McpError::internal_error(e.to_string(), None))?;
    Ok(CallToolResult::structured(v))
}

fn ok_text() -> CallToolResult {
    CallToolResult::success(vec![Content::text("ok")])
}

#[tool_router]
impl MnemeServer {
    #[tool(description = r##"Read a document by {root}/{path} (≈ Read). A root may be a wiki, notes, worklog, or any markdown folder. UTF-8 text (markdown or not) returns content + parsed frontmatter. Images (png/jpg/gif/webp) are returned as a viewable image. Other binary (pdf/zip/…) returns a short notice — fetch such files through the UI, not as text. Example: read {"path":"personal/contacts/jane.md"} → {"content":"# Jane Doe\nReach Jane at jane.doe@acme.com.","frontmatter":{"title":"Jane Doe","tags":["contact","work"],"created":"2026-06-13","verified":null}}"##)]
    async fn read(&self, Parameters(p): Parameters<ReadParams>) -> std::result::Result<CallToolResult, McpError> {
        match self.state.read_doc(p).await.map_err(to_mcp)? {
            ReadOutcome::Text(r) => structured(r),
            ReadOutcome::Image { base64, mime, note } => Ok(CallToolResult::success(vec![
                Content::image(base64, mime.to_string()),
                Content::text(note),
            ])),
            ReadOutcome::Binary { note } => Ok(CallToolResult::success(vec![Content::text(note)])),
        }
    }

    #[tool(description = r##"Write a whole document (content includes YAML frontmatter at the top); indexes it synchronously (≈ Write). Text/markdown only — for binary files (images/PDFs/diagrams) use upload. Example: write {"path":"personal/contacts/jane.md","content":"---\ntitle: Jane Doe\ntags: [contact, work]\n---\n# Jane Doe\nReach Jane at jane@acme.com."} → "ok""##)]
    async fn write(&self, Parameters(p): Parameters<WriteParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.write_doc(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Create/overwrite a BINARY file (image/PDF/diagram) from base64 bytes. For text/markdown use write. The file is stored and listable (glob) but not indexed/searched. Example: upload {"path":"work/diagrams/arch.png","contentBase64":"iVBORw0KGgo…"} → "ok""##)]
    async fn upload(&self, Parameters(p): Parameters<UploadParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.upload(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Exact string replacement in a document; re-indexes it (≈ Edit). Example: edit {"path":"personal/contacts/jane.md","old_string":"jane@acme.com","new_string":"jane.doe@acme.com"} → "ok""##)]
    async fn edit(&self, Parameters(p): Parameters<EditParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.edit_doc(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Delete a file, OR a folder and everything under it (recursive — like rm -r); the index follows. Example: delete {"path":"personal/contacts/jane.md"} → "ok"; delete {"path":"personal/old-notes"} → "ok" (removes the folder and all its documents)."##)]
    async fn delete(&self, Parameters(p): Parameters<DeleteParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.delete_doc(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Create an empty folder (≈ mkdir -p; parents created as needed). Folders aren't indexed; the new folder shows up in tree right away. Files are created with write/upload — you don't need mkdir first (write creates parent folders). Example: mkdir {"path":"personal/projects/2026"} → "ok""##)]
    async fn mkdir(&self, Parameters(p): Parameters<MkdirParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.mkdir(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Move or rename a file or folder within a root (atomic; also handles extension changes — the index follows). Refuses to overwrite an existing destination. Example: rename {"from":"personal/draft.md","to":"personal/notes/2026/plan.md"} → "ok" (moves + renames); rename {"from":"personal/old","to":"personal/archive"} → "ok" (renames a folder and all its contents)."##)]
    async fn rename(&self, Parameters(p): Parameters<RenameParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.rename(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Find files by path/name glob against the full {root}/{path} (≈ Glob). Lists EVERY file in the root — markdown and non-markdown alike (.html/.png/.pdf/…), like a filesystem; only .mneme/ is hidden. (include/ignore configure indexing/search, not file listing.) Example: glob {"pattern":"personal/contacts/*"} → {"matches":["personal/contacts/jane.md","personal/contacts/jane.png"]}"##)]
    async fn glob(&self, Parameters(p): Parameters<GlobParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.glob(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Literal/regex content scan over the root's text files (≈ Grep); binary files are skipped; not FTS. Optional tags/dateRange restrict to matching .md docs; -n toggles line numbers. Example: grep {"pattern":"acme\\.com","path":"personal"} → {"mode":"files_with_matches","files":["personal/contacts/jane.md"]}"##)]
    async fn grep(&self, Parameters(p): Parameters<GrepParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.grep(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Ranked search (mode text|vector|hybrid, default hybrid) with optional subtree/tags/excludeTags/dateRange filters; subtree scopes to a {root} or sub-path within it (e.g. personal or personal/contacts; omit to search all roots); topK caps the result count (default 5, kept small to conserve context — pass a higher topK when you need more breadth); one row per doc {uri,title,tags,snippet,score}, best-first (rely on order, not the score). vector/hybrid degrade to text when no model is provisioned. Example: search {"query":"how do I reach Jane","mode":"hybrid","subtree":"personal"} → {"results":[{"uri":"mneme://personal/contacts/jane.md","title":"Jane Doe","tags":["contact","work"],"snippet":"Jane Doe — Reach Jane at jane.doe@acme.com.","score":0.0166}]}"##)]
    async fn search(&self, Parameters(p): Parameters<SearchParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.search(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Category/document tree as a flat depth-first list of {uri,name,isDir,depth} (depth = absolute slash count of the address); path scopes to a {root} or sub-category (e.g. personal or personal/contacts); optional depth limits levels below path (1 = the path node + its immediate children; omit for the whole subtree). Example: tree {"path":"personal/contacts","depth":1} → {"entries":[{"uri":"mneme://personal/contacts","name":"contacts","isDir":true,"depth":1},{"uri":"mneme://personal/contacts/jane.md","name":"jane.md","isDir":false,"depth":2}]}"##)]
    async fn tree(&self, Parameters(p): Parameters<TreeParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.tree(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Daily-log timeline (log-tagged docs under log/, date parsed from filename), newest first; subtree/tags/from/to filter. Example: timeline {"subtree":"personal"} → {"entries":[{"uri":"mneme://personal/log/2026/2026-06-13.md","title":"2026-06-13","date":"2026-06-13","tags":["log"]}]}"##)]
    async fn timeline(&self, Parameters(p): Parameters<TimelineParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.timeline(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Distinct tags + document counts (autocomplete / free-form vocabulary); subtree scopes. Example: tags {"subtree":"personal"} → {"tags":[{"tag":"contact","count":1},{"tag":"work","count":1}]}"##)]
    async fn tags(&self, Parameters(p): Parameters<TagsParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.tags(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Register a new root (folder = existing OS path; name = the id used in mneme:// URIs — unique, non-overlapping; defaults to the folder basename). Example: add_root {"folder":"C:/Users/me/personal","name":"personal"} → {"name":"personal","folder":"C:/Users/me/personal"}"##)]
    async fn add_root(&self, Parameters(p): Parameters<AddRootParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.add_root(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Remove a root by name and delete its on-disk .mneme index folder (the index is derived — re-add the folder to rebuild it). Example: remove_root {"root":"personal"} → "ok""##)]
    async fn remove_root(&self, Parameters(p): Parameters<RemoveRootParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.remove_root(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"List registered roots. Example: list_roots {} → {"roots":[{"name":"personal","folder":"C:/Users/me/personal"}]}"##)]
    async fn list_roots(&self) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.list_roots().await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Read or update a root's include/ignore glob filters. These are INDEXING filters only — they decide what search/FTS index, NOT what the file tools (glob/grep/tree/read) list or read (those see the whole root). Omit both include and ignore to read; provide either to update (the given list replaces that filter, the omitted one is kept). Updates apply live — re-applied, watcher restarted, root reindexed (newly-matching files added, no-longer-matching removed) — and persist to mneme.toml. include defaults to ["*.md"] (an empty include falls back to that default); ignore is gitignore-style on top of the built-in defaults (.git, .mneme, node_modules, target, dist, build). Example: root_config {"root":"personal","include":["*.md","*.txt"]} → {"name":"personal","folder":"C:/Users/me/personal","include":["*.md","*.txt"],"ignore":[]}"##)]
    async fn root_config(&self, Parameters(p): Parameters<RootConfigParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.root_config(p).await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Reconcile the index with the files; path scopes to a {root}. Cancellable, emits progress notifications (send a progressToken), returns per-root stats. Example: reindex {"path":"personal"} → {"roots":[{"name":"personal","scanned":1,"indexed":0,"refreshed":0,"skipped":1,"vectorized":0,"deleted":0,"errors":0}]}"##)]
    async fn reindex(
        &self,
        Parameters(p): Parameters<ReindexParams>,
        ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResult, McpError> {
        // Stream reconcile progress to the client when it opted in with a progressToken; cancel
        // when the client sends notifications/cancelled (ctx.ct).
        let token = ctx.meta.get_progress_token();
        let peer = ctx.peer.clone();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let pump = tokio::spawn(async move {
            while let Some((root, p)) = rx.recv().await {
                if let Some(tok) = token.clone() {
                    let p: crate::indexer::ReindexProgress = p;
                    let _ = peer
                        .notify_progress(ProgressNotificationParam {
                            progress_token: tok,
                            progress: p.processed as f64,
                            total: Some(p.total as f64),
                            message: Some(format!("{root}: {}", p.phase.as_str())),
                        })
                        .await;
                }
            }
        });
        let result = self.state.reindex(p, ctx.ct.clone(), tx).await.map_err(to_mcp)?;
        let _ = pump.await;
        structured(result)
    }

    #[tool(description = r##"Roots, index inventory (versioned DB path + size), model, and document counts. Example: status {} → {"roots":[{"name":"personal","folder":"C:/Users/me/personal","docCount":1,"model":"gte-multilingual-base","precision":"int8","schemaVer":2,"indexPath":"C:/Users/me/personal/.mneme/gte-multilingual-base-int8/index-v2.db","indexBytes":4096}],"model":{"name":"gte-multilingual-base","precision":"int8","complete":true}}"##)]
    async fn status(&self) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.status().await.map_err(to_mcp)?)
    }

    #[tool(description = r##"Delete a stale/inactive versioned index DB (refuses the active one); identify it by the modelId + schemaVer from status. Example: index_delete {"root":"personal","modelId":"gte-multilingual-base-int8","schemaVer":1} → "ok""##)]
    async fn index_delete(&self, Parameters(p): Parameters<IndexDeleteParams>) -> std::result::Result<CallToolResult, McpError> {
        self.state.index_delete(p).await.map_err(to_mcp)?;
        Ok(ok_text())
    }

    #[tool(description = r##"Download/verify the configured embedding model into the cache (enables vector/hybrid search). Returns immediately and downloads in the background; poll wiki_status.model (download.{phase,bytesDone,bytesTotal}, and complete=true when done) for progress. Calling again while a download is in flight is a no-op. Example: model_update {} → {"name":"gte-multilingual-base","precision":"int8","version":"1","complete":false,"files":[...],"download":{"phase":"downloading","bytesDone":12345678,"bytesTotal":357000000}}"##)]
    async fn model_update(&self, Parameters(p): Parameters<ModelUpdateParams>) -> std::result::Result<CallToolResult, McpError> {
        structured(self.state.model_update(false, p.model).await.map_err(to_mcp)?)
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for MnemeServer {
    fn get_info(&self) -> ServerInfo {
        // Identify as Mneme — rmcp's default `from_build_env()` would report the rmcp crate
        // name/version ("rmcp"/"1.7.0") to every client (incl. the Persephone MCP Inspector).
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                // Live refresh (US-670): clients subscribe to mneme://{root}/{path}; the watcher
                // emits resources/updated, and add/remove/rename emit resources/list_changed.
                .enable_resources_subscribe()
                .enable_resources_list_changed()
                .build(),
        )
        .with_server_info(
            Implementation::new("persephone-mneme", env!("CARGO_PKG_VERSION")).with_title("Mneme"),
        )
        .with_instructions(INSTRUCTIONS)
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<ListResourcesResult, McpError> {
        // Register this session's peer so it receives resources/list_changed broadcasts even if it
        // never subscribes to a specific document (US-670 — e.g. a tree view).
        self.state.subscriptions().touch(self.session, &ctx.peer);
        let guide = RawResource::new(GUIDE_URI, "Mneme agent guide").no_annotation();
        let status = RawResource::new(STATUS_URI, "Mneme service status").no_annotation();
        Ok(ListResourcesResult::with_all_items(vec![guide, status]))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<ListResourceTemplatesResult, McpError> {
        let template = RawResourceTemplate {
            uri_template: "mneme://{root}/{path}".to_string(),
            name: "Document or attachment".to_string(),
            title: None,
            description: Some(
                "Read a document or binary attachment by its {root}/{path} address.".to_string(),
            ),
            mime_type: None,
            icons: None,
        }
        .no_annotation();
        Ok(ListResourceTemplatesResult::with_all_items(vec![template]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<ReadResourceResult, McpError> {
        self.state.subscriptions().touch(self.session, &ctx.peer);
        let uri = request.uri;
        if uri == GUIDE_URI {
            return Ok(ReadResourceResult::new(vec![ResourceContents::text(GUIDE, uri)]));
        }
        if uri == STATUS_URI {
            let status = self.state.status().await.map_err(to_mcp)?;
            let json = serde_json::to_string_pretty(&status).map_err(|e| {
                McpError::internal_error(
                    "failed to serialize status",
                    Some(serde_json::json!({ "error": e.to_string() })),
                )
            })?;
            return Ok(ReadResourceResult::new(vec![ResourceContents::text(json, uri)]));
        }
        let addr = uri.strip_prefix("mneme://").ok_or_else(|| {
            McpError::resource_not_found("unknown uri scheme", Some(serde_json::json!({ "uri": uri })))
        })?;
        let body = self
            .state
            .read_resource_body(addr.to_string())
            .await
            .map_err(to_mcp)?;
        let contents = match body {
            ResourceBody::Text(text) => ResourceContents::text(text, uri),
            ResourceBody::Blob(b64) => ResourceContents::blob(b64, uri),
        };
        Ok(ReadResourceResult::new(vec![contents]))
    }

    async fn subscribe(
        &self,
        request: SubscribeRequestParams,
        ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<(), McpError> {
        // Record (session, uri) → peer; the watcher fan-out pushes resources/updated for it (US-670).
        self.state
            .subscriptions()
            .subscribe(self.session, &ctx.peer, request.uri);
        Ok(())
    }

    async fn unsubscribe(
        &self,
        request: UnsubscribeRequestParams,
        _ctx: RequestContext<RoleServer>,
    ) -> std::result::Result<(), McpError> {
        self.state
            .subscriptions()
            .unsubscribe(self.session, &request.uri);
        Ok(())
    }
}

/// Run the MCP server over Streamable HTTP on `bind:port` (loopback). Builds a tokio runtime
/// (so the CLI's other commands stay synchronous), prints the single stdout readiness line once
/// the listener is bound, and serves until Ctrl-C.
pub fn serve(cfg: Config, config_path: PathBuf, bind: &str, port: u16) -> crate::error::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let bind = bind.to_string();
    rt.block_on(async move {
        let state = ServerState::new(cfg, config_path)?;
        // Start the watcher→subscriber fan-out (US-670) now that we're inside the tokio runtime.
        state.spawn_fanout();
        let service = StreamableHttpService::new(
            {
                let state = Arc::clone(&state);
                move || Ok(MnemeServer::new(Arc::clone(&state)))
            },
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default(),
        );
        let app = axum::Router::new().nest_service("/mcp", service);
        let listener = tokio::net::TcpListener::bind((bind.as_str(), port)).await?;
        // The single allowed stdout line — the spawner (Persephone) waits for it before connecting.
        println!("listening on {bind}:{port}");
        tracing::info!("mneme MCP server listening on {bind}:{port}/mcp");
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await?;
        Ok::<(), MnemeError>(())
    })
}
