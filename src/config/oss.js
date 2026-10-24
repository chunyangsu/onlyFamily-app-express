const OSS = require('ali-oss')

const requiredEnv = ['OSS_BUCKET', 'OSS_REGION', 'OSS_ENDPOINT', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_ROLE_ARN']

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`缺少环境变量：${key}`)
  }
}

// ali-oss/Endpoint 常写为 oss-cn-shanghai，而 OSS V4 credential 的
// signing region 必须是 cn-shanghai。统一在配置层转换，避免签名和 endpoint 使用不同格式。
function normalizeSigningRegion(value) {
  const region = String(value || '').trim().replace(/^oss-/, '')
  if (!region || /[/:.\s]/.test(region)) {
    throw new Error('OSS_REGION 必须是有效地域 ID，例如 cn-shanghai')
  }
  return region
}

const ossConfig = {
  bucket: process.env.OSS_BUCKET,
  region: normalizeSigningRegion(process.env.OSS_REGION),
  endpoint: process.env.OSS_ENDPOINT,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  roleArn: process.env.OSS_ROLE_ARN,
  maxFileSize: Number(process.env.OSS_UPLOAD_MAX_SIZE || 10485760),
  policyTtl: Number(process.env.OSS_UPLOAD_POLICY_TTL || 60)
}

// STS 客户端只在服务端使用长期 RAM 用户凭证。
// 不要将这个实例或其凭证返回给前端。
const stsClient = new OSS.STS({
  accessKeyId: ossConfig.accessKeyId,
  accessKeySecret: ossConfig.accessKeySecret
})

module.exports = {
  ossConfig,
  stsClient,
  normalizeSigningRegion
}
