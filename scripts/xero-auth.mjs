import { createServer } from 'http';
import { parse } from 'url';

const CLIENT_ID     = 'EC7DAEEB0B364AC883C4EA0436072C43';
const CLIENT_SECRET = '5vHucFrmspuTRWU8DG1FvTb0HD9Muz5FFdzPerAshPYDhRvE';
const REDIRECT_URI  = 'http://localhost:3000/api/xero/callback';
const SCOPES = 'openid profile email accounting.invoices accounting.contacts accounting.attachments accounting.settings offline_access';

// Step 1: Print auth URL
const authUrl = `https://login.xero.com/identity/connect/authorize?` +
  `response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&state=123`;

console.log('\n=== STEP 1 ===');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback...\n');

// Step 2: Listen for callback on localhost:3000
const server = createServer(async (req, res) => {
  const { pathname, query } = parse(req.url, true);

  if (pathname !== '/api/xero/callback') {
    res.end('Not found');
    return;
  }

  const code = query.code;
  if (!code) {
    res.end('No code found');
    return;
  }

  // Step 3: Exchange code for tokens
  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.access_token) {
    res.end('Token exchange failed: ' + JSON.stringify(tokens));
    server.close();
    return;
  }

  // Step 4: Get tenant ID
  const connectionsRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const connections = await connectionsRes.json();
  const tenantId = connections[0]?.tenantId;

  // Step 5: Print everything
  res.end('Success! Check your terminal.');
  console.log('\n=== SUCCESS — Add these to .env.local ===\n');
  // console.log(`XERO_CLIENT_ID=${CLIENT_ID}`);
  // console.log(`XERO_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`XERO_TENANT_ID=${tenantId}`);
  console.log(`XERO_ACCESS_TOKEN=${tokens.access_token}`);
  console.log(`XERO_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\n=========================================\n');

  server.close();
  process.exit(0);
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000...');
});