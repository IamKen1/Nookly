// ESC/POS printers speak raw single-byte codepages, not Unicode. The peso sign (₱) isn't
// present in the common codepages (CP437/852/860, etc.) these cheap printers ship with, so
// swap it for a plain "P" before encoding — otherwise it prints as a garbled or blank glyph.
export const escPosSafeText = (text: string) => text.replace(/₱/g, "P");

export const textToEscPosBytes = (text: string): Uint8Array => {
  const safe = escPosSafeText(text);
  const bytes = new Uint8Array(safe.length);
  for (let i = 0; i < safe.length; i++) {
    bytes[i] = safe.charCodeAt(i) & 0xff;
  }
  return bytes;
};
