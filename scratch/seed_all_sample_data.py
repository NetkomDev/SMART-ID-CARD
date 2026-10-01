import urllib.request
import json

SUPABASE_URL = "https://mzurocuwgoqwooilxuvv.supabase.co"
PROJECT_ID = "mzurocuwgoqwooilxuvv"

# Sample photos (using UI Avatars or SVG avatars)
def get_photo(name, gender):
    bg = "144837" if gender == "MALE" else "29634d"
    return f"https://ui-avatars.com/api/?name={urllib.parse.quote(name)}&size=512&background={bg}&color=ffffff&bold=true"

sql_script = """
DO $$
DECLARE
  v_sd_id UUID; v_smp_id UUID; v_sma_id UUID;
  v_sd_year UUID; v_smp_year UUID; v_sma_year UUID;
  v_cid UUID; v_sid UUID;
BEGIN
  -- Get Schools
  SELECT id INTO v_sd_id FROM schools WHERE code = 'SDN1WTP';
  SELECT id INTO v_smp_id FROM schools WHERE code = 'SMPN1WTP';
  SELECT id INTO v_sma_id FROM schools WHERE code = 'SMAN3WTP';

  -- Get Academic Years
  SELECT id INTO v_sd_year FROM academic_years WHERE school_id = v_sd_id AND is_active = true LIMIT 1;
  SELECT id INTO v_smp_year FROM academic_years WHERE school_id = v_smp_id AND is_active = true LIMIT 1;
  SELECT id INTO v_sma_year FROM academic_years WHERE school_id = v_sma_id AND is_active = true LIMIT 1;

"""

# Define Classes & Students
sd_data = [
    # (code, name, grade, [(full_name, nisn, nis, gender, dob)])
    ("SD1A", "Kelas I-A", 1, [
        ("Ahmad Rayhan", "0151001001", "260101", "MALE", "2019-03-15"),
        ("Anisa Putri", "0151001002", "260102", "FEMALE", "2019-07-20")
    ]),
    ("SD1B", "Kelas I-B", 1, [
        ("Bilal Ramadhan", "0151001003", "260103", "MALE", "2019-05-10"),
        ("Citra Dewi", "0151001004", "260104", "FEMALE", "2019-09-02")
    ]),
    ("SD2A", "Kelas II-A", 2, [
        ("Dafi Prasetya", "0141002001", "250201", "MALE", "2018-02-14"),
        ("Elena Nur", "0141002002", "250202", "FEMALE", "2018-08-11")
    ]),
    ("SD2B", "Kelas II-B", 2, [
        ("Fadhil Al-Farisi", "0141002003", "250203", "MALE", "2018-04-25"),
        ("Gita Gutawa", "0141002004", "250204", "FEMALE", "2018-11-30")
    ]),
    ("SD3A", "Kelas III-A", 3, [
        ("Hafiz Zikri", "0131003001", "240301", "MALE", "2017-01-18"),
        ("Indah Permata", "0131003002", "240302", "FEMALE", "2017-06-05")
    ]),
    ("SD3B", "Kelas III-B", 3, [
        ("Joko Kusumo", "0131003003", "240303", "MALE", "2017-03-22"),
        ("Kiran Larasati", "0131003004", "240304", "FEMALE", "2017-10-14")
    ]),
    ("SD4A", "Kelas IV-A", 4, [
        ("Luqman Hakim", "0121004001", "230401", "MALE", "2016-05-09"),
        ("Mia Audina", "0121004002", "230402", "FEMALE", "2016-12-01")
    ]),
    ("SD4B", "Kelas IV-B", 4, [
        ("Naufal Azam", "0121004003", "230403", "MALE", "2016-07-19"),
        ("Olivia Safitri", "0121004004", "230404", "FEMALE", "2016-09-28")
    ]),
    ("SD5A", "Kelas V-A", 5, [
        ("Pradipta Putra", "0111005001", "220501", "MALE", "2015-04-03"),
        ("Qonita Zahra", "0111005002", "220502", "FEMALE", "2015-10-17")
    ]),
    ("SD5B", "Kelas V-B", 5, [
        ("Rafi Pratama", "0111005003", "220503", "MALE", "2015-08-21"),
        ("Salsabila Aulia", "0111005004", "220504", "FEMALE", "2015-11-05")
    ]),
    ("SD6A", "Kelas VI-A", 6, [
        ("Taufik Hidayat", "0101006001", "210601", "MALE", "2014-02-08"),
        ("Ulya Rahma", "0101006002", "210602", "FEMALE", "2014-06-14")
    ]),
    ("SD6B", "Kelas VI-B", 6, [
        ("Vino G. Bastian", "0101006003", "210603", "MALE", "2014-09-30"),
        ("Wulan Guritno", "0101006004", "210604", "FEMALE", "2014-12-25")
    ])
]

