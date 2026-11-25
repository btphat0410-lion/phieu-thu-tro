// Exchange a Supabase refresh token for a new access token.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return res.status(500).json({ error: 'Chưa cấu hình Supabase.' });

  const refreshToken = String(req.body?.refresh_token || '').trim();
  if (!refreshToken) return res.status(400).json({ error: 'Thiếu refresh token.' });

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await response.json();
    if (!response.ok)
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
  } catch {
    return res.status(502).json({ error: 'Không thể kết nối dịch vụ xác thực.' });
  }
}
