const path = require('path')
const dotenv = require('dotenv')

// 获取当前环境
const nodeEnv = process.env.NODE_ENV || 'development'

// 加载对应环境配置
const envFile = `.env.${nodeEnv}`

// 根据当前运行环境，读取对应的 .env 文件，并将配置加载到 process.env 中
dotenv.config({
  // Node.js内置模块，用于处理文件路径：会将相对路径转换成绝对路径
  path: path.resolve(process.cwd(), envFile)
})

// 校验微信小程序配置
if (nodeEnv === 'production') {
  if (!process.env.WECHAT_APP_ID) {
    throw new Error('缺少微信小程序配置：WECHAT_APP_ID')
  }

  if (!process.env.WECHAT_APP_SECRET) {
    throw new Error('缺少微信小程序配置：WECHAT_APP_SECRET')
  }
}

// 导出统一配置
const env = {
  // 应用配置
  app: {
    nodeEnv, // 当前运行环境
    port: Number(process.env.PORT) // 服务端口号
  },
  // 数据库配置
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  // 微信小程序配置
  wechat: {
    appId: process.env.WECHAT_APP_ID,
    appSecret: process.env.WECHAT_APP_SECRET
  },
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN
  },
  // OSS 配置
  oss: {
    bucket: process.env.OSS_BUCKET,
    region: process.env.OSS_REGION,
    endpoint: process.env.OSS_ENDPOINT,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    roleArn: process.env.OSS_ROLE_ARN,
    uploadMaxSize: Number(process.env.OSS_UPLOAD_MAX_SIZE),
    uploadPolicyTtl: Number(process.env.OSS_UPLOAD_POLICY_TTL)
  }
}

module.exports = env
