import json
import urllib.request
import urllib.parse
import random

# All 90 students data mapping with correct gender, pob, date_of_birth, address, photo_url

SD_STUDENTS = [
    # Grade 1 (Born 2019)
    {"name": "Achmad Rayhan", "nisn": "0000010001", "gender": "MALE", "dob": "2019-03-15", "pob": "Watampone", "address": "Jl. Merdeka No. 12, Watampone"},
    {"name": "Anisa Fitriani", "nisn": "0000010002", "gender": "FEMALE", "dob": "2019-07-20", "pob": "Watampone", "address": "Jl. Ahmad Yani No. 45, Watampone"},
    {"name": "Aliyyah Putri", "nisn": "0000010003", "gender": "FEMALE", "dob": "2019-05-10", "pob": "Watampone", "address": "Jl. Jend. Sudirman No. 18, Watampone"},
    {"name": "Muhammad Bilal", "nisn": "0000010004", "gender": "MALE", "dob": "2019-09-02", "pob": "Bone", "address": "Jl. Vetran No. 8, Watampone"},
    {"name": "Nabila Syakirah", "nisn": "0000010005", "gender": "FEMALE", "dob": "2019-11-14", "pob": "Watampone", "address": "Jl. MH. Thamrin No. 22, Watampone"},

    # Grade 2 (Born 2018)
    {"name": "Dimas Pratama", "nisn": "0000010006", "gender": "MALE", "dob": "2018-02-14", "pob": "Watampone", "address": "Jl. Basuki Rahmat No. 5, Watampone"},
    {"name": "Faqih Alfian", "nisn": "0000010007", "gender": "MALE", "dob": "2018-04-25", "pob": "Watampone", "address": "Jl. Kartini No. 30, Watampone"},
    {"name": "Zahra Humaira", "nisn": "0000010008", "gender": "FEMALE", "dob": "2018-08-11", "pob": "Makassar", "address": "Jl. Diponegoro No. 14, Watampone"},
    {"name": "Sultan Fadhil", "nisn": "0000010009", "gender": "MALE", "dob": "2018-10-05", "pob": "Watampone", "address": "Jl. Pemuda No. 9, Watampone"},
    {"name": "Clarissa Qanita", "nisn": "0000010010", "gender": "FEMALE", "dob": "2018-12-19", "pob": "Watampone", "address": "Jl. Dr. Wahidin No. 33, Watampone"},

    # Grade 3 (Born 2017)
    {"name": "Habibie Asyraf", "nisn": "0000010011", "gender": "MALE", "dob": "2017-01-18", "pob": "Watampone", "address": "Jl. Sukowati No. 11, Watampone"},
    {"name": "Naurah Hasna", "nisn": "0000010012", "gender": "FEMALE", "dob": "2017-04-09", "pob": "Bone", "address": "Jl. Sungai Musi No. 27, Watampone"},
    {"name": "Fathan Mubarak", "nisn": "0000010013", "gender": "MALE", "dob": "2017-06-22", "pob": "Watampone", "address": "Jl. Gatot Subroto No. 16, Watampone"},
    {"name": "Rania Azzahra", "nisn": "0000010014", "gender": "FEMALE", "dob": "2017-09-03", "pob": "Watampone", "address": "Jl. Hos Cokroaminoto No. 40, Watampone"},
    {"name": "Wildan Kenzie", "nisn": "0000010015", "gender": "MALE", "dob": "2017-11-28", "pob": "Makassar", "address": "Jl. Yos Sudarso No. 7, Watampone"},

    # Grade 4 (Born 2016)
    {"name": "Hafiz Zulkarnain", "nisn": "0000010016", "gender": "MALE", "dob": "2016-02-05", "pob": "Watampone", "address": "Jl. Sulawesi No. 19, Watampone"},
    {"name": "Kaylah Maharani", "nisn": "0000010017", "gender": "FEMALE", "dob": "2016-05-17", "pob": "Watampone", "address": "Jl. Kalimantan No. 12, Watampone"},
    {"name": "Muhammad Rizky", "nisn": "0000010018", "gender": "MALE", "dob": "2016-07-29", "pob": "Bone", "address": "Jl. Sumatera No. 25, Watampone"},
    {"name": "Sabrina Aulia", "nisn": "0000010019", "gender": "FEMALE", "dob": "2016-10-12", "pob": "Watampone", "address": "Jl. Jawa No. 8, Watampone"},
    {"name": "Dzaky Mubarak", "nisn": "0000010020", "gender": "MALE", "dob": "2016-12-01", "pob": "Watampone", "address": "Jl. Bali No. 14, Watampone"},

    # Grade 5 (Born 2015)
    {"name": "Atharizz Calief", "nisn": "0000010021", "gender": "MALE", "dob": "2015-01-24", "pob": "Watampone", "address": "Jl. Pattimura No. 50, Watampone"},
    {"name": "Felicia Naura", "nisn": "0000010022", "gender": "FEMALE", "dob": "2015-03-30", "pob": "Watampone", "address": "Jl. Imam Bonjol No. 3, Watampone"},
    {"name": "Adrian Setiawan", "nisn": "0000010023", "gender": "MALE", "dob": "2015-06-15", "pob": "Watampone", "address": "Jl. Pangeran Hidayat No. 21, Watampone"},
    {"name": "Nadira Safiya", "nisn": "0000010024", "gender": "FEMALE", "dob": "2015-08-08", "pob": "Bone", "address": "Jl. Cut Nyak Dien No. 17, Watampone"},
    {"name": "Kenzo Hamizan", "nisn": "0000010025", "gender": "MALE", "dob": "2015-11-03", "pob": "Watampone", "address": "Jl. RA. Kartini No. 36, Watampone"},

    # Grade 6 (Born 2014)
    {"name": "Reyhan Ramadhan", "nisn": "0000010026", "gender": "MALE", "dob": "2014-02-18", "pob": "Watampone", "address": "Jl. Sepinggan No. 2, Watampone"},
    {"name": "Syifa Nuraini", "nisn": "0000010027", "gender": "FEMALE", "dob": "2014-04-11", "pob": "Watampone", "address": "Jl. Ujung Pandang No. 29, Watampone"},
    {"name": "Arya Kusuma", "nisn": "0000010028", "gender": "MALE", "dob": "2014-07-05", "pob": "Watampone", "address": "Jl. Nusantara No. 15, Watampone"},
    {"name": "Dania Talita", "nisn": "0000010029", "gender": "FEMALE", "dob": "2014-09-21", "pob": "Watampone", "address": "Jl. Pendidikan No. 44, Watampone"},
    {"name": "Farhan Maulana", "nisn": "0000010030", "gender": "MALE", "dob": "2014-12-30", "pob": "Bone", "address": "Jl. Pramuka No. 10, Watampone"}
]

