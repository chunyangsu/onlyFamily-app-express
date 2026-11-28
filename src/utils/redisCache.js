const { redisClient } = require('@/config/redis')

/**
 * 获取缓存
 * @param {*} key 缓存key
 * @returns {Promise<*>}
 */
const getCache = async (key) => {
  try {
    const value = await redisClient.get(key)

    return value === null ? null : JSON.parse(value)
  } catch (error) {
    console.error('Redis Get cache error:', error)
    return null
  }
}

/**
 * 设置缓存
 * @param {*} key 缓存 Key
 * @param {*} value 缓存内容
 * @param {*} expire 过期时间，单位秒，默认300秒(5分钟)
 * @returns {Promise<boolean>}
 */
const setCache = async (key, value, expire = 300) => {
  try {
    await redisClient.set(key, JSON.stringify(value), {
      EX: expire
    })

    return true
  } catch (error) {
    console.error('Redis Set cache error:', error)
    return false
  }
}

/**
 * 删除缓存
 * @param {string} key 缓存 Key
 * @returns {Promise<number>}
 */
const deleteCache = async (key) => {
  try {
    return await redisClient.del(key)
  } catch (error) {
    console.error('Redis Delete cache error:', error)
    return 0
  }
}

module.exports = {
  getCache,
  setCache,
  deleteCache
}
