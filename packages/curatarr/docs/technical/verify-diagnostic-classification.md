# Verify Diagnostic Classification

Curatarr Deep Verify classifies ffmpeg/ffprobe diagnostics into high-signal buckets so users see actionable issues instead of noisy logs.

## Actionable `FLAG` diagnostics

These patterns are treated as real faults and will mark verification as failed:

- Bitstream/decode faults (`decode_error`)
  - `Invalid NAL unit size`
  - `error while decoding`
  - `decode_slice_header error`
  - `non-existing PPS`, `PPS id out of range`, `SPS id out of range`
  - `missing reference picture`
  - `corrupt`, `truncated`, `packet too small`
  - `invalid ... bitstream`
- Container/mux faults (`mux_error`)
  - `moov atom not found`
  - `invalid data found when processing input`
  - `error reading header`
  - `invalid atom size`
  - `could not find codec parameters`
- Timestamp disorder (`backward_pts`)
  - `non monotonically increasing dts`
  - out-of-order DTS/PTS diagnostics

## Actionable `WARN` diagnostics

- Large GOP (`large_gop`)
  - Triggered when max keyframe interval > 4s in the ffprobe packet sample.

## Ignored or downgraded noise

These do not fail verification:

- Known benign diagnostics:
  - `pts has no value`
  - `Application provided invalid...`
  - null-mux encoder-selection chatter (`Automatic encoder selection failed ... format null`)
- Unclassified ffmpeg warnings/errors:
  - stored as warnings only to avoid false-positive hard failures.

## Stream mapping policy

Deep Verify decodes video/audio streams and skips subtitle/data streams:

- `-map 0:v? -map 0:a? -sn -dn`

This avoids false failures caused by subtitle streams that cannot be muxed to `null`.