SMP_STUDENTS = [
    # Grade 7 (Born 2013)
    {"name": "Ageng Pangestu", "nisn": "0000020001", "gender": "MALE", "dob": "2013-01-15", "pob": "Watampone", "address": "Jl. Jend. Sudirman No. 102, Watampone"},
    {"name": "Aisyah Kirana", "nisn": "0000020002", "gender": "FEMALE", "dob": "2013-03-22", "pob": "Watampone", "address": "Jl. Ahmad Yani No. 88, Watampone"},
    {"name": "Bagas Ardiansyah", "nisn": "0000020003", "gender": "MALE", "dob": "2013-05-04", "pob": "Bone", "address": "Jl. Merdeka No. 64, Watampone"},
    {"name": "Cinta Laura", "nisn": "0000020004", "gender": "FEMALE", "dob": "2013-07-19", "pob": "Watampone", "address": "Jl. Vetran No. 51, Watampone"},
    {"name": "Devano Danendra", "nisn": "0000020005", "gender": "MALE", "dob": "2013-09-12", "pob": "Watampone", "address": "Jl. MH. Thamrin No. 37, Watampone"},
    {"name": "Erlangga Saputra", "nisn": "0000020006", "gender": "MALE", "dob": "2013-10-25", "pob": "Watampone", "address": "Jl. Basuki Rahmat No. 19, Watampone"},
    {"name": "Fiona Nabila", "nisn": "0000020007", "gender": "FEMALE", "dob": "2013-11-30", "pob": "Makassar", "address": "Jl. Kartini No. 82, Watampone"},
    {"name": "Gathan Pratama", "nisn": "0000020008", "gender": "MALE", "dob": "2013-12-14", "pob": "Watampone", "address": "Jl. Diponegoro No. 41, Watampone"},
    {"name": "Hana Humaira", "nisn": "0000020009", "gender": "FEMALE", "dob": "2013-02-08", "pob": "Watampone", "address": "Jl. Pemuda No. 73, Watampone"},
    {"name": "Irfan Fauzi", "nisn": "0000020010", "gender": "MALE", "dob": "2013-04-17", "pob": "Bone", "address": "Jl. Dr. Wahidin No. 55, Watampone"},

    # Grade 8 (Born 2012)
    {"name": "Jovan Malik", "nisn": "0000020011", "gender": "MALE", "dob": "2012-01-20", "pob": "Watampone", "address": "Jl. Sukowati No. 38, Watampone"},
    {"name": "Keysha Az-Zahra", "nisn": "0000020012", "gender": "FEMALE", "dob": "2012-03-11", "pob": "Watampone", "address": "Jl. Sungai Musi No. 60, Watampone"},
    {"name": "Lingga Buana", "nisn": "0000020013", "gender": "MALE", "dob": "2012-05-29", "pob": "Watampone", "address": "Jl. Gatot Subroto No. 42, Watampone"},
    {"name": "Mutia Anggraini", "nisn": "0000020014", "gender": "FEMALE", "dob": "2012-07-03", "pob": "Bone", "address": "Jl. Hos Cokroaminoto No. 91, Watampone"},
    {"name": "Naufal Athalla", "nisn": "0000020015", "gender": "MALE", "dob": "2012-09-18", "pob": "Watampone", "address": "Jl. Yos Sudarso No. 23, Watampone"},
    {"name": "Olivia Stefani", "nisn": "0000020016", "gender": "FEMALE", "dob": "2012-10-07", "pob": "Watampone", "address": "Jl. Sulawesi No. 54, Watampone"},
    {"name": "Pandu Wirawan", "nisn": "0000020017", "gender": "MALE", "dob": "2012-11-15", "pob": "Makassar", "address": "Jl. Kalimantan No. 31, Watampone"},
    {"name": "Qonita Luthfia", "nisn": "0000020018", "gender": "FEMALE", "dob": "2012-12-24", "pob": "Watampone", "address": "Jl. Sumatera No. 76, Watampone"},
    {"name": "Restu Permana", "nisn": "0000020019", "gender": "MALE", "dob": "2012-02-26", "pob": "Watampone", "address": "Jl. Jawa No. 49, Watampone"},
    {"name": "Salsabila Rahma", "nisn": "0000020020", "gender": "FEMALE", "dob": "2012-04-14", "pob": "Bone", "address": "Jl. Bali No. 67, Watampone"},

    # Grade 9 (Born 2011)
    {"name": "Taraka Adiyasa", "nisn": "0000020021", "gender": "MALE", "dob": "2011-01-09", "pob": "Watampone", "address": "Jl. Pattimura No. 112, Watampone"},
    {"name": "Utari Pramesti", "nisn": "0000020022", "gender": "FEMALE", "dob": "2011-03-18", "pob": "Watampone", "address": "Jl. Imam Bonjol No. 45, Watampone"},
    {"name": "Vanno Alghifari", "nisn": "0000020023", "gender": "MALE", "dob": "2011-05-27", "pob": "Watampone", "address": "Jl. Pangeran Hidayat No. 83, Watampone"},
    {"name": "Winda Lestari", "nisn": "0000020024", "gender": "FEMALE", "dob": "2011-07-02", "pob": "Bone", "address": "Jl. Cut Nyak Dien No. 59, Watampone"},
    {"name": "Xavier Putra", "nisn": "0000020025", "gender": "MALE", "dob": "2011-09-14", "pob": "Watampone", "address": "Jl. RA. Kartini No. 97, Watampone"},
    {"name": "Yasmin Shafira", "nisn": "0000020026", "gender": "FEMALE", "dob": "2011-10-31", "pob": "Watampone", "address": "Jl. Sepinggan No. 16, Watampone"},
    {"name": "Zaidan Hidayat", "nisn": "0000020027", "gender": "MALE", "dob": "2011-11-20", "pob": "Makassar", "address": "Jl. Ujung Pandang No. 71, Watampone"},
    {"name": "Aris Munandar", "nisn": "0000020028", "gender": "MALE", "dob": "2011-12-08", "pob": "Watampone", "address": "Jl. Nusantara No. 52, Watampone"},
    {"name": "Bella Safitri", "nisn": "0000020029", "gender": "FEMALE", "dob": "2011-02-13", "pob": "Watampone", "address": "Jl. Pendidikan No. 89, Watampone"},
    {"name": "Cakra Wijaya", "nisn": "0000020030", "gender": "MALE", "dob": "2011-06-25", "pob": "Bone", "address": "Jl. Pramuka No. 34, Watampone"}
]

