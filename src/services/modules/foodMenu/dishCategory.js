const { dishCategoryList } = require('@/models')

const dishCategoryService = {
  /**
   * 获取菜品分类列表
   */
  getDishCategoryList: async () => {
    const list = await dishCategoryList.findAll()
    return list
  },
  /**
   * 创建菜品分类
   * @param {Object} formData 对象参数：name
   */
  createDishCategory: async (formData) => {
    const newData = await dishCategoryList.create(formData)
    return newData
  }
}

module.exports = dishCategoryService
