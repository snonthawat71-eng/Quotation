-- =========================================================
-- Migration 2: เพิ่มช่องค่าเริ่มต้นของใบแจ้งหนี้ (แยกจากใบเสนอราคา)
-- สำหรับโปรเจกต์ที่รัน schema.sql เวอร์ชันก่อนหน้าไปแล้ว
-- วิธีใช้: เข้า Supabase > SQL Editor > วางทั้งไฟล์นี้ > กด Run (ครั้งเดียว)
-- =========================================================

alter table public.companies add column if not exists invoice_notes text;
alter table public.companies add column if not exists invoice_payment_terms text;
