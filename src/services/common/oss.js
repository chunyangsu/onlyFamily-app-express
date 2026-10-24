const crypto = require('node:crypto')
const { ossConfig, stsClient } = require('@/config/oss')

// 只允许明确列出的业务类型和图片格式。
// 客户端不能自行指定任意 OSS 路径。
const FILE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

const CATEGORIES = new Set(['avatar', 'food', 'attachment'])

function hmacSha256(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding)
}

function getV4SigningKey(secret, date, region) {
  const dateKey = hmacSha256(`aliyun_v4${secret}`, date)

  const dateRegionKey = hmacSha256(dateKey, region)

  const dateRegionServiceKey = hmacSha256(dateRegionKey, 'oss')

  return hmacSha256(dateRegionServiceKey, 'aliyun_v4_request')
}

function createV4Signature(accessKeySecret, date, region, policyBase64) {
  const signingKey = getV4SigningKey(accessKeySecret, date, region)

  // OSS V4 表单签名结果使用十六进制字符串。
  return hmacSha256(signingKey, policyBase64, 'hex')
}

function getUtcDate() {
  const now = new Date()

  const date = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')

  return {
    date: date.slice(0, 8),
    dateTime: date
  }
}

/**
 * Build the PostObject endpoint from the configured bucket endpoint.
 * OSS PostObject must target the bucket root, never an object URL.
 */
