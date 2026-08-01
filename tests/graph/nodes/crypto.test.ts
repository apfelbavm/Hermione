import forge from "node-forge";
import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import {
  createExecutionContext,
  runExecFrom,
} from "../../../src/engine/executor";
import { getNodeDef } from "../../../src/engine/registry";
import { Graph } from "../../../src/engine/graph";
import { NodeInstance } from "../../../src/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

function buildGraph(
  type: string,
  id: string,
  pinValues: Record<string, unknown>,
) {
  const graph = new Graph("g", "test");
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(
    type,
    { x: 0, y: 0 },
    def.pins,
    id,
  );
  for (const [pinId, value] of Object.entries(pinValues)) {
    node.pins[pinId].value = value;
  }
  graph.nodes.push(node);
  return graph;
}

async function runNode(
  type: string,
  id: string,
  pinValues: Record<string, unknown>,
) {
  const graph = buildGraph(type, id, pinValues);
  const ctx = createExecutionContext(graph, { log: () => {} });
  await runExecFrom(id, "exec-in", ctx);
  return ctx.execOutputs;
}

describe("crypto.pgpEncrypt / crypto.pgpDecrypt", () => {
  let publicKeyArmored: string;
  let privateKeyArmored: string;
  let protectedPrivateKeyArmored: string;
  const passphrase = "correct-horse-battery-staple";

  beforeAll(async () => {
    const plainKeys = await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: "Alice", email: "alice@example.com" }],
      format: "armored",
    });
    publicKeyArmored = plainKeys.publicKey;
    privateKeyArmored = plainKeys.privateKey;

    const protectedKeys = await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: "Bob", email: "bob@example.com" }],
      passphrase,
      format: "armored",
    });
    protectedPrivateKeyArmored = protectedKeys.privateKey;
  });

  it("round-trips plaintext through a real OpenPGP key pair with no passphrase", async () => {
    const encOutputs = await runNode("crypto.pgpEncrypt", "enc", {
      plaintext: "the eagle has landed",
      publicKeyArmored,
    });
    expect(encOutputs.get("enc:success")).toBe(true);
    const encryptedArmored = encOutputs.get("enc:encryptedArmored") as string;
    expect(encryptedArmored).toContain("-----BEGIN PGP MESSAGE-----");

    const decOutputs = await runNode("crypto.pgpDecrypt", "dec", {
      encryptedArmored,
      privateKeyArmored,
      passphrase: "",
    });
    expect(decOutputs.get("dec:success")).toBe(true);
    expect(decOutputs.get("dec:plaintext")).toBe("the eagle has landed");
    expect(decOutputs.get("dec:error")).toBe("");
  });

  it("round-trips through a passphrase-protected private key", async () => {
    const protectedPublic = await openpgp.readPrivateKey({
      armoredKey: protectedPrivateKeyArmored,
    });
    const encOutputs = await runNode("crypto.pgpEncrypt", "enc2", {
      plaintext: "guarded message",
      publicKeyArmored: protectedPublic.toPublic().armor(),
    });
    expect(encOutputs.get("enc2:success")).toBe(true);

    const decOutputs = await runNode("crypto.pgpDecrypt", "dec2", {
      encryptedArmored: encOutputs.get("enc2:encryptedArmored"),
      privateKeyArmored: protectedPrivateKeyArmored,
      passphrase,
    });
    expect(decOutputs.get("dec2:success")).toBe(true);
    expect(decOutputs.get("dec2:plaintext")).toBe("guarded message");
  });

  it("reports success:false with an error message on a garbage public key", async () => {
    const outputs = await runNode("crypto.pgpEncrypt", "bad", {
      plaintext: "hi",
      publicKeyArmored: "not a real key",
    });
    expect(outputs.get("bad:success")).toBe(false);
    expect(outputs.get("bad:encryptedArmored")).toBe("");
    expect(outputs.get("bad:error")).toBeTruthy();
  });

  it("reports success:false when decrypting with the wrong passphrase", async () => {
    const encOutputs = await runNode("crypto.pgpEncrypt", "enc3", {
      plaintext: "secret",
      publicKeyArmored: (
        await openpgp.readPrivateKey({ armoredKey: protectedPrivateKeyArmored })
      )
        .toPublic()
        .armor(),
    });

    const decOutputs = await runNode("crypto.pgpDecrypt", "dec3", {
      encryptedArmored: encOutputs.get("enc3:encryptedArmored"),
      privateKeyArmored: protectedPrivateKeyArmored,
      passphrase: "wrong-passphrase",
    });
    expect(decOutputs.get("dec3:success")).toBe(false);
    expect(decOutputs.get("dec3:plaintext")).toBe("");
  });

  it("leaves the config untouched (auto-negotiated) when autoDetectSettings is true, even if the tuning pins hold different values", async () => {
    const outputs = await runNode("crypto.pgpEncrypt", "enc4", {
      plaintext: "hi",
      publicKeyArmored,
      autoDetectSettings: true,
      showVersion: true,
      versionString: "should-be-ignored",
    });
    expect(outputs.get("enc4:success")).toBe(true);
    // Auto mode never passes a config object at all, so openpgp's own default (showVersion: false)
    // applies regardless of what the (unused) showVersion/versionString pins are set to.
    expect(outputs.get("enc4:encryptedArmored") as string).not.toContain(
      "should-be-ignored",
    );
  });

  it("applies the explicit tuning pins end-to-end when autoDetectSettings is false", async () => {
    const encOutputs = await runNode("crypto.pgpEncrypt", "enc5", {
      plaintext: "tunable message",
      publicKeyArmored,
      autoDetectSettings: false,
      symmetricAlgorithm: "aes128",
      compressionAlgorithm: "zip",
      aeadProtect: false,
      showVersion: true,
      versionString: "Hermione-Test/1.0",
      showComment: true,
      commentString: "a custom comment",
    });
    expect(encOutputs.get("enc5:success")).toBe(true);
    const encryptedArmored = encOutputs.get("enc5:encryptedArmored") as string;
    expect(encryptedArmored).toContain("Version: Hermione-Test/1.0");
    expect(encryptedArmored).toContain("Comment: a custom comment");

    // The message still decrypts normally regardless of which symmetric/compression algorithm the
    // sender picked — that's negotiated once at encryption time and simply recorded in the message.
    const decOutputs = await runNode("crypto.pgpDecrypt", "dec5", {
      encryptedArmored,
      privateKeyArmored,
      passphrase: "",
    });
    expect(decOutputs.get("dec5:success")).toBe(true);
    expect(decOutputs.get("dec5:plaintext")).toBe("tunable message");
  });

  it("still round-trips correctly when decrypt's own autoDetectSettings is turned off with matching (permissive) values", async () => {
    const encOutputs = await runNode("crypto.pgpEncrypt", "enc6", {
      plaintext: "explicit decrypt config",
      publicKeyArmored,
    });
    const decOutputs = await runNode("crypto.pgpDecrypt", "dec6", {
      encryptedArmored: encOutputs.get("enc6:encryptedArmored"),
      privateKeyArmored,
      passphrase: "",
      autoDetectSettings: false,
      allowUnauthenticatedMessages: false,
      minRSABits: 2047,
    });
    expect(decOutputs.get("dec6:success")).toBe(true);
    expect(decOutputs.get("dec6:plaintext")).toBe("explicit decrypt config");
  });
});

