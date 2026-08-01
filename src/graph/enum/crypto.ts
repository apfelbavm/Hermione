import * as openpgp from "openpgp";
import { registerEnumType } from "../engine/enumRegistry";

export const PGP_SYMMETRIC_ALGORITHM_ENUM_TYPE = "pgpSymmetricAlgorithm";
export const PGP_COMPRESSION_ALGORITHM_ENUM_TYPE = "pgpCompressionAlgorithm";
export const PGP_AEAD_ALGORITHM_ENUM_TYPE = "pgpAeadAlgorithm";
export const PKCS7_CIPHER_ALGORITHM_ENUM_TYPE = "pkcs7CipherAlgorithm";

registerEnumType({
  id: PGP_SYMMETRIC_ALGORITHM_ENUM_TYPE,
  label: "PGP Symmetric Algorithm",
  category: "Crypto",
  values: Object.keys(openpgp.enums.symmetric).map((id) => ({ id, label: id })),
});

registerEnumType({
  id: PGP_COMPRESSION_ALGORITHM_ENUM_TYPE,
  label: "PGP Compression Algorithm",
  category: "Crypto",
  values: Object.keys(openpgp.enums.compression).map((id) => ({ id, label: id })),
});

registerEnumType({
  id: PGP_AEAD_ALGORITHM_ENUM_TYPE,
  label: "PGP AEAD Algorithm",
  category: "Crypto",
  // experimentalGCM is filtered out here (not just at the pin) so this registered class matches
  // exactly what the pin ever offers/wires — see nodes/crypto.ts.
  values: Object.keys(openpgp.enums.aead)
    .filter((id) => id !== "experimentalGCM")
    .map((id) => ({ id, label: id })),
});

registerEnumType({
  id: PKCS7_CIPHER_ALGORITHM_ENUM_TYPE,
  label: "PKCS7 Cipher Algorithm",
  category: "Crypto",
  values: ["aes128", "aes192", "aes256", "3des"].map((id) => ({ id, label: id })),
});
