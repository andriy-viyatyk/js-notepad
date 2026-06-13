//! Vector-lane helpers for hybrid search: f32 BLOB packing + Reciprocal Rank Fusion.
//!
//! `sqlite-vec` stores and matches embeddings as a packed little-endian `f32` BLOB; [`to_blob`]
//! produces that wire form. [`rrf_merge`] fuses the FTS and vector rankings into a single
//! best-first order (the ~30-line app-level RRF that D4/D7 call for).

use std::collections::HashMap;

/// Pack a normalized embedding into the little-endian `f32` BLOB sqlite-vec stores / matches
/// (`dims * 4` bytes).
pub fn to_blob(v: &[f32]) -> Vec<u8> {
    let mut b = Vec::with_capacity(v.len() * 4);
    for x in v {
        b.extend_from_slice(&x.to_le_bytes());
    }
    b
}

/// RRF constant — the standard 60 (Cormack et al. 2009). Larger flattens the rank weighting.
pub const RRF_K: f64 = 60.0;

/// Fuse two rankings of the same doc-id space into Reciprocal Rank Fusion scores
/// (**higher = better**). `text_ranked` / `vec_ranked` are doc-ids in best-first order
/// (index 0 = rank 0 = best). A doc contributes `1/(RRF_K + rank)` from each lane it appears in.
/// Returns `(doc_id, score)` for every doc in either list, sorted by score descending with
/// doc-id as a deterministic tiebreaker.
pub fn rrf_merge(text_ranked: &[i64], vec_ranked: &[i64]) -> Vec<(i64, f64)> {
    let mut scores: HashMap<i64, f64> = HashMap::new();
    for lane in [text_ranked, vec_ranked] {
        for (rank, &doc_id) in lane.iter().enumerate() {
            *scores.entry(doc_id).or_insert(0.0) += 1.0 / (RRF_K + rank as f64);
        }
    }
    let mut out: Vec<(i64, f64)> = scores.into_iter().collect();
    out.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(&b.0))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_blob_length_and_roundtrip() {
        let v = vec![1.0f32, -2.5, 0.0, 3.25];
        let b = to_blob(&v);
        assert_eq!(b.len(), v.len() * 4);
        let back: Vec<f32> = b
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        assert_eq!(v, back);
    }

    #[test]
    fn rrf_top_in_both_lanes_wins() {
        // doc 7 is rank 0 in BOTH lanes → strictly highest fused score.
        let text = [7, 3, 9];
        let vec = [7, 3, 1];
        let fused = rrf_merge(&text, &vec);
        assert_eq!(fused[0].0, 7);
    }

    #[test]
    fn rrf_symmetric_in_lane_order() {
        let a = rrf_merge(&[1, 2, 3], &[3, 2, 1]);
        let b = rrf_merge(&[3, 2, 1], &[1, 2, 3]);
        // Same id set + same fused scores regardless of which list is "text" vs "vector".
        let to_map = |v: Vec<(i64, f64)>| v.into_iter().collect::<std::collections::HashMap<_, _>>();
        let (ma, mb) = (to_map(a), to_map(b));
        assert_eq!(ma.len(), mb.len());
        for (k, va) in &ma {
            assert!((va - mb[k]).abs() < 1e-12);
        }
    }

    #[test]
    fn rrf_missing_from_a_lane_contributes_nothing() {
        // doc 5 only in vector lane; doc 1 in both → doc 1 outranks doc 5.
        let fused = rrf_merge(&[1], &[1, 5]);
        assert_eq!(fused[0].0, 1);
        assert!(fused.iter().any(|(d, _)| *d == 5));
    }
}
