const { Op } = require('sequelize')
const { attachmentList, sequelize } = require('@/models')
const { getOssUrl } = require('@/config/oss')

const attachmentService = {
  /**
   * 获取附件列表
   * idArr：附件id数组
   */
  getAttachmentList: async (idArr) => {
    // 去重，避免重复查询；后续仍可按原始 ids 顺序组装
    const tempIdArr = [...new Set(idArr)]

    const attachments = await attachmentList.findAll({
      where: {
        id: {
          [Op.in]: tempIdArr
        }
      },
      attributes: ['id', 'objectKey', 'module'],
      raw: true
    })

    const attachmentMap = new Map(attachments.map((item) => [String(item.id), item]))

    const list = await Promise.all(
      idArr.map(async (id) => {
        const attachment = attachmentMap.get(String(id))

        // 不存在的 ID 返回 null，保留请求顺序
        if (!attachment) {
          return {
            id,
            objectKey: null,
            module: null,
            url: null
          }
        }
        const url = await getOssUrl(attachment.objectKey)
        return {
          id: attachment.id,
          objectKey: attachment.objectKey,
          module: attachment.module,
          url
        }
      })
    )

    return list
  },
  /**
   * 添加附件
   * @param {Object} attachmentArr 附件数组
   */
  addAttachment: async (attachmentArr) => {
    // 开启事务
    return sequelize.transaction(async (transaction) => {
      const newDataArr = await attachmentList.bulkCreate(
        attachmentArr.map((item) => ({
          ...item,
          createId: 1
        })),
        {
          transaction,
          validate: true
        }
      )
      return newDataArr.map((item) => ({
        id: item.id,
        objectKey: item.objectKey
      }))
    })
  }
}

module.exports = attachmentService
