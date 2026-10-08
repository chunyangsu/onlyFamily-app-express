const { dishCategoryList, dishList, foodOrderList, foodOrderDetails, userList, sequelize } = require('@/models')
const { generateFoodOrderCode } = require('@/utils/codeRule')

const foodOrderService = {
  /**
   * 获取食物订单列表
   */
  getFoodOrderList: async () => {
    const list = await foodOrderList.findAll({
      attributes: ['id', 'code', 'createId', 'createTime'],
      include: [
        {
          model: userList,
          as: 'creator',
          attributes: ['name']
        },
        {
          model: foodOrderDetails,
          // 定义返回时接收的数组别名
          as: 'dishArr',
          // 设置字段别名
          attributes: [['dishId', 'id'], ['dishName', 'name'], 'price', 'num']
        }
      ],
      order: [['createTime', 'DESC']]
    })
    return list.map((order) => {
      const data = order.toJSON()
      return {
        ...data,
        creator: data.creator ? data.creator.name : ''
      }
    })
  },
  /**
   * 新增食物订单
   * @param {Object} data 对象参数
   */
  createFoodOrder: async (data) => {
    return sequelize.transaction(async (transaction) => {
      const masterParams = {
        code: '',
        remark: data.remark,
        createId: 1
      }
      const masterResult = await foodOrderList.create(masterParams, { transaction })
      // 根据新生成的食物订单id生成订单编号
      const masterCode = generateFoodOrderCode(masterResult.id)
      await foodOrderList.update({ code: masterCode }, { where: { id: masterResult.id }, transaction })

      // 继续新增菜品明细
      if (data.dishArr && data.dishArr.length > 0) {
        // 以服务端菜品数据为准，避免信任前端传入的名称、分类和价格
        const dishIds = [...new Set(data.dishArr.map((item) => item.id))]
        const dishListData = await dishList.findAll({
          where: { id: dishIds },
          attributes: ['id', 'name', 'categoryId', 'price'],
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

        const tempArr = data.dishArr.map((item) => {
          const tempDish = dishMap.get(String(item.id))
          if (!tempDish) {
            throw new Error(`菜品不存在：${item.id}`)
          }

          return {
            foodOrderId: masterResult.id, // 食物订单id
            dishId: tempDish.id, // 菜品id
            dishName: tempDish.name, // 菜品名称
            dishCategoryId: tempDish.categoryId, // 菜品分类id
            dishCategoryName: categoryMap.get(String(tempDish.categoryId)) || '', // 菜品分类名称
            price: tempDish.price, // 菜品价格
            num: item.num, // 菜品数量
            createId: 1
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
  }
}

module.exports = foodOrderService
