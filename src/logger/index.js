const pino = require('pino')
const path = require('path')

const { isProduction, logLevel, redactPaths } = require('./config')

/**
 * 项目根目录下的 logs 文件夹
 * __dirname：当前文件所在目录
 */

const logDir = path.resolve(__dirname, '../../logs')

/**
 * 日志输出配置
 *
 * 开发环境：启用控制台 + 文件双输出
 * 生产环境：输出原生 JSON
 */
const transport = isProduction
  ? undefined
  : pino.transport({
      // targets 是一个数组，每个元素代表一个独立的输出目标
      targets: [
        // 1. 控制台输出：美化日志
        // {
        //   target: 'pino-pretty', // 使用 pino-pretty 美化输出
        //   level: logLevel,
        //   options: {
        //     colorize: true,
        //     translateTime: 'SYS:standard',
        //     ignore: 'pid,hostname',
        //     singleLine: true
        //   }
        // },
        // 2. app.log：全量日志文件
        {
          target: 'pino-roll',
          level: logLevel,
          options: {
            file: path.join(logDir, 'app.log'),
            size: '20m', // 每个日志文件达到约 20 MB 时自动创建新的日志文件
            mkdir: true, // 如果 logs 目录不存在，自动创建目录
            limit: {
              count: 5, // 保留最多 5 个轮转文件，另外还会有当前正在写入的文件。因此最多约为 6 个文件
              removeOtherLogFiles: true // 会让轮转清理也检查之前运行进程产生的同类日志文件，避免开发过程中日志无限积累
            }
          }
        },
        // 3. error.log：错误日志文件
        {
          target: 'pino-roll',
          level: 'error',
          options: {
            file: path.join(logDir, 'error.log'),
            size: '20m',
            mkdir: true,
            limit: {
              count: 5,
              removeOtherLogFiles: true
            }
          }
        }
      ]
    })

/**
 * 创建 Pino Logger 实例
 */
const logger = pino(
  {
    // 日志级别
    level: logLevel,
    // 服务基础信息
    base: {
      service: 'only-family-api',
      env: process.env.NODE_ENV || 'development'
    },
    // 时间格式
    timestamp: pino.stdTimeFunctions.isoTime,
    // 日志消息字段
    messageKey: 'msg',
    // 敏感字段脱敏
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]'
    }
  },
  transport
)

module.exports = logger
