// 引入Sequelize
const { Sequelize } = require('sequelize')
const env = require('@/config/env')

// 创建 Sequelize 实例(使用分离参数连接)
const sequelize = new Sequelize(
  env.database.name, // 数据库名称
  env.database.user, // 数据库用户名
  env.database.password, // 数据库密码
  {
    host: env.database.host, // 数据库服务器地址，默认localhost
    port: env.database.port, // 数据库端口，默认3306
    dialect: 'mysql', // 指定底层使用的数据库，这里配置为 'mysql'，告诉 Sequelize 要生成 MySQL 兼容的 SQL 语句
    logging: false // 关闭 Sequelize 默认的控制台 SQL 日志打印。在生产环境中，频繁打印 SQL 会影响性能并污染控制台，因此建议关闭
  }
)
// 导出实例
module.exports = sequelize
