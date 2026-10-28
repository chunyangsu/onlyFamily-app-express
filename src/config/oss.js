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
  const region = String(value || '')
    .trim()
    .replace(/^oss-/, '')
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

// STS客户端：用于获取附件上传所需的临时凭证
const stsClient = new OSS.STS({
  accessKeyId: ossConfig.accessKeyId,
  accessKeySecret: ossConfig.accessKeySecret
})

// OSS 角色临时凭证缓存
let roleCredentialsCache = null

// 提前 5 分钟刷新凭证，避免接近过期时间时生成 URL
const CREDENTIAL_REFRESH_BEFORE_MS = 5 * 60 * 1000

/**
 * 获取用于读取 OSS 对象的角色临时凭证
 */
async function getRoleCredentials() {
  const now = Date.now()
  if (roleCredentialsCache && roleCredentialsCache.expiration - now > CREDENTIAL_REFRESH_BEFORE_MS) {
    return roleCredentialsCache.credentials
  }
  // 使用现有长期 RAM 用户凭证扮演指定角色
  const result = await stsClient.assumeRole(ossConfig.roleArn, '', '3600', 'onlyFamilyReadAttachment')
  const credentials = result.credentials
  if (!credentials || !credentials.AccessKeyId || !credentials.AccessKeySecret || !credentials.SecurityToken || !credentials.Expiration) {
    throw new Error('获取 OSS 角色临时凭证失败')
  }
  roleCredentialsCache = {
    credentials,
    expiration: new Date(credentials.Expiration).getTime()
  }
  return credentials
}

/**
 * 获取 OSS 对象的临时签名访问 URL
 * @param {string} objectKey OSS 对象完整路径
 * @param {number} expires 有效期，单位秒，默认300秒(5分钟)
 * @returns {string} 签名访问 URL
 */
async function getOssUrl(objectKey, expires = 300) {
  if (typeof objectKey !== 'string' || !objectKey.trim()) {
    throw new Error('objectKey 不能为空')
  }

  if (!Number.isInteger(expires) || expires <= 0) {
    throw new Error('签名 URL 有效期必须是正整数')
  }

  const credentials = await getRoleCredentials()

  // 使用角色临时凭证创建 OSS 客户端
  const ossClient = new OSS({
    region: ossConfig.region,
    endpoint: ossConfig.endpoint,
    bucket: ossConfig.bucket,
    accessKeyId: credentials.AccessKeyId,
    accessKeySecret: credentials.AccessKeySecret,
    stsToken: credentials.SecurityToken,
    secure: true
  })

  return ossClient.signatureUrl(objectKey.trim(), {
    expires
  })
}

module.exports = {
  ossConfig,
  stsClient,
  normalizeSigningRegion,
  getOssUrl
}
