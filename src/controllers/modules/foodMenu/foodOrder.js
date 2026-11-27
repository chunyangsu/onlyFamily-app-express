const foodOrderService = require('@/services/modules/foodMenu/foodOrder')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const foodOrderController = {
  /**
   * 获取食物订单列表
   */
  getFoodOrderList: asyncHandler(async (req, res) => {
    const familyId = req.headers['family-id']
    const response = await foodOrderService.getFoodOrderList(familyId)
    success(res, response)
  }),

  /**
   * 新增食物订单
   */
  createFoodOrder: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const { dishArr, remark } = req.body
    // 校验必传参数
    if (!dishArr || !Array.isArray(dishArr) || dishArr.length === 0) {
      return fail(res, '菜品不能为空', 400, codeEnum.paramInvalid)
    }

    const params = {
      userId,
      dishArr,
      remark
    }
    // 调用service中的方法
    const response = await foodOrderService.createFoodOrder(params)
    success(res, response)
  }),
  /**
   * 获取食物订单详情
   */
  getFoodOrderDetail: asyncHandler(async (req, res) => {
    const familyId = req.headers['family-id']
    const { id } = req.params
    const params = {
      familyId,
      id
    }
    const response = await foodOrderService.getFoodOrderDetail(params)
    success(res, response)
  })
}

module.exports = foodOrderController
