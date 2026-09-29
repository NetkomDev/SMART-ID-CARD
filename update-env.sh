while IFS='=' read -r key value; do
  if [[ -n "$key" && "$key" != \#* ]]; then
    echo "Updating $key"
    npx vercel env rm "$key" production -y 2>/dev/null
    npx vercel env add "$key" production <<< "$value"
  fi
done < .env
