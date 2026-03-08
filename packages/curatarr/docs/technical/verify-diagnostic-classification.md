# Deep Check Runtime

This is the runtime behavior for `src/scanner/deepcheck.ts`.

## Sampling strategy

- Goal: catch high-impact corruption in large files without full decode.
- Uses ffmpeg null decode with video+audio streams only:
  - `-map 0:v? -map 0:a? -sn -dn -f null -`
- Random-sampling windows:
  - Per-file budget is user-controlled (`30` to `3600` seconds, default `30`).
  - Runtime creates multiple short sample windows across random offsets.
  - When duration is known, sampling is stratified across start/middle/end regions with extra random offsets.
  - Re-runs sample different offsets, so long-running repeated checks increase coverage over time.
  - If duration is unknown/invalid, runtime samples from the start only.

## Failure signals (hard fail)

Only curated high-signal diagnostics fail verification:

- Decode/bitstream faults:
  - `Invalid NAL unit size`
  - `decode_slice_header error`
  - `error while decoding`
  - `non-existing PPS`, `PPS/SPS id out of range`
  - `missing reference picture`
  - `corrupt`, `truncated`, `packet too small`
  - `invalid ... bitstream`
- Container/mux faults:
  - `moov atom not found`
  - `invalid data found when processing input`
  - `error reading header`
  - `invalid atom size`
- Runtime limits:
  - Spawn failure (`spawn error: ...`)
  - Sampling budget timeout (`timeout: file check exceeded <N>s budget`)

## Quality flags (non-fail metadata)

- `backward_pts` (FLAG): non-monotonic/out-of-order DTS/PTS detected.
- `decode_error` (FLAG): count+sample of decode faults.
- `mux_error` (FLAG): count+sample of mux/container faults.

## Ignored noise

Known non-actionable lines are ignored, including:

- Null-mux chatter (`Automatic encoder selection failed ... format null`)
- `pts has no value`
- Subtitle-only probe messages like:
  - `Could not find codec parameters ... (Subtitle ...): unspecified size`

These are ignored because they are commonly non-fatal for main video/audio playback.
