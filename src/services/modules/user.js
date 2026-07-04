const models = require('@/models')
const sequelize = require('@/config/database')

const User = {
  /**
   * 获取用户列表
   */
  getUserList: async () => {
    // 等价于 SELECT * FROM user_list
    // 通过 Sequelize 的 Model 定义生成的数据表
    // return await models.user_list.findAll()
    // 直接在数据库中创建的数据表
    const [results, metadata] = await sequelize.query('SELECT * FROM user_list')
    return results
  },
}

module.exports = User
