require('module-alias/register')

const env = require('@/config/env')
const models = require('@/models')

/**
 * 初始化生产数据库
 */
const initDatabase = async () => {
  try {
    // 1. 环境安全检查
    if (env.app.nodeEnv !== 'production') {
      throw new Error('当前不是生产环境，禁止执行生产数据库初始化')
    }

    if (env.database.name !== 'only-family') {
      throw new Error(`数据库名称不匹配：${env.database.name}`)
    }

    console.log('开始初始化 OnlyFamily 生产数据库...')
    console.log(`目标数据库：${env.database.name}`)

    // 2. 测试数据库连接
    await models.sequelize.authenticate()
    console.log('数据库连接成功')

    // 3. 创建所有尚不存在的数据表
    await models.sequelize.sync()
    console.log('所有数据表初始化完成')
  } catch (error) {
    console.error('数据库初始化失败：', error)
    process.exitCode = 1
  } finally {
    // 4. 关闭数据库连接
    await models.sequelize.close()
  }
}

initDatabase()
