import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP32_SENTINEL = 0xffff;
const ZIP32_ENTRY_LIMIT = ZIP32_SENTINEL - 1;
const RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";

export type DocxRenderInputFailure = "unsafe_source_package" | "source_too_large";

export type DocxRenderInputInspection =
  | { safe: true; entryCount: number; expandedBytes: number }
  | { safe: false; failureCode: DocxRenderInputFailure };

interface ArchiveEntry {
  name: string;
  lowerName: string;
  nameBytes: Buffer;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataOffset?: number;
  isDirectory: boolean;
}

function unsafe(): DocxRenderInputInspection {
  return { safe: false, failureCode: "unsafe_source_package" };
}

function tooLarge(): DocxRenderInputInspection {
  return { safe: false, failureCode: "source_too_large" };
}

function decodeEntryName(nameBytes: Buffer, utf8: boolean): string | null {
  if (nameBytes.byteLength === 0 || nameBytes.includes(0)) return null;
  if (!utf8) return nameBytes.some(byte => byte > 0x7f) ? null : nameBytes.toString("ascii");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
  } catch {
    return null;
  }
}

function canonicalizeUriComponent(value: string): string | null {
  let canonical = "";
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "%") {
      canonical += value[index];
      continue;
    }
    const hex = value.slice(index + 1, index + 3);
    if (!/^[0-9a-f]{2}$/i.test(hex)) return null;
    const byte = Number.parseInt(hex, 16);
    const character = String.fromCharCode(byte);
    if (!/[A-Za-z0-9._~-]/.test(character)) return null;
    canonical += character;
    index += 2;
  }
  return canonical;
}

function isSafeCanonicalArchiveName(name: string, isDirectory: boolean): boolean {
  if (!name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || /^[a-z]:/i.test(name) || name.includes(":")) return false;
  const parts = name.split("/");
  if (isDirectory && parts.at(-1) === "") parts.pop();
  return parts.length > 0 && parts.every(part => part !== "" && part !== "." && part !== "..");
}

function validZipExtraFields(bytes: Buffer, start: number, length: number): boolean {
  const end = start + length;
  let cursor = start;
  while (cursor < end) {
    if (cursor + 4 > end) return false;
    const id = bytes.readUInt16LE(cursor);
    const fieldLength = bytes.readUInt16LE(cursor + 2);
    if (cursor + 4 + fieldLength > end || id === 0x0001) return false;
    cursor += 4 + fieldLength;
  }
  return cursor === end;
}

function findEndOfCentralDirectory(bytes: Buffer): number | null {
  if (bytes.byteLength < 22) return null;
  const firstCandidate = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= firstCandidate; offset--) {
    if (bytes.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  return null;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

function parseCentralDirectory(bytes: Buffer, maxExpandedBytes: number):
  | { entries: ArchiveEntry[]; centralDirectoryOffset: number; failureCode?: never }
  | { entries?: never; centralDirectoryOffset?: never; failureCode: DocxRenderInputFailure } {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset === null || eocdOffset >= 20 && bytes.readUInt32LE(eocdOffset - 20) === 0x07064b50) {
    return { failureCode: "unsafe_source_package" };
  }

  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskEntryCount = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || diskEntryCount !== entryCount ||
      entryCount === ZIP32_SENTINEL || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff ||
      entryCount === 0 || entryCount > ZIP32_ENTRY_LIMIT) {
    return { failureCode: "unsafe_source_package" };
  }
  if (centralDirectoryOffset + centralDirectorySize !== eocdOffset || centralDirectorySize < entryCount * 46) {
    return { failureCode: "unsafe_source_package" };
  }

  const entries: ArchiveEntry[] = [];
  const seenNames = new Set<string>();
  let declaredExpandedBytes = 0n;
  let cursor = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > centralDirectoryEnd || bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      return { failureCode: "unsafe_source_package" };
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const compressionMethod = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const versionMadeBy = bytes.readUInt16LE(cursor + 4);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    const unsupportedFlags = flags & ~0x0806;
    const deflateOptions = flags & 0x0006;
    const creatorPlatform = versionMadeBy >>> 8;
    const unixFileType = creatorPlatform === 3 || creatorPlatform === 19
      ? (externalAttributes >>> 16) & 0xf000
      : 0;
    if (entryEnd > centralDirectoryEnd || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff || diskStart !== 0 || (flags & 0x2041) !== 0 ||
        unsupportedFlags !== 0 || deflateOptions === 0x0006 ||
        compressionMethod !== 0 && compressionMethod !== 8 || compressionMethod === 0 && deflateOptions !== 0 ||
        unixFileType !== 0 && unixFileType !== 0x8000 && unixFileType !== 0x4000) {
      return { failureCode: "unsafe_source_package" };
    }

    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const extraStart = cursor + 46 + nameLength;
    if (!validZipExtraFields(bytes, extraStart, extraLength)) return { failureCode: "unsafe_source_package" };
    const rawName = decodeEntryName(nameBytes, (flags & 0x0800) !== 0);
    // Keep only the canonical OPC name for all later lookup; `nameBytes` still binds the local header.
    const name = rawName === null ? null : canonicalizeUriComponent(rawName);
    const isDirectory = Boolean(name?.endsWith("/"));
    if (!name || !isSafeCanonicalArchiveName(name, isDirectory)) return { failureCode: "unsafe_source_package" };
    const lowerName = name.toLowerCase();
    if (seenNames.has(lowerName)) return { failureCode: "unsafe_source_package" };
    seenNames.add(lowerName);

    declaredExpandedBytes += BigInt(uncompressedSize);
    if (declaredExpandedBytes > BigInt(maxExpandedBytes)) return { failureCode: "source_too_large" };
    entries.push({
      name,
      lowerName,
      nameBytes,
      flags,
      compressionMethod,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory,
    });
    cursor = entryEnd;
  }
  if (cursor !== centralDirectoryEnd) return { failureCode: "unsafe_source_package" };
  return { entries, centralDirectoryOffset };
}

