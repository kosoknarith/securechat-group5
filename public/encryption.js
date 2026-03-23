// Change PEM text key into binary data
function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// Change binary data into base64 text
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// Change base64 text back into binary data
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// Load public key for encryption
async function importPublicKey(publicKeyPem) {
  return crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
}

// Load private key for decryption
async function importPrivateKey(privateKeyPem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );
}

// Encrypt message with AES, then encrypt AES key with RSA
export async function encryptMessage(plainText, recipientPublicKeyPem) {
  const encoder = new TextEncoder();

  // Make random AES key
  const aesKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );

  // Make random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt text with AES
  const encryptedMessageBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    encoder.encode(plainText)
  );

  // Export AES key
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  // Load receiver public key
  const recipientPublicKey = await importPublicKey(recipientPublicKeyPem);

  // Encrypt AES key with RSA
  const encryptedKeyBuffer = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    recipientPublicKey,
    rawAesKey
  );

  // Return encrypted data
  return {
    encryptedMessage: arrayBufferToBase64(encryptedMessageBuffer),
    encryptedKey: arrayBufferToBase64(encryptedKeyBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

// Decrypt AES key with RSA, then decrypt message with AES
export async function decryptMessage(payload, recipientPrivateKeyPem) {
  const decoder = new TextDecoder();

  // Load private key
  const recipientPrivateKey = await importPrivateKey(recipientPrivateKeyPem);

  // Decrypt AES key
  const rawAesKey = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    recipientPrivateKey,
    base64ToArrayBuffer(payload.encryptedKey)
  );

  // Load AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );

  // Decrypt message
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(payload.iv)),
    },
    aesKey,
    base64ToArrayBuffer(payload.encryptedMessage)
  );

  return decoder.decode(decryptedBuffer);
}