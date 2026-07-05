// persephone-snip: Native screen snip tool + Windows file-clipboard helper.
//
// No arguments (default): captures all monitors, shows fullscreen overlays,
// lets the user draw a selection rectangle, then writes the cropped PNG to
// stdout.
//   Exit codes: 0 — success (PNG written to stdout)
//               1 — cancelled or error (nothing written)
//
// Subcommands (US-807):
//   clipboard-read           — CF_HDROP file list + drop effect as JSON to stdout
//   clipboard-write [--cut]  — set CF_HDROP from stdin path list (see clipboard.rs)

mod capture;
mod clipboard;
mod overlay;

use std::io::Write;

#[link(name = "user32")]
extern "system" {
    fn SetProcessDpiAwarenessContext(value: isize) -> i32;
}
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: isize = -4;

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("clipboard-read") => clipboard::read(),
        Some("clipboard-write") => clipboard::write(std::env::args().any(|a| a == "--cut")),
        _ => run_snip(),
    }
}

fn run_snip() {
    // Declare Per-Monitor DPI V2 awareness so that EnumDisplayMonitors,
    // GetDC, BitBlt, and CreateWindowExW all use physical pixel coordinates.
    // Without this, mixed-DPI setups produce mismatched capture/window sizes.
    unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2); }

    // 1. Enumerate monitors.
    let monitors = capture::enumerate_monitors();
    if monitors.is_empty() {
        std::process::exit(1);
    }

    // 2. Capture each monitor's screen.
    let captures = capture::capture_monitors(&monitors);
    if captures.is_empty() {
        std::process::exit(1);
    }

    // 3. Show overlays and wait for selection.
    let result = match overlay::run(captures) {
        Some(r) => r,
        None => std::process::exit(1),
    };

    // 4. Encode as PNG and write to stdout.
    let png_data = encode_png(&result.pixels, result.width, result.height);

    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    if out.write_all(&png_data).is_err() {
        std::process::exit(1);
    }
    let _ = out.flush();
}

/// Encode BGRA pixels as an RGB PNG.
fn encode_png(bgra: &[u8], width: u32, height: u32) -> Vec<u8> {
    let pixel_count = (width as usize) * (height as usize);
    let mut rgb = Vec::with_capacity(pixel_count * 3);
    for chunk in bgra.chunks_exact(4) {
        rgb.push(chunk[2]); // R
        rgb.push(chunk[1]); // G
        rgb.push(chunk[0]); // B
    }

    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("PNG header");
        writer.write_image_data(&rgb).expect("PNG data");
    }
    buf
}