function validateLocalHeaders(bytes: Buffer, entries: ArchiveEntry[], centralDirectoryOffset: number): boolean {
  const offsets = new Set<number>();
  for (const entry of entries) {
    const offset = entry.localHeaderOffset;
    if (offset + 30 > centralDirectoryOffset || offsets.has(offset) || bytes.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) return false;
    offsets.add(offset);
    const localFlags = bytes.readUInt16LE(offset + 6);
    const localCompressionMethod = bytes.readUInt16LE(offset + 8);
    const localCrc = bytes.readUInt32LE(offset + 14);
    const localCompressedSize = bytes.readUInt32LE(offset + 18);
    const localUncompressedSize = bytes.readUInt32LE(offset + 22);
    const localNameLength = bytes.readUInt16LE(offset + 26);
    const localExtraLength = bytes.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (localCompressedSize === 0xffffffff || localUncompressedSize === 0xffffffff ||
        localFlags !== entry.flags || localCompressionMethod !== entry.compressionMethod ||
        localNameLength !== entry.nameBytes.byteLength || offset + 30 + localNameLength > centralDirectoryOffset ||
        dataOffset > centralDirectoryOffset || dataEnd > centralDirectoryOffset ||
        !bytes.subarray(offset + 30, offset + 30 + localNameLength).equals(entry.nameBytes)) return false;
    if (!validZipExtraFields(bytes, offset + 30 + localNameLength, localExtraLength)) return false;

    if (localCrc !== entry.crc32 || localCompressedSize !== entry.compressedSize || localUncompressedSize !== entry.uncompressedSize) return false;
    entry.dataOffset = dataOffset;
  }

  const orderedEntries = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  if (orderedEntries.length === 0 || orderedEntries[0].localHeaderOffset !== 0) return false;
  for (let index = 0; index < orderedEntries.length - 1; index++) {
    const current = orderedEntries[index];
    const next = orderedEntries[index + 1];
    if ((current.dataOffset ?? 0) + current.compressedSize !== next.localHeaderOffset) return false;
  }
  const last = orderedEntries[orderedEntries.length - 1];
  return (last.dataOffset ?? 0) + last.compressedSize === centralDirectoryOffset;
}

function decodeXml(bytes: Buffer): string | null {
  try {
    let actualEncoding = "utf-8";
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      actualEncoding = "utf-16le";
      bytes = bytes.subarray(2);
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      actualEncoding = "utf-16be";
      bytes = bytes.subarray(2);
    } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      bytes = bytes.subarray(3);
    }
    const xml = new TextDecoder(actualEncoding, { fatal: true }).decode(bytes);
    const declaration = /^<\?xml\s+([^?]*)\?>/i.exec(xml);
    const declaredEncoding = declaration?.[1].match(/\bencoding\s*=\s*(['"])([^'"]+)\1/i)?.[2].toLowerCase();
    if (declaredEncoding && !(actualEncoding === "utf-8" && declaredEncoding === "utf-8") &&
        !(actualEncoding === "utf-16le" && (declaredEncoding === "utf-16" || declaredEncoding === "utf-16le")) &&
        !(actualEncoding === "utf-16be" && (declaredEncoding === "utf-16" || declaredEncoding === "utf-16be"))) return null;
    return xml;
  } catch {
    return null;
  }
}

function decodeXmlAttributeValue(raw: string): string | null {
  let result = "";
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] !== "&") {
      result += raw[index];
      continue;
    }
    const semicolon = raw.indexOf(";", index + 1);
    if (semicolon === -1) return null;
    const entity = raw.slice(index + 1, semicolon);
    const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
    if (entity in named) result += named[entity];
    else if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const codePoint = entity[1].toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
      result += String.fromCodePoint(codePoint);
    } else return null;
    index = semicolon;
  }
  return result;
}

