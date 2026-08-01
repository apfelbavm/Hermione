import * as openpgp from "openpgp";
import { compileResultVar, FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import { registerNode } from "../engine/registry";
import { enumOptionIds } from "../engine/enumRegistry";
import { PGP_SYMMETRIC_ALGORITHM_ENUM_TYPE, PGP_COMPRESSION_ALGORITHM_ENUM_TYPE, PGP_AEAD_ALGORITHM_ENUM_TYPE, PKCS7_CIPHER_ALGORITHM_ENUM_TYPE } from "../enum/crypto";
import { pgpEncrypt, pgpDecrypt, pkcs7Encrypt, pkcs7Decrypt } from "../../server/functionLibrary";
import { i18n } from "@i18n";

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
    { id: "symmetricAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_symmetric_algorithm, type: "enum", subType: PGP_SYMMETRIC_ALGORITHM_ENUM_TYPE, direction: "input", defaultValue: "aes256", options: enumOptionIds(PGP_SYMMETRIC_ALGORITHM_ENUM_TYPE) },
    { id: "compressionAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_compression, type: "enum", subType: PGP_COMPRESSION_ALGORITHM_ENUM_TYPE, direction: "input", defaultValue: "uncompressed", options: enumOptionIds(PGP_COMPRESSION_ALGORITHM_ENUM_TYPE) },
    { id: "aeadProtect", label: i18n.nodes.crypto.pgpEncrypt.pin_use_aead, type: "boolean", direction: "input", defaultValue: openpgp.config.aeadProtect },
    { id: "aeadAlgorithm", label: i18n.nodes.crypto.pgpEncrypt.pin_aead_algorithm, type: "enum", subType: PGP_AEAD_ALGORITHM_ENUM_TYPE, direction: "input", defaultValue: "gcm", options: enumOptionIds(PGP_AEAD_ALGORITHM_ENUM_TYPE) },
    { id: "showVersion", label: i18n.nodes.crypto.pgpEncrypt.pin_show_version, type: "boolean", direction: "input", defaultValue: openpgp.config.showVersion },
    { id: "versionString", label: i18n.nodes.crypto.pgpEncrypt.pin_version_comment, type: "string", direction: "input", defaultValue: openpgp.config.versionString },
    { id: "showComment", label: i18n.nodes.crypto.pgpEncrypt.pin_show_comment, type: "boolean", direction: "input", defaultValue: openpgp.config.showComment },
    { id: "commentString", label: i18n.nodes.crypto.pgpEncrypt.pin_comment, type: "string", direction: "input", defaultValue: openpgp.config.commentString },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "encryptedArmored", label: i18n.nodes.crypto.pgpEncrypt.pin_encrypted, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: await pgpEncrypt(inputs as unknown as Parameters<typeof pgpEncrypt>[0]),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrary.pgpEncrypt({ plaintext: ${inputs.plaintext}, publicKeyArmored: ${inputs.publicKeyArmored}, autoDetectSettings: ${inputs.autoDetectSettings}, symmetricAlgorithm: ${inputs.symmetricAlgorithm}, compressionAlgorithm: ${inputs.compressionAlgorithm}, aeadProtect: ${inputs.aeadProtect}, aeadAlgorithm: ${inputs.aeadAlgorithm}, showVersion: ${inputs.showVersion}, versionString: ${inputs.versionString}, showComment: ${inputs.showComment}, commentString: ${inputs.commentString} });`,
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
  compileImports: [FUNCTION_LIBRARY_IMPORT],
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
  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: await pgpDecrypt(inputs as unknown as Parameters<typeof pgpDecrypt>[0]),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrary.pgpDecrypt({ encryptedArmored: ${inputs.encryptedArmored}, privateKeyArmored: ${inputs.privateKeyArmored}, passphrase: ${inputs.passphrase}, autoDetectSettings: ${inputs.autoDetectSettings}, allowUnauthenticatedMessages: ${inputs.allowUnauthenticatedMessages}, minRSABits: ${inputs.minRSABits} });`,
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
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});

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
    { id: "cipherAlgorithm", label: i18n.nodes.crypto.pkcs7Encrypt.pin_cipher_algorithm, type: "enum", subType: PKCS7_CIPHER_ALGORITHM_ENUM_TYPE, direction: "input", defaultValue: "aes256", options: enumOptionIds(PKCS7_CIPHER_ALGORITHM_ENUM_TYPE) },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    { id: "envelopedDataPem", label: i18n.nodes.crypto.pkcs7Encrypt.pin_enveloped_data, type: "string", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: pkcs7Encrypt(inputs as unknown as Parameters<typeof pkcs7Encrypt>[0]),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = functionLibrary.pkcs7Encrypt({ plaintext: ${inputs.plaintext}, recipientCertPem: ${inputs.recipientCertPem}, autoDetectSettings: ${inputs.autoDetectSettings}, cipherAlgorithm: ${inputs.cipherAlgorithm} });`,
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
  compileImports: [FUNCTION_LIBRARY_IMPORT],
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
  execute: async ({ inputs }) => ({
    nextExec: "exec-out",
    outputs: pkcs7Decrypt(inputs as unknown as Parameters<typeof pkcs7Decrypt>[0]),
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = functionLibrary.pkcs7Decrypt({ envelopedDataPem: ${inputs.envelopedDataPem}, privateKeyPem: ${inputs.privateKeyPem} });`,
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
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
