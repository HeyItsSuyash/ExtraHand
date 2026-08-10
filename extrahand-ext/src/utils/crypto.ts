// crypto.ts
export async function generateAndStoreKeyPair(): Promise<string> {
  const existing = await chrome.storage.local.get(['privateKey', 'publicKeyJwk']);
  if (existing.privateKey && existing.publicKeyJwk) {
    return existing.publicKeyJwk;
  }

  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const exportedPublicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const exportedPrivateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  await chrome.storage.local.set({
    privateKey: exportedPrivateKey,
    publicKeyJwk: JSON.stringify(exportedPublicKey)
  });

  return JSON.stringify(exportedPublicKey);
}

export async function decryptData(encryptedBase64: string): Promise<string> {
  const { privateKey } = await chrome.storage.local.get(['privateKey']);
  if (!privateKey) throw new Error("Private key not found in storage");

  const importedPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    privateKey,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );

  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    importedPrivateKey,
    encryptedBytes
  );

  return new TextDecoder().decode(decryptedBuffer);
}
