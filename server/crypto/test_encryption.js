const {
  generateRSAKeyPair,
  encryptMessage,
  decryptMessage,
} = require("./encryption");

const user1Keys = generateRSAKeyPair();
const user2Keys = generateRSAKeyPair();

const originalMessage = "Hello User2, this is a secret message!";

console.log("Original message:");
console.log(originalMessage);
console.log("");

const encryptedPayload = encryptMessage(originalMessage, user2Keys.publicKey);

console.log("Encrypted payload:");
console.log(encryptedPayload);
console.log("");

const decryptedMessage = decryptMessage(encryptedPayload, user2Keys.privateKey);

console.log("Decrypted message:");
console.log(decryptedMessage);