SMA_STUDENTS = [
    # Grade 10 (Born 2010)
    {"name": "Andi Baso", "nisn": "0000030001", "gender": "MALE", "dob": "2010-01-12", "pob": "Watampone", "address": "Jl. Merdeka No. 101, Watampone"},
    {"name": "Andi Tenri", "nisn": "0000030002", "gender": "FEMALE", "dob": "2010-03-24", "pob": "Watampone", "address": "Jl. Ahmad Yani No. 150, Watampone"},
    {"name": "Muhammad Fadil", "nisn": "0000030003", "gender": "MALE", "dob": "2010-05-19", "pob": "Bone", "address": "Jl. Jend. Sudirman No. 200, Watampone"},
    {"name": "Nurul Inayah", "nisn": "0000030004", "gender": "FEMALE", "dob": "2010-07-08", "pob": "Watampone", "address": "Jl. Vetran No. 99, Watampone"},
    {"name": "Rahmat Hidayat", "nisn": "0000030005", "gender": "MALE", "dob": "2010-09-30", "pob": "Watampone", "address": "Jl. MH. Thamrin No. 75, Watampone"},
    {"name": "Sultan Hasanuddin", "nisn": "0000030006", "gender": "MALE", "dob": "2010-10-15", "pob": "Watampone", "address": "Jl. Basuki Rahmat No. 62, Watampone"},
    {"name": "Resky Amelia", "nisn": "0000030007", "gender": "FEMALE", "dob": "2010-11-28", "pob": "Makassar", "address": "Jl. Kartini No. 115, Watampone"},
    {"name": "Ahmad Faisal", "nisn": "0000030008", "gender": "MALE", "dob": "2010-12-04", "pob": "Watampone", "address": "Jl. Diponegoro No. 83, Watampone"},
    {"name": "Dian Ekawati", "nisn": "0000030009", "gender": "FEMALE", "dob": "2010-02-16", "pob": "Watampone", "address": "Jl. Pemuda No. 120, Watampone"},
    {"name": "Farhan Syah", "nisn": "0000030010", "gender": "MALE", "dob": "2010-04-22", "pob": "Bone", "address": "Jl. Dr. Wahidin No. 94, Watampone"},

    # Grade 11 (Born 2009)
    {"name": "Kaharuddin", "nisn": "0000030011", "gender": "MALE", "dob": "2009-01-05", "pob": "Watampone", "address": "Jl. Sukowati No. 77, Watampone"},
    {"name": "Mutiara Pertiwi", "nisn": "0000030012", "gender": "FEMALE", "dob": "2009-03-14", "pob": "Watampone", "address": "Jl. Sungai Musi No. 105, Watampone"},
    {"name": "Ilham Ramadhan", "nisn": "0000030013", "gender": "MALE", "dob": "2009-05-23", "pob": "Watampone", "address": "Jl. Gatot Subroto No. 88, Watampone"},
    {"name": "Rahmawati", "nisn": "0000030014", "gender": "FEMALE", "dob": "2009-07-09", "pob": "Bone", "address": "Jl. Hos Cokroaminoto No. 143, Watampone"},
    {"name": "Syahrul Gunawan", "nisn": "0000030015", "gender": "MALE", "dob": "2009-09-17", "pob": "Watampone", "address": "Jl. Yos Sudarso No. 66, Watampone"},
    {"name": "Nur Syamsi", "nisn": "0000030016", "gender": "FEMALE", "dob": "2009-10-03", "pob": "Watampone", "address": "Jl. Sulawesi No. 91, Watampone"},
    {"name": "Wahyu Hidayat", "nisn": "0000030017", "gender": "MALE", "dob": "2009-11-21", "pob": "Makassar", "address": "Jl. Kalimantan No. 78, Watampone"},
    {"name": "Fitriani Safitri", "nisn": "0000030018", "gender": "FEMALE", "dob": "2009-12-11", "pob": "Watampone", "address": "Jl. Sumatera No. 132, Watampone"},
    {"name": "Muhammad Syukri", "nisn": "0000030019", "gender": "MALE", "dob": "2009-02-27", "pob": "Watampone", "address": "Jl. Jawa No. 85, Watampone"},
    {"name": "Tari Maharani", "nisn": "0000030020", "gender": "FEMALE", "dob": "2009-04-18", "pob": "Bone", "address": "Jl. Bali No. 110, Watampone"},

    # Grade 12 (Born 2008)
    {"name": "Andi Batara", "nisn": "0000030021", "gender": "MALE", "dob": "2008-01-28", "pob": "Watampone", "address": "Jl. Pattimura No. 175, Watampone"},
    {"name": "Maghfira Putri", "nisn": "0000030022", "gender": "FEMALE", "dob": "2008-03-07", "pob": "Watampone", "address": "Jl. Imam Bonjol No. 92, Watampone"},
    {"name": "Ridwan Kamil", "nisn": "0000030023", "gender": "MALE", "dob": "2008-05-15", "pob": "Watampone", "address": "Jl. Pangeran Hidayat No. 140, Watampone"},
    {"name": "Hasna Mutmainnah", "nisn": "0000030024", "gender": "FEMALE", "dob": "2008-07-22", "pob": "Bone", "address": "Jl. Cut Nyak Dien No. 118, Watampone"},
    {"name": "Firman Utama", "nisn": "0000030025", "gender": "MALE", "dob": "2008-09-04", "pob": "Watampone", "address": "Jl. RA. Kartini No. 162, Watampone"},
    {"name": "Nurbaeti", "nisn": "0000030026", "gender": "FEMALE", "dob": "2008-10-19", "pob": "Watampone", "address": "Jl. Sepinggan No. 53, Watampone"},
    {"name": "Muhammad Arshad", "nisn": "0000030027", "gender": "MALE", "dob": "2008-11-30", "pob": "Makassar", "address": "Jl. Ujung Pandang No. 127, Watampone"},
    {"name": "Suci Rahmadani", "nisn": "0000030028", "gender": "FEMALE", "dob": "2008-12-14", "pob": "Watampone", "address": "Jl. Nusantara No. 98, Watampone"},
    {"name": "Tommy Kurniawan", "nisn": "0000030029", "gender": "MALE", "dob": "2008-02-02", "pob": "Watampone", "address": "Jl. Pendidikan No. 145, Watampone"},
    {"name": "Vina Panduwinata", "nisn": "0000030030", "gender": "FEMALE", "dob": "2008-06-11", "pob": "Bone", "address": "Jl. Pramuka No. 76, Watampone"}
]

def get_photo(name, gender):
    bg = "144837" if gender == "MALE" else "29634d"
    encoded_name = urllib.parse.quote(name)
    return f"https://ui-avatars.com/api/?name={encoded_name}&size=512&background={bg}&color=ffffff&bold=true"

statements = []
all_students = SD_STUDENTS + SMP_STUDENTS + SMA_STUDENTS

for s in all_students:
    photo = get_photo(s['name'], s['gender'])
    name_escaped = s['name'].replace("'", "''")
    address_escaped = s['address'].replace("'", "''")
    pob_escaped = s['pob'].replace("'", "''")
    
    stmt = f"""UPDATE students SET 
    gender = '{s['gender']}', 
    pob = '{pob_escaped}', 
    date_of_birth = '{s['dob']}', 
    address = '{address_escaped}', 
    photo_url = '{photo}',
    updated_at = NOW()
WHERE nisn = '{s['nisn']}';"""
    statements.append(stmt)

full_sql = "\n".join(statements)

with open("/tmp/update_students.sql", "w") as f:
    f.write(full_sql)

print(f"Generated UPDATE SQL for {len(all_students)} students in /tmp/update_students.sql")
