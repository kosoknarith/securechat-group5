const crypto = require("crypto");

// Create RSA public and private key
function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

    return {
        publicKey, privateKey
    };
}

// Encrypt message with AES and RSA
function encryptMessage(plainText, recipientPublicKey) {
  
  // Create random AES-256 key and IV
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Encrypt the message with AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);

  let encryptedMessage = cipher.update(plainText, "utf8", "base64");
  encryptedMessage += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Encrypt AES key using recipient RSA public key
  const encryptedKey = crypto.publicEncrypt(recipientPublicKey, aesKey);

  return {
    encryptedMessage,
    encryptedKey: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

// Decrypt message with AES and RSA
function decryptMessage(payload, recipientPrivateKey) {
    
  // Convert encrypted data from base64
  const encryptedKeyBuffer = Buffer.from(payload.encryptedKey, "base64");
  const ivBuffer = Buffer.from(payload.iv, "base64");
  const authTagBuffer = Buffer.from(payload.authTag, "base64");

  // Decrypt AES key with RSA private key
  const aesKey = crypto.privateDecrypt(recipientPrivateKey, encryptedKeyBuffer);

  // Decrypt message with AES-256-GCM
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decryptedMessage = decipher.update(payload.encryptedMessage, "base64", "utf8");
  decryptedMessage += decipher.final("utf8");

  return decryptedMessage;
}

module.exports = {
    generateRSAKeyPair,
    encryptMessage,
    decryptMessage,
};