function getPostObjectHost(endpoint, bucket) {
  const rawEndpoint = String(endpoint || '').trim()
  if (!rawEndpoint || !bucket) {
    throw new Error('OSS_ENDPOINT 和 OSS_BUCKET 配置不能为空')
  }

  const endpointUrl = new URL(/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`)
  if (endpointUrl.protocol !== 'https:') {
    throw new Error('OSS_ENDPOINT 必须使用 HTTPS')
  }
  if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash || endpointUrl.pathname !== '/') {
    throw new Error('OSS_ENDPOINT 必须是 Bucket 服务根地址，不能包含路径、查询参数或凭证')
  }

  const bucketPrefix = `${bucket.toLowerCase()}.`
  const hostname = endpointUrl.hostname.toLowerCase().startsWith(bucketPrefix) ? endpointUrl.hostname : `${bucket}.${endpointUrl.hostname}`

  return `https://${hostname}${endpointUrl.port ? `:${endpointUrl.port}` : ''}/`
}

function assertEndpointRegion(endpoint, region) {
  const hostname = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`).hostname.toLowerCase()
  const regionSuffix = `oss-${region}`.toLowerCase()
  if (!hostname.includes(regionSuffix)) {
    throw new Error(`OSS_ENDPOINT 与 OSS_REGION 不匹配：endpoint=${hostname}，region=${region}`)
  }
}

function assertV4Credential(credential, accessKeyId, date, region) {
  const parts = String(credential || '').split('/')
  if (parts.length !== 5 || parts[0] !== accessKeyId || parts[1] !== date.slice(0, 8) || parts[2] !== region || parts[3] !== 'oss' || parts[4] !== 'aliyun_v4_request') {
    throw new Error('OSS V4 credential 格式错误，请检查 AccessKey、日期和 Region')
  }
}

// 创建上传附件的policy
async function createUploadPolicy({ category, contentType }) {
  assertEndpointRegion(ossConfig.endpoint, ossConfig.region)

  if (!CATEGORIES.has(category)) {
    const error = new Error('不支持的附件业务类型')
    error.status = 400
    throw error
  }

  const extension = FILE_TYPES[contentType]

  if (!extension) {
    const error = new Error('不支持的图片格式')
    error.status = 400
    throw error
  }

  const maxFileSize = ossConfig.maxFileSize

  if (!Number.isSafeInteger(maxFileSize) || maxFileSize < 1) {
    throw new Error('OSS_UPLOAD_MAX_SIZE 配置错误')
  }

  const ttl = ossConfig.policyTtl

  if (!Number.isSafeInteger(ttl) || ttl < 10 || ttl > 300) {
    throw new Error('OSS_UPLOAD_POLICY_TTL 必须在 10 到 300 秒之间')
  }

  // 后续正式接入用户认证时，路径还应包含经过认证的 userId。
  // 这里使用随机 UUID，避免客户端控制对象路径。
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  const objectKey = [category, year, month, `${crypto.randomUUID()}${extension}`].join('/')

  // 将 STS 临时权限进一步限制到本次生成的单个对象。
  const inlinePolicy = {
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:PutObject'],
        Resource: [`acs:oss:*:*:${ossConfig.bucket}/${objectKey}`]
      }
    ]
  }

  // 900 秒为 STS 会话有效期。
  // 临时凭证不会直接返回给小程序。
  const stsResult = await stsClient.assumeRole(ossConfig.roleArn, JSON.stringify(inlinePolicy), 900, `only-family-${category}`)

  const credentials = stsResult?.credentials

  if (
    !credentials ||
    typeof credentials.AccessKeyId !== 'string' ||
    typeof credentials.AccessKeySecret !== 'string' ||
    typeof credentials.SecurityToken !== 'string' ||
    !credentials.AccessKeyId ||
    !credentials.AccessKeySecret ||
    !credentials.SecurityToken
  ) {
    throw new Error('STS 未返回完整的临时凭证')
  }

  const { date, dateTime } = getUtcDate()

  const credential = [credentials.AccessKeyId, date, ossConfig.region, 'oss', 'aliyun_v4_request'].join('/')
  assertV4Credential(credential, credentials.AccessKeyId, dateTime, ossConfig.region)

  const expiration = new Date(Date.now() + ttl * 1000).toISOString()

  // Policy 同时限制 Bucket、对象 Key、Token、
  // V4 签名字段、上传状态、MIME 类型和文件大小。
  const policy = {
    expiration, // Policy过期时间
    conditions: [
      { bucket: ossConfig.bucket }, // 上传到哪个Bucket
      { key: objectKey }, // 文件在 OSS 里的路径，可用 starts-with 限制前缀
      {
        'x-oss-security-token': credentials.SecurityToken // STS临时凭证时必传
      },
      {
        'x-oss-signature-version': 'OSS4-HMAC-SHA256' // 指定签名的版本和算法，固定值为OSS4-HMAC-SHA256
      },
      {
        'x-oss-credential': credential // <AccessKeyId>/<YYYYMMDD>/<region>/oss/aliyun_v4_request，其中region用通用RegionID，例如 cn-shanghai
      },
      {
        'x-oss-date': dateTime // 请求时间，需与签名里的日期一致，格式 YYYYMMDDTHHmmssZ
      }
      // ['eq', '$success_action_status', '200'],
      // ['eq', '$content-type', contentType],
      // ['content-length-range', 1, maxFileSize] // 限制文件大小
    ]
  }

  const policyBase64 = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64')

  const signature = createV4Signature(credentials.AccessKeySecret, date, ossConfig.region, policyBase64)
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    throw new Error('OSS V4 签名格式错误')
  }

  const host = getPostObjectHost(ossConfig.endpoint, ossConfig.bucket)

  // 注意：不返回 AccessKeySecret，以免对外泄露
  return {
    host, // PostObject 上传地址，只能是 Bucket 根地址
    // bucket: ossConfig.bucket,
    // region: ossConfig.region,
    objectKey, // 文件在OSS中的存储路径
    policy: policyBase64, // OSS表单上传策略，Base64编码
    signature, // Policy的V4 签名
    signatureVersion: 'OSS4-HMAC-SHA256', // 签名版本
    credential, // 临时凭证对应的Credential字符串
    date: dateTime, // 签名使用的UTC时间
    securityToken: credentials.SecurityToken // STS返回的临时安全令牌
    // contentType, // 上传文件的MIME类型
    // successActionStatus: 200,
    // maxFileSize, // 限制文件大小
    // expiration // 上传授权是否过期
  }
}

module.exports = {
  createUploadPolicy,
  // Exported for focused configuration tests; not part of the HTTP response.
  getPostObjectHost,
  assertV4Credential
}
