const crypto = require('node:crypto')
const { ossConfig, stsClient } = require('@/config/oss')
const { generateObjectKey } = require('@/utils/oss')

/**
 * HMAC-SHA256 加密计算
 * 底层加密工具，使用 Node.js 内置的 crypto 模块
 * 作用：为后面的V4签名计算提供基础能力。它不是普通的哈希计算，而是结合密钥进行的消息认证码计算
 * @param {*} key HMAC使用的密钥
 * @param {*} value 需要参与计算的数据
 * @param {*} encoding 输出格式，例如 hex
 * @returns 返回十六进制字符串形式的 HMAC 计算结果
 */
const hmacSha256 = (key, value, encoding) => {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding)
}

/**
 * 派生 OSS V4 签名密钥
 * OSS V4 签名不是直接使用 AccessKeySecret 对 Policy 签名，而是按照规定的顺序派生签名密钥
 * @param {*} secret
 * @param {*} date
 * @param {*} region
 * @returns
 */
const getV4SigningKey = (secret, date, region) => {
  const dateKey = hmacSha256(`aliyun_v4${secret}`, date)

  const dateRegionKey = hmacSha256(dateKey, region)

  const dateRegionServiceKey = hmacSha256(dateRegionKey, 'oss')

  return hmacSha256(dateRegionServiceKey, 'aliyun_v4_request')
}

/**
 * 生成最终 V4 签名
 * 作用：让 OSS 能够验证上传请求携带的签名是否与 Policy 相匹配
 * 这个方法分为两步：
 * 1. 调用 getV4SigningKey()，得到最终签名密钥
 * 2. 使用该密钥对 policyBase64 进行 HMAC-SHA256 计算，输出十六进制签名
 * @param {*} accessKeySecret
 * @param {*} date
 * @param {*} region
 * @param {*} policyBase64
 * @returns
 */
const createV4Signature = (accessKeySecret, date, region, policyBase64) => {
  const signingKey = getV4SigningKey(accessKeySecret, date, region)
  // OSS V4 表单签名结果使用十六进制字符串
  return hmacSha256(signingKey, policyBase64, 'hex')
}

/**
 * 生成 UTC 签名时间
 * @returns
 */
const getUtcDate = () => {
  const now = new Date()
  const date = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  return {
    date: date.slice(0, 8), // 用于派生签名密钥
    dateTime: date // 用于构造 x-oss-date 和 x-oss-credential 对应的日期信息
  }
}

/**
 * 生成 OSS 表单上传地址
 * 这个方法将 Bucket Endpoint 转换为 PostObject 所需的地址
 * 根据配置的存储桶端点构建PostObject端点
 * OSS PostObject必须以bucket根目录为目标，而不能以对象URL为目标
 * 它还会校验：
    - Endpoint 和 Bucket 是否配置。
    - 是否使用 HTTPS。
    - Endpoint 是否错误地包含路径、查询参数或凭证。
    - Bucket 前缀是否已经存在，避免重复拼接。
 */
const getPostObjectHost = (endpoint, bucket) => {
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

/**
 * 校验地域配置
 * 作用：防止 OSS Endpoint 和 Region 配错
 * @param {*} endpoint
 * @param {*} region
 */
const assertEndpointRegion = (endpoint, region) => {
  const hostname = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`).hostname.toLowerCase()
  const regionSuffix = `oss-${region}`.toLowerCase()
  if (!hostname.includes(regionSuffix)) {
    throw new Error(`OSS_ENDPOINT 与 OSS_REGION 不匹配：endpoint=${hostname}，region=${region}`)
  }
}

/**
 * 校验 Credential 格式
 * 作用：提前发现后端拼接 Credential 时的格式错误，而不是等到前端上传后才收到 OSS 的签名错误
 * 它检查：
   - AccessKeyId 是否一致。
   - 日期是否一致。
   - Region 是否一致。
   - 服务名是否为 oss。
   - 请求类型是否为 aliyun_v4_request。
 * @param {*} credential 
 * @param {*} accessKeyId 
 * @param {*} date 
 * @param {*} region 
 */
const assertV4Credential = (credential, accessKeyId, date, region) => {
  const parts = String(credential || '').split('/')
  if (parts.length !== 5 || parts[0] !== accessKeyId || parts[1] !== date.slice(0, 8) || parts[2] !== region || parts[3] !== 'oss' || parts[4] !== 'aliyun_v4_request') {
    throw new Error('OSS V4 credential 格式错误，请检查 AccessKey、日期和 Region')
  }
}

// 创建上传附件的policy
const createUploadPolicy = async ({ familyId, module }) => {
  assertEndpointRegion(ossConfig.endpoint, ossConfig.region)

  const maxFileSize = ossConfig.maxFileSize

  if (!Number.isSafeInteger(maxFileSize) || maxFileSize < 1) {
    throw new Error('OSS_UPLOAD_MAX_SIZE 配置错误')
  }

  const ttl = ossConfig.policyTtl

  if (!Number.isSafeInteger(ttl) || ttl < 10 || ttl > 300) {
    throw new Error('OSS_UPLOAD_POLICY_TTL 必须在 10 到 300 秒之间')
  }

  // 使用家庭ID、附件所属模块、年月和随机UUID生成对象路径
  const objectKey = generateObjectKey({ familyId, module })

  // 将STS临时权限进一步限制到本次生成的单个对象
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

  // 900 秒为 STS 会话有效期
  // 临时凭证不会直接返回给小程序
  const stsResult = await stsClient.assumeRole(ossConfig.roleArn, JSON.stringify(inlinePolicy), 900, `only-family-${module}`)

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
      },
      ['eq', '$success_action_status', '200']
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
    securityToken: credentials.SecurityToken, // STS返回的临时安全令牌
    // contentType, // 上传文件的MIME类型
    successActionStatus: 200 // 上传成功后HTTP返回200
    // maxFileSize, // 限制文件大小
    // expiration // 上传授权是否过期
  }
}

module.exports = {
  createUploadPolicy
}
