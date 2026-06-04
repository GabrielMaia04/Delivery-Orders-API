module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ error: 'Push environment is not configured' });
  }

  return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};