function localName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.lastIndexOf(":") + 1);
}

function parseTagName(xml: string, start: number): { name: string; next: number } | null {
  const match = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(xml.slice(start));
  return match ? { name: match[0], next: start + match[0].length } : null;
}

function parseAttributes(xml: string, start: number): { attributes: Map<string, string>; selfClosing: boolean; next: number } | null {
  const attributes = new Map<string, string>();
  let cursor = start;
  while (cursor < xml.length) {
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
    if (xml.startsWith(">", cursor)) return { attributes, selfClosing: false, next: cursor + 1 };
    if (xml.startsWith("/>", cursor)) return { attributes, selfClosing: true, next: cursor + 2 };
    const name = parseTagName(xml, cursor);
    if (!name || attributes.has(name.name)) return null;
    cursor = name.next;
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
    if (!xml.startsWith("=", cursor)) return null;
    cursor++;
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
    const quote = xml[cursor];
    if (quote !== "'" && quote !== '"') return null;
    cursor++;
    const valueStart = cursor;
    while (cursor < xml.length && xml[cursor] !== quote) cursor++;
    if (cursor >= xml.length) return null;
    const value = decodeXmlAttributeValue(xml.slice(valueStart, cursor));
    if (value === null) return null;
    attributes.set(name.name, value);
    cursor++;
  }
  return null;
}

function sourceDirectoryForRelationshipsPart(name: string): string | null {
  const parts = name.split("/");
  const fileName = parts.at(-1) ?? "";
  if (!fileName.endsWith(".rels") || parts.at(-2) !== "_rels") return null;
  return parts.slice(0, -2).join("/");
}

