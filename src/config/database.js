// 引入Sequelize
const { Sequelize } = require('sequelize')
// 加载项目根目录下的 .env 文件，将里面的键值对注入到 Node.js 的 process.env 对象中。
require('dotenv').config()

// 创建 Sequelize 实例(使用分离参数连接)
const sequelize = new Sequelize(
  process.env.DB_NAME, // 数据库名称
  process.env.DB_USER, // 数据库用户名
  process.env.DB_PASSWORD, // 数据库密码
  {
    host: process.env.DB_HOST, // 数据库服务器地址，默认localhost
    dialect: 'mysql', // 指定底层使用的数据库，这里配置为 'mysql'，告诉 Sequelize 要生成 MySQL 兼容的 SQL 语句
    logging: false, // 关闭 Sequelize 默认的控制台 SQL 日志打印。在生产环境中，频繁打印 SQL 会影响性能并污染控制台，因此建议关闭
  },
)
// 导出实例
module.exports = sequelize
