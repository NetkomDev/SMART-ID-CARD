#!/bin/bash
# Script untuk menjalankan semua server AKSIS secara bersamaan di localhost

echo "Memulai AKSIS Platform Services..."

# Hentikan semua proses ketika script dihentikan (Ctrl+C)
trap 'kill $(jobs -p) 2>/dev/null; exit' EXIT

# Jalankan backend API
npm run dev &
echo "✓ API Server berjalan di latar belakang"

# Jalankan frontend admin
npm run dev:admin &
echo "✓ Admin Web berjalan di latar belakang"

# Jalankan semua PWA
npm run dev:parent &
echo "✓ Parent PWA berjalan di latar belakang"

npm run dev:waste &
echo "✓ Waste PWA berjalan di latar belakang"

npm run dev:extracurricular &
echo "✓ Extracurricular PWA berjalan di latar belakang"

npm run dev:library &
echo "✓ Library Terminal berjalan di latar belakang"

echo ""
echo "Semua server telah berjalan! Tekan Ctrl+C untuk mematikan semua server."
echo "- API: http://localhost:3000"
echo "- Admin Web: http://localhost:4173"
echo "- Parent PWA: http://localhost:4174"
echo "- Waste PWA: http://localhost:4175"
echo "- Extracurricular PWA: http://localhost:4176"
echo "- Library Terminal: http://localhost:4177"
echo ""

# Tunggu hingga pengguna menekan Ctrl+C
wait