smp_data = [
    ("SMP7A", "Kelas VII-A", 7, [
        ("Aditya Febrian", "0092007001", "26701", "MALE", "2013-03-12"),
        ("Bunga Citra", "0092007002", "26702", "FEMALE", "2013-07-24")
    ]),
    ("SMP7B", "Kelas VII-B", 7, [
        ("Cakra Khan", "0092007003", "26703", "MALE", "2013-05-18"),
        ("Dara Rizki", "0092007004", "26704", "FEMALE", "2013-10-09")
    ]),
    ("SMP8A", "Kelas VIII-A", 8, [
        ("Eko Prasetyo", "0082008001", "25801", "MALE", "2012-01-30"),
        ("Fani Rahmawati", "0082008002", "25802", "FEMALE", "2012-08-15")
    ]),
    ("SMP8B", "Kelas VIII-B", 8, [
        ("Gilang Dirga", "0082008003", "25803", "MALE", "2012-04-05"),
        ("Hania Pertiwi", "0082008004", "25804", "FEMALE", "2012-11-22")
    ]),
    ("SMP9A", "Kelas IX-A", 9, [
        ("Irfan Bachdim", "0072009001", "24901", "MALE", "2011-02-17"),
        ("Jasmine Nadya", "0072009002", "24902", "FEMALE", "2011-06-29")
    ]),
    ("SMP9B", "Kelas IX-B", 9, [
        ("Kevin Sanjaya", "0072009003", "24903", "MALE", "2011-09-03"),
        ("Larasati Nur", "0072009004", "24904", "FEMALE", "2011-12-19")
    ])
]

sma_data = [
    ("SMA10A", "Kelas X-A", 10, [
        ("Andi Tenri Sa'na", "0063010001", "261001", "FEMALE", "2010-03-05"),
        ("Muh. Rizky Utama", "0063010002", "261002", "MALE", "2010-08-18")
    ]),
    ("SMA10B", "Kelas X-B", 10, [
        ("Nurfadhilah M.", "0063010003", "261003", "FEMALE", "2010-05-14"),
        ("Revaldi Perdana", "0063010004", "261004", "MALE", "2010-11-27")
    ]),
    ("SMA10C", "Kelas X-C", 10, [
        ("Siti Nurhaliza A.", "0063010005", "261005", "FEMALE", "2010-01-20"),
        ("Teuku Ryan", "0063010006", "261006", "MALE", "2010-09-08")
    ]),
    ("SMA11IPA", "Kelas XI-IPA 1", 11, [
        ("Tari Qadrisya", "0053011001", "251101", "FEMALE", "2009-04-12"),
        ("Umar Faruq", "0053011002", "251102", "MALE", "2009-10-31")
    ]),
    ("SMA11IPS", "Kelas XI-IPS 1", 11, [
        ("Valerie Thomas", "0053011003", "251103", "FEMALE", "2009-02-28"),
        ("Wildan Fitrah", "0053011004", "251104", "MALE", "2009-07-07")
    ]),
    ("SMA12IPA", "Kelas XII-IPA 1", 12, [
        ("Xavier Alexander", "0043012001", "241201", "MALE", "2008-01-15"),
        ("Yulia Rahman", "0043012002", "241202", "FEMALE", "2008-06-25")
    ]),
    ("SMA12IPS", "Kelas XII-IPS 1", 12, [
        ("Zidane Al-Gifari", "0043012003", "241203", "MALE", "2008-05-04"),
        ("Zaskia Gotik", "0043012004", "241204", "FEMALE", "2008-09-19")
    ])
]

def generate_level_sql(school_var, year_var, data_list):
    sql = ""
    for c_code, c_name, grade, students in data_list:
        sql += f"""
  -- Class {c_name}
  SELECT id INTO v_cid FROM classes WHERE school_id = {school_var} AND code = '{c_code}';
  IF v_cid IS NULL THEN
    v_cid := gen_random_uuid();
    INSERT INTO classes (id, school_id, academic_year_id, code, name, grade_level, is_active, created_at, updated_at)
    VALUES (v_cid, {school_var}, {year_var}, '{c_code}', '{c_name}', {grade}, true, NOW(), NOW());
  END IF;
"""
        for name, nisn, nis, gender, dob in students:
            photo = get_photo(name, gender)
            card_uid = f"UID{nisn}"
            card_serial = f"CARD-{nis}"
            qr_key = f"QR-{nisn}"
            sql += f"""
  SELECT id INTO v_sid FROM students WHERE school_id = {school_var} AND student_number = '{nis}';
  IF v_sid IS NULL THEN
    v_sid := gen_random_uuid();
    INSERT INTO students (id, school_id, nisn, student_number, full_name, gender, date_of_birth, pob, address, photo_url, is_active, created_at, updated_at)
    VALUES (v_sid, {school_var}, '{nisn}', '{nis}', '{name}', '{gender}', '{dob}', 'Watampone', 'Jl. Merdeka No. 12, Watampone', '{photo}', true, NOW(), NOW());
  ELSE
    UPDATE students SET photo_url = '{photo}', nisn = '{nisn}', full_name = '{name}', gender = '{gender}', date_of_birth = '{dob}' WHERE id = v_sid;
  END IF;

  -- Class Membership
  INSERT INTO student_class_history (id, school_id, student_id, class_id, academic_year_id, start_date, is_current, created_at, updated_at)
  VALUES (gen_random_uuid(), {school_var}, v_sid, v_cid, {year_var}, '2026-07-01', true, NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Student Card
  INSERT INTO student_cards (id, school_id, student_id, card_uid, card_serial, qr_key, status, production_status, created_at, updated_at)
  VALUES (gen_random_uuid(), {school_var}, v_sid, '{card_uid}', '{card_serial}', '{qr_key}', 'ACTIVE', 'VERIFIED', NOW(), NOW())
  ON CONFLICT DO NOTHING;
"""
    return sql

sql_script += generate_level_sql("v_sd_id", "v_sd_year", sd_data)
sql_script += generate_level_sql("v_smp_id", "v_smp_year", smp_data)
sql_script += generate_level_sql("v_sma_id", "v_sma_year", sma_data)

sql_script += "\nEND $$;\n"

with open("/tmp/seed_students.sql", "w") as f:
    f.write(sql_script)

print("SQL seed script written to /tmp/seed_students.sql. Total length:", len(sql_script))
