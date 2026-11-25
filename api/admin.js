// api/admin.js — Quản lý tài khoản người dùng (chỉ Admin)
// Dùng Supabase Admin API với SERVICE_ROLE_KEY (chỉ chạy ở server, không lộ ra client)
//
// Các route:
//   GET  /api/admin?action=list              — Danh sách users
//   POST /api/admin  { action:'create', username, password, name, role } — Tạo user mới
//   POST /api/admin  { action:'delete', userId }                   — Xóa user
//   POST /api/admin  { action:'setpw',  userId, password }         — Đổi mật khẩu
//   POST /api/admin  { action:'setrole',userId, role }             — Đổi role (admin/user)
import { normalizeUsername, usernameFromAuthEmail, usernameToAuthEmail } from '../lib/username.js';

export default async function handler(req, res) {
  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY)
    return res.status(500).json({ error: 'Thiếu biến môi trường Supabase.' });

  // ── Xác thực token & kiểm tra role admin ──────────────────────
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Token không hợp lệ hoặc hết hạn.' });

  const me = await userRes.json();
  const myRole = me?.app_metadata?.role || '';
  if (myRole !== 'admin')
    return res.status(403).json({ error: 'Chỉ Admin mới được quản lý tài khoản.' });

  // ── Headers dùng Service Role ──────────────────────────────────
  const H = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  };
  const BASE = `${SUPABASE_URL}/auth/v1/admin/users`;

  // ── GET: danh sách users ───────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(`${BASE}?page=1&per_page=100`, { headers: H });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: d.message || 'Lỗi lấy danh sách.' });
    // Trả về thông tin gọn
    const users = (d.users || []).map(u => ({
      id:         u.id,
      email:      u.email,
      username:   usernameFromAuthEmail(u.email, SUPABASE_URL) || normalizeUsername(u.user_metadata?.username),
      name:       u.user_metadata?.name || '',
      role:       u.app_metadata?.role || 'user',
      created_at: u.created_at,
      last_sign:  u.last_sign_in_at,
    }));
    return res.status(200).json({ users });
  }

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed.' });

  const { action, username: rawUsername, password, userId, name, role } = req.body || {};

  // ── Tạo user mới ───────────────────────────────────────────────
  if (action === 'create') {
    const username = normalizeUsername(rawUsername);
    if (!username || !password)
      return res.status(400).json({ error: 'Tên đăng nhập không hợp lệ hoặc thiếu mật khẩu.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' });
    const newRole = role || 'user';
    if (!['admin', 'user'].includes(newRole))
      return res.status(400).json({ error: 'Role không hợp lệ.' });
    const email = usernameToAuthEmail(username, SUPABASE_URL);

    const r = await fetch(BASE, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,          // bỏ qua bước xác nhận email
        user_metadata: { name: name || '', username },
      }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(400).json({ error: d.message || 'Tạo tài khoản thất bại.' });
    if (newRole === 'admin') {
      const roleRes = await fetch(`${BASE}/${d.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({
          app_metadata: { role: 'admin' },
        }),
      });
      const roleData = await roleRes.json();
      if (!roleRes.ok)
        return res.status(502).json({ error: `Đã tạo tài khoản nhưng không cấp được quyền Admin: ${roleData.message || 'Lỗi cập nhật role.'}` });
    }
    return res.status(200).json({ ok: true, user: { id: d.id, username } });
  }

  // ── Xóa user ───────────────────────────────────────────────────
  if (action === 'delete') {
    if (!userId) return res.status(400).json({ error: 'Thiếu userId.' });
    if (userId === me.id) return res.status(400).json({ error: 'Không thể tự xóa chính mình.' });
    const r = await fetch(`${BASE}/${userId}`, { method: 'DELETE', headers: H });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return res.status(400).json({ error: d.message || 'Xóa thất bại.' });
    }
    return res.status(200).json({ ok: true });
  }

  // ── Đổi mật khẩu ──────────────────────────────────────────────
  if (action === 'setpw') {
    if (!userId || !password) return res.status(400).json({ error: 'Thiếu userId hoặc mật khẩu.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' });
    const r = await fetch(`${BASE}/${userId}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ password }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(400).json({ error: d.message || 'Đổi mật khẩu thất bại.' });
    return res.status(200).json({ ok: true });
  }

  // ── Đổi role ──────────────────────────────────────────────────
  if (action === 'setrole') {
    if (!userId || !role) return res.status(400).json({ error: 'Thiếu userId hoặc role.' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role không hợp lệ.' });
    if (userId === me.id && role !== 'admin') return res.status(400).json({ error: 'Không thể tự hạ quyền chính mình.' });
    const r = await fetch(`${BASE}/${userId}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ app_metadata: { role } }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(400).json({ error: d.message || 'Đổi quyền thất bại.' });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'action không hợp lệ.' });
}
