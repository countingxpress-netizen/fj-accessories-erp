-- warehouse_transfers টেবিলের জন্য RLS পলিসি (লগইন করা ইউজার সব করতে পারবে —
-- অন্য টেবিলগুলোর (purchase_entries ইত্যাদি) মতো একই প্যাটার্ন)
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON warehouse_transfers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
