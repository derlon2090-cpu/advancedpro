import multer from "multer";

export const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});
