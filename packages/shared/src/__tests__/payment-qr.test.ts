import { describe, expect, it } from "vitest";
import { qrStoragePath, staleQrPaths } from "../utils/payment-qr";

const base = "https://project.supabase.co/storage/v1/object/public/payment-qr/";
const me = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

describe("qrStoragePath", () => {
  it("returns the path for a QR in my own folder", () => {
    expect(qrStoragePath(`${base}${me}/gcash-qr-1.jpg`, me)).toBe(`${me}/gcash-qr-1.jpg`);
  });

  it("ignores query strings and decodes the path", () => {
    expect(qrStoragePath(`${base}${me}/bank%20qr.png?t=1`, me)).toBe(`${me}/bank qr.png`);
  });

  it("refuses other people's files, other buckets and traversal", () => {
    expect(qrStoragePath(`${base}${other}/gcash.jpg`, me)).toBeNull();
    expect(qrStoragePath(`https://project.supabase.co/storage/v1/object/public/avatars/${me}/a.png`, me)).toBeNull();
    expect(qrStoragePath(`${base}${me}/../${other}/gcash.jpg`, me)).toBeNull();
    expect(qrStoragePath(null, me)).toBeNull();
    expect(qrStoragePath(`${base}${me}/a.png`, "")).toBeNull();
  });
});

describe("staleQrPaths", () => {
  it("deletes replaced and never-saved uploads but keeps what the profile points at", () => {
    const oldGcash = `${base}${me}/gcash-qr-1.jpg`;
    const unsaved = `${base}${me}/gcash-qr-2.jpg`;
    const newGcash = `${base}${me}/gcash-qr-3.jpg`;
    const bank = `${base}${me}/bank-qr-1.jpg`;
    expect(staleQrPaths([oldGcash, bank, unsaved, newGcash], [newGcash, bank], me)).toEqual([
      `${me}/gcash-qr-1.jpg`,
      `${me}/gcash-qr-2.jpg`,
    ]);
  });

  it("deletes nothing when nothing changed, and never another user's file", () => {
    const gcash = `${base}${me}/gcash.jpg`;
    expect(staleQrPaths([gcash], [gcash], me)).toEqual([]);
    expect(staleQrPaths([`${base}${other}/gcash.jpg`], [], me)).toEqual([]);
  });
});
