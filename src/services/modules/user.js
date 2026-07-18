const { userList } = require('@/models')

const userService = {
  /**
   * 获取用户列表
   */
  getUserList: async () => {
    // 等价于 SELECT * FROM user_list
    return await userList.findAll()
  },
  /**
   * 创建用户
   * @param {Object} formData 对象参数：name, mobile, password, email
   */
  createUser: async (formData) => {
    // Sequelize 会自动处理 createTime 和 updateTime 的时间戳
    const newData = await userList.create(formData)
    return newData
  }
}

module.exports = userService
