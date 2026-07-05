-- Enum for transaction types
DO $$ BEGIN
  CREATE TYPE public.credit_transaction_type AS ENUM ('recharge', 'consumption', 'adjustment', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Balance table (one row per org)
CREATE TABLE public.credit_balances (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_brl NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_recharged_brl NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_consumed_brl NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_balance_threshold_brl NUMERIC(12,2) NOT NULL DEFAULT 10.00,
  low_balance_alert_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.credit_balances TO authenticated;
GRANT ALL ON public.credit_balances TO service_role;

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org balance"
  ON public.credit_balances FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can update org balance settings"
  ON public.credit_balances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin'))
  WITH CHECK (public.has_role(auth.uid(), org_id, 'org_admin'));

CREATE POLICY "Admins can insert balance row"
  ON public.credit_balances FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), org_id, 'org_admin'));

CREATE TRIGGER trg_credit_balances_updated_at
  BEFORE UPDATE ON public.credit_balances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Transactions table
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.credit_transaction_type NOT NULL,
  amount_brl NUMERIC(12,2) NOT NULL,
  balance_after_brl NUMERIC(12,2),
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_org_created ON public.credit_transactions(org_id, created_at DESC);
CREATE INDEX idx_credit_transactions_type ON public.credit_transactions(type);

GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org transactions"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can insert manual transactions"
  ON public.credit_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), org_id, 'org_admin')
    AND type IN ('adjustment', 'refund')
    AND created_by = auth.uid()
  );