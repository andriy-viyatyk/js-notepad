//! Document Store integration tests.
//!
//! The fixture wiki is built programmatically under `CARGO_TARGET_TMPDIR` (rather than
//! committed) so a nested `.gitignore` + `secret.md` + `node_modules/` can be exercised
//! without those files affecting the Persephone repo's own git tracking.

use std::fs;
use std::path::PathBuf;

use persephone_mneme::config::RootConfig;
use persephone_mneme::error::MnemeError;
use persephone_mneme::store::address::WikiAddress;
use persephone_mneme::store::grep::{GrepOptions, GrepResult, OutputMode};
use persephone_mneme::store::roots::RootRegistry;
use persephone_mneme::store::DocumentStore;

fn base_dir(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// Build a two-root wiki and return (store, base_dir).
fn setup(name: &str) -> (DocumentStore, PathBuf) {
    let base = base_dir(name);
    let _ = fs::remove_dir_all(&base);
    let personal = base.join("personal");
    let work = base.join("work");
    fs::create_dir_all(personal.join("notes")).unwrap();
    fs::create_dir_all(work.join("sub")).unwrap();
    fs::create_dir_all(work.join("node_modules")).unwrap();
    fs::create_dir_all(work.join(".mneme")).unwrap();

    fs::write(personal.join("index.md"), "# Personal\n\nhello world\n").unwrap();
    fs::write(personal.join("notes/day.md"), "# Day\n\nthe quick brown fox\n").unwrap();
    fs::write(personal.join("ignore-me.txt"), "not markdown\n").unwrap();

    fs::write(
        work.join("readme.md"),
        "# Work\n\npostgres tips\nThe quick fox jumps\n",
    )
    .unwrap();
    fs::write(work.join("sub/deep.md"), "# Deep\n\nnested content\n").unwrap();
    fs::write(work.join("node_modules/junk.md"), "# Junk\n").unwrap();
    fs::write(work.join(".gitignore"), "secret.md\n").unwrap();
    fs::write(work.join("secret.md"), "# Secret\n").unwrap();
    // Realistic PNG header (8-byte signature + IHDR chunk) — contains NUL bytes, so grep treats it
    // as binary and skips it.
    fs::write(
        work.join("logo.png"),
        [
            0x89u8, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, b'I', b'H',
            b'D', b'R',
        ],
    )
    .unwrap();
    // Mneme's own derived index — must stay hidden from the file tools.
    fs::write(work.join(".mneme/index.db"), [0x00u8, 0x01, 0x02]).unwrap();

    let store = DocumentStore::from_roots(vec![
        RootConfig {
            name: "personal".into(),
            folder: personal,
            include: vec!["*.md".into()],
            ignore: vec![],
        },
        RootConfig {
            name: "work".into(),
            folder: work,
            include: vec!["*.md".into()],
            ignore: vec![],
        },
    ])
    .unwrap();
    (store, base)
}

#[test]
fn list_shows_all_files_like_a_filesystem() {
    let (store, _b) = setup("listall");
    // The file tools present the whole root — markdown AND non-markdown — not the index allowlist.
    let personal = store.list(Some("personal")).unwrap();
    assert_eq!(
        personal,
        vec!["personal/ignore-me.txt", "personal/index.md", "personal/notes/day.md"]
    );
}

#[test]
fn list_includes_ignored_and_nonmarkdown_but_not_mneme() {
    let (store, _b) = setup("listwork");
    let work = store.list(Some("work")).unwrap();
    // `.gitignore`'d secret.md, node_modules, dotfiles, and binary logo.png are ALL listed —
    // only `.mneme/` (the derived index) is hidden.
    assert_eq!(
        work,
        vec![
            "work/.gitignore",
            "work/logo.png",
            "work/node_modules/junk.md",
            "work/readme.md",
            "work/secret.md",
            "work/sub/deep.md",
        ]
    );
    assert!(!work.iter().any(|a| a.contains(".mneme")));
}

#[test]
fn glob_matches_addresses() {
    let (store, _b) = setup("glob");
    // Glob now spans every file in the root, so node_modules/secret markdown surface too
    // (the index still ignores them — that's `walk_root`, not the file tools).
    let all = store.glob("**/*.md", None).unwrap();
    assert_eq!(
        all,
        vec![
            "personal/index.md",
            "personal/notes/day.md",
            "work/node_modules/junk.md",
            "work/readme.md",
            "work/secret.md",
            "work/sub/deep.md",
        ]
    );
    let personal = store.glob("personal/**/*.md", None).unwrap();
    assert_eq!(personal, vec!["personal/index.md", "personal/notes/day.md"]);
    // literal_separator: `*` does not cross `/`, so only the top-level work docs match.
    let work_top = store.glob("work/*.md", Some("work")).unwrap();
    assert_eq!(work_top, vec!["work/readme.md", "work/secret.md"]);
}

#[test]
fn grep_files_with_matches() {
    let (store, _b) = setup("grep_files");
    let opts = GrepOptions {
        output_mode: OutputMode::FilesWithMatches,
        ..Default::default()
    };
    match store.grep("postgres", None, &opts).unwrap() {
        GrepResult::Files(f) => assert_eq!(f, vec!["work/readme.md"]),
        other => panic!("expected Files, got {other:?}"),
    }
    match store.grep("fox", None, &opts).unwrap() {
        GrepResult::Files(f) => {
            assert_eq!(f, vec!["personal/notes/day.md", "work/readme.md"]);
        }
        other => panic!("expected Files, got {other:?}"),
    }
}

#[test]
fn grep_count_and_ignore_case() {
    let (store, _b) = setup("grep_count");
    let count_opts = GrepOptions {
        output_mode: OutputMode::Count,
        ..Default::default()
    };
    match store.grep("fox", None, &count_opts).unwrap() {
        GrepResult::Counts(c) => assert_eq!(
            c,
            vec![("personal/notes/day.md".to_string(), 1), ("work/readme.md".to_string(), 1)]
        ),
        other => panic!("expected Counts, got {other:?}"),
    }
    // Case-sensitive: uppercase FOX matches nothing.
    let cs = GrepOptions {
        output_mode: OutputMode::FilesWithMatches,
        ..Default::default()
    };
    match store.grep("FOX", None, &cs).unwrap() {
        GrepResult::Files(f) => assert!(f.is_empty()),
        other => panic!("expected Files, got {other:?}"),
    }
    // Case-insensitive: FOX matches both.
    let ci = GrepOptions {
        ignore_case: true,
        output_mode: OutputMode::FilesWithMatches,
        ..Default::default()
    };
    match store.grep("FOX", None, &ci).unwrap() {
        GrepResult::Files(f) => assert_eq!(f.len(), 2),
        other => panic!("expected Files, got {other:?}"),
    }
}

#[test]
fn grep_content_with_context() {
    let (store, _b) = setup("grep_content");
    let opts = GrepOptions {
        context: 1,
        output_mode: OutputMode::Content,
        ..Default::default()
    };
    match store.grep("postgres", None, &opts).unwrap() {
        GrepResult::Content(c) => {
            assert_eq!(c.len(), 1);
            let (addr, lines) = &c[0];
            assert_eq!(addr, "work/readme.md");
            // readme.md lines: 1 "# Work", 2 "", 3 "postgres tips", 4 "The quick fox jumps"
            let nums: Vec<usize> = lines.iter().map(|l| l.line_number).collect();
            assert_eq!(nums, vec![2, 3, 4]);
            assert!(lines.iter().find(|l| l.line_number == 3).unwrap().is_match);
            assert!(!lines.iter().find(|l| l.line_number == 2).unwrap().is_match);
        }
        other => panic!("expected Content, got {other:?}"),
    }
}

#[test]
fn read_write_delete_roundtrip() {
    let (store, _b) = setup("rwd");
    store.write("personal/new.md", "# New\n\nfresh\n").unwrap();
    assert_eq!(store.read("personal/new.md", None, None).unwrap(), "# New\n\nfresh\n");
    assert!(store.list(Some("personal")).unwrap().contains(&"personal/new.md".to_string()));
    store.delete("personal/new.md").unwrap();
    assert!(store.read("personal/new.md", None, None).is_err());
}

#[test]
fn read_bytes_serves_binary_attachment() {
    let (store, _b) = setup("bytes");
    // logo.png is now listed by the file tools and reachable by address.
    let bytes = store.read_bytes("work/logo.png").unwrap();
    assert_eq!(&bytes[..4], &[0x89, 0x50, 0x4e, 0x47]);
}

#[test]
fn read_returns_nonmarkdown_text() {
    let (store, _b) = setup("readtext");
    assert_eq!(store.read("personal/ignore-me.txt", None, None).unwrap(), "not markdown\n");
}

#[test]
fn mneme_dir_hidden_and_address_rejected() {
    let (store, _b) = setup("mnemeguard");
    // Never listed/globbed…
    assert!(!store.list(Some("work")).unwrap().iter().any(|a| a.contains(".mneme")));
    assert!(!store.glob("**/*", None).unwrap().iter().any(|a| a.contains(".mneme")));
    // …and not addressable directly (read/write/delete all go through WikiAddress::parse).
    assert!(WikiAddress::parse("work/.mneme/index.db").is_err());
    assert!(store.read("work/.mneme/index.db", None, None).is_err());
}

#[test]
fn grep_skips_binary_files() {
    let (store, _b) = setup("grepbin");
    // logo.png contains the literal "IHDR" but is binary (NUL bytes) → skipped, no match.
    let opts = GrepOptions {
        output_mode: OutputMode::FilesWithMatches,
        ..Default::default()
    };
    match store.grep("IHDR", None, &opts).unwrap() {
        GrepResult::Files(f) => assert!(f.is_empty(), "binary file should be skipped, got {f:?}"),
        other => panic!("expected Files, got {other:?}"),
    }
}

#[test]
fn edit_uniqueness_and_replace_all() {
    let (store, _b) = setup("edit");
    store.write("personal/e.md", "aaa bbb aaa\n").unwrap();
    // unique replace
    store.edit("personal/e.md", "bbb", "ccc", false).unwrap();
    assert_eq!(store.read("personal/e.md", None, None).unwrap(), "aaa ccc aaa\n");
    // missing string
    assert!(matches!(
        store.edit("personal/e.md", "zzz", "x", false),
        Err(MnemeError::EditNotFound)
    ));
    // non-unique without replace_all
    assert!(matches!(
        store.edit("personal/e.md", "aaa", "x", false),
        Err(MnemeError::EditNotUnique(2))
    ));
    // replace_all succeeds
    store.edit("personal/e.md", "aaa", "x", true).unwrap();
    assert_eq!(store.read("personal/e.md", None, None).unwrap(), "x ccc x\n");
}

#[test]
fn address_parsing_rejects_traversal() {
    assert!(WikiAddress::parse("work/notes/x.md").is_ok());
    assert!(WikiAddress::parse("work/../../secret").is_err());
    assert!(WikiAddress::parse("/etc/passwd").is_err());
    assert!(WikiAddress::parse("").is_err());
    let a = WikiAddress::parse("work").unwrap();
    assert_eq!(a.root, "work");
    assert_eq!(a.rest, "");
}

#[test]
fn unknown_root_is_an_error() {
    let (store, _b) = setup("unknown");
    assert!(matches!(
        store.read("nope/x.md", None, None),
        Err(MnemeError::UnknownRoot(_))
    ));
}

#[test]
fn root_add_invariants() {
    let base = base_dir("roots");
    let _ = fs::remove_dir_all(&base);
    let r1 = base.join("r1");
    let r1_sub = r1.join("sub");
    let r2 = base.join("r2");
    fs::create_dir_all(&r1_sub).unwrap();
    fs::create_dir_all(&r2).unwrap();

    let mut reg = RootRegistry::from_config(vec![]).unwrap();
    reg.add(r1.clone(), Some("r1".into())).unwrap();

    // duplicate name
    assert!(matches!(
        reg.add(r2.clone(), Some("r1".into())),
        Err(MnemeError::DuplicateRoot(_))
    ));
    // missing folder
    assert!(matches!(
        reg.add(base.join("does-not-exist"), Some("x".into())),
        Err(MnemeError::FolderMissing(_))
    ));
    // overlapping (sub-folder of an existing root)
    assert!(matches!(
        reg.add(r1_sub.clone(), Some("y".into())),
        Err(MnemeError::OverlappingRoot(_))
    ));
    // a non-overlapping sibling is fine; name defaults to the basename
    let added = reg.add(r2.clone(), None).unwrap();
    assert_eq!(added.name, "r2");
}

#[test]
fn invalid_root_name_rejected() {
    let base = base_dir("badname");
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let mut reg = RootRegistry::from_config(vec![]).unwrap();
    assert!(matches!(
        reg.add(base.clone(), Some("has space".into())),
        Err(MnemeError::InvalidRootName(_, _))
    ));
    assert!(matches!(
        reg.add(base.clone(), Some("has/slash".into())),
        Err(MnemeError::InvalidRootName(_, _))
    ));
}
