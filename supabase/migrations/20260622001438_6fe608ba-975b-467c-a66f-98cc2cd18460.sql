
CREATE POLICY "Org members can view fellow member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om1
    JOIN public.organization_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = auth.uid()
      AND om2.user_id = profiles.id
  )
);
