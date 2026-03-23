const { generateRSAKeyPair } = require("./encryption");

const user1Keys = generateRSAKeyPair();
const user2Keys = generateRSAKeyPair();

console.log("USER1 PUBLIC KEY:\n", user1Keys.publicKey);
console.log("USER1 PRIVATE KEY:\n", user1Keys.privateKey);

console.log("USER2 PUBLIC KEY:\n", user2Keys.publicKey);
console.log("USER2 PRIVATE KEY:\n", user2Keys.privateKey);