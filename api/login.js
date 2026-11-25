// api/login.js — Xử lý đăng nhập username/email và mật khẩu qua Supabase Auth
// Biến môi trường: SUPABASE_URL, SUPABASE_ANON_KEY
import { normalizeUsername, usernameFromAuthEmail, usernameToAuthEmail } from '../lib/username.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return res.status(500).json({ error: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY.' });

  const { identifier, email, password } = req.body || {};
  const loginId = String(identifier || email || '').trim();
  if (!loginId || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập/email hoặc mật khẩu.' });
  const username = loginId.includes('@') ? '' : normalizeUsername(loginId);
  if (!loginId.includes('@') && !username)
    return res.status(400).json({ error: 'Tên đăng nhập cần dài 3–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
  const authEmail = username ? usernameToAuthEmail(username, SUPABASE_URL) : loginId;

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: authEmail, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data.error_description || data.message || data.error || 'Sai email hoặc mật khẩu.';
      return res.status(401).json({ error: msg });
    }

    // Chỉ dùng app_metadata làm nguồn phân quyền; user_metadata do người dùng tự cập nhật được.
    const role = data.user?.app_metadata?.role || 'user';

    return res.status(200).json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_in:    data.expires_in,
      user: {
        id:    data.user?.id,
        email: data.user?.email,
        username: usernameFromAuthEmail(data.user?.email, SUPABASE_URL) || undefined,
        name:  data.user?.user_metadata?.name || '',
        role,                             // 'admin' hoặc 'user'
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
}
