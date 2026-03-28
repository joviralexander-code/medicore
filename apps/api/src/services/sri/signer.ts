/**
 * Servicio de firma electrónica XAdES-BES con SHA-256
 * Usa node-forge para leer el certificado P12
 * Usa xadesjs para generar la firma XAdES-BES
 *
 * El certificado P12 se descifra del storage en memoria — NUNCA se escribe a disco
 */

import * as forge from 'node-forge';
import { SignedXml } from 'xadesjs';
import { webcrypto } from 'node:crypto';
import crypto from 'node:crypto';
import { env } from '../../config/env';

// xmldsigjs Application es re-exportado por xadesjs
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Application } = require('xmldsigjs') as { Application: { setEngine: (name: string, engine: unknown) => void } };
Application.setEngine('WebCrypto', webcrypto);

export interface P12Credentials {
  /** P12 cifrado (desde Supabase Storage) en Buffer */
  encryptedP12: Buffer;
  /** Password del P12 cifrado (desde DB) */
  encryptedPassword: string;
}

export interface SignedResult {
  signedXml: string;
  certSubject: string;
}

/**
 * Descifra el P12 usando la clave maestra del servidor
 */
export function decryptP12(encryptedP12: Buffer, encryptedPassword: string): {
  p12Buffer: Buffer;
  password: string;
} {
  // scryptSync: KDF de alta resistencia a fuerza bruta — N=32768, r=8, p=1, keylen=32
  const key = crypto.scryptSync(env.P12_MASTER_KEY, 'medicore-sri-p12-v1', 32, { N: 32768, r: 8, p: 1 });
  const iv = encryptedP12.subarray(0, 16);
  const encrypted = encryptedP12.subarray(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const p12Buffer = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  const pwBuffer = Buffer.from(encryptedPassword, 'base64');
  const pwIv = pwBuffer.subarray(0, 16);
  const pwEncrypted = pwBuffer.subarray(16);
  const pwDecipher = crypto.createDecipheriv('aes-256-cbc', key, pwIv);
  const password = Buffer.concat([pwDecipher.update(pwEncrypted), pwDecipher.final()]).toString('utf-8');

  return { p12Buffer, password };
}

/**
 * Cifra un P12 antes de almacenarlo
 */
export function encryptP12(p12Buffer: Buffer, password: string): {
  encryptedP12: Buffer;
  encryptedPassword: string;
} {
  // scryptSync: KDF de alta resistencia a fuerza bruta — N=32768, r=8, p=1, keylen=32
  const key = crypto.scryptSync(env.P12_MASTER_KEY, 'medicore-sri-p12-v1', 32, { N: 32768, r: 8, p: 1 });

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encryptedP12 = Buffer.concat([iv, cipher.update(p12Buffer), cipher.final()]);

  const pwIv = crypto.randomBytes(16);
  const pwCipher = crypto.createCipheriv('aes-256-cbc', key, pwIv);
  const encryptedPw = Buffer.concat([
    pwIv,
    pwCipher.update(Buffer.from(password, 'utf-8')),
    pwCipher.final(),
  ]).toString('base64');

  return {
    encryptedP12,
    encryptedPassword: encryptedPw,
  };
}

/**
 * Firma un XML con XAdES-BES usando el certificado P12
 */
export async function signXmlXadesBes(
  xmlString: string,
  credentials: P12Credentials
): Promise<SignedResult> {
  const { p12Buffer, password } = decryptP12(
    credentials.encryptedP12,
    credentials.encryptedPassword
  );

  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const CERT_BAG_OID = forge.pki.oids['certBag'] as string;
  const certBags = p12.getBags({ bagType: CERT_BAG_OID });
  const certBag = certBags[CERT_BAG_OID]?.[0];
  if (!certBag?.cert) throw new Error('Certificado no encontrado en el P12');

  const KEY_BAG_OID = forge.pki.oids['pkcs8ShroudedKeyBag'] as string;
  const keyBags = p12.getBags({ bagType: KEY_BAG_OID });
  const keyBag = keyBags[KEY_BAG_OID]?.[0];
  if (!keyBag?.key) throw new Error('Clave privada no encontrada en el P12');

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
  const certBase64 = Buffer.from(certDer, 'binary').toString('base64');
  const certDerBuffer = Buffer.from(certDer, 'binary');

  const keyDer = forge.asn1.toDer(forge.pki.privateKeyToAsn1(keyBag.key)).getBytes();

  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    Buffer.from(keyDer, 'binary'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Extraer clave pública del certificado para KeyValue
  const publicKey = await webcrypto.subtle.importKey(
    'spki',
    certDerBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify']
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DOMParser, XMLSerializer } = require('@xmldom/xmldom') as {
    DOMParser: new () => { parseFromString: (s: string, t: string) => globalThis.Document };
    XMLSerializer: new () => { serializeToString: (n: globalThis.Node) => string };
  };
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

  const xades = new SignedXml();

  await xades.Sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey as CryptoKey,
    xmlDoc as unknown as globalThis.Document,
    {
      keyValue: publicKey as CryptoKey,
      x509: [certBase64],
      references: [{
        hash: 'SHA-256',
        transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
      }],
    }
  );

  const serializer = new XMLSerializer();
  const sigNode = xades.XmlSignature.GetXml();
  if (!sigNode) throw new Error('No se generó la firma XML');
  const signedXml = serializer.serializeToString(sigNode as unknown as globalThis.Node);

  const signedDocument = xmlString.replace(
    '</factura>',
    `${signedXml}\n</factura>`
  );

  const cnField = certBag.cert.subject.getField('CN') as { value: string } | null;
  const certSubject = cnField?.value ?? 'Desconocido';

  return { signedXml: signedDocument, certSubject };
}
