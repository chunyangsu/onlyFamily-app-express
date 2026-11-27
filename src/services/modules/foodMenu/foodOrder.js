const { dishCategoryList, dishList, foodOrderList, foodOrderDetails, familyUserMap, sequelize } = require('@/models')
const { generateFoodOrderCode } = require('@/utils/codeRule')
const { getAttachmentList } = require('@/services/common/attachment')

const foodOrderService = {
  /**
   * 获取食物订单列表
   */
  getFoodOrderList: async (familyId) => {
    if (!['string', 'number'].includes(typeof familyId) || !/^[1-9]\d*$/.test(String(familyId)) || !Number.isSafeInteger(Number(familyId)) || Number(familyId) > 2147483647) {
      const error = new Error('家庭 ID 必须为有效正整数')
      error.status = 400
      throw error
    }
    const list = await foodOrderList.findAll({
      attributes: ['id', 'code', 'progress', 'remark', 'createId', 'createTime'],
      include: [
        {
          model: foodOrderDetails,
          // 定义返回时接收的数组别名
          as: 'dishArr',
          // 设置字段别名
          attributes: [['dishId', 'id'], ['dishName', 'name'], ['dishMainImageId', 'mainImageId'], 'price', 'num']
        }
      ],
      order: [['createTime', 'DESC']]
    })
    const orderList = list.map((item) => item.toJSON())
    // 同一用户在不同家庭的昵称、头像独立，必须限定当前家庭。
    const createIds = [...new Set(orderList.map((order) => String(order.createId)))]
    const members = createIds.length
      ? await familyUserMap.findAll({
          where: { familyId: Number(familyId), userId: createIds },
          attributes: ['userId', 'nickname', 'userAvatarId'],
          raw: true
        })
      : []
    const memberMap = new Map(members.map((member) => [String(member.userId), member]))
    // 批量获取主图 URL，避免逐个菜品查询附件或重复生成签名 URL
    const mainImageIds = [
      ...new Set(
        orderList
          .flatMap((order) => order.dishArr.map((dish) => dish.mainImageId))
          .filter((id) => Number(id) > 0)
          .map(String)
      )
    ]
    const attachmentIds = [
      ...new Set([
        ...mainImageIds,
        ...members
          .map((member) => member.userAvatarId)
          .filter((id) => Number(id) > 0)
          .map(String)
      ])
    ]
    const attachments = attachmentIds.length ? await getAttachmentList(attachmentIds) : []
    const attachmentMap = new Map(attachments.map((attachment) => [String(attachment.id), attachment]))

    return orderList.map((data) => {
      const member = memberMap.get(String(data.createId))
      const avatarId = member?.userAvatarId || 0
      return {
        ...data,
        createUser: {
          id: data.createId,
          nickname: member?.nickname || '',
          avatarId,
          avatarUrl: Number(avatarId) > 0 ? attachmentMap.get(String(avatarId))?.url || '' : '',
          expiresTime: Number(avatarId) > 0 && attachmentMap.get(String(avatarId))?.url ? (attachmentMap.get(String(avatarId)).expiresTime ?? null) : null
        },
        dishArr: data.dishArr.map((dish) => ({
          ...dish,
          mainImageUrl: attachmentMap.get(String(dish.mainImageId))?.url ?? '',
          expiresTime: attachmentMap.get(String(dish.mainImageId))?.url ? (attachmentMap.get(String(dish.mainImageId)).expiresTime ?? null) : null
        }))
      }
    })
  },
  /**
   * 新增食物订单
   * @param {Object} data：userId、dishArr、remark
   */
  createFoodOrder: async (data) => {
    const { userId, dishArr, remark } = data
    return sequelize.transaction(async (transaction) => {
      const masterParams = {
        code: '',
        remark: remark,
        createId: userId
      }
      const masterResult = await foodOrderList.create(masterParams, { transaction })
      // 根据新生成的食物订单id生成订单编号
      const masterCode = generateFoodOrderCode(masterResult.id)
      await foodOrderList.update({ code: masterCode }, { where: { id: masterResult.id }, transaction })

      // 继续新增菜品明细
      if (dishArr && dishArr.length > 0) {
        // 以服务端菜品数据为准，避免信任前端传入的名称、分类和价格
        const dishIds = [...new Set(dishArr.map((item) => item.id))]
        const dishListData = await dishList.findAll({
          where: { id: dishIds },
          attributes: ['id', 'name', 'mainImageId', 'categoryId', 'price'],
          transaction
        })
        const dishMap = new Map(dishListData.map((dish) => [String(dish.id), dish]))

        const categoryIds = [...new Set(dishListData.map((dish) => dish.categoryId))]
        const categoryList = await dishCategoryList.findAll({
          where: { id: categoryIds },
          attributes: ['id', 'name'],
          transaction
        })
        const categoryMap = new Map(categoryList.map((category) => [String(category.id), category.name]))

        const tempArr = dishArr.map((item) => {
          const tempDish = dishMap.get(String(item.id))
          if (!tempDish) {
            throw new Error(`菜品不存在：${item.id}`)
          }

          return {
            foodOrderId: masterResult.id, // 食物订单id
            dishId: tempDish.id, // 菜品id
            dishName: tempDish.name, // 菜品名称
            dishMainImageId: tempDish.mainImageId, // 菜品主图
            dishCategoryId: tempDish.categoryId, // 菜品分类id
            dishCategoryName: categoryMap.get(String(tempDish.categoryId)) || '', // 菜品分类名称
            price: tempDish.price, // 菜品价格
            num: item.num, // 菜品数量
            createId: userId
          }
        })
        await foodOrderDetails.bulkCreate(tempArr, { transaction })
        // 返回客户端的数据
        const tempBody = {
          id: masterResult.id, // 食物订单id
          code: masterCode // 食物订单编号
        }
        return tempBody
      }
    })
  },
  /**
   * 获取食物订单详情
   * data：familyId、id
   * @returns {Promise<Object|null>} 订单详情，订单不存在时返回 null
   */
  getFoodOrderDetail: async (data) => {
    const { familyId, id } = data
    if (!['string', 'number'].includes(typeof familyId) || !/^[1-9]\d*$/.test(String(familyId)) || !Number.isSafeInteger(Number(familyId)) || Number(familyId) > 2147483647) {
      const error = new Error('家庭 ID 必须为有效正整数')
      error.status = 400
      throw error
    }
    const orderInfo = await foodOrderList.findByPk(id, {
      attributes: ['id', 'code', 'progress', 'remark', 'createId', 'createTime'],
      include: [
        {
          model: foodOrderDetails,
          // 定义返回时接收的数组别名
          as: 'dishArr',
          // 设置字段别名
          attributes: [['dishId', 'id'], ['dishName', 'name'], ['dishMainImageId', 'mainImageId'], 'price', 'num']
        }
      ]
    })
    if (!orderInfo) {
      return null
    }

    const tempData = orderInfo.toJSON()
    const member = await familyUserMap.findOne({
      where: { familyId: Number(familyId), userId: tempData.createId },
      attributes: ['userId', 'nickname', 'userAvatarId'],
      raw: true
    })
    const avatarId = member?.userAvatarId || 0
    // 批量获取主图 URL，避免逐个菜品查询附件或重复生成签名 URL
    const mainImageIds = [
      ...new Set(
        tempData.dishArr
          .map((dish) => dish.mainImageId)
          .filter((id) => Number(id) > 0)
          .map(String)
      )
    ]
    const attachmentIds = [...new Set([...mainImageIds, ...(Number(avatarId) > 0 ? [String(avatarId)] : [])])]
    const attachments = attachmentIds.length ? await getAttachmentList(attachmentIds) : []
    const attachmentMap = new Map(attachments.map((attachment) => [String(attachment.id), attachment]))

    return {
      ...tempData,
      createUser: {
        id: tempData.createId,
        nickname: member?.nickname || '',
        avatarId,
        avatarUrl: Number(avatarId) > 0 ? attachmentMap.get(String(avatarId))?.url || '' : '',
        expiresTime: Number(avatarId) > 0 && attachmentMap.get(String(avatarId))?.url ? (attachmentMap.get(String(avatarId)).expiresTime ?? null) : null
      },
      dishArr: tempData.dishArr.map((dish) => ({
        ...dish,
        mainImageUrl: attachmentMap.get(String(dish.mainImageId))?.url ?? '',
        expiresTime: attachmentMap.get(String(dish.mainImageId))?.url ? (attachmentMap.get(String(dish.mainImageId)).expiresTime ?? null) : null
      }))
    }
  }
}

module.exports = foodOrderService
