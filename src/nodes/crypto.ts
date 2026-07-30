import forge from "node-forge";
import * as openpgp from "openpgp";
import { compileResultVar } from "../engine/compileUtils";
import { registerNode } from "../engine/registry";

// PGP (OpenPGP.js) and PKCS#7/CMS (node-forge) are both pure-JS, work identically in the browser
// (in-editor Run) and under plain Node (a compiled .mjs) with no native bindings, and are the two
// most widely-used, actively-maintained libraries for their respective message formats — hence
// "bulletproof" rather than a hand-rolled/lower-level ASN.1 implementation (see pkijs/asn1js as
// the harder-to-get-right alternative for PKCS7 this deliberately avoids).

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

registerNode({
  type: "crypto.pgpEncrypt",
  label: "PGP Encrypt",
  description: "Encrypts text for a recipient using their armored OpenPGP public key.",
  group: "Crypto.PGP",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "plaintext", label: "Plaintext", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "publicKeyArmored", label: "Public Key", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "encryptedArmored", label: "Encrypted", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      const publicKey = await openpgp.readKey({ armoredKey: String(inputs.publicKeyArmored ?? "") });
      const message = await openpgp.createMessage({ text: String(inputs.plaintext ?? "") });
      const encryptedArmored = await openpgp.encrypt({ message, encryptionKeys: publicKey });
      return { nextExec: "exec-out", outputs: { encryptedArmored, success: true, error: "" } };
    } catch (err) {
      return { nextExec: "exec-out", outputs: { encryptedArmored: "", success: false, error: errorMessage(err) } };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await (async () => {
      try {
        const publicKey = await openpgp.readKey({ armoredKey: ${inputs.publicKeyArmored} });
        const message = await openpgp.createMessage({ text: ${inputs.plaintext} });
        const encryptedArmored = await openpgp.encrypt({ message, encryptionKeys: publicKey });
        return { encryptedArmored, success: true, error: "" };
      } catch (err) {
        return { encryptedArmored: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { encryptedArmored: `${v}.encryptedArmored`, success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: ['import * as openpgp from "openpgp";'],
});

registerNode({
  type: "crypto.pgpDecrypt",
  label: "PGP Decrypt",
  description: "Decrypts an armored OpenPGP message using the recipient's armored private key.",
  group: "Crypto.PGP",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "encryptedArmored", label: "Encrypted", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "privateKeyArmored", label: "Private Key", type: "string", direction: "input", defaultValue: "", multiline: true },
    // Left empty for a private key that isn't itself passphrase-protected.
    { id: "passphrase", label: "Passphrase", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "plaintext", label: "Plaintext", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      let privateKey = await openpgp.readPrivateKey({ armoredKey: String(inputs.privateKeyArmored ?? "") });
      const passphrase = String(inputs.passphrase ?? "");
      if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
      const message = await openpgp.readMessage({ armoredMessage: String(inputs.encryptedArmored ?? "") });
      const { data: plaintext } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
      return { nextExec: "exec-out", outputs: { plaintext: String(plaintext), success: true, error: "" } };
    } catch (err) {
      return { nextExec: "exec-out", outputs: { plaintext: "", success: false, error: errorMessage(err) } };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await (async () => {
      try {
        let privateKey = await openpgp.readPrivateKey({ armoredKey: ${inputs.privateKeyArmored} });
        const passphrase = ${inputs.passphrase};
        if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
        const message = await openpgp.readMessage({ armoredMessage: ${inputs.encryptedArmored} });
        const { data: plaintext } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
        return { plaintext: String(plaintext), success: true, error: "" };
      } catch (err) {
        return { plaintext: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { plaintext: `${v}.plaintext`, success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: ['import * as openpgp from "openpgp";'],
});

registerNode({
  type: "crypto.pkcs7Encrypt",
  label: "PKCS7 Encrypt",
  description: "Encrypts text into a PKCS#7/CMS EnvelopedData structure (PEM) for a recipient's certificate.",
  group: "Crypto.PKCS7",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "plaintext", label: "Plaintext", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "recipientCertPem", label: "Recipient Certificate", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "envelopedDataPem", label: "Enveloped Data", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      const cert = forge.pki.certificateFromPem(String(inputs.recipientCertPem ?? ""));
      const p7 = forge.pkcs7.createEnvelopedData();
      p7.addRecipient(cert);
      p7.content = forge.util.createBuffer(forge.util.encodeUtf8(String(inputs.plaintext ?? "")));
      p7.encrypt();
      // @types/node-forge types messageToPem as accepting only PkcsSignedData — it works identically
      // for PkcsEnvelopedData at runtime (both just serialize via .toAsn1()); the .d.ts is just narrow.
      const envelopedDataPem = forge.pkcs7.messageToPem(p7 as unknown as forge.pkcs7.PkcsSignedData);
      return { nextExec: "exec-out", outputs: { envelopedDataPem, success: true, error: "" } };
    } catch (err) {
      return { nextExec: "exec-out", outputs: { envelopedDataPem: "", success: false, error: errorMessage(err) } };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = (() => {
      try {
        const cert = forge.pki.certificateFromPem(${inputs.recipientCertPem});
        const p7 = forge.pkcs7.createEnvelopedData();
        p7.addRecipient(cert);
        p7.content = forge.util.createBuffer(forge.util.encodeUtf8(${inputs.plaintext}));
        p7.encrypt();
        return { envelopedDataPem: forge.pkcs7.messageToPem(p7), success: true, error: "" };
      } catch (err) {
        return { envelopedDataPem: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { envelopedDataPem: `${v}.envelopedDataPem`, success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: ['import forge from "node-forge";'],
});

registerNode({
  type: "crypto.pkcs7Decrypt",
  label: "PKCS7 Decrypt",
  description: "Decrypts a PKCS#7/CMS EnvelopedData structure (PEM) using the recipient's private key.",
  group: "Crypto.PKCS7",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "envelopedDataPem", label: "Enveloped Data", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "privateKeyPem", label: "Private Key", type: "string", direction: "input", defaultValue: "", multiline: true },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "plaintext", label: "Plaintext", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  // Decrypts against the envelope's first RecipientInfo — matches what crypto.pkcs7Encrypt itself
  // produces (always exactly one recipient); a multi-recipient envelope from elsewhere would need
  // its own matching-certificate input to pick the right one via forge's own p7.findRecipient(cert).
  execute: async ({ inputs }) => {
    try {
      const message = forge.pkcs7.messageFromPem(String(inputs.envelopedDataPem ?? "")) as forge.pkcs7.PkcsEnvelopedData;
      const privateKey = forge.pki.privateKeyFromPem(String(inputs.privateKeyPem ?? ""));
      const recipient = message.recipients[0];
      if (!recipient) throw new Error("Enveloped data has no recipients");
      message.decrypt(recipient, privateKey);
      const plaintext = forge.util.decodeUtf8((message.content as forge.util.ByteStringBuffer).getBytes());
      return { nextExec: "exec-out", outputs: { plaintext, success: true, error: "" } };
    } catch (err) {
      return { nextExec: "exec-out", outputs: { plaintext: "", success: false, error: errorMessage(err) } };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = (() => {
      try {
        const message = forge.pkcs7.messageFromPem(${inputs.envelopedDataPem});
        const privateKey = forge.pki.privateKeyFromPem(${inputs.privateKeyPem});
        message.decrypt(message.recipients[0], privateKey);
        return { plaintext: forge.util.decodeUtf8(message.content.getBytes()), success: true, error: "" };
      } catch (err) {
        return { plaintext: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { plaintext: `${v}.plaintext`, success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: ['import forge from "node-forge";'],
});
