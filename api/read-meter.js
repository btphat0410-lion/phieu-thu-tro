module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing_api_key' });

  const { image, meterType } = req.body || {};
  if (typeof image !== 'string' || image.length > 3000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    return res.status(400).json({ error: 'bad_image' });
  }

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: image } },
              {
                text: `Đọc chỉ số trên ảnh đồng hồ ${meterType === 'nước' ? 'nước' : 'điện'}. Chỉ lấy các chữ số nguyên màu đen; bỏ phần thập phân/chữ số màu đỏ. Bỏ số 0 vô nghĩa ở đầu. Trả về duy nhất JSON theo dạng {"reading":123} hoặc {"reading":null}.`
              }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 32
          }
        })
      }
    );

    const result = await upstream.json();
    if (!upstream.ok) {
      const message = result.error && result.error.message;
      const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
      return res.status(status).json({ error: 'gemini_api_error', message: message || 'Gemini request failed' });
    }

    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    let reading = null;
    try {
      const parsed = JSON.parse(text);
      if (Number.isSafeInteger(parsed.reading) && parsed.reading >= 0) reading = parsed.reading;
    } catch (e) {}

    return res.status(200).json({ reading });
  } catch (error) {
    return res.status(500).json({ error: 'server_error', message: 'Không thể gọi Gemini, vui lòng thử lại.' });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '4mb' } }
};
