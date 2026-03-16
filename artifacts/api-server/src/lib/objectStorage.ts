import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function createObjectStorageClient(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: getRequiredEnv("S3_ENDPOINT"),
    credentials: {
      accessKeyId: getRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}

let cachedObjectStorageClient: S3Client | null = null;

function getObjectStorageClient(): S3Client {
  if (!cachedObjectStorageClient) {
    cachedObjectStorageClient = createObjectStorageClient();
  }

  return cachedObjectStorageClient;
}

function isMissingObjectError(error: unknown): boolean {
  if (error instanceof NoSuchKey) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    maybeError.name === "NoSuchKey" ||
    maybeError.name === "NotFound" ||
    maybeError.Code === "NoSuchKey" ||
    maybeError.Code === "NotFound" ||
    maybeError.$metadata?.httpStatusCode === 404
  );
}

function bodyToWebStream(body: unknown): ReadableStream {
  if (body && typeof body === "object" && "transformToWebStream" in body) {
    const streamable = body as { transformToWebStream(): ReadableStream };
    return streamable.transformToWebStream();
  }

  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream;
  }

  throw new Error("Unsupported object storage response body");
}

class StoredS3Object {
  public readonly name: string;

  constructor(
    public readonly bucketName: string,
    public readonly objectName: string,
  ) {
    this.name = objectName;
  }

  async exists(): Promise<boolean> {
    try {
      await getObjectStorageClient().send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.objectName,
        }),
      );
      return true;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(): Promise<{
    contentType?: string;
    size?: number;
    metadata?: Record<string, string | undefined>;
  }> {
    const metadata = await getObjectStorageClient().send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
      }),
    );

    return {
      contentType: metadata.ContentType,
      size: metadata.ContentLength,
      metadata: metadata.Metadata,
    };
  }

  async setMetadata(metadata: Record<string, string>): Promise<void> {
    const current = await getObjectStorageClient().send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
      }),
    );

    const encodedKey = encodeURIComponent(this.objectName).replace(/%2F/g, "/");

    // S3-compatible providers replace metadata by copying the object onto itself.
    await getObjectStorageClient().send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
        CopySource: `${this.bucketName}/${encodedKey}`,
        MetadataDirective: "REPLACE",
        Metadata: {
          ...(current.Metadata ?? {}),
          ...metadata,
        },
        ContentType: current.ContentType,
        CacheControl: current.CacheControl,
        ContentDisposition: current.ContentDisposition,
        ContentEncoding: current.ContentEncoding,
        ContentLanguage: current.ContentLanguage,
      }),
    );
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );

    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Configure S3-style paths such as /bucket/public.",
      );
    }

    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Configure an S3-style path such as /bucket/private.",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StoredS3Object | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath.replace(/\/$/, "")}/${filePath.replace(/^\//, "")}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const file = new StoredS3Object(bucketName, objectName);

      if (await file.exists()) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: StoredS3Object,
    cacheTtlSec = 3600,
  ): Promise<Response> {
    const metadata = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const object = await getObjectStorageClient().send(
      new GetObjectCommand({
        Bucket: file.bucketName,
        Key: file.objectName,
      }),
    );

    if (!object.Body) {
      throw new ObjectNotFoundError();
    }

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };

    if (metadata.size != null) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(bodyToWebStream(object.Body), { headers });
  }

  async createObjectEntityUpload(): Promise<{
    uploadURL: string;
    objectPath: string;
  }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir.replace(/\/$/, "")}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await getSignedUrl(
      getObjectStorageClient(),
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectName,
      }),
      { expiresIn: 900 },
    );

    return {
      uploadURL,
      objectPath: `/objects/uploads/${objectId}`,
    };
  }

  async uploadDirect(data: Buffer, contentType: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir.replace(/\/$/, "")}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    await getObjectStorageClient().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectName,
        Body: data,
        ContentType: contentType,
      }),
    );

    return `/objects/uploads/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredS3Object> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }

    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const objectFile = new StoredS3Object(bucketName, objectName);

    if (!(await objectFile.exists())) {
      throw new ObjectNotFoundError();
    }

    return objectFile;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    if (!rawPath.startsWith("/")) {
      return rawPath;
    }

    const objectFile = await this.getObjectEntityFile(rawPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return rawPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StoredS3Object;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(rawPath: string): {
  bucketName: string;
  objectName: string;
} {
  let normalizedPath = rawPath;
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }

  const pathParts = normalizedPath.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
