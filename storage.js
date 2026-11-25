import { v2 as cloudinary } from "cloudinary";
import path from "node:path";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error("Missing Cloudinary server credentials.");
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

const BUCKETS = Object.freeze({
  "stc-media": { type: "upload", public: true },
  "stc-private-files": { type: "authenticated", public: false },
  "stc-payment-receipts": { type: "authenticated", public: false }
});

function bucketConfig(name) {
  const config = BUCKETS[name];
  if (!config) throw new Error("Storage bucket is not allowed: " + name);
  return config;
}

function cleanKey(key) {
  if (typeof key !== "string" || !key.trim() || key.startsWith("/") ||
      key.split("/").some(part => !part || part === "." || part === "..") ||
      !/^[a-zA-Z0-9_./-]+$/.test(key)) {
    throw new Error("Invalid storage key.");
  }
  return key.replace(/\\/g, "/");
}

function assetDetails(key) {
  const ext = path.posix.extname(key).slice(1).toLowerCase();
  const resourceType = ["pdf", "doc", "docx", "xls", "xlsx", "zip", "txt", "csv"].includes(ext)
    ? "raw"
    : ["mp4", "mov", "webm"].includes(ext) ? "video" : "image";
  const publicId = resourceType === "raw" ? key : key.slice(0, key.length - path.posix.extname(key).length);
  return { resourceType, publicId, format: ext || undefined };
}

function cloudinaryError(error) {
  return { message: error?.message || "Cloudinary storage operation failed.", name: error?.name };
}

class Bucket {
  constructor(name) {
    this.name = name;
    this.config = bucketConfig(name);
  }

  async upload(key, body, options = {}) {
    try {
      const safeKey = cleanKey(key);
      if (!Buffer.isBuffer(body)) throw new Error("Storage upload expects a Buffer.");
      if (!body.length) throw new Error("Cannot upload an empty file.");
      const { resourceType, publicId } = assetDetails(safeKey);
      const result = await cloudinary.uploader.upload(
        "data:" + (options.contentType || "application/octet-stream") + ";base64," + body.toString("base64"),
        {
          public_id: publicId,
          resource_type: resourceType,
          type: this.config.type,
          overwrite: Boolean(options.upsert),
          unique_filename: false,
          use_filename: false,
          invalidate: true
        }
      );
      return {
        data: { path: safeKey, id: result.asset_id, public_id: result.public_id, secure_url: result.secure_url },
        error: null
      };
    } catch (error) {
      return { data: null, error: cloudinaryError(error) };
    }
  }

  async remove(keys) {
    const removed = [];
    try {
      for (const key of keys || []) {
        const safeKey = cleanKey(key);
        const { resourceType, publicId } = assetDetails(safeKey);
        const result = await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType,
          type: this.config.type,
          invalidate: true
        });
        if (result.result !== "ok" && result.result !== "not found") {
          throw new Error("Cloudinary could not delete " + safeKey + ".");
        }
        removed.push(safeKey);
      }
      return { data: removed, error: null };
    } catch (error) {
      return { data: null, error: cloudinaryError(error) };
    }
  }

  getPublicUrl(key) {
    try {
      if (!this.config.public) throw new Error("This storage bucket is private.");
      const safeKey = cleanKey(key);
      const { resourceType, publicId } = assetDetails(safeKey);
      return {
        data: {
          publicUrl: cloudinary.url(publicId, {
            resource_type: resourceType,
            type: this.config.type,
            secure: true
          })
        }
      };
    } catch (error) {
      return { data: { publicUrl: null }, error: cloudinaryError(error) };
    }
  }

  async createSignedUrl(key, expiresIn = 300) {
    try {
      if (this.config.public) {
        const result = this.getPublicUrl(key);
        if (result.error) throw new Error(result.error.message);
        return { data: { signedUrl: result.data.publicUrl }, error: null };
      }
      const safeKey = cleanKey(key);
      const { resourceType, publicId, format } = assetDetails(safeKey);
      const ttl = Math.max(60, Math.min(3600, Number(expiresIn) || 300));
      const signedUrl = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: resourceType,
        type: this.config.type,
        expires_at: Math.floor(Date.now() / 1000) + ttl
      });
      return { data: { signedUrl }, error: null };
    } catch (error) {
      return { data: null, error: cloudinaryError(error) };
    }
  }
}

export const storage = { from: name => new Bucket(name) };
