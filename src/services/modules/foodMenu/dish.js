const { dishList } = require('@/models')

const dishService = {
  /**
   * 获取菜品列表
   */
  getDishList: async () => {
    const list = await dishList.findAll()
    return list
  },
  /**
   * 创建菜品
   * @param {Object} formData 对象参数
   */
  createDish: async (formData) => {
    const newData = await dishList.create(formData)
    return newData
  }
}

module.exports = dishService
