const OSS = require('ali-oss')
const env = require('@/config/env')

const requiredEnv = ['bucket', 'region', 'endpoint', 'accessKeyId', 'accessKeySecret', 'roleArn']

for (const key of requiredEnv) {
  if (!env.oss[key]) {
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
  bucket: env.oss.bucket,
  region: normalizeSigningRegion(env.oss.region),
  endpoint: env.oss.endpoint,
  accessKeyId: env.oss.accessKeyId,
  accessKeySecret: env.oss.accessKeySecret,
  roleArn: env.oss.roleArn,
  readStsTtl: env.oss.readStsTtl,
  readUrlTtl: env.oss.readUrlTtl,
  maxFileSize: Number(env.oss.uploadMaxSize),
  policyTtl: Number(env.oss.uploadPolicyTtl)
}

// if (!Number.isInteger(ossConfig.readStsTtl) || ossConfig.readStsTtl < 900 || ossConfig.readStsTtl > 43200) {
//   throw new Error('OSS_READ_STS_TTL 必须是 900 到 43200 之间的整数秒数')
// }
// if (!Number.isInteger(ossConfig.readUrlTtl) || ossConfig.readUrlTtl <= 0 || ossConfig.readUrlTtl > ossConfig.readStsTtl) {
//   throw new Error('OSS_READ_URL_TTL 必须是正整数且不能超过 OSS_READ_STS_TTL')
// }

// STS客户端：用于获取附件上传所需的临时凭证
const stsClient = new OSS.STS({
  accessKeyId: ossConfig.accessKeyId,
  accessKeySecret: ossConfig.accessKeySecret
})

// OSS 角色临时凭证缓存
let roleCredentialsCache = null
let roleCredentialsRefreshPromise = null

// 满时长 URL 使用最近约 5 分钟内申请的凭证，兼顾接近 12 小时的有效期与缓存复用。
const CREDENTIAL_REUSE_WINDOW_SECONDS = 5 * 60
const CREDENTIAL_REFRESH_BEFORE_SECONDS = 5 * 60
const URL_SAFETY_SECONDS = 60

/**
 * 获取用于读取 OSS 对象的角色临时凭证
 */
async function getRoleCredentials(minRemainingSeconds = CREDENTIAL_REFRESH_BEFORE_SECONDS) {
  if (roleCredentialsCache && roleCredentialsCache.expiration - Date.now() > minRemainingSeconds * 1000) {
    return roleCredentialsCache
  }
  // 批量签名和文件验证共用刷新任务；失败时清除任务，允许后续请求重试。
  if (!roleCredentialsRefreshPromise) {
    roleCredentialsRefreshPromise = (async () => {
      const result = await stsClient.assumeRole(ossConfig.roleArn, '', ossConfig.readStsTtl, 'onlyFamilyReadAttachment')
      const credentials = result.credentials
      const expiration = Date.parse(credentials?.Expiration)
      if (!credentials?.AccessKeyId || !credentials.AccessKeySecret || !credentials.SecurityToken || !Number.isFinite(expiration) || expiration - Date.now() <= URL_SAFETY_SECONDS * 1000) {
        throw new Error('获取 OSS 角色临时凭证失败或凭证有效期不足')
      }
      roleCredentialsCache = { credentials, expiration }
      return roleCredentialsCache
    })().finally(() => {
      roleCredentialsRefreshPromise = null
    })
  }
  const cached = await roleCredentialsRefreshPromise
  if (cached.expiration - Date.now() <= minRemainingSeconds * 1000) {
    throw new Error('OSS 角色临时凭证剩余有效期不足，请检查 RAM 角色最大会话时间和服务器时钟')
  }
  return cached
}

/**
 * 获取 OSS 对象的临时签名访问 URL
 * @param {string} objectKey OSS 对象完整路径
 * @param {number} expires 有效期上限，单位秒，默认 43200 秒（12 小时）
 * @returns {Promise<string>} 签名访问 URL；兼容原有调用
 */
async function getOssUrl(objectKey, expires = ossConfig.readUrlTtl) {
  const { url } = await getSignedOssUrl(objectKey, expires)
  return url
}

/** 返回签名 URL 和真实到期时间（Unix 毫秒时间戳），供前端提前 5 分钟刷新。 */
async function getSignedOssUrl(objectKey, expires = ossConfig.readUrlTtl) {
  if (typeof objectKey !== 'string' || !objectKey.trim()) {
    throw new Error('objectKey 不能为空')
  }

  if (!Number.isInteger(expires) || expires <= 0 || expires > ossConfig.readStsTtl) {
    throw new Error('签名 URL 有效期必须是正整数且不能超过读取 STS 凭证有效期')
  }

  // 请求接近 STS 上限时允许约 5 分钟复用，否则要求凭证覆盖整个 URL 时长。
  const minRemainingSeconds = Math.min(expires + URL_SAFETY_SECONDS, ossConfig.readStsTtl - CREDENTIAL_REUSE_WINDOW_SECONDS)
  const { credentials, expiration } = await getRoleCredentials(minRemainingSeconds)
  const actualExpires = Math.min(expires, Math.floor((expiration - Date.now()) / 1000) - URL_SAFETY_SECONDS)
  if (actualExpires <= 0) {
    throw new Error('OSS 角色临时凭证已临近过期，请重试')
  }
  const url = createOssReadClient(credentials).signatureUrl(objectKey.trim(), {
    expires: actualExpires
  })
  // 从实际签名读取过期秒数，避免 SDK 的秒级取整与返回元数据不一致。
  const signedExpiration = Number(new URL(url).searchParams.get('Expires')) * 1000
  if (!Number.isFinite(signedExpiration) || signedExpiration <= Date.now()) {
    throw new Error('OSS 签名 URL 过期时间无效')
  }
  return {
    url,
    expiresTime: Math.min(signedExpiration, expiration - URL_SAFETY_SECONDS * 1000)
  }
}

// 复用读取角色凭证，供服务端验证对象，不向前端暴露凭证
async function getOssReadClient() {
  const { credentials } = await getRoleCredentials()
  return createOssReadClient(credentials)
}

function createOssReadClient(credentials) {
  return new OSS({
    region: ossConfig.region,
    endpoint: ossConfig.endpoint,
    bucket: ossConfig.bucket,
    accessKeyId: credentials.AccessKeyId,
    accessKeySecret: credentials.AccessKeySecret,
    stsToken: credentials.SecurityToken,
    secure: true
  })
}

module.exports = {
  ossConfig,
  stsClient,
  normalizeSigningRegion,
  getOssUrl,
  getSignedOssUrl,
  getOssReadClient
}
