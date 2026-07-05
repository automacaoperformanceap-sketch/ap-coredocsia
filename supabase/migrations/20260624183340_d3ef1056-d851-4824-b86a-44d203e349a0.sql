
-- Fix credit policies to use private.* schema-qualified SECURITY DEFINER functions
DROP POLICY IF EXISTS "Admins can insert balance row" ON public.credit_balances;
DROP POLICY IF EXISTS "Admins can update org balance settings" ON public.credit_balances;
DROP POLICY IF EXISTS "Members can view org balance" ON public.credit_balances;

CREATE POLICY "Admins can insert balance row" ON public.credit_balances
  FOR INSERT WITH CHECK (private.has_role(auth.uid(), org_id, 'org_admin'::app_role));
CREATE POLICY "Admins can update org balance settings" ON public.credit_balances
  FOR UPDATE USING (private.has_role(auth.uid(), org_id, 'org_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), org_id, 'org_admin'::app_role));
CREATE POLICY "Members can view org balance" ON public.credit_balances
  FOR SELECT USING (private.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Admins can insert manual transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Members can view org transactions" ON public.credit_transactions;

CREATE POLICY "Admins can insert manual transactions" ON public.credit_transactions
  FOR INSERT WITH CHECK (
    private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
    AND type = ANY (ARRAY['adjustment'::credit_transaction_type, 'refund'::credit_transaction_type])
    AND created_by = auth.uid()
  );
CREATE POLICY "Members can view org transactions" ON public.credit_transactions
  FOR SELECT USING (private.is_org_member(auth.uid(), org_id));

-- Harden user_roles UPDATE: platform admins cannot escalate any row to platform_admin,
-- and cannot modify their own role rows (prevents self-escalation/lockout abuse).
DROP POLICY IF EXISTS "Platform admins update roles" ON public.user_roles;
CREATE POLICY "Platform admins update roles" ON public.user_roles
  FOR UPDATE
  USING (
    private.is_platform_admin(auth.uid())
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    private.is_platform_admin(auth.uid())
    AND role <> 'platform_admin'::app_role
    AND user_id <> auth.uid()
  );

-- Harden platform admin INSERT: cannot insert org_admin either (org_admin grants belong to org admins flow)
DROP POLICY IF EXISTS "Platform admins insert non-platform roles" ON public.user_roles;
CREATE POLICY "Platform admins insert non-platform roles" ON public.user_roles
  FOR INSERT
  WITH CHECK (
    private.is_platform_admin(auth.uid())
    AND role <> 'platform_admin'::app_role
    AND user_id <> auth.uid()
  );
