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
  getAttachmentList: asyncHandler(async (req, res) => {
    // const userId = req.user.id
    // const familyId = req.headers['family-id']
    const { ids } = req.query
    if (!ids || ids === '') {
      return fail(res, '附件id不能为空', 400, codeEnum.paramInvalid)
    }
    const idArr = ids.split(',').map(Number)
    // const params = {
    //   userId,
    //   familyId,
    //   idArr
    // }
    const list = await attachmentService.getAttachmentList(idArr)
    // 续签请求不得命中旧响应缓存。
    res.set('Cache-Control', 'no-store')
    success(res, list)
  }),

  /**
   * 新增附件：支持批量新增
   * name：附件名称
   * category：业务分类
   * objectKey：OSS对象key
   */
  addAttachment: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const familyId = req.headers['family-id']
    const { attachmentArr } = req.body
    // 校验必传参数
    if (!attachmentArr || (Array.isArray(attachmentArr) && attachmentArr.length === 0)) {
      return fail(res, '附件不能为空', 400, codeEnum.paramInvalid)
    }

    // 调用service中的方法
    const params = {
      userId,
      familyId,
      attachmentArr
    }
    const newData = await attachmentService.addAttachment(params)
    success(res, newData)
  })
}

module.exports = attachmentController