describe("crypto.pkcs7Encrypt / crypto.pkcs7Decrypt", () => {
  let certPem: string;
  let privateKeyPem: string;
  let otherPrivateKeyPem: string;

  beforeAll(() => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const attrs = [{ name: "commonName", value: "Test Recipient" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);

    certPem = forge.pki.certificateToPem(cert);
    privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    otherPrivateKeyPem = forge.pki.privateKeyToPem(
      forge.pki.rsa.generateKeyPair({ bits: 2048 }).privateKey,
    );
  });

  it("round-trips plaintext through a real self-signed certificate/private key pair", async () => {
    const encOutputs = await runNode("crypto.pkcs7Encrypt", "penc", {
      plaintext: "top secret payload",
      recipientCertPem: certPem,
    });
    expect(encOutputs.get("penc:success")).toBe(true);
    const envelopedDataPem = encOutputs.get("penc:envelopedDataPem") as string;
    expect(envelopedDataPem).toContain("-----BEGIN PKCS7-----");

    const decOutputs = await runNode("crypto.pkcs7Decrypt", "pdec", {
      envelopedDataPem,
      privateKeyPem,
    });
    expect(decOutputs.get("pdec:success")).toBe(true);
    expect(decOutputs.get("pdec:plaintext")).toBe("top secret payload");
    expect(decOutputs.get("pdec:error")).toBe("");
  });

  it("round-trips a multi-byte UTF-8 string correctly", async () => {
    const encOutputs = await runNode("crypto.pkcs7Encrypt", "putf", {
      plaintext: "héllo wörld — 日本語",
      recipientCertPem: certPem,
    });
    const decOutputs = await runNode("crypto.pkcs7Decrypt", "pdutf", {
      envelopedDataPem: encOutputs.get("putf:envelopedDataPem"),
      privateKeyPem,
    });
    expect(decOutputs.get("pdutf:plaintext")).toBe("héllo wörld — 日本語");
  });

  it("reports success:false with an error message on a garbage certificate", async () => {
    const outputs = await runNode("crypto.pkcs7Encrypt", "pbad", {
      plaintext: "hi",
      recipientCertPem: "not a real certificate",
    });
    expect(outputs.get("pbad:success")).toBe(false);
    expect(outputs.get("pbad:envelopedDataPem")).toBe("");
    expect(outputs.get("pbad:error")).toBeTruthy();
  });

  it("reports success:false when decrypting with a private key that doesn't match the recipient", async () => {
    const encOutputs = await runNode("crypto.pkcs7Encrypt", "penc2", {
      plaintext: "secret",
      recipientCertPem: certPem,
    });
    const decOutputs = await runNode("crypto.pkcs7Decrypt", "pdec2", {
      envelopedDataPem: encOutputs.get("penc2:envelopedDataPem"),
      privateKeyPem: otherPrivateKeyPem,
    });
    expect(decOutputs.get("pdec2:success")).toBe(false);
    expect(decOutputs.get("pdec2:plaintext")).toBe("");
  });

  it("uses forge's own default cipher (aes256-CBC) when autoDetectSettings is true, regardless of the (unused) cipherAlgorithm pin", async () => {
    const outputs = await runNode("crypto.pkcs7Encrypt", "pauto", {
      plaintext: "hi",
      recipientCertPem: certPem,
      autoDetectSettings: true,
      cipherAlgorithm: "3des",
    });
    // The actual content-encryption cipher lives on the message's own top-level encryptedContent
    // (not each recipient's own encryptedContent, which is the RSA key-transport algorithm instead)
    // — @types/node-forge doesn't declare this field at all, hence the `as any`.
    const parsed = forge.pkcs7.messageFromPem(
      outputs.get("pauto:envelopedDataPem") as string,
    ) as any;
    expect(parsed.encryptedContent.algorithm).toBe(
      forge.pki.oids["aes256-CBC"],
    );
  });

  it("applies the explicit cipherAlgorithm pin end-to-end when autoDetectSettings is false, and still decrypts correctly", async () => {
    for (const [option, oidName] of [
      ["aes128", "aes128-CBC"],
      ["3des", "des-EDE3-CBC"],
    ] as const) {
      const id = `penc-${option}`;
      const encOutputs = await runNode("crypto.pkcs7Encrypt", id, {
        plaintext: `encrypted with ${option}`,
        recipientCertPem: certPem,
        autoDetectSettings: false,
        cipherAlgorithm: option,
      });
      expect(encOutputs.get(`${id}:success`)).toBe(true);
      const envelopedDataPem = encOutputs.get(
        `${id}:envelopedDataPem`,
      ) as string;

      const parsed = forge.pkcs7.messageFromPem(envelopedDataPem) as any;
      expect(parsed.encryptedContent.algorithm).toBe(forge.pki.oids[oidName]);

      const decId = `pdec-${option}`;
      const decOutputs = await runNode("crypto.pkcs7Decrypt", decId, {
        envelopedDataPem,
        privateKeyPem,
      });
      expect(decOutputs.get(`${decId}:success`)).toBe(true);
      expect(decOutputs.get(`${decId}:plaintext`)).toBe(
        `encrypted with ${option}`,
      );
    }
  });
});
