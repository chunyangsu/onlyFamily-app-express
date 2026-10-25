const attachmentService = require('@/services/common/attachment')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const attachmentController = {
  /**
   * 获取附件列表
   */
  // getDishList: asyncHandler(async (req, res) => {
  //   const list = await dishService.getDishList()
  //   success(res, list)
  // }),

  /**
   * 新增附件：支持批量新增
   * name：附件名称
   * category：业务分类
   * objectKey：OSS对象key
   */
  addAttachment: asyncHandler(async (req, res) => {
    const { attachmentArr } = req.body
    // 校验必传参数
    if (!attachmentArr || (Array.isArray(attachmentArr) && attachmentArr.length === 0)) {
      return fail(res, '附件不能为空', 400, codeEnum.paramInvalid)
    }

    // 调用service中的方法
    const newData = await attachmentService.addAttachment(attachmentArr)
    success(res, newData)
  })
}

module.exports = attachmentController
