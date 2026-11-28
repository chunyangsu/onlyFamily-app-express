const { createClient } = require('redis')
const env = require('@/config/env')

// 创建 Redis 客户端
const redisClient = createClient({
  socket: {
    host: env.redis.host,
    port: env.redis.port
  },
  password: env.redis.password,
  database: env.redis.database
})

// 监听错误
redisClient.on('error', (err) => {
  console.error('Redis Error:', err)
})

// 连接事件
redisClient.on('connect', () => {
  console.log('Redis connecting...')
})

// 连接成功
redisClient.on('ready', () => {
  console.log('Redis connected successfully')
})

// 重连事件
redisClient.on('reconnecting', () => {
  console.log('Redis Reconnecting...')
})

// 初始化连接redis
const connectRedis = async () => {
  if (redisClient.isReady) {
    return
  }

  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
}

// 断开redis
const disconnectRedis = async () => {
  if (redisClient.isOpen) {
    redisClient.close()
  }
}

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis
}
