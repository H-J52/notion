module.exports = async function handler(req, res) {
  // ── 1. CORS 헤더는 항상 맨 먼저 (브라우저 preflight OPTIONS가 auth 전에 통과해야 함)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── 2. Secret token 인증
  const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET;
  if (!DASHBOARD_SECRET) {
    return res.status(500).json({ error: 'DASHBOARD_SECRET not configured' });
  }
  if (req.headers['x-dashboard-secret'] !== DASHBOARD_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_API_KEY) {
    return res.status(500).json({ error: 'NOTION_API_KEY not set' });
  }

  // ── 3. path 화이트리스트
  const notionPath = req.query.path;
  if (!notionPath) {
    return res.status(400).json({ error: 'path query parameter required' });
  }

  const isDbQuery  = /^databases\/[0-9a-f-]{32,36}\/query$/.test(notionPath);
  const isDbSchema = /^databases\/[0-9a-f-]{32,36}$/.test(notionPath);
  const isNewPage  = notionPath === 'pages';
  const isPage     = /^pages\/[0-9a-f-]{32,36}$/.test(notionPath);

  if (!isDbQuery && !isDbSchema && !isNewPage && !isPage) {
    return res.status(403).json({ error: 'Forbidden path' });
  }

  // ── 4. path별 허용 메서드 제한
  const allowedMethods = isDbQuery  ? ['POST']
    : isDbSchema ? ['GET']
    : isNewPage  ? ['POST']
    : isPage     ? ['PATCH']
    : [];

  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 5. Notion API 프록시
  const notionUrl = `https://api.notion.com/v1/${notionPath}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
    };

    if (['POST', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const response = await fetch(notionUrl, fetchOptions);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
