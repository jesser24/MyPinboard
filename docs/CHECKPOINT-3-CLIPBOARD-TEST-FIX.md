# Checkpoint 3 clipboard test correction

The Windows CI run confirmed that the image clipboard write now succeeds and publishes `CF_DIB`. The remaining failure was an overly strict test assertion: it required the DIB header to be exactly 40 bytes, while the `image` BMP encoder emitted a valid 108-byte `BITMAPV4HEADER`.

The Windows integration test now accepts the standard 40-byte `BITMAPINFOHEADER`, 108-byte `BITMAPV4HEADER`, and 124-byte `BITMAPV5HEADER`, and still verifies that the header is complete and the image can be read back and decoded.

This is a test expectation correction, not a claim that the Windows suite has passed. Re-run the Windows CI job to validate the complete round trip on the runner.
