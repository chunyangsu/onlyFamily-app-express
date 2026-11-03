const { familyList, familyUserMap } = require('@/models')

const familyService = {
  /**
   * 获取菜品列表
   */
  // getDishList: async () => {
  //   const list = await familyList.findAll()
  //   return list
  // },
  /**
   * 创建家庭
   * @param {Object} data 参数
   */
  createFamily: async (data) => {
    const masterParams = {
      name: data.name,
      introduction: data.introduction
    }
    const masterResult = await familyList.create(masterParams)

    // 同步加入家庭
    const joinParams = {
      familyId: masterResult.id,
      userId: data.userId,
      role: 1 // 创建家庭的用户默认是管理员
    }
    await familyService.joinFamily(joinParams)

    // 返回客户端的数据
    const tempBody = {
      id: masterResult.id // 家庭id
    }
    return tempBody
  },
  /**
   * 加入家庭
   * @param {Object} data 参数
   */
  joinFamily: async (data) => {
    const params = {
      familyId: data.familyId,
      userId: data.userId,
      role: data.role || 2 // 默认普通成员
    }
    const newData = await familyUserMap.create(params)
    return newData
  }
}

module.exports = familyService
