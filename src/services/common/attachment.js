const { attachmentList, sequelize } = require('@/models')

const attachmentService = {
  /**
   * 获取附件列表
   */
  // getDishList: async () => {
  //   const list = await dishList.findAll()
  //   return list
  // },
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