function hasSafeInternalTarget(target: string, sourceDirectory: string): boolean {
  const suffixStart = target.search(/[?#]/);
  const rawPath = suffixStart === -1 ? target : target.slice(0, suffixStart);
  const path = canonicalizeUriComponent(rawPath);
  if (!path || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return false;
  const segments = path.startsWith("/") ? [] : sourceDirectory.split("/").filter(Boolean);
  const pathSegments = (path.startsWith("/") ? path.slice(1) : path).split("/");
  if (pathSegments.some(segment => segment === "")) return false;
  for (const segment of pathSegments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return false;
      segments.pop();
      continue;
    }
    if (segment.includes(":") || segment.includes("\0")) return false;
    segments.push(segment);
  }
  return segments.length > 0;
}

function validateRelationshipsXml(bytes: Buffer, relsPartName: string): boolean {
  const sourceDirectory = sourceDirectoryForRelationshipsPart(relsPartName);
  const xml = decodeXml(bytes);
  if (sourceDirectory === null || xml === null || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) return false;

  let cursor = 0;
  const stack: string[] = [];
  let rootPrefix = "";
  let rootSeen = false;
  let rootClosed = false;
  const relationshipIds = new Set<string>();
  while (cursor < xml.length) {
    const nextTag = xml.indexOf("<", cursor);
    const textEnd = nextTag === -1 ? xml.length : nextTag;
    if (xml.slice(cursor, textEnd).trim() !== "") return false;
    if (nextTag === -1) break;
    cursor = nextTag;

    if (xml.startsWith("<!--", cursor)) {
      const commentEnd = xml.indexOf("-->", cursor + 4);
      if (commentEnd === -1) return false;
      cursor = commentEnd + 3;
      continue;
    }
    if (xml.startsWith("<?xml", cursor) && !rootSeen && cursor === 0) {
      const declaration = /^<\?xml\s+[^?]*\?>/i.exec(xml.slice(cursor));
      if (!declaration) return false;
      cursor += declaration[0].length;
      continue;
    }
    if (xml.startsWith("<!", cursor) || xml.startsWith("<?", cursor)) return false;

    let tagStart = cursor + 1;
    const closing = xml[tagStart] === "/";
    if (closing) tagStart++;
    const tag = parseTagName(xml, tagStart);
    if (!tag) return false;
    let tagName = tag.name;
    cursor = tag.next;
    if (closing) {
      while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
      if (!xml.startsWith(">", cursor) || stack.pop() !== tagName) return false;
      cursor++;
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    const parsed = parseAttributes(xml, cursor);
    if (!parsed) return false;
    cursor = parsed.next;
    const shortName = localName(tagName);
    if (!rootSeen) {
      if (shortName !== "Relationships" || rootClosed || stack.length !== 0) return false;
      rootPrefix = tagName.includes(":") ? tagName.slice(0, tagName.indexOf(":")) : "";
      const namespaceName = rootPrefix ? `xmlns:${rootPrefix}` : "xmlns";
      if (parsed.attributes.get(namespaceName) !== RELATIONSHIPS_NAMESPACE) return false;
      if ([...parsed.attributes.keys()].some(name => name !== "xmlns" && !/^xmlns:[A-Za-z_][A-Za-z0-9_.-]*$/.test(name))) return false;
      rootSeen = true;
    } else {
      if (rootClosed || stack.length > 1 || shortName !== "Relationship" ||
          (tagName.includes(":") ? tagName.slice(0, tagName.indexOf(":")) : "") !== rootPrefix) return false;
      const namespaceName = rootPrefix ? `xmlns:${rootPrefix}` : "xmlns";
      const declaredChildNamespace = parsed.attributes.get(namespaceName);
      if (declaredChildNamespace !== undefined && declaredChildNamespace !== RELATIONSHIPS_NAMESPACE) return false;
      for (const attributeName of parsed.attributes.keys()) {
        if (attributeName === "xmlns" || /^xmlns:[A-Za-z_][A-Za-z0-9_.-]*$/.test(attributeName)) continue;
        if (!(attributeName === "Id" || attributeName === "Type" || attributeName === "Target" || attributeName === "TargetMode")) return false;
      }
      const id = parsed.attributes.get("Id");
      const type = parsed.attributes.get("Type");
      const target = parsed.attributes.get("Target");
      const targetMode = parsed.attributes.get("TargetMode");
      if (!id || !type || !target || relationshipIds.has(id)) return false;
      relationshipIds.add(id);
      if (targetMode !== undefined && targetMode.toLowerCase() !== "internal") return false;
      if (!hasSafeInternalTarget(target, sourceDirectory)) return false;
    }

    if (parsed.selfClosing) {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push(tagName);
    }
  }
  return rootSeen && rootClosed && stack.length === 0;
}

function inflateEntry(bytes: Buffer, entry: ArchiveEntry, remainingBytes: number): Buffer | null {
  if (entry.dataOffset === undefined) return null;
  const compressedData = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) {
    if (compressedData.byteLength !== entry.uncompressedSize) return null;
    return compressedData;
  }
  try {
    const maxOutputLength = Math.min(remainingBytes, entry.uncompressedSize + 1);
    return inflateRawSync(compressedData, { maxOutputLength });
  } catch {
    return null;
  }
}

/**
 * Validate an untrusted OOXML package before any Office COM instance or temp file is created.
 * The input and its actual decompressed contents share the existing source-byte ceiling.
 * ZIP64 is rejected; ZIP32's 0xffff sentinel is reserved for ZIP64 entry-count signaling.
 */
function inspectDocxRenderInputUnchecked(sourceBytes: Uint8Array, maxExpandedBytes: number): DocxRenderInputInspection {
  if (!Number.isSafeInteger(maxExpandedBytes) || maxExpandedBytes <= 0 || sourceBytes.byteLength === 0) return unsafe();
  if (sourceBytes.byteLength > maxExpandedBytes) return tooLarge();
  const bytes = Buffer.from(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const directory = parseCentralDirectory(bytes, maxExpandedBytes);
  if (!directory.entries) return { safe: false, failureCode: directory.failureCode };
  if (!validateLocalHeaders(bytes, directory.entries, directory.centralDirectoryOffset)) return unsafe();

  const byName = new Set(directory.entries.map(entry => entry.name));
  if (!byName.has("[Content_Types].xml") || !byName.has("_rels/.rels") || !byName.has("word/document.xml")) return unsafe();
  for (const entry of directory.entries) {
    if (entry.lowerName.endsWith(".rels") && sourceDirectoryForRelationshipsPart(entry.name) === null) return unsafe();
  }

  let expandedBytes = 0;
  for (const entry of directory.entries) {
    const remainingBytes = maxExpandedBytes - expandedBytes;
    if (entry.uncompressedSize > remainingBytes) return tooLarge();
    const output = inflateEntry(bytes, entry, remainingBytes + 1);
    if (!output) return unsafe();
    if (output.byteLength > remainingBytes) return tooLarge();
    if (output.byteLength !== entry.uncompressedSize || crc32(output) !== entry.crc32) return unsafe();
    expandedBytes += output.byteLength;
    if (entry.lowerName.endsWith(".rels") && !validateRelationshipsXml(output, entry.name)) return unsafe();
  }
  return { safe: true, entryCount: directory.entries.length, expandedBytes };
}

/** Malformed archive bytes must become a rejection result, never escape the preflight boundary. */
export function inspectDocxRenderInput(sourceBytes: Uint8Array, maxExpandedBytes: number): DocxRenderInputInspection {
  try {
    return inspectDocxRenderInputUnchecked(sourceBytes, maxExpandedBytes);
  } catch {
    return unsafe();
  }
}
