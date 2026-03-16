import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import express from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post(
  "/storage/uploads/request-url",
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const { uploadURL, objectPath } =
        await objectStorageService.createObjectEntityUpload();

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      console.error(
        "Error generating upload URL (signed URL fallback):",
        error,
      );
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

router.post(
  "/storage/uploads/direct",
  express.raw({ type: () => true, limit: "20mb" }),
  async (req: Request, res: Response) => {
    try {
      const contentType =
        (req.headers["x-file-content-type"] as string) ||
        req.headers["content-type"] ||
        "application/octet-stream";
      const fileName = (req.headers["x-file-name"] as string) || "upload";

      if (!req.body || req.body.length === 0) {
        res.status(400).json({ error: "No file data received" });
        return;
      }

      if (req.body.length > MAX_FILE_SIZE) {
        res.status(413).json({ error: "File too large (max 20MB)" });
        return;
      }

      const objectPath = await objectStorageService.uploadDirect(
        Buffer.from(req.body),
        contentType,
      );

      res.json({
        objectPath,
        fileName,
        fileSize: req.body.length,
        contentType,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Error serving public object:", error);
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const localFile = await objectStorageService.getLocalFile(objectPath);
    if (localFile) {
      res.setHeader("Content-Type", localFile.contentType);
      res.setHeader("Content-Length", String(localFile.data.length));
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(localFile.data);
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving object:", error);
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
