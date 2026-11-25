// api/data.js — Lấy và lưu dữ liệu tiền trọ qua Supabase (Service Role Key ở server)
// Biến môi trường cần đặt trong Vercel:
//   SUPABASE_URL              = https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = eyJ... (service_role key — KHÔNG để lộ ra client)
//   SUPABASE_ANON_KEY         = eyJ... (dùng để verify token người dùng)

export default async function handler(req, res) {
  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY          = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return res.status(500).json({ error: 'Thiếu biến môi trường Supabase.' });
  }

  // ── 1. Xác thực token người dùng gửi lên ──────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

  // Dùng anon key + user token để verify — Supabase /auth/v1/user trả về user nếu token hợp lệ
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.' });
  const userData = await userRes.json();
  const userId = userData.id; // UUID của user đang đăng nhập

  // ── 2. Headers dùng Service Role Key để đọc/ghi DB ────────────────────────
  const svcHeaders = {
    'Content-Type': 'application/json',
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Prefer':        'return=representation',
  };

  // Tên bảng trong Supabase (tạo theo hướng dẫn bên dưới)
  const TABLE = 'tro_data';

  // ── 3. GET — lấy dữ liệu mới nhất ────────────────────────────────────────
  if (req.method === 'GET') {
    // Lấy bản ghi dùng chung của toàn bộ ứng dụng
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.shared&select=*&limit=1`,
      { headers: svcHeaders }
    );
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(500).json({ error: 'Lỗi đọc DB: ' + (e.message || r.status) });
    }
    const rows = await r.json();
    if (!rows.length) return res.status(200).json({ data: null, has_data: false });
    return res.status(200).json({ data: rows[0].payload, has_data: true, updated_at: rows[0].updated_at, updated_by: rows[0].updated_by });
  }

  // ── 4. POST — lưu dữ liệu ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { payload, expectedExists, expectedUpdatedAt } = req.body || {};
    if (!payload) return res.status(400).json({ error: 'Thiếu payload.' });
    if (typeof expectedExists !== 'boolean')
      return res.status(400).json({ error: 'Phiên bản đồng bộ không hợp lệ. Tải lại ứng dụng.' });
    if (expectedExists && expectedUpdatedAt != null &&
        (typeof expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(expectedUpdatedAt))))
      return res.status(400).json({ error: 'Mốc đồng bộ không hợp lệ.' });

    // Kiểm tra dữ liệu tối thiểu
    if (!Array.isArray(payload.rooms) || !Array.isArray(payload.hist)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ (cần có rooms và hist).' });
    }

    // Xóa ảnh base64 trong hist để tránh row quá lớn (Supabase giới hạn 1MB/row)
    // Ảnh đồng hồ chỉ dùng để xem trước, không cần sync lên cloud
    const cleanPayload = {
      ...payload,
      hist: payload.hist.map(h => ({ ...h, imgE: null, imgW: null })),
    };

    const expectedTime = expectedUpdatedAt == null ? 0 : Date.parse(expectedUpdatedAt);
    const record = {
      payload: cleanPayload,
      updated_at: new Date(Math.max(Date.now(), expectedTime + 1)).toISOString(),
      updated_by: userData.email,
    };
    let url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
    let method = 'POST';
    let body = { id: 'shared', ...record };
    if (expectedExists) {
      const filters = new URLSearchParams({
        id: 'eq.shared',
        updated_at: expectedUpdatedAt == null ? 'is.null' : `eq.${expectedUpdatedAt}`,
        select: 'id,payload,updated_at,updated_by',
      });
      url += `?${filters}`;
      method = 'PATCH';
      body = record;
    }

    const r = await fetch(url, {
      method,
      headers: { ...svcHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (r.status === 409)
        return res.status(409).json({ conflict: true, error: 'Dữ liệu dùng chung vừa được tài khoản khác cập nhật.' });
      return res.status(500).json({ error: 'Lỗi ghi DB: ' + (e.message || r.status) });
    }
    const rows = await r.json();
    if (!rows.length)
      return res.status(409).json({ conflict: true, error: 'Dữ liệu dùng chung vừa được tài khoản khác cập nhật.' });
    return res.status(200).json({ ok: true, updated_at: rows[0].updated_at, updated_by: userData.email });
  }

  // ── 5. POST /api/read-meter — đọc số đồng hồ bằng Gemini ─────────────────
  // (route phụ, nếu cần dùng Gemini từ server thay vì browser)
  return res.status(405).json({ error: 'Method not allowed' });
}
