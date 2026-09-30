import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const secretNames = [
  'HOME_ASSISTANT_ACCESS_TOKEN',
  'GOOGLE_CLIENT_SECRET',
  'VERCEL_ACCESS_TOKEN',
  'AI_GATEWAY_API_KEY',
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'ATLAS_ENCRYPTION_KEY',
  'SESSION_SECRET',
]

const roots = ['apps/web/src', 'apps/web/dist'].filter((dir) => {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
})

const hits = []
for (const root of roots) {
  for (const file of walk(root)) {
    if (!/\.(js|mjs|cjs|html|css|vue|ts)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const name of secretNames) {
      if (text.includes(`VITE_${name}`) || text.includes(`${name}=`) && file.includes('dist')) hits.push(`${file} mentions ${name}`)
    }
  }
}

if (hits.length > 0) {
  console.error(hits.join('\n'))
  process.exit(1)
}
console.log('No server secrets found in the web bundle.')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}
