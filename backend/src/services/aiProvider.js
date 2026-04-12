function requireKey(key, label) {
  if (!key) {
    const error = new Error(`مفتاح ${label} غير مضبوط في الخادم.`);
    error.statusCode = 500;
    throw error;
  }
}

export async function generateText({ prompt }) {
  const key = process.env.GEMINI_API_KEY;
  requireKey(key, "Gemini");

  // TODO: استبدل هذا بالنداء الحقيقي لـ Gemini.
  return {
    text: `تم استلام الطلب: ${prompt}`,
  };
}

export async function generateImage({ prompt }) {
  const key = process.env.GEMINI_IMAGE_API_KEY || process.env.IMAGEN_API_KEY || process.env.GEMINI_API_KEY;
  requireKey(key, "Imagen/Gemini Image");

  // TODO: استبدل هذا بالنداء الحقيقي لـ Imagen أو Gemini Image.
  return {
    resultUrl: "https://example.com/image-result",
  };
}

export async function generateVideo({ prompt }) {
  const key = process.env.VEO_API_KEY || process.env.GEMINI_API_KEY;
  requireKey(key, "Veo");

  // TODO: استبدل هذا بالنداء الحقيقي لـ Veo.
  return {
    resultUrl: null,
  };
}
