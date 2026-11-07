# Checkpoint 3 clipboard image fix

The image clipboard writer now publishes the PNG custom format plus a standard
Windows `CF_DIB` fallback. It no longer routes writes through
`clipboard_win::formats::Bitmap` / `CF_BITMAP` (the GDI HBITMAP path that failed
on the first Windows CI run with `OSError(0)`).

The reader now prefers `CF_DIBV5` and `CF_DIB` payloads when the registered PNG
format is unavailable, wrapping the DIB payload in a BMP file header for image
decoding. The Windows integration test asserts that a `CF_DIB` fallback was
published and contains a valid 40-byte `BITMAPINFOHEADER` before checking the
image round trip.

This patch has been source-reviewed only in the current Linux environment.
It has **not** been compiled or executed on Windows here. GitHub Actions must
run the native clipboard test before this change can be considered verified.
