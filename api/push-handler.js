-- Rodar no Supabase SQL Editor

-- Tabela para guardar subscriptions de push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  endpoint    TEXT UNIQUE NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — só o service_role acessa (a function do Vercel usa service_role)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON push_subscriptions
  USING (auth.role() = 'service_role');
