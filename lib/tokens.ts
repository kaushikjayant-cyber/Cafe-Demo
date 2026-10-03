// Random table tokens for QR links [D-15]. No 0/o/1/l/i so a token read aloud is unambiguous.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const TABLE_TOKEN_PATTERN = /^[a-z0-9]{10}$/;

export function newTableToken(length = 10): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let token = "";
  while (token.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && token.length < length) token += ALPHABET[byte % ALPHABET.length];
    }
  }
  return token;
}
