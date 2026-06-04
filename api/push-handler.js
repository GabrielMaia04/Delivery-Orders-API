    if (!subs || subs.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }
  } catch (err) {
    console.error('push-handler error:', err);
    return res.status(500).json({ error: err.message });
  }