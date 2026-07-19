const { userList } = require('@/models')
const codeEnum = require('@/data/enum/code')
const { generateToken } = require('@/utils/jwt')

const userService = {
  /**
   * 用户登录
   * @param {Object} formData 对象参数：mobile, password
   */
  login: async (formData) => {
    const { mobile, password } = formData

    // 1. 根据手机号查找用户
    const userData = await userList.findOne({ where: { mobile } })

    // 2. 安全比对：如果用户不存在，或者密码比对失败，统一抛出错误
    // 严禁区分“用户不存在”或“密码错误”，防止账号枚举攻击
    // if (!userData || !(await bcrypt.compare(password, userData.password))) {
    //   const error = new Error('手机号或密码错误')
    //   error.bizCode = data.code.loginFailed
    //   error.httpCode = 401
    //   throw error
    // }
    // 2. 明文密码比对：如果用户不存在，或者密码不一致，统一抛出错误
    if (!userData || !userData.password || userData.password !== password) {
      const error = new Error('手机号或密码错误')
      error.bizCode = codeEnum.loginFailed
      error.httpCode = 401
      throw error
    }

    // 3. 验证通过，生成 JWT Token
    const token = generateToken({
      id: userData.id,
      name: userData.name,
      mobile: userData.mobile
    })

    // 4. 生成返回数据
    const resInfo = {
      id: userData.id,
      name: userData.name,
      mobile: userData.mobile,
      email: userData.email,
      token: token
    }

    // 5. 返回用户信息和token
    return resInfo
  },
  /**
   * 获取用户列表
   */
  getUserList: async () => {
    // 等价于 SELECT * FROM user_list
    const userList = await userList.findAll()
    return userList
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
