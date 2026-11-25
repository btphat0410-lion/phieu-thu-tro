// api/read-meter.js — Đọc số đồng hồ bằng Gemini (key giữ ở server, client không thấy)
// Biến môi trường: GEMINI_API_KEY = AQ.Ab8RN6... hoặc AIzaSy...

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
];

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'missing_api_key', message: 'Chưa cấu hình GEMINI_API_KEY trong Vercel.' });

  const { image, meterType } = req.body || {};
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Thiếu ảnh (base64).' });
  if (image.length > 3_000_000) return res.status(413).json({ error: 'Ảnh quá lớn (>2MB sau nén).' });

  const prompt = `Đọc chỉ số đồng hồ ${meterType === 'nước' ? 'nước (m³)' : 'điện (kWh)'} trong ảnh này. Chỉ lấy dãy số nguyên màu đen (bỏ số thập phân màu đỏ, số sau dấu phẩy hoặc dấu chấm). Bỏ số 0 vô nghĩa đứng đầu. Chỉ trả về JSON: {"reading":<số nguyên>} hoặc {"reading":null} nếu không đọc được. Không giải thích gì thêm.`;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: image } },
        { text: prompt },
      ],
    }],
    generationConfig: { maxOutputTokens: 128, responseMimeType: 'application/json', temperature: 0 },
  };

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });

      const data = await r.json();

      if (!r.ok) {
        const msg = (data.error && data.error.message) || '';
        const detail = msg.toLowerCase();
        const unavailable = /not found|not support|deprecated|not available|unavailable|does not exist/.test(detail);
        const modelPermissionDenied = r.status === 403 &&
          /(?:models?.{0,100}(?:access|permission|available)|(?:access|permission).{0,100}models?)/.test(detail);
        if (r.status === 404 || r.status === 503 || unavailable || modelPermissionDenied) continue;
        // Lỗi thật → trả về ngay
        return res.status(r.status).json({ error: 'api_error', message: msg || `HTTP ${r.status}` });
      }

      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(part => !part.thought)
        .map(part => part.text || '')
        .join('')
        .trim();
      const m = text.match(/\{[\s\S]*?\}/);
      let reading = null;
      try { reading = (m ? JSON.parse(m[0]) : null)?.reading; } catch {}

      // Ghi log model đã dùng thành công để debug
      console.log(`[read-meter] model=${model} reading=${reading}`);
      return res.status(200).json({ reading, model_used: model });

    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return res.status(504).json({ error: 'timeout', message: 'Gemini không phản hồi trong 45 giây.' });
      }
      // Lỗi mạng → thử model tiếp
      continue;
    }
  }

  return res.status(503).json({ error: 'no_model', message: 'Không có model Gemini nào hoạt động với key này.' });
}
