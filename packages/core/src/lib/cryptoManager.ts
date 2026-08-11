import forge from "node-forge";
import * as openpgp from "openpgp";

export interface PgpEncryptInputs {
  plaintext: string;
  publicKeyArmored: string;
  autoDetectSettings: boolean;
  symmetricAlgorithm: string;
  compressionAlgorithm: string;
  aeadProtect: boolean;
  aeadAlgorithm: string;
  showVersion: boolean;
  versionString: string;
  showComment: boolean;
  commentString: string;
}

export interface PgpEncryptOutputs {
  encryptedArmored: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface PgpDecryptInputs {
  encryptedArmored: string;
  privateKeyArmored: string;
  passphrase: string;
  autoDetectSettings: boolean;
  allowUnauthenticatedMessages: boolean;
  minRSABits: number;
}

export interface PgpDecryptOutputs {
  plaintext: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface Pkcs7EncryptInputs {
  plaintext: string;
  recipientCertPem: string;
  autoDetectSettings: boolean;
  cipherAlgorithm: string;
}

export interface Pkcs7EncryptOutputs {
  envelopedDataPem: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface Pkcs7DecryptInputs {
  envelopedDataPem: string;
  privateKeyPem: string;
}

export interface Pkcs7DecryptOutputs {
  plaintext: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

const PKCS7_CIPHER_OID_NAMES: Record<string, string> = {
  aes128: "aes128-CBC",
  aes192: "aes192-CBC",
  aes256: "aes256-CBC",
  "3des": "des-EDE3-CBC",
};

/** Called directly both by the interpreter (see graph/nodes/crypto.ts's execute) and, via a real ESM
 * import, by a deployed/compiled flow script (see CRYPTO_MANAGER_IMPORT). Runs under plain Node with
 * no build/transpile step, given NODE_OPTIONS=--experimental-strip-types. */
export class CryptoManager {
  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  static async pgpEncrypt(inputs: PgpEncryptInputs): Promise<PgpEncryptOutputs> {
    try {
      const publicKey = await openpgp.readKey({ armoredKey: String(inputs.publicKeyArmored ?? "") });
      const message = await openpgp.createMessage({ text: String(inputs.plaintext ?? "") });
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
      const encryptedArmored = await openpgp.encrypt({ message, encryptionKeys: publicKey, config });
      return { encryptedArmored, success: true, error: "" };
    } catch (err) {
      return { encryptedArmored: "", success: false, error: CryptoManager.errorMessage(err) };
    }
  }

  static async pgpDecrypt(inputs: PgpDecryptInputs): Promise<PgpDecryptOutputs> {
    try {
      let privateKey = await openpgp.readPrivateKey({ armoredKey: String(inputs.privateKeyArmored ?? "") });
      const passphrase = String(inputs.passphrase ?? "");
      if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
      const message = await openpgp.readMessage({ armoredMessage: String(inputs.encryptedArmored ?? "") });
      const config = inputs.autoDetectSettings
        ? undefined
        : {
            allowUnauthenticatedMessages: Boolean(inputs.allowUnauthenticatedMessages),
            minRSABits: Number(inputs.minRSABits),
          };
      const { data: plaintext } = await openpgp.decrypt({ message, decryptionKeys: privateKey, config });
      return { plaintext: String(plaintext), success: true, error: "" };
    } catch (err) {
      return { plaintext: "", success: false, error: CryptoManager.errorMessage(err) };
    }
  }

  static pkcs7Encrypt(inputs: Pkcs7EncryptInputs): Pkcs7EncryptOutputs {
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
      return { envelopedDataPem, success: true, error: "" };
    } catch (err) {
      return { envelopedDataPem: "", success: false, error: CryptoManager.errorMessage(err) };
    }
  }

  /** Decrypts against the envelope's first RecipientInfo — matches what pkcs7Encrypt itself always
   * produces (exactly one recipient); a multi-recipient envelope from elsewhere would need its own
   * matching-certificate input to pick the right one via forge's own p7.findRecipient(cert). */
  static pkcs7Decrypt(inputs: Pkcs7DecryptInputs): Pkcs7DecryptOutputs {
    try {
      const message = forge.pkcs7.messageFromPem(String(inputs.envelopedDataPem ?? "")) as forge.pkcs7.PkcsEnvelopedData;
      const privateKey = forge.pki.privateKeyFromPem(String(inputs.privateKeyPem ?? ""));
      const recipient = message.recipients[0];
      if (!recipient) throw new Error("Enveloped data has no recipients");
      message.decrypt(recipient, privateKey);
      const plaintext = forge.util.decodeUtf8((message.content as forge.util.ByteStringBuffer).getBytes());
      return { plaintext, success: true, error: "" };
    } catch (err) {
      return { plaintext: "", success: false, error: CryptoManager.errorMessage(err) };
    }
  }
}
