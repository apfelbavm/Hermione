import forge from "node-forge";
import * as openpgp from "openpgp";
import { compileResultVar } from "../engine/compileUtils";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PGP_SYMMETRIC_ALGORITHM_OPTIONS = Object.keys(openpgp.enums.symmetric);
const PGP_COMPRESSION_ALGORITHM_OPTIONS = Object.keys(openpgp.enums.compression);
const PGP_AEAD_ALGORITHM_OPTIONS = Object.keys(openpgp.enums.aead).filter((k) => k !== "experimentalGCM");

registerNode({
  type: "crypto.pgpEncrypt",
  label: i18n.nodes.crypto.pgpEncrypt.label,
  description: i18n.nodes.crypto.pgpEncrypt.description,
  group: "Crypto.PGP",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "plaintext", label: i18n.nodes.__shared.pin_plaintext, type: "string", direction: "input", defaultValue: "" },
    { id: "publicKeyArmored", label: i18n.nodes.crypto.pgpEncrypt.pin_public_key, type: "string", direction: "input", defaultValue: "" },
    { id: "autoDetectSettings", label: i18n.nodes.__shared.pin_auto_detect, type: "boolean", direction: "input", defaultValue: true },
    { id: "symmetricAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_symmetric_algorithm, type: "enum", direction: "input", defaultValue: "aes256", options: PGP_SYMMETRIC_ALGORITHM_OPTIONS },
    { id: "compressionAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_compression, type: "enum", direction: "input", defaultValue: "uncompressed", options: PGP_COMPRESSION_ALGORITHM_OPTIONS },
    { id: "aeadProtect", label: i18n.nodes.crypto.pgpEncrypt.pin_use_aead, type: "boolean", direction: "input", defaultValue: openpgp.config.aeadProtect },
    { id: "aeadAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_aead_algorithm, type: "enum", direction: "input", defaultValue: "gcm", options: PGP_AEAD_ALGORITHM_OPTIONS },
    { id: "showVersion", label: i18n.nodes.crypto.pgpEncrypt.pin_show_version, type: "boolean", direction: "input", defaultValue: openpgp.config.showVersion },
    { id: "versionString", label: i18n.nodes.crypto.pgpEncrypt.pin_version_comment, type: "string", direction: "input", defaultValue: openpgp.config.versionString },
    { id: "showComment", label: i18n.nodes.crypto.pgpEncrypt.pin_show_comment, type: "boolean", direction: "input", defaultValue: openpgp.config.showComment },
    { id: "commentString", label: i18n.nodes.crypto.pgpEncrypt.pin_comment, type: "string", direction: "input", defaultValue: openpgp.config.commentString },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "encryptedArmored", label: i18n.nodes.crypto.pgpEncrypt.pin_encrypted, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      const publicKey = await openpgp.readKey({
        armoredKey: String(inputs.publicKeyArmored ?? ""),
      });
      const message = await openpgp.createMessage({
        text: String(inputs.plaintext ?? ""),
      });
      const config = inputs.autoDetectSettings
        ? undefined
        : {
            preferredSymmetricAlgorithm: openpgp.enums.symmetric[String(inputs.symmetricAlgorithm) as keyof typeof openpgp.enums.symmetric],
            preferredCompressionAlgorithm: openpgp.enums.compression[String(inputs.compressionAlgorithm) as keyof typeof openpgp.enums.compression],
            aeadProtect: Boolean(inputs.aeadProtect),
            preferredAEADAlgorithm: openpgp.enums.aead[String(inputs.aeadAlgorithm) as keyof typeof openpgp.enums.aead],
            showVersion: Boolean(inputs.showVersion),
            versionString: String(inputs.versionString ?? ""),
            showComment: Boolean(inputs.showComment),
            commentString: String(inputs.commentString ?? ""),
          };
      const encryptedArmored = await openpgp.encrypt({
        message,
        encryptionKeys: publicKey,
        config,
      });
      return {
        nextExec: "exec-out",
        outputs: { encryptedArmored, success: true, error: "" },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: {
          encryptedArmored: "",
          success: false,
          error: errorMessage(err),
        },
      };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await (async () => {
      try {
        const publicKey = await openpgp.readKey({ armoredKey: ${inputs.publicKeyArmored} });
        const message = await openpgp.createMessage({ text: ${inputs.plaintext} });
        const config = ${inputs.autoDetectSettings} ? undefined : {
          preferredSymmetricAlgorithm: openpgp.enums.symmetric[${inputs.symmetricAlgorithm}],
          preferredCompressionAlgorithm: openpgp.enums.compression[${inputs.compressionAlgorithm}],
          aeadProtect: Boolean(${inputs.aeadProtect}),
          preferredAEADAlgorithm: openpgp.enums.aead[${inputs.aeadAlgorithm}],
          showVersion: Boolean(${inputs.showVersion}),
          versionString: String(${inputs.versionString} ?? ""),
          showComment: Boolean(${inputs.showComment}),
          commentString: String(${inputs.commentString} ?? ""),
        };
        const encryptedArmored = await openpgp.encrypt({ message, encryptionKeys: publicKey, config });
        return { encryptedArmored, success: true, error: "" };
      } catch (err) {
        return { encryptedArmored: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      encryptedArmored: `${v}.encryptedArmored`,
      success: `${v}.success`,
      error: `${v}.error`,
    };
  },
  compileImports: ['import * as openpgp from "openpgp";'],
});

registerNode({
  type: "crypto.pgpDecrypt",
  label: i18n.nodes.crypto.pgpDecrypt.label,
  description: i18n.nodes.crypto.pgpDecrypt.description,
  group: "Crypto.PGP",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "encryptedArmored", label: i18n.nodes.crypto.pgpDecrypt.pin_encrypted, type: "string", direction: "input", defaultValue: "" },
    { id: "privateKeyArmored", label: i18n.nodes.__shared.pin_private_key, type: "string", direction: "input", defaultValue: "" },
    { id: "passphrase", label: i18n.nodes.crypto.pgpDecrypt.pin_passphrase, type: "string", direction: "input", defaultValue: "" },
    { id: "autoDetectSettings", label: i18n.nodes.__shared.pin_auto_detect, type: "boolean", direction: "input", defaultValue: true },
    { id: "allowUnauthenticatedMessages", label: i18n.nodes.crypto.pgpDecrypt.pin_allow_unauthenticated, type: "boolean", direction: "input", defaultValue: openpgp.config.allowUnauthenticatedMessages },
    { id: "minRSABits", label: i18n.nodes.crypto.pgpDecrypt.pin_min_rsa_bits, type: "number", direction: "input", defaultValue: openpgp.config.minRSABits, integer: true },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "plaintext", label: i18n.nodes.__shared.pin_plaintext, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      let privateKey = await openpgp.readPrivateKey({
        armoredKey: String(inputs.privateKeyArmored ?? ""),
      });
      const passphrase = String(inputs.passphrase ?? "");
      if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
      const message = await openpgp.readMessage({
        armoredMessage: String(inputs.encryptedArmored ?? ""),
      });
      const config = inputs.autoDetectSettings
        ? undefined
        : {
            allowUnauthenticatedMessages: Boolean(inputs.allowUnauthenticatedMessages),
            minRSABits: Number(inputs.minRSABits),
          };
      const { data: plaintext } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey,
        config,
      });
      return {
        nextExec: "exec-out",
        outputs: { plaintext: String(plaintext), success: true, error: "" },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: { plaintext: "", success: false, error: errorMessage(err) },
      };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await (async () => {
      try {
        let privateKey = await openpgp.readPrivateKey({ armoredKey: ${inputs.privateKeyArmored} });
        const passphrase = ${inputs.passphrase};
        if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
        const message = await openpgp.readMessage({ armoredMessage: ${inputs.encryptedArmored} });
        const config = ${inputs.autoDetectSettings} ? undefined : {
          allowUnauthenticatedMessages: Boolean(${inputs.allowUnauthenticatedMessages}),
          minRSABits: Number(${inputs.minRSABits}),
        };
        const { data: plaintext } = await openpgp.decrypt({ message, decryptionKeys: privateKey, config });
        return { plaintext: String(plaintext), success: true, error: "" };
      } catch (err) {
        return { plaintext: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      plaintext: `${v}.plaintext`,
      success: `${v}.success`,
      error: `${v}.error`,
    };
  },
  compileImports: ['import * as openpgp from "openpgp";'],
});

const PKCS7_CIPHER_OPTIONS = ["aes128", "aes192", "aes256", "3des"];
const PKCS7_CIPHER_OID_NAMES: Record<string, string> = {
  aes128: "aes128-CBC",
  aes192: "aes192-CBC",
  aes256: "aes256-CBC",
  "3des": "des-EDE3-CBC",
};

registerNode({
  type: "crypto.pkcs7Encrypt",
  label: i18n.nodes.crypto.pkcs7Encrypt.label,
  description: i18n.nodes.crypto.pkcs7Encrypt.description,
  group: "Crypto.PKCS7",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "plaintext", label: i18n.nodes.__shared.pin_plaintext, type: "string", direction: "input", defaultValue: "" },
    { id: "recipientCertPem", label: i18n.nodes.crypto.pkcs7Encrypt.pin_recipient_cert, type: "string", direction: "input", defaultValue: "" },
    { id: "autoDetectSettings", label: i18n.nodes.__shared.pin_auto_detect, type: "boolean", direction: "input", defaultValue: true },
    { id: "cipherAlgorithm", label: i18n.nodes.crypto.pkcs7Encrypt.pin_cipher_algorithm, type: "enum", direction: "input", defaultValue: "aes256", options: PKCS7_CIPHER_OPTIONS },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "envelopedDataPem", label: i18n.nodes.crypto.pkcs7Encrypt.pin_enveloped_data, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    try {
      const cert = forge.pki.certificateFromPem(String(inputs.recipientCertPem ?? ""));
      const p7 = forge.pkcs7.createEnvelopedData();
      p7.addRecipient(cert);
      p7.content = forge.util.createBuffer(forge.util.encodeUtf8(String(inputs.plaintext ?? "")));
      if (inputs.autoDetectSettings) {
        p7.encrypt();
      } else {
        const oidName = PKCS7_CIPHER_OID_NAMES[String(inputs.cipherAlgorithm)];
        p7.encrypt(undefined, forge.pki.oids[oidName]);
      }
      // @types/node-forge types messageToPem as accepting only PkcsSignedData — it works identically
      // for PkcsEnvelopedData at runtime (both just serialize via .toAsn1()); the .d.ts is just narrow.
      const envelopedDataPem = forge.pkcs7.messageToPem(p7 as unknown as forge.pkcs7.PkcsSignedData);
      return {
        nextExec: "exec-out",
        outputs: { envelopedDataPem, success: true, error: "" },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: {
          envelopedDataPem: "",
          success: false,
          error: errorMessage(err),
        },
      };
    }
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = (() => {
      try {
        const cert = forge.pki.certificateFromPem(${inputs.recipientCertPem});
        const p7 = forge.pkcs7.createEnvelopedData();
        p7.addRecipient(cert);
        p7.content = forge.util.createBuffer(forge.util.encodeUtf8(${inputs.plaintext}));
        if (${inputs.autoDetectSettings}) {
          p7.encrypt();
        } else {
          const oidName = ${JSON.stringify(PKCS7_CIPHER_OID_NAMES)}[${inputs.cipherAlgorithm}];
          p7.encrypt(undefined, forge.pki.oids[oidName]);
        }
        return { envelopedDataPem: forge.pkcs7.messageToPem(p7), success: true, error: "" };
      } catch (err) {
        return { envelopedDataPem: "", success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      envelopedDataPem: `${v}.envelopedDataPem`,
      success: `${v}.success`,
      error: `${v}.error`,
    };
  },
  compileImports: ['import forge from "node-forge";'],
});

registerNode({
  type: "crypto.pkcs7Decrypt",
  label: i18n.nodes.crypto.pkcs7Decrypt.label,
  description: i18n.nodes.crypto.pkcs7Decrypt.description,
  group: "Crypto.PKCS7",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "envelopedDataPem", label: i18n.nodes.crypto.pkcs7Decrypt.pin_enveloped_data, type: "string", direction: "input", defaultValue: "" },
    { id: "privateKeyPem", label: i18n.nodes.__shared.pin_private_key, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "plaintext", label: i18n.nodes.__shared.pin_plaintext, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
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
      return {
        nextExec: "exec-out",
        outputs: { plaintext, success: true, error: "" },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: { plaintext: "", success: false, error: errorMessage(err) },
      };
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
    return {
      plaintext: `${v}.plaintext`,
      success: `${v}.success`,
      error: `${v}.error`,
    };
  },
  compileImports: ['import forge from "node-forge";'],
});
