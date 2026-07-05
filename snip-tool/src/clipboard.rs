// Windows file-clipboard interop (CF_HDROP + "Preferred DropEffect").
//
// Subcommands (dispatched from main.rs):
//   clipboard-read           — print {"paths":[...],"dropEffect":"copy"|"cut"|"none"}
//                              to stdout. No files on the clipboard is NOT an
//                              error: empty list, dropEffect "none", exit 0.
//   clipboard-write [--cut]  — read UTF-8 paths from stdin (one per line) and
//                              put them on the clipboard as CF_HDROP with the
//                              matching Preferred DropEffect. An EMPTY path
//                              list just empties the clipboard (used to consume
//                              a "cut" clipboard after a successful paste, the
//                              way Windows Explorer does).
//
// Exit codes: 0 — success, 1 — clipboard could not be opened / written.

use std::io::Read;

use windows_sys::Win32::Foundation::{HANDLE, HGLOBAL};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};

/// Standard clipboard format for shell file lists. Defined locally to avoid
/// pulling the whole Win32_System_Ole feature for one constant.
const CF_HDROP: u32 = 15;

/// DROPFILES header preceding the path list in a CF_HDROP block (shellapi.h).
/// 20 bytes; `p_files` is the offset from the start of the block to the path
/// list, `f_wide` selects UTF-16 (1) vs ANSI (0) paths.
#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt_x: i32,
    pt_y: i32,
    f_nc: i32,
    f_wide: i32,
}

const DROPFILES_SIZE: usize = std::mem::size_of::<DropFiles>();

// Preferred DropEffect DWORD values (oleidl.h DROPEFFECT_*).
const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;
const DROPEFFECT_LINK: u32 = 4;

fn drop_effect_format() -> u32 {
    let name: Vec<u16> = "Preferred DropEffect"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe { RegisterClipboardFormatW(name.as_ptr()) }
}

/// The clipboard is a shared resource — another process may hold it open for a
/// moment. Retry briefly before giving up.
fn open_clipboard_retry() -> bool {
    for attempt in 0..10 {
        if unsafe { OpenClipboard(0) } != 0 {
            return true;
        }
        if attempt < 9 {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    false
}

// ── read ────────────────────────────────────────────────────────────────────

pub fn read() -> ! {
    let (paths, effect) = read_clipboard().unwrap_or((Vec::new(), "none"));
    let mut json = String::from("{\"paths\":[");
    for (i, p) in paths.iter().enumerate() {
        if i > 0 {
            json.push(',');
        }
        json.push('"');
        json.push_str(&json_escape(p));
        json.push('"');
    }
    json.push_str("],\"dropEffect\":\"");
    json.push_str(effect);
    json.push_str("\"}");
    println!("{}", json);
    std::process::exit(0);
}

/// None ⇒ nothing usable on the clipboard (treated as empty, not an error).
fn read_clipboard() -> Option<(Vec<String>, &'static str)> {
    if !open_clipboard_retry() {
        return None;
    }
    let result = unsafe { read_clipboard_locked() };
    unsafe { CloseClipboard() };
    result
}

unsafe fn read_clipboard_locked() -> Option<(Vec<String>, &'static str)> {
    if IsClipboardFormatAvailable(CF_HDROP) == 0 {
        return None;
    }
    let handle = GetClipboardData(CF_HDROP);
    if handle == 0 {
        return None;
    }
    let ptr = GlobalLock(handle as HGLOBAL) as *const u8;
    if ptr.is_null() {
        return None;
    }
    let size = GlobalSize(handle as HGLOBAL);
    let paths = if size >= DROPFILES_SIZE {
        let header = std::ptr::read_unaligned(ptr as *const DropFiles);
        let offset = header.p_files as usize;
        if offset >= size {
            Vec::new()
        } else if header.f_wide != 0 {
            parse_wide_list(ptr.add(offset) as *const u16, (size - offset) / 2)
        } else {
            parse_ansi_list(ptr.add(offset), size - offset)
        }
    } else {
        Vec::new()
    };
    GlobalUnlock(handle as HGLOBAL);
    if paths.is_empty() {
        return None;
    }

    // Copy vs cut. Explorer writes 5 (COPY|LINK) on Ctrl+C and 2 (MOVE) on
    // Ctrl+X. Absent format ⇒ treat as copy (the safe default).
    let mut effect = "copy";
    let fmt = drop_effect_format();
    if fmt != 0 && IsClipboardFormatAvailable(fmt) != 0 {
        let h = GetClipboardData(fmt);
        if h != 0 {
            let p = GlobalLock(h as HGLOBAL) as *const u8;
            if !p.is_null() {
                if GlobalSize(h as HGLOBAL) >= 4 {
                    let value = std::ptr::read_unaligned(p as *const u32);
                    if value & DROPEFFECT_MOVE != 0 && value & DROPEFFECT_COPY == 0 {
                        effect = "cut";
                    }
                }
                GlobalUnlock(h as HGLOBAL);
            }
        }
    }
    Some((paths, effect))
}

/// Parse a double-NUL-terminated UTF-16 string list.
fn parse_wide_list(ptr: *const u16, max_units: usize) -> Vec<String> {
    let units = unsafe { std::slice::from_raw_parts(ptr, max_units) };
    let mut paths = Vec::new();
    let mut start = 0;
    for (i, &u) in units.iter().enumerate() {
        if u == 0 {
            if i == start {
                break; // empty string = end of list
            }
            paths.push(String::from_utf16_lossy(&units[start..i]));
            start = i + 1;
        }
    }
    paths
}

/// Parse a double-NUL-terminated ANSI string list (legacy producers only).
/// Bytes are mapped as Latin-1 — good enough for the rare ANSI case.
fn parse_ansi_list(ptr: *const u8, max_bytes: usize) -> Vec<String> {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, max_bytes) };
    let mut paths = Vec::new();
    let mut start = 0;
    for (i, &b) in bytes.iter().enumerate() {
        if b == 0 {
            if i == start {
                break;
            }
            paths.push(bytes[start..i].iter().map(|&c| c as char).collect());
            start = i + 1;
        }
    }
    paths
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

// ── write ───────────────────────────────────────────────────────────────────

pub fn write(cut: bool) -> ! {
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        std::process::exit(1);
    }
    let paths: Vec<&str> = input
        .lines()
        .map(|l| l.trim_end_matches('\r').trim())
        .filter(|l| !l.is_empty())
        .collect();

    if !open_clipboard_retry() {
        std::process::exit(1);
    }
    let ok = unsafe { write_clipboard_locked(&paths, cut) };
    unsafe { CloseClipboard() };
    std::process::exit(if ok { 0 } else { 1 });
}

