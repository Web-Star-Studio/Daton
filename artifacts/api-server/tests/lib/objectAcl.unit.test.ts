import { describe, expect, it, vi } from "vitest";
import {
  setObjectAclPolicy,
  getObjectAclPolicy,
  canAccessObject,
  ObjectPermission,
  type StoredObject,
  type ObjectAclPolicy,
} from "../../src/lib/objectAcl";

function makeStoredObject(overrides: Partial<StoredObject> = {}): StoredObject {
  return {
    name: "test-object",
    exists: vi.fn().mockResolvedValue(true),
    getMetadata: vi.fn().mockResolvedValue({ metadata: {} }),
    setMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeObjectWithPolicy(policy: ObjectAclPolicy): StoredObject {
  return makeStoredObject({
    getMetadata: vi.fn().mockResolvedValue({
      metadata: { "custom:aclPolicy": JSON.stringify(policy) },
    }),
  });
}

const samplePolicy: ObjectAclPolicy = {
  owner: "user-123",
  visibility: "private",
};

describe("setObjectAclPolicy", () => {
  it("throws when object does not exist", async () => {
    const obj = makeStoredObject({ exists: vi.fn().mockResolvedValue(false) });
    await expect(setObjectAclPolicy(obj, samplePolicy)).rejects.toThrow(
      "Object not found: test-object",
    );
  });

  it("stores the policy as JSON in object metadata", async () => {
    const setMetadata = vi.fn().mockResolvedValue(undefined);
    const obj = makeStoredObject({ setMetadata });
    await setObjectAclPolicy(obj, samplePolicy);
    expect(setMetadata).toHaveBeenCalledWith({
      "custom:aclPolicy": JSON.stringify(samplePolicy),
    });
  });
});

describe("getObjectAclPolicy", () => {
  it("returns null when metadata is empty", async () => {
    const obj = makeStoredObject({ getMetadata: vi.fn().mockResolvedValue({}) });
    expect(await getObjectAclPolicy(obj)).toBeNull();
  });

  it("returns null when ACL key is absent from metadata", async () => {
    const obj = makeStoredObject({
      getMetadata: vi.fn().mockResolvedValue({ metadata: { "other-key": "value" } }),
    });
    expect(await getObjectAclPolicy(obj)).toBeNull();
  });

  it("parses and returns the stored ACL policy", async () => {
    const obj = makeObjectWithPolicy(samplePolicy);
    expect(await getObjectAclPolicy(obj)).toEqual(samplePolicy);
  });
});

describe("canAccessObject", () => {
  it("returns false when no ACL policy exists", async () => {
    const obj = makeStoredObject();
    const result = await canAccessObject({
      objectFile: obj,
      requestedPermission: ObjectPermission.READ,
    });
    expect(result).toBe(false);
  });

  it("returns true for public object with READ permission", async () => {
    const obj = makeObjectWithPolicy({ owner: "u1", visibility: "public" });
    const result = await canAccessObject({
      objectFile: obj,
      requestedPermission: ObjectPermission.READ,
    });
    expect(result).toBe(true);
  });

  it("returns false for public object with WRITE permission and no userId", async () => {
    const obj = makeObjectWithPolicy({ owner: "u1", visibility: "public" });
    const result = await canAccessObject({
      objectFile: obj,
      requestedPermission: ObjectPermission.WRITE,
    });
    expect(result).toBe(false);
  });

  it("returns false when userId is absent and object is private", async () => {
    const obj = makeObjectWithPolicy({ owner: "u1", visibility: "private" });
    const result = await canAccessObject({
      objectFile: obj,
      requestedPermission: ObjectPermission.READ,
    });
    expect(result).toBe(false);
  });

  it("returns true when userId matches owner", async () => {
    const obj = makeObjectWithPolicy({ owner: "user-123", visibility: "private" });
    const result = await canAccessObject({
      userId: "user-123",
      objectFile: obj,
      requestedPermission: ObjectPermission.READ,
    });
    expect(result).toBe(true);
  });

  it("returns false for non-owner with no ACL rules", async () => {
    const obj = makeObjectWithPolicy({
      owner: "user-123",
      visibility: "private",
      aclRules: [],
    });
    const result = await canAccessObject({
      userId: "other-user",
      objectFile: obj,
      requestedPermission: ObjectPermission.READ,
    });
    expect(result).toBe(false);
  });
});
