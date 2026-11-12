// Signs tokens shaped like Google's ID tokens with a key made for the test,
// so the verifier can be run without Google.
const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

export async function makeSigner(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = { ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey), kid, alg: "RS256", use: "sig" };
  return {
    jwk,
    async sign(claims: Record<string, unknown>) {
      const input = `${b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
      return `${input}.${b64url(new Uint8Array(sig))}`;
    },
  };
}