unsafe fn write_clipboard_locked(paths: &[&str], cut: bool) -> bool {
    if EmptyClipboard() == 0 {
        return false;
    }
    if paths.is_empty() {
        return true; // empty list ⇒ just clear the clipboard
    }

    // DROPFILES header + UTF-16 paths, each NUL-terminated, plus a final NUL.
    let mut buf: Vec<u8> = Vec::new();
    let header = DropFiles {
        p_files: DROPFILES_SIZE as u32,
        pt_x: 0,
        pt_y: 0,
        f_nc: 0,
        f_wide: 1,
    };
    buf.extend_from_slice(std::slice::from_raw_parts(
        &header as *const DropFiles as *const u8,
        DROPFILES_SIZE,
    ));
    for path in paths {
        for unit in path.encode_utf16() {
            buf.extend_from_slice(&unit.to_le_bytes());
        }
        buf.extend_from_slice(&0u16.to_le_bytes());
    }
    buf.extend_from_slice(&0u16.to_le_bytes());

    if !set_clipboard_bytes(CF_HDROP, &buf) {
        return false;
    }

    let fmt = drop_effect_format();
    if fmt == 0 {
        return false;
    }
    let effect: u32 = if cut {
        DROPEFFECT_MOVE
    } else {
        DROPEFFECT_COPY | DROPEFFECT_LINK
    };
    set_clipboard_bytes(fmt, &effect.to_le_bytes())
}

/// Copy `bytes` into a GMEM_MOVEABLE block and hand it to the clipboard.
/// On success the system owns the block; it must not be freed here.
unsafe fn set_clipboard_bytes(format: u32, bytes: &[u8]) -> bool {
    let hmem = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
    if hmem.is_null() {
        return false;
    }
    let ptr = GlobalLock(hmem) as *mut u8;
    if ptr.is_null() {
        return false;
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
    GlobalUnlock(hmem);
    SetClipboardData(format, hmem as HANDLE) != 0
